# LCM — API Design

## 1. Conventions

LCM tuân theo conventions chung của hydra-services:

- **Auth**: `JwtAuthGuard` (Bearer token từ IAM service)
- **Base URL**: `/` (service được proxy qua Nginx tại `/lcm/`)
- **Pagination**: `?page=1&limit=20` (default limit: 20)
- **Filtering**: `parseQueryString` operators (xem [CLAUDE.md](../../../CLAUDE.md))
- **Error format**: `GlobalExceptionFilter` — `{ statusCode, message, correlationId }`
- **Response**: plain object (không wrap thêm `data:`, `result:`)

## 2. Authentication

Tất cả endpoints đều yêu cầu JWT Bearer token, trừ `/health`.

```
Authorization: Bearer <jwt_token>
```

Token lấy từ IAM service (`POST /auth/login`). Payload chứa `userId`, `orgId`, `roles`.

Staff được link với IAM user qua field `staff.iamUserId`. Khi nhân viên gọi API, LCM lấy `staffCode` tương ứng từ `userId` trong token.

## 3. Endpoint List

### Health

```
GET /health
```

### Partner

```
POST   /partners
GET    /partners              ?code=&name:regex=&isActive=&page=&limit=&sort=
GET    /partners/:id
PATCH  /partners/:id
DELETE /partners/:id
```

### Customer

```
POST   /customers
GET    /customers             ?partnerCode=&callStaffCode=&fieldStaffCode=&status=&lovdd:gte=&page=&limit=&sort=
GET    /customers/:id
PATCH  /customers/:id
DELETE /customers/:id

# Endpoints bổ sung
GET    /customers/:id/contracts       # Lấy tất cả contracts của customer
GET    /customers/:id/activities      # Lịch sử liên lạc
```

### Contract

```
POST   /contracts
GET    /contracts             ?partnerCode=&customerCode=&status=&ovdDays:gte=&bucket=&page=&limit=&sort=
GET    /contracts/:id
PATCH  /contracts/:id
DELETE /contracts/:id
```

### Activity

```
POST   /activities
GET    /activities            ?contractCode=&customerCode=&staffCode=&type=&resultCode=&performAt:gte=&performAt:lte=&page=&limit=&sort=
GET    /activities/:id
PATCH  /activities/:id
DELETE /activities/:id
```

**Lưu ý POST /activities**: Sau khi tạo, service tự động cập nhật các cached fields trên Customer:
- `lastActivity`
- `acim` (tăng 1 nếu cùng tháng)
- `rcim` (thêm resultCode nếu chưa có)
- `lastPTPActivity` (nếu có ptpDate)

### Result

```
POST   /results
GET    /results               ?parentCode=&isActive=&isSelectable=
GET    /results/:id
PATCH  /results/:id
DELETE /results/:id
```

### Transaction

```
POST   /transactions
GET    /transactions          ?partnerCode=&contractCode=&customerCode=&staffCode=&date:gte=&date:lte=&source=&page=&limit=&sort=
GET    /transactions/:id
PATCH  /transactions/:id
DELETE /transactions/:id
```

### Investigation

```
POST   /investigations
GET    /investigations        ?customerCode=&staffCode=&typeCode=&page=&limit=&sort=
GET    /investigations/:id
PATCH  /investigations/:id
DELETE /investigations/:id
```

### Reference

```
POST   /references
GET    /references            ?customerCode=&relationCode=&page=&limit=&sort=
GET    /references/:id
PATCH  /references/:id
DELETE /references/:id
```

### Staff

```
POST   /staffs
GET    /staffs                ?type=&teamCode=&partnerCodes:in=&status=&page=&limit=&sort=
GET    /staffs/:id
PATCH  /staffs/:id
DELETE /staffs/:id
```

### Team

```
POST   /teams
GET    /teams                 ?partnerCodes:in=&status=&page=&limit=&sort=
GET    /teams/:id
PATCH  /teams/:id
DELETE /teams/:id
```

### Performance

```
POST   /performance
GET    /performance           ?staffCode=&year=&month=&page=&limit=
GET    /performance/:id
PATCH  /performance/:id
DELETE /performance/:id
```

### Import Data

```
POST   /import-data                   # Upload metadata, chưa process
GET    /import-data                   ?partnerCode=&status=&page=&limit=&sort=
GET    /import-data/:id
PATCH  /import-data/:id
DELETE /import-data/:id

PUT    /import-data/:id/process       # Trigger BullMQ ImportProcessorJob
PUT    /import-data/:id/cancel        # Hủy nếu status là new/read/queued
```

### Export Data

```
POST   /export-data                   # Tạo export job
GET    /export-data                   ?partnerCode=&status=&page=&limit=
GET    /export-data/:id
DELETE /export-data/:id
```

### Report

```
GET    /reports/summary               ?partnerCode=&year=&month=
GET    /reports/activity-stats        ?partnerCode=&staffCode=&from=&to=
GET    /reports/collection-rate       ?partnerCode=&year=&month=
GET    /reports/staff-performance     ?partnerCode=&year=&month=
```

## 4. Request / Response Patterns

### Create (POST)

```http
POST /contracts
Authorization: Bearer <token>
Content-Type: application/json

{
  "code": "VPB-2024-001",
  "partnerCode": "VPBANK",
  "customerCode": "KH-001",
  "productGroup": "personal-loan",
  "originalBalance": 50000000,
  "ovdBalance": 5000000,
  "ovdDays": 45,
  "bucket": 2,
  "status": "active"
}
```

```json
{
  "_id": "6642abc123...",
  "code": "VPB-2024-001",
  "partnerCode": "VPBANK",
  "orgId": "org_xxx",
  "createdBy": { "userId": "...", "roles": ["admin"] },
  "createdAt": "2026-05-01T10:00:00.000Z",
  "updatedAt": "2026-05-01T10:00:00.000Z"
}
```

### List (GET) với filtering

```http
GET /contracts?partnerCode=VPBANK&ovdDays:gte=30&bucket=2&sort=ovdDays:desc&page=1&limit=20
Authorization: Bearer <token>
```

```json
{
  "data": [ { ... }, { ... } ],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### Trigger Import Process

```http
PUT /import-data/6642abc123/process
Authorization: Bearer <token>
```

```json
{
  "_id": "6642abc123",
  "status": "queued",
  "updatedAt": "2026-05-01T10:05:00.000Z"
}
```

## 5. Filtering Reference

Dùng `parseQueryString` từ `@hydrabyte/base`:

```
?partnerCode=VPBANK              # exact match
?ovdDays:gte=30                  # ovdDays >= 30
?ovdDays:lte=90                  # ovdDays <= 90
?bucket:in=2,3,4                 # bucket IN [2,3,4]
?status:ne=closed                # status != 'closed'
?fullname:regex=nguyen           # fullname LIKE 'nguyen' (case-insensitive)
?sort=ovdDays:desc,createdAt:asc
?page=2&limit=50
```

## 6. Error Responses

```json
// 400 — Validation error
{
  "statusCode": 400,
  "message": ["code must not be empty"],
  "correlationId": "req_abc123"
}

// 401 — Unauthorized
{
  "statusCode": 401,
  "message": "Unauthorized",
  "correlationId": "req_abc123"
}

// 404 — Not found
{
  "statusCode": 404,
  "message": "Contract not found",
  "correlationId": "req_abc123"
}

// 409 — Conflict (duplicate code)
{
  "statusCode": 409,
  "message": "Contract code already exists",
  "correlationId": "req_abc123"
}
```

## 7. Các điểm cần quyết định

- **File upload cho import-data**: dùng multipart/form-data hay upload lên storage trước rồi truyền `fileId`? → Đề xuất: upload lên storage (S3/MinIO) trước, POST chỉ nhận `fileId` + metadata.
- **Report endpoints**: dùng MongoDB aggregation pipeline hay pre-compute? → Đề xuất: aggregation on-demand cho v1, pre-compute nếu cần hiệu suất sau.
- **Pagination default limit**: 20 hay 50? → Đề xuất: 20 (đồng nhất với các service khác).
