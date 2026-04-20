# VSM — AMI Bridge Worker

**Worker mode:** `nx run vsm:ami`  
**Connects to:** Asterisk AMI `:5038`  
**Reports to:** VSM API via HTTP webhook

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [AMI Connection](#3-ami-connection)
4. [Event Handling](#4-event-handling)
5. [Command Service](#5-command-service)
6. [Config Sync](#6-config-sync)
7. [Deployment](#7-deployment)
8. [Environment Variables](#8-environment-variables)

---

## 1. Overview

AMI Bridge là worker mode của VSM service, chạy như một tiến trình độc lập (`nx run vsm:ami`). Vai trò là **cầu nối** giữa Asterisk AMI và VSM API.

**Responsibilities:**

| Chiều | Hành động |
|-------|-----------|
| Asterisk → VSM | Nhận AMI events, forward về VSM API để ghi call-log, cập nhật trạng thái account |
| VSM → Asterisk | Thực thi AMI actions: originate, sync PJSIP config, reload dialplan |

**Nguyên tắc:** AMI bridge là **thin layer** — không có business logic, không ghi DB trực tiếp. Toàn bộ logic xử lý nằm trong VSM API.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  VSM ami-bridge worker                   │
│                                                          │
│  ┌──────────────────┐    ┌───────────────────────────┐   │
│  │   AmiClient      │    │   BullMQ Consumer         │   │
│  │                  │    │                           │   │
│  │  keepConnected() │    │  queue: vsm:ami:commands  │   │
│  │  on(event) ──────┼────┼──▶ CommandService         │   │
│  │                  │    │                           │   │
│  └──────────────────┘    └───────────────────────────┘   │
│           │                          │                   │
│           ▼                          ▼                   │
│  ┌──────────────────┐    ┌───────────────────────────┐   │
│  │  EventHandler    │    │   CommandService          │   │
│  │                  │    │                           │   │
│  │  filter events   │    │  originate()              │   │
│  │  enrich payload  │    │  syncPjsipEndpoint()      │   │
│  │  extract S3 key  │    │  syncTrunk()              │   │
│  │  POST /webhooks  │    │  reloadDialplan()         │   │
│  │  /ami ──────────▶│    │  hangupChannel()          │   │
│  │  (VSM API)       │    │                           │   │
│  └──────────────────┘    └───────────────────────────┘   │
│                                      │                   │
└──────────────────────────────────────┼───────────────────┘
                                       │
            ┌──────────────────────────┘
            │ AMI TCP :5038
            ▼
     Asterisk PBX
```

---

## 3. AMI Connection

### 3.1 Connection Setup

```typescript
// Thư viện: asterisk-manager (npm)
const ami = new AsteriskManager(
  AMI_PORT,      // 5038
  AMI_HOST,      // IP Asterisk server
  AMI_USERNAME,  // vsm-bridge
  AMI_SECRET,
  true           // enable events
);

ami.keepConnected(); // auto-reconnect khi mất kết nối
```

### 3.2 Reconnect Strategy

| Sự kiện | Hành động |
|---------|-----------|
| Kết nối thành công | Log, PATCH `/nodes/:id` → `status: online` |
| Mất kết nối | Log warning, `keepConnected()` tự reconnect |
| Reconnect thành công | Log, PATCH `/nodes/:id` → `status: online` |
| Lỗi auth | Log error, dừng — không retry tự động |

### 3.3 Multi-node Support

Một AMI bridge instance kết nối đến **một Asterisk node** duy nhất. Nhiều nodes → deploy nhiều AMI bridge processes, mỗi process có `NODE_ID` riêng trong env.

---

## 4. Event Handling

### 4.1 Events Subscribed

```typescript
const SUBSCRIBED_EVENTS = [
  'Cdr',
  'DialBegin',
  'DialEnd',
  'Hangup',
  'PeerStatus',
  'DeviceStateChange',
];
```

### 4.2 Event Filter, Enrich & Forward

```typescript
// Payload gửi về VSM API POST /webhooks/ami
{
  nodeId: NODE_ID,             // từ env
  event: 'Cdr',
  receivedAt: new Date().toISOString(),
  payload: { ...rawAmiEvent }  // raw AMI event, không transform
}
```

Bridge **không** transform logic — toàn bộ parsing (Disposition → result, duration calc, accountId extraction) thực hiện tại VSM API.

**Ngoại lệ duy nhất:** Extract S3 key từ `RecordingFile` trong CDR event (xem 4.3).

### 4.3 RecordingFile — Extract S3 Key

CDR event từ Asterisk chứa absolute path trên server. Bridge strip prefix trước khi gửi về VSM:

```typescript
const RECORDING_PREFIX = '/var/spool/asterisk/monitor/';

function extractS3Key(recordingFile: string): string | undefined {
  if (!recordingFile) return undefined;
  return recordingFile.startsWith(RECORDING_PREFIX)
    ? recordingFile.slice(RECORDING_PREFIX.length)
    : recordingFile;
}

// CDR.RecordingFile = "/var/spool/asterisk/monitor/recordings/2026/04/19/<id>.wav"
// → s3Key            = "recordings/2026/04/19/<id>.wav"
```

S3 key được thêm vào payload trước khi POST về VSM:

```typescript
payload.s3Key = extractS3Key(payload.RecordingFile);
```

### 4.4 Event Processing tại VSM API

| AMI Event | VSM xử lý |
|-----------|----------|
| `Cdr` | Parse Disposition → result; tính duration, answeredDuration; lưu `recordingFile = s3Key`; tạo call-log |
| `PeerStatus` | Extract accountId từ `PJSIP/<accountId>-<hex>`; update `account.status` |
| `DeviceStateChange` | Map state → `idle`/`ringing`/`in_call`; update `account.state` |
| `DialBegin` | Update call-log state nếu có matching UniqueID |
| `DialEnd` | Update call-log state theo DialStatus |
| `Hangup` | Finalize call-log nếu CDR chưa về |

### 4.5 CDR Disposition Mapping (tại VSM API)

| Asterisk Disposition | VSM Result |
|---------------------|-----------|
| `ANSWERED` | `answered` |
| `NO ANSWER` | `no_answer` |
| `BUSY` | `busy` |
| `FAILED` | `failed` |
| `CONGESTION` | `failed` |

### 4.6 AccountId Extraction từ Channel Name (tại VSM API)

```typescript
// Channel format: PJSIP/<accountId>-<hex>
const CHANNEL_REGEX = /PJSIP\/([a-f0-9]{24})-/i;
const accountId = channel.match(CHANNEL_REGEX)?.[1];
```

---

## 5. Command Service

VSM API gửi commands tới AMI bridge qua **BullMQ queue** (`vsm:ami:commands`). Bridge consume queue và thực thi AMI actions.

### 5.1 Command Types

#### `originate` — Khởi tạo outbound call

```typescript
// BullMQ job payload
{
  type: 'originate',
  callLogId: string,      // pre-created call-log _id (dùng làm VSM_CALL_ID)
  channel: string,        // 'PJSIP/<accountId>'
  context: string,        // dialplan context
  extension: string,      // số cần gọi (E.164)
  callerId: string,       // E.164
}

// AMI action
ami.action({
  action: 'Originate',
  channel: 'PJSIP/64b110001bdbfc44ef96aa01',
  context: 'outbound',
  exten: '+84912345678',
  priority: 1,
  callerid: '+842412345678',
  variable: 'VSM_CALL_ID=64g770001bdbfc44ef96gg07,VSM_DIRECTION=outbound',
  async: 'true',
});
```

> `VSM_CALL_ID` được pass vào Asterisk channel variable để dialplan dùng làm tên file recording:
> ```ini
> exten => s,n,MixMonitor(recordings/%Y/%m/%d/${VSM_CALL_ID}.wav,b)
> ```

#### `syncAccount` — Sync account lên Asterisk PJSIP

```typescript
{
  type: 'syncAccount',
  accountId: string,       // MongoDB ObjectId — dùng làm PJSIP section name
  ext: string,             // mã gọi nội bộ
  displayName: string,
  orgId: string,
  password: string,
  protocol: 'sip' | 'webrtc' | 'both',
  codecs: string[],
  maxContacts: number,
  action: 'create' | 'update' | 'delete',
}

// AMI actions
ami.action({ action: 'UpdateConfig', srcfilename: 'pjsip.conf', ... });
ami.action({ action: 'ModuleReload', module: 'res_pjsip' });
```

#### `syncTrunk` — Sync trunk lên Asterisk PJSIP

```typescript
{
  type: 'syncTrunk',
  trunkId: string,
  name: string,
  host: string,
  port: number,
  username: string,
  password: string,
  transport: 'udp' | 'tcp' | 'tls',
  codecs: string[],
  action: 'create' | 'update' | 'delete',
}

ami.action({ action: 'UpdateConfig', srcfilename: 'pjsip.conf', ... });
ami.action({ action: 'ModuleReload', module: 'res_pjsip' });
```

#### `syncDialplan` — Sync dialplan lên Asterisk

```typescript
{
  type: 'syncDialplan',
  dialplanId: string,
  context: string,
  steps: Array<{ order: number; application: string; parameters: string }>,
  action: 'create' | 'update' | 'delete',
}

// AMI action — ghi extensions.conf rồi reload
ami.action({ action: 'Command', command: 'dialplan reload' });
```

#### `hangupChannel` — Cúp máy

```typescript
{
  type: 'hangupChannel',
  channel: string,  // channel name hoặc UniqueID
}

ami.action({ action: 'Hangup', channel: 'PJSIP/64b110...-00000001' });
```

### 5.2 Job Retry Policy

| Thông số | Giá trị |
|----------|---------|
| Attempts | 3 |
| Backoff | exponential, base 2s |
| Timeout | 10s per attempt |
| On failure | POST `/webhooks/ami/sync-result` `{ status: 'error', error: message }` |

---

## 6. Config Sync Flow

### 6.1 Account Sync

```
POST /accounts (VSM API)
  │ save to MongoDB (syncStatus=pending)
  │ publish → BullMQ: { type: 'syncAccount', action: 'create', ... }
  ▼
AMI Bridge
  │ AMI: UpdateConfig pjsip.conf
  │   ; orgId=<orgId> | ext=<ext> | displayName=<name>
  │   [<accountId>] type=endpoint, webrtc=yes / sip config
  │   [<accountId>] type=aor, max_contacts=N
  │   [<accountId>] type=auth, username=<accountId>, password=<pw>
  │ AMI: ModuleReload res_pjsip
  │ POST /webhooks/ami/sync-result { accountId, status: 'synced' }
  ▼
VSM API: syncStatus=synced, syncedAt=now()
```

### 6.2 PJSIP Config Generated

**SIP account (`protocol=sip`):**
```ini
; orgId=64org001... | ext=8898 | displayName=Nguyễn Văn A
[64b110001bdbfc44ef96aa01]
type=endpoint
context=from-internal
aors=64b110001bdbfc44ef96aa01
auth=64b110001bdbfc44ef96aa01
allow=ulaw,alaw
direct_media=no

[64b110001bdbfc44ef96aa01]
type=aor
max_contacts=5
remove_existing=yes

[64b110001bdbfc44ef96aa01]
type=auth
auth_type=userpass
username=64b110001bdbfc44ef96aa01
password=<password>
```

**WebRTC account (`protocol=webrtc`):**
```ini
; orgId=64org001... | ext=8898 | displayName=Nguyễn Văn A
[64b110001bdbfc44ef96aa01]
type=endpoint
webrtc=yes
context=from-internal
aors=64b110001bdbfc44ef96aa01
auth=64b110001bdbfc44ef96aa01
allow=opus,ulaw
dtls_auto_generate_cert=yes

[64b110001bdbfc44ef96aa01]
type=aor
max_contacts=5
remove_existing=yes

[64b110001bdbfc44ef96aa01]
type=auth
auth_type=userpass
username=64b110001bdbfc44ef96aa01
password=<password>
```

---

## 7. Deployment

### 7.1 Vị trí deploy

AMI bridge **phải chạy trên cùng server với Asterisk** vì cần:
1. TCP access đến AMI `:5038` (internal only, không expose ra ngoài)
2. Đọc được path `/var/spool/asterisk/monitor/` để extract S3 key prefix

```
Asterisk server
  ├── asterisk process
  ├── s3fs mount: /var/spool/asterisk/monitor/ → S3 bucket vsm-recordings
  └── vsm ami-bridge process (nx run vsm:ami)
        └── kết nối AMI localhost:5038
```

### 7.2 PM2 Config

```javascript
// ecosystem.config.js
{
  name: 'vsm-ami-hn01',
  script: 'dist/services/vsm/main.js',
  args: '--mode=ami',
  env: {
    NODE_ID: '64a920341bdbfc44ef96cc3c',
    AMI_HOST: '127.0.0.1',    // localhost vì cùng server
    AMI_PORT: '5038',
    AMI_USERNAME: 'vsm-bridge',
    AMI_SECRET: '<secret>',
    AMI_RECORDING_PREFIX: '/var/spool/asterisk/monitor/',
    VSM_API_URL: 'http://vsm-api-host:3009',
    AMI_BRIDGE_TOKEN: '<service-token>',
    REDIS_URL: 'redis://redis-host:6379',
  }
}
```

### 7.3 Multiple Nodes

```javascript
[
  {
    name: 'vsm-ami-hn01',
    env: { NODE_ID: 'xxx', AMI_HOST: '127.0.0.1' }
    // chạy trên server HN
  },
  {
    name: 'vsm-ami-hcm01',
    env: { NODE_ID: 'yyy', AMI_HOST: '127.0.0.1' }
    // chạy trên server HCM
  },
]
```

---

## 8. Environment Variables

| Variable | Required | Mô tả |
|----------|----------|-------|
| `NODE_ID` | ✅ | MongoDB ObjectId của node này |
| `AMI_HOST` | ✅ | IP/hostname Asterisk (`127.0.0.1` nếu cùng server) |
| `AMI_PORT` | ❌ | AMI port, mặc định `5038` |
| `AMI_USERNAME` | ✅ | AMI username |
| `AMI_SECRET` | ✅ | AMI secret |
| `AMI_RECORDING_PREFIX` | ❌ | Prefix path strip khi extract S3 key, mặc định `/var/spool/asterisk/monitor/` |
| `VSM_API_URL` | ✅ | Base URL của VSM API |
| `AMI_BRIDGE_TOKEN` | ✅ | Service token cho webhook `/webhooks/ami` |
| `REDIS_URL` | ✅ | Redis URL cho BullMQ |
| `AMI_RECONNECT_DELAY` | ❌ | Delay reconnect ms, mặc định `5000` |
