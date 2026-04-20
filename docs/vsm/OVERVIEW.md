# VSM — Voice Service Management

**Service:** Voice Service Management (VSM)  
**Port (Dev):** `3009`  
**Port (Prod):** `3390–3399`  
**Base URL:** `http://localhost:3009`  
**Auth:** Bearer JWT required on all endpoints unless noted

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Modules](#3-modules)
4. [Run Modes](#4-run-modes)
5. [Data Flow](#5-data-flow)
6. [Asterisk Integration](#6-asterisk-integration)
7. [WebRTC Support](#7-webrtc-support)
8. [Recording Pipeline](#8-recording-pipeline)
9. [Port Allocation](#9-port-allocation)

---

## 1. Overview

VSM là control plane cho hệ thống telephony dựa trên Asterisk PBX. Service quản lý toàn bộ vòng đời của:

- **Nodes** — đăng ký, cấu hình, monitor Asterisk servers
- **Accounts** — tài khoản SIP/WebRTC gắn với người dùng
- **Trunks** — trunk/gateway kết nối ra ngoài (PSTN, SIP provider)
- **Phone Numbers** — đầu số DID gọi vào, caller ID gọi ra
- **Routes** — luật định tuyến cuộc gọi vào/ra
- **Dialplans** — cấu hình xử lý cuộc gọi trên Asterisk
- **Call Logs** — CDR, ghi log đầy đủ mọi cuộc gọi

VSM **không** xử lý media trực tiếp — Asterisk đảm nhiệm toàn bộ RTP/SRTP. VSM chỉ là control plane: lưu trữ cấu hình, cung cấp API, nhận event từ AMI bridge, và ghi log.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Clients / FE                           │
│         Browser (WebRTC)  ·  Softphone  ·  Mobile App       │
└────────────┬────────────────────────┬───────────────────────┘
             │ SIP over WSS :8089     │ REST / WebSocket
             │                        │
             ▼                        ▼
┌────────────────────────┐  ┌───────────────────────────────────┐
│   Asterisk PBX         │  │        VSM Service (NestJS)        │
│   (PJSIP + AMI)        │  │  ┌─────────────────────────────┐  │
│                        │  │  │  REST API  :3009             │  │
│  AMI  :5038 ───────────┼──┼─▶│  nodes, accounts, trunks,   │  │
│  WSS  :8089 ◀──────────┼──┼──│  phone-numbers, routes,      │  │
│  RTP  :10000-20000/udp │  │  │  dialplans, call-logs        │  │
│                        │  │  └─────────────────────────────┘  │
│  /var/spool/asterisk/  │  │  ┌─────────────────────────────┐  │
│  monitor/ ─── s3fs ───▶┼──┼─▶│  S3/MinIO Storage           │  │
│  (recordings mount)    │  │  │  recordings/<date>/<id>.wav  │  │
└────────────────────────┘  │  └─────────────────────────────┘  │
             ▲              │  ┌─────────────────────────────┐  │
             │              │  │  AMI Bridge Worker  (ami)    │  │
             │              │  │  nx run vsm:ami              │  │
             └─────────────┼──│  · AMI TCP client            │  │
                            │  │  · event handler → call-logs │  │
                            │  │  · command service           │  │
                            │  │    (originate, pjsip sync,   │  │
                            │  │     dialplan sync)           │  │
                            │  └─────────────────────────────┘  │
                            └───────────────────────────────────┘
                                           │
                            ┌──────────────▼──────────────┐
                            │  MongoDB · Redis · BullMQ    │
                            └─────────────────────────────┘
```

### Nguyên tắc thiết kế

| Nguyên tắc | Áp dụng |
|------------|---------|
| **Separation of concerns** | API service (control plane) tách biệt với AMI bridge (data plane) |
| **Asterisk là media engine** | VSM không xử lý SIP/RTP — chỉ quản lý cấu hình và log |
| **AMI làm giao tiếp chính** | Port duy nhất expose từ Asterisk là `:5038` (AMI) |
| **Event-driven logging** | CDR và call events từ AMI → BullMQ → call-logs |
| **RBAC đầy đủ** | `BaseService` + `owner.orgId` multi-tenancy cho tất cả module |
| **Recording qua s3fs** | Asterisk ghi thẳng vào S3/MinIO mount — không cần transfer file |

---

## 3. Modules

| Module | Endpoint prefix | Mô tả |
|--------|----------------|-------|
| **nodes** | `/nodes` | Asterisk node: hostname, AMI credentials, trạng thái kết nối |
| **accounts** | `/accounts` | Tài khoản SIP/WebRTC, mã gọi nội bộ (ext), trạng thái online/call |
| **trunks** | `/trunks` | Trunk/gateway ra ngoài (SIP provider, PSTN, VoIP carrier) |
| **phone-numbers** | `/phone-numbers` | DID numbers gọi vào, caller ID gọi ra |
| **routes** | `/routes` | Luật định tuyến inbound/outbound theo ưu tiên |
| **dialplans** | `/dialplans` | Cấu hình dialplan Asterisk (context, extensions) |
| **call-logs** | `/call-logs` | CDR log, thống kê cuộc gọi, signed recording URL |

### 3.1 Module Dependencies

```
nodes
    ├── accounts    (account gắn vào node)
    ├── trunks      (trunk gắn vào node)
    └── dialplans   (dialplan gắn vào node)

routes
    ├── accounts    (from account)
    ├── trunks      (to trunk)
    └── dialplans   (to dialplan)

call-logs
    ├── nodes
    ├── accounts    (from/to)
    ├── trunks
    ├── phone-numbers
    └── dialplans
```

---

## 4. Run Modes

| Mode | Command | Mô tả |
|------|---------|-------|
| `api` | `nx run vsm:api` | REST API server — port 3009 |
| `ami` | `nx run vsm:ami` | AMI bridge worker — kết nối Asterisk, xử lý events |

### AMI Bridge Worker

Worker `ami` chạy độc lập, deploy **trên cùng server với Asterisk** hoặc cùng network segment để đảm bảo TCP latency thấp đến AMI port `:5038`.

Responsibilities:
- Duy trì AMI TCP connection (auto-reconnect)
- Nhận events: `Cdr`, `DialBegin`, `DialEnd`, `Hangup`, `PeerStatus`, `DeviceStateChange`
- Forward events về VSM API qua HTTP webhook
- Thực thi commands từ VSM: originate call, sync PJSIP config, reload dialplan

---

## 5. Data Flow

### 5.1 Outbound Call

```
FE/API
  │ POST /call-logs/originate
  ▼
VSM API
  │ validate route + trunk
  │ tạo call-log (result=queued)
  │ publish job → BullMQ vsm:ami:commands
  ▼
AMI Bridge (worker)
  │ AMI action: Originate
  ▼
Asterisk
  │ dial via trunk → recording bắt đầu ghi vào s3fs mount
  ▼
CDR event → AMI Bridge
  │ POST /webhooks/ami { event: Cdr, payload: { recordingFile, ... } }
  ▼
VSM API
  └── cập nhật call-log: result, duration, answeredDuration, recordingFile (S3 key)
```

### 5.2 Inbound Call

```
PSTN/SIP → Asterisk
  │ match dialplan → route to account
  │ recording bắt đầu ghi vào s3fs mount
  ▼
Asterisk events (DialBegin, DialEnd, CDR)
  ▼
AMI Bridge
  │ POST /webhooks/ami
  ▼
VSM API
  │ lookup phone-number + account
  └── tạo/cập nhật call-log với recordingFile (S3 key)
```

### 5.3 Config Sync

```
POST /accounts (VSM API)
  │ save to MongoDB (syncStatus=pending)
  │ publish job → BullMQ vsm:ami:commands
  ▼
AMI Bridge (worker)
  │ AMI: UpdateConfig pjsip.conf (endpoint, aor, auth)
  │ AMI: ModuleReload res_pjsip
  │ POST /webhooks/ami/sync-result { accountId, status: synced }
  ▼
VSM API: syncStatus=synced, syncedAt=now()
```

### 5.4 Recording Playback

```
FE
  │ GET /call-logs/:id/recording-url
  ▼
VSM API
  │ lấy recordingFile (S3 key) từ call-log
  │ generate signed URL (TTL 15 phút) từ S3/MinIO SDK
  └── { url: "https://storage.../file.wav?X-Amz-Expires=900&...", expiresAt }

FE stream audio trực tiếp từ S3 URL (không qua VSM)
```

---

## 6. Asterisk Integration

### AMI Connection

```
AMI_HOST=<asterisk-server-ip>
AMI_PORT=5038
AMI_USERNAME=vsm-bridge
AMI_SECRET=<secret>
```

### Events Consumed

| AMI Event | Trigger | Xử lý |
|-----------|---------|-------|
| `Cdr` | Cuộc gọi kết thúc | Tạo call-log: result, duration, answeredDuration, recordingFile |
| `DialBegin` | Bắt đầu dial | Cập nhật call-log state → `calling` |
| `DialEnd` | Dial kết thúc | Cập nhật call-log state theo disposition |
| `Hangup` | Máy cúp | Finalize call-log nếu CDR chưa về |
| `PeerStatus` | SIP peer register/unregister | Cập nhật `account.status` (online/offline) |
| `DeviceStateChange` | Trạng thái thiết bị thay đổi | Cập nhật `account.state` (idle/ringing/in_call) |

### AMI Actions Used

| Action | Mục đích |
|--------|---------|
| `Originate` | Khởi tạo outbound call |
| `UpdateConfig` | Cập nhật pjsip.conf (endpoint, aor, auth, trunk) |
| `ModuleReload` | Reload `res_pjsip` sau khi sync config |
| `Command` | Chạy CLI: `dialplan reload` |
| `Hangup` | Cúp máy một channel cụ thể |
| `Redirect` | Chuyển hướng call đang active |

### Firewall — Asterisk chỉ expose AMI và media

```
# Firewall rules trên Asterisk server
ALLOW  :5038        FROM vsm-ami-bridge-host   # AMI (internal only)
ALLOW  :8089        FROM 0.0.0.0/0             # WebRTC clients (WSS)
ALLOW  :10000-20000 FROM 0.0.0.0/0  (UDP)      # RTP media
DENY   ALL others
```

---

## 7. WebRTC Support

WebRTC được hỗ trợ ở **tầng Asterisk + PJSIP**, VSM chỉ quản lý cấu hình và sync lên Asterisk.

### Stack

```
Browser (SipJS / JsSIP)
  │ SIP over WSS :8089
  ▼
Asterisk res_pjsip_transport_websocket
  │ PJSIP endpoint (webrtc=yes)
  ▼
DTLS-SRTP + ICE ↔ Browser (media)
```

### PJSIP endpoint config được generate bởi AMI Bridge

`accountId` dùng luôn MongoDB ObjectId. Comment header giúp admin đọc config mà không cần tra DB.

```ini
; orgId=64org001... | ext=8898 | displayName=Nguyễn Văn A
[64b110001bdbfc44ef96aa01]
type=endpoint
webrtc=yes
aors=64b110001bdbfc44ef96aa01
auth=64b110001bdbfc44ef96aa01
allow=opus,ulaw,alaw
dtls_auto_generate_cert=yes

[64b110001bdbfc44ef96aa01]
type=aor
max_contacts=5
remove_existing=yes

[64b110001bdbfc44ef96aa01]
type=auth
auth_type=userpass
username=64b110001bdbfc44ef96aa01
password={password}
```

### Account — protocol field

| Value | Mô tả |
|-------|-------|
| `sip` | SIP over UDP/TCP — softphone truyền thống |
| `webrtc` | SIP over WSS + DTLS-SRTP — browser/mobile WebRTC |
| `both` | Hỗ trợ cả hai transport |

---

## 8. Recording Pipeline

### Cách tiếp cận: s3fs mount

Asterisk ghi file recording **trực tiếp lên S3/MinIO** thông qua `s3fs` — một FUSE filesystem mount S3 bucket như local directory. Không cần transfer file hay thêm bước upload.

```
Asterisk server
  /var/spool/asterisk/monitor/   ← mount điểm s3fs
        │
        │ FUSE (s3fs)
        ▼
  S3/MinIO bucket: vsm-recordings/
        recordings/2026/04/19/<callLogId>.wav
```

### Setup s3fs trên Asterisk server

```bash
# Cài đặt
apt-get install s3fs

# Credentials
echo "ACCESS_KEY:SECRET_KEY" > /etc/passwd-s3fs
chmod 600 /etc/passwd-s3fs

# Mount
s3fs vsm-recordings /var/spool/asterisk/monitor \
  -o passwd_file=/etc/passwd-s3fs \
  -o url=https://minio.example.com \
  -o use_path_request_style \
  -o allow_other \
  -o umask=0022

# Auto-mount qua /etc/fstab
s3fs#vsm-recordings /var/spool/asterisk/monitor fuse \
  _netdev,allow_other,use_path_request_style,url=https://minio.example.com 0 0
```

### Asterisk MixMonitor dialplan

Asterisk ghi âm bằng application `MixMonitor`. Tên file dùng `callLogId` (được pass qua channel variable từ VSM khi originate):

```ini
; extensions.conf
exten => s,n,MixMonitor(recordings/%Y/%m/%d/${VSM_CALL_ID}.wav,b)
```

- `b` — ghi cả 2 chiều vào 1 file
- Path relative so với `/var/spool/asterisk/monitor/` (tức là S3 key: `recordings/2026/04/19/<id>.wav`)

### CDR event chứa recordingFile path

Khi cuộc gọi kết thúc, Asterisk CDR event có field:

```
RecordingFile: /var/spool/asterisk/monitor/recordings/2026/04/19/<callLogId>.wav
```

AMI Bridge strip prefix `/var/spool/asterisk/monitor/` → lấy S3 key `recordings/2026/04/19/<callLogId>.wav` → gửi về VSM API lưu vào `call-log.recordingFile`.

### Recording URL cho FE

```
GET /call-logs/:id/recording-url
→ {
    url: "https://minio.example.com/vsm-recordings/recordings/2026/04/19/<id>.wav?X-Amz-Expires=900&...",
    expiresAt: "2026-04-19T08:15:00.000Z"
  }
```

VSM API generate **presigned URL** (TTL 15 phút) từ S3/MinIO SDK. FE stream audio trực tiếp — không đi qua VSM backend.

---

## 9. Port Allocation

| Environment | Port | Mục đích |
|-------------|------|---------|
| Dev | `3009` | REST API |
| Prod API | `3390–3393` | 4 API instances (load balanced) |
| Prod special | `3394–3399` | Reserved (WebSocket events, future) |

---

## Related Docs

- [ENTITIES-AND-API.md](./ENTITIES-AND-API.md) — Entity schemas & API reference đầy đủ
- [AMI-BRIDGE.md](./AMI-BRIDGE.md) — AMI bridge worker design chi tiết
- [docs/PORT-ALLOCATION.md](../PORT-ALLOCATION.md) — Port strategy toàn hệ thống
