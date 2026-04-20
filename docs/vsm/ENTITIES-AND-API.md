# VSM — Entities, Permissions & API Reference

**Service:** Voice Service Management (VSM)  
**Port:** 3009  
**Base URL:** `http://localhost:3009`  
**Auth:** Bearer JWT required on all endpoints unless noted

---

## Table of Contents

1. [Nodes](#1-nodes)
2. [Accounts](#2-accounts)
3. [Trunks](#3-trunks)
4. [Phone Numbers](#4-phone-numbers)
5. [Routes](#5-routes)
6. [Dialplans](#6-dialplans)
7. [Call Logs](#7-call-logs)
8. [Webhook — AMI Bridge](#8-webhook--ami-bridge)
9. [Permission Matrix](#9-permission-matrix)

---

## 1. Nodes

Đại diện cho một Asterisk server. Mỗi node phục vụ nhiều `accounts` và `trunks`.

### 1.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `name` | string | ✅ | Tên hiển thị (vd: `PBX HN-01`) |
| `hostname` | string | ✅ | IP hoặc hostname của Asterisk server |
| `ami` | object | ✅ | Thông số kết nối AMI (xem bên dưới) |
| `wssPort` | number | ❌ | WebRTC WSS port, mặc định `8089` |
| `status` | enum | auto | `online` \| `offline` \| `error` — AMI bridge cập nhật |
| `owner` | object | auto | `{ orgId, userId }` từ BaseSchema |
| `createdBy` | object | auto | `{ type, id }` |
| `updatedBy` | object | auto | `{ type, id }` |
| `isDeleted` | boolean | auto | Soft delete |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

#### AMI Object

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `port` | number | ❌ | AMI port, mặc định `5038` |
| `username` | string | ✅ | AMI username |
| `secret` | string | ✅ | AMI secret (lưu encrypted, không trả về trong GET) |

### 1.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/nodes` | Tạo node mới |
| `GET` | `/nodes` | Danh sách nodes (paginated) |
| `GET` | `/nodes/:id` | Chi tiết node |
| `PATCH` | `/nodes/:id` | Cập nhật node |
| `DELETE` | `/nodes/:id` | Xóa node (soft delete) |
| `GET` | `/nodes/:id/status` | Trạng thái AMI connection hiện tại |

### 1.3 Example

```json
{
  "_id": "64a920341bdbfc44ef96cc3c",
  "name": "PBX HN-01",
  "hostname": "10.0.1.10",
  "ami": {
    "port": 5038,
    "username": "vsm-bridge"
  },
  "wssPort": 8089,
  "status": "online",
  "owner": { "orgId": "64org001...", "userId": "64user001..." },
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

> `ami.secret` không được trả về trong GET responses.

---

## 2. Accounts

Tài khoản SIP/WebRTC gắn với một user. MongoDB `_id` dùng làm SIP username trên Asterisk.

### 2.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key — dùng làm SIP username |
| `nodeId` | ObjectId | ✅ | Node Asterisk chứa account |
| `userId` | string | ❌ | User ID trong hệ thống |
| `ext` | string | ✅ | Mã gọi nội bộ, unique trong org (vd: `8898`) — dùng để gọi nhanh trong cùng org |
| `displayName` | string | ✅ | Tên hiển thị |
| `password` | string | ✅ | SIP password (lưu encrypted, không trả về trong GET) |
| `protocol` | enum | ✅ | `sip` \| `webrtc` \| `both` |
| `status` | enum | auto | `online` \| `offline` — AMI bridge cập nhật (PeerStatus) |
| `state` | enum | auto | `idle` \| `ringing` \| `in_call` — AMI bridge cập nhật (DeviceStateChange) |
| `codecs` | string[] | ❌ | Codec cho phép, mặc định `["opus","ulaw","alaw"]` |
| `syncedAt` | Date | auto | Lần cuối sync config lên Asterisk |
| `syncStatus` | enum | auto | `pending` \| `synced` \| `error` |
| `owner` | object | auto | `{ orgId, userId }` từ BaseSchema |
| `createdBy` | object | auto | |
| `updatedBy` | object | auto | |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

> **`ext`** phải unique trong phạm vi `orgId`. Index: `{ orgId, ext }` unique.

### 2.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/accounts` | Tạo account + trigger sync lên Asterisk |
| `GET` | `/accounts` | Danh sách accounts (paginated) |
| `GET` | `/accounts/:id` | Chi tiết account |
| `PATCH` | `/accounts/:id` | Cập nhật + trigger re-sync |
| `DELETE` | `/accounts/:id` | Xóa account + trigger remove từ Asterisk |
| `POST` | `/accounts/:id/sync` | Force sync config lên Asterisk ngay |

### 2.3 Query Parameters

```
GET /accounts?nodeId=xxx
GET /accounts?status=online
GET /accounts?state=in_call
GET /accounts?protocol=webrtc
GET /accounts?ext=8898
GET /accounts?page=1&limit=20
```

### 2.4 Example

```json
{
  "_id": "64b110001bdbfc44ef96aa01",
  "nodeId": "64a920341bdbfc44ef96cc3c",
  "userId": "64user001...",
  "ext": "8898",
  "displayName": "Nguyễn Văn A",
  "protocol": "webrtc",
  "status": "online",
  "state": "idle",
  "codecs": ["opus", "ulaw"],
  "syncStatus": "synced",
  "syncedAt": "2026-04-19T08:00:00.000Z"
}
```

---

## 3. Trunks

Trunk/gateway kết nối Asterisk ra ngoài: SIP provider, PSTN gateway, VoIP carrier.

### 3.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `nodeId` | ObjectId | ✅ | Node Asterisk chứa trunk |
| `name` | string | ✅ | Tên trunk (vd: `Viettel SIP Trunk`) |
| `note` | string | ❌ | Ghi chú tùy ý |
| `host` | string | ✅ | SIP server hostname/IP của provider |
| `port` | number | ❌ | SIP port, mặc định `5060` |
| `username` | string | ❌ | Username đăng ký với provider |
| `password` | string | ❌ | Password (lưu encrypted, không trả về trong GET) |
| `transport` | enum | ❌ | `udp` \| `tcp` \| `tls`, mặc định `udp` |
| `codecs` | string[] | ❌ | Codec hỗ trợ, mặc định `["ulaw","alaw","g729"]` |
| `syncStatus` | enum | auto | `pending` \| `synced` \| `error` |
| `syncedAt` | Date | auto | |
| `owner` | object | auto | |
| `createdBy` | object | auto | |
| `updatedBy` | object | auto | |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

### 3.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/trunks` | Tạo trunk + trigger sync |
| `GET` | `/trunks` | Danh sách trunks |
| `GET` | `/trunks/:id` | Chi tiết trunk |
| `PATCH` | `/trunks/:id` | Cập nhật + trigger re-sync |
| `DELETE` | `/trunks/:id` | Xóa trunk |
| `POST` | `/trunks/:id/sync` | Force sync |

### 3.3 Example

```json
{
  "_id": "64c220001bdbfc44ef96bb02",
  "nodeId": "64a920341bdbfc44ef96cc3c",
  "name": "Viettel SIP Trunk",
  "note": "Trunk chính cho cuộc gọi nội địa",
  "host": "sip.viettel.vn",
  "port": 5060,
  "username": "0241234567",
  "transport": "udp",
  "codecs": ["ulaw", "alaw", "g729"],
  "syncStatus": "synced",
  "syncedAt": "2026-04-19T07:00:00.000Z"
}
```

---

## 4. Phone Numbers

Đầu số DID — số gọi vào, caller ID gọi ra.

### 4.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `number` | string | ✅ | Số điện thoại (E.164, vd: `+84241234567`) |
| `callerId` | string | ❌ | Caller ID hiển thị khi gọi ra (nếu khác `number`) |
| `note` | string | ❌ | Ghi chú (vd: `Hotline CSKH`) |
| `status` | enum | ✅ | `active` \| `inactive` \| `porting` \| `suspended` |
| `owner` | object | auto | |
| `createdBy` | object | auto | |
| `updatedBy` | object | auto | |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

#### Phone Number Status

| Status | Mô tả |
|--------|-------|
| `active` | Số đang hoạt động bình thường |
| `inactive` | Tạm ngưng sử dụng |
| `porting` | Đang trong quá trình chuyển mạng/đăng ký |
| `suspended` | Bị khóa (do nhà mạng hoặc admin) |

### 4.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/phone-numbers` | Thêm số mới |
| `GET` | `/phone-numbers` | Danh sách số |
| `GET` | `/phone-numbers/:id` | Chi tiết số |
| `PATCH` | `/phone-numbers/:id` | Cập nhật |
| `DELETE` | `/phone-numbers/:id` | Xóa |
| `GET` | `/phone-numbers/resolve/:number` | Tìm số theo E.164 (dùng bởi AMI bridge) |

### 4.3 Example

```json
{
  "_id": "64d330001bdbfc44ef96cc03",
  "number": "+842412345678",
  "callerId": "+842412345678",
  "note": "Hotline CSKH",
  "status": "active",
  "owner": { "orgId": "64org001..." }
}
```

---

## 5. Routes

Luật định tuyến cuộc gọi theo điều kiện: số gọi, số nhận, hướng, ưu tiên.

### 5.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `name` | string | ✅ | Tên luật (vd: `Outbound Viettel`) |
| `direction` | enum | ✅ | `inbound` \| `outbound` \| `local` |
| `priority` | number | ✅ | Độ ưu tiên — số nhỏ hơn = ưu tiên cao hơn |
| `isActive` | boolean | ❌ | Bật/tắt luật, mặc định `true` |
| `condition` | object | ✅ | Điều kiện match (xem bên dưới) |
| `action` | object | ✅ | Hành động khi match (xem bên dưới) |
| `owner` | object | auto | |
| `createdBy` | object | auto | |
| `updatedBy` | object | auto | |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

#### Condition Object

| Field | Type | Mô tả |
|-------|------|-------|
| `fromAccountId` | ObjectId | ❌ | Từ account cụ thể |
| `fromNumber` | string | ❌ | Từ số cụ thể hoặc pattern (vd: `09*`) |
| `toNumber` | string | ❌ | Tới số cụ thể hoặc prefix pattern (vd: `024*`) |
| `nodeId` | ObjectId | ❌ | Giới hạn theo node |

#### Action Object

| Field | Type | Mô tả |
|-------|------|-------|
| `type` | enum | `trunk` \| `account` \| `dialplan` |
| `trunkId` | ObjectId | ❌ | Route qua trunk này |
| `accountId` | ObjectId | ❌ | Route tới account này |
| `dialplanId` | ObjectId | ❌ | Xử lý qua dialplan này |

### 5.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/routes` | Tạo luật |
| `GET` | `/routes` | Danh sách luật (sắp xếp theo priority) |
| `GET` | `/routes/:id` | Chi tiết |
| `PATCH` | `/routes/:id` | Cập nhật |
| `DELETE` | `/routes/:id` | Xóa |
| `POST` | `/routes/resolve` | Tìm route match cho một cuộc gọi cụ thể |

### 5.3 Example

```json
{
  "_id": "64e550001bdbfc44ef96ee05",
  "name": "Outbound — Viettel numbers",
  "direction": "outbound",
  "priority": 10,
  "isActive": true,
  "condition": {
    "toNumber": "09*",
    "nodeId": "64a920341bdbfc44ef96cc3c"
  },
  "action": {
    "type": "trunk",
    "trunkId": "64c220001bdbfc44ef96bb02"
  }
}
```

---

## 6. Dialplans

Cấu hình dialplan Asterisk — cách xử lý cuộc gọi khi vào một context.

### 6.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `name` | string | ✅ | Tên dialplan (vd: `IVR CSKH`) |
| `direction` | enum | ✅ | `inbound` \| `outbound` \| `local` |
| `context` | string | ✅ | Asterisk context name (vd: `inbound-cskh`) — unique trên node |
| `steps` | array | ✅ | Danh sách bước xử lý (xem bên dưới) |
| `syncStatus` | enum | auto | `pending` \| `synced` \| `error` |
| `syncedAt` | Date | auto | |
| `owner` | object | auto | |
| `createdBy` | object | auto | |
| `updatedBy` | object | auto | |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

#### Step Object

| Field | Type | Mô tả |
|-------|------|-------|
| `order` | number | Thứ tự thực hiện (bắt đầu từ 1) |
| `application` | string | Asterisk app: `Answer`, `Playback`, `Queue`, `Dial`, `AGI`, `Hangup`, v.v. |
| `parameters` | string | Tham số của app |

### 6.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `POST` | `/dialplans` | Tạo dialplan + trigger sync |
| `GET` | `/dialplans` | Danh sách |
| `GET` | `/dialplans/:id` | Chi tiết |
| `PATCH` | `/dialplans/:id` | Cập nhật + trigger re-sync |
| `DELETE` | `/dialplans/:id` | Xóa |
| `POST` | `/dialplans/:id/sync` | Force sync lên Asterisk |

### 6.3 Example

```json
{
  "_id": "64f660001bdbfc44ef96ff06",
  "name": "IVR CSKH",
  "direction": "inbound",
  "context": "inbound-cskh",
  "steps": [
    { "order": 1, "application": "Answer", "parameters": "" },
    { "order": 2, "application": "Playback", "parameters": "welcome-cskh" },
    { "order": 3, "application": "Queue", "parameters": "cskh-queue,t,,,30" },
    { "order": 4, "application": "Playback", "parameters": "sorry-busy" },
    { "order": 5, "application": "Hangup", "parameters": "" }
  ],
  "syncStatus": "synced",
  "syncedAt": "2026-04-19T07:00:00.000Z"
}
```

---

## 7. Call Logs

CDR (Call Detail Record) — ghi log đầy đủ mọi cuộc gọi. Được tạo bởi AMI bridge qua webhook, không tạo trực tiếp qua API client.

### 7.1 Schema

| Field | Type | Required | Mô tả |
|-------|------|----------|-------|
| `_id` | ObjectId | auto | Primary key |
| `cdr` | object | ❌ | Raw CDR object từ Asterisk AMI |
| `nodeId` | ObjectId | ✅ | Node xử lý cuộc gọi |
| `trunkId` | ObjectId | ❌ | Trunk được sử dụng |
| `dialplanId` | ObjectId | ❌ | Dialplan xử lý cuộc gọi |
| `phoneNumberId` | ObjectId | ❌ | DID number liên quan |
| `direction` | enum | ✅ | `inbound` \| `outbound` \| `local` |
| `fromNumber` | string | ✅ | Số gọi đi (E.164) |
| `toNumber` | string | ✅ | Số nhận (E.164) |
| `fromAccountId` | ObjectId | ❌ | Account gọi đi |
| `toAccountId` | ObjectId | ❌ | Account nhận |
| `result` | enum | ✅ | Kết quả cuộc gọi (xem bên dưới) |
| `startedAt` | Date | ✅ | Thời điểm bắt đầu dial |
| `answeredAt` | Date | ❌ | Thời điểm máy nhấc |
| `endedAt` | Date | ❌ | Thời điểm kết thúc |
| `duration` | number | auto | Tổng thời gian (giây) từ dial đến hangup |
| `answeredDuration` | number | auto | Thời gian đàm thoại (giây) từ answer đến hangup |
| `recordingFile` | string | ❌ | S3/MinIO object key (vd: `recordings/2026/04/19/<id>.wav`) — set bởi AMI bridge từ CDR event |
| `owner` | object | auto | |
| `createdBy` | object | auto | `{ type: "system", id: "ami-bridge" }` |
| `isDeleted` | boolean | auto | |
| `createdAt` | Date | auto | |
| `updatedAt` | Date | auto | |

#### Call Result Values

| Value | Mô tả |
|-------|-------|
| `answered` | Cuộc gọi được trả lời |
| `no_answer` | Không có người nhận |
| `busy` | Máy bận |
| `failed` | Lỗi kỹ thuật |
| `canceled` | Người gọi cúp trước khi được nhấc |

### 7.2 API Endpoints

| Method | Path | Mô tả |
|--------|------|-------|
| `GET` | `/call-logs` | Danh sách call logs (paginated) |
| `GET` | `/call-logs/:id` | Chi tiết cuộc gọi |
| `DELETE` | `/call-logs/:id` | Xóa log (soft delete) |
| `GET` | `/call-logs/stats` | Thống kê tổng hợp |
| `POST` | `/call-logs/originate` | Khởi tạo outbound call |
| `GET` | `/call-logs/:id/recording-url` | Lấy signed URL để phát lại recording (TTL 15 phút) |

### 7.3 Query Parameters

```
GET /call-logs?direction=inbound
GET /call-logs?result=answered
GET /call-logs?fromNumber=+84241234567
GET /call-logs?nodeId=xxx
GET /call-logs?fromAccountId=xxx
GET /call-logs?startedAt:gte=2026-04-01&startedAt:lte=2026-04-30
GET /call-logs?page=1&limit=50&sort=startedAt:desc
```

### 7.4 POST /call-logs/originate

**Request:**
```json
{
  "fromAccountId": "64b110001bdbfc44ef96aa01",
  "toNumber": "+84912345678"
}
```

**Response:**
```json
{
  "_id": "64g770001bdbfc44ef96gg07",
  "result": "queued",
  "message": "Call queued for origination"
}
```

### 7.5 GET /call-logs/:id/recording-url

File ghi âm được lưu trên S3/MinIO qua s3fs mount trên Asterisk server. VSM generate presigned URL để FE stream trực tiếp mà không qua backend.

**Response:**
```json
{
  "url": "https://minio.example.com/vsm-recordings/recordings/2026/04/19/<id>.wav?X-Amz-Expires=900&X-Amz-Signature=...",
  "expiresAt": "2026-04-19T08:15:00.000Z"
}
```

> Trả về `404` nếu `recordingFile` chưa có (cuộc gọi không được ghi âm hoặc CDR chưa về).

### 7.6 Example Call Log

```json
{
  "_id": "64g770001bdbfc44ef96gg07",
  "nodeId": "64a920341bdbfc44ef96cc3c",
  "trunkId": "64c220001bdbfc44ef96bb02",
  "direction": "outbound",
  "fromNumber": "+842412345678",
  "toNumber": "+84912345678",
  "fromAccountId": "64b110001bdbfc44ef96aa01",
  "result": "answered",
  "startedAt": "2026-04-19T08:00:00.000Z",
  "answeredAt": "2026-04-19T08:00:05.000Z",
  "endedAt": "2026-04-19T08:03:45.000Z",
  "duration": 225,
  "answeredDuration": 220,
  "recordingFile": "recordings/2026/04/19/64g770001bdbfc44ef96gg07.wav",
  "cdr": {
    "UniqueID": "1713510000.42",
    "Disposition": "ANSWERED",
    "RecordingFile": "/var/spool/asterisk/monitor/recordings/2026/04/19/64g770001bdbfc44ef96gg07.wav"
  }
}
```

---

## 8. Webhook — AMI Bridge

Internal endpoint nhận events từ AMI bridge. Xác thực bằng service token riêng, không dùng JWT.

### 8.1 POST /webhooks/ami

**Headers:**
```
Authorization: Bearer <AMI_BRIDGE_SERVICE_TOKEN>
Content-Type: application/json
```

**Request:**
```json
{
  "nodeId": "64a920341bdbfc44ef96cc3c",
  "event": "Cdr",
  "receivedAt": "2026-04-19T08:03:45.000Z",
  "payload": { ...rawAmiEvent }
}
```

### 8.2 Supported Events

| Event | Xử lý |
|-------|-------|
| `Cdr` | Tạo call-log; parse Disposition → result; tính duration, answeredDuration; extract S3 key từ `RecordingFile` |
| `PeerStatus` | Cập nhật `account.status` (online/offline) |
| `DeviceStateChange` | Cập nhật `account.state` (idle/ringing/in_call) |
| `DialBegin` | Cập nhật call-log state nếu có cdrId |
| `DialEnd` | Cập nhật call-log state theo DialStatus |
| `Hangup` | Finalize call-log nếu CDR chưa về |

### 8.3 RecordingFile — S3 Key Extraction

AMI bridge nhận `RecordingFile` từ CDR event là absolute path trên Asterisk server. Bridge strip prefix để lấy S3 object key trước khi gửi về VSM:

```
CDR.RecordingFile = "/var/spool/asterisk/monitor/recordings/2026/04/19/<id>.wav"
                                                 ↓ strip prefix
call-log.recordingFile = "recordings/2026/04/19/<id>.wav"   ← S3 key
```

---

## 9. Permission Matrix

| Role | nodes | accounts | trunks | phone-numbers | routes | dialplans | call-logs |
|------|-------|----------|--------|---------------|--------|-----------|-----------|
| `org.owner` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Read + Delete |
| `org.admin` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Full CRUD | Read |
| `org.editor` | Read | Own only | Read | Read | Read | Read | Own only |
| `org.viewer` | Read | Own only | — | Read | — | — | Own only |

> **Own only:** Chỉ xem records liên quan đến `userId` của mình.
