# LCM — Phân tích lcm-service cũ

Tài liệu này so sánh `lcm-service` (repo độc lập) với conventions của hydra-services, xác định những gì giữ nguyên, những gì cần đổi khi port sang monorepo.

## 1. Tổng quan lcm-service cũ

- **Framework**: NestJS 8.x, TypeScript
- **ORM**: TypeORM 0.2.x (MongoDB driver)
- **Message queue**: RabbitMQ (amqplib)
- **Database**: MongoDB (primary) + MSSQL (legacy payment sync)
- **Background workers**: Custom worker classes, cron-based
- **Auth**: JWT + Basic Auth (Passport)
- **Deployment**: PM2, 3 app modes (`api` / `microservice` / `worker`)
- **Codebase**: ~240 TypeScript files, ~19,000 LOC, 21 modules

## 2. Gap Analysis

### 2.1 ORM & Schema

| Khía cạnh | lcm cũ | hydra-services mới | Hành động |
|-----------|--------|-------------------|-----------|
| ORM | TypeORM 0.2.x (MongoDB) | Mongoose + `@nestjs/mongoose` | **Đổi**: viết lại schema dùng `BaseSchema` |
| Base entity | Custom `BaseEntity` (TypeORM) | `BaseSchema` từ `@hydrabyte/base` | **Đổi**: kế thừa `BaseSchema` |
| Collection name | Tự động từ class name | Khai báo tường minh (`collection: 'lcm_...'`) | **Đổi**: thêm prefix `lcm_` để tránh xung đột |
| Soft delete | Custom `isDeleted` field | Built-in trong `BaseSchema` | **Giữ**: tương thích, không cần viết lại |
| Audit fields | `createdBy`, `updatedBy` | Built-in trong `BaseSchema` | **Giữ**: tương thích |

### 2.2 Base Service & Controller

| Khía cạnh | lcm cũ | hydra-services mới | Hành động |
|-----------|--------|-------------------|-----------|
| Base CRUD | `BaseService` + `BaseController` (custom) | `BaseService` từ `@hydrabyte/base` | **Đổi**: dùng `BaseService` của monorepo |
| RBAC | `RolesGuard` + `@Roles()` custom | Built-in trong `BaseService` (`orgId` scope) | **Đổi**: bỏ custom guards, dùng `BaseService` |
| Controller pattern | Kế thừa `BaseController` | Controller riêng, inject service, `@CurrentUser()` | **Đổi**: không dùng `BaseController`, viết controller theo pattern mới |
| Request context | Custom `RequestContext` | `RequestContext` từ `@hydrabyte/base` | **Giữ concept**: dùng `@CurrentUser()` |

### 2.3 Authentication

| Khía cạnh | lcm cũ | hydra-services mới | Hành động |
|-----------|--------|-------------------|-----------|
| Auth strategy | JWT + Basic Auth (dual) | JWT (`JwtAuthGuard`) + `CombinedAuthGuard` | **Đổi**: dùng guards từ `@hydrabyte/base` |
| JWT config | Self-contained JWT module | Dùng chung JWT secret từ IAM | **Đổi**: align với IAM service |
| Role check | Custom `@Roles()` + `RolesGuard` | `orgId`-scoped trong `BaseService` | **Đổi**: bỏ Basic Auth, chỉ dùng JWT |

### 2.4 Message Queue & Workers

| Khía cạnh | lcm cũ | hydra-services mới | Hành động |
|-----------|--------|-------------------|-----------|
| Queue system | RabbitMQ (`@nestjs/microservices`) | BullMQ (Redis-based) | **Đổi**: thay RabbitMQ bằng BullMQ |
| Import processor | RabbitMQ consumer (`EventPattern`) | BullMQ Processor (`@Processor`) | **Đổi**: viết lại job processor |
| Payment sync | Custom cron worker (MSSQL → MongoDB) | BullMQ job với Redis lock | **Đổi**: wrap logic cũ vào BullMQ job |
| Data migration/sync | Custom worker, `queuedAt`/`syncedAt` flags | BullMQ job có retry, backoff | **Đổi**: bỏ flag polling, dùng BullMQ queue |
| Scheduler | `cron` package thủ công | `@nestjs/schedule` | **Đổi**: dùng `@nestjs/schedule` |

### 2.5 Database

| Khía cạnh | lcm cũ | hydra-services mới | Hành động |
|-----------|--------|-------------------|-----------|
| MongoDB | TypeORM MongoDB driver | Mongoose | **Đổi**: viết lại schema/repo |
| MSSQL | mssql driver (payment sync) | Giữ nguyên qua BullMQ job | **Giữ**: logic đồng bộ MSSQL vẫn cần, nhưng wrap vào worker |
| Voice DB | Separate MongoDB (`voice`) | Có thể tách module `call` riêng | **Xem xét**: để scope v1, bỏ module `call` |
| DB name | Cấu hình qua `MONGODB_URL` | `core_lcm` theo convention | **Đổi**: `DatabaseNamePrefix + 'lcm'` |

### 2.6 Modules — Giữ / Bỏ / Merge

| Module cũ | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `contract` | ✅ Giữ | Core module |
| `customer` | ✅ Giữ | Core module |
| `activity` | ✅ Giữ | Core module |
| `result` | ✅ Giữ | Danh mục kết quả |
| `transaction` | ✅ Giữ | Giao dịch thanh toán |
| `investigation` | ✅ Giữ | Điều tra thông tin |
| `reference` | ✅ Giữ | Người tham chiếu |
| `partner` | ✅ Giữ | Đối tác/ngân hàng |
| `staff` | ✅ Giữ | Nhân viên |
| `team` | ✅ Giữ | Đội nhóm |
| `performance` | ✅ Giữ | KPI |
| `import-data` | ✅ Giữ | Đổi: queue sang BullMQ |
| `export-data` | ✅ Giữ | Ít thay đổi |
| `report` | ✅ Giữ | Aggregation queries |
| `data-migration` | 🔄 Refactor | Thay bằng BullMQ DataSyncJob |
| `data-handler` | 🔄 Merge | Merge vào import-data / utils |
| `event` | ❌ Bỏ | RabbitMQ-specific, không cần trong BullMQ model |
| `call` | ⏸ Để sau | Voice DB riêng, phức tạp — để scope v2 |
| `scheduled-task` | 🔄 Refactor | Dùng `@nestjs/schedule` thay cron thủ công |
| `utils` | 🔄 Merge | Merge vào `common/` của service |

## 3. Những gì giữ nguyên từ lcm cũ

- **Business logic** của các module core (contract, customer, activity, transaction)
- **Entity fields** — cấu trúc dữ liệu hầu hết tương đồng, chỉ đổi decorator
- **Import processing logic** — parse Excel sheets, map sang collections
- **MSSQL payment sync logic** — giữ nguyên SQL query, chỉ đổi trigger mechanism
- **PTP flow** — `ptpDate`, `ptpAmount` tracking trong activity
- **Bucket / OVD Days** logic trong contract
- **Performance KPI** structure (targets + results)

## 4. Những thay đổi quan trọng nhất

1. **TypeORM → Mongoose**: toàn bộ entity cần viết lại dùng `@Schema()` / `@Prop()`
2. **RabbitMQ → BullMQ**: import processor và các async jobs chuyển sang BullMQ
3. **Custom base → `@hydrabyte/base`**: `BaseSchema`, `BaseService`, guards, decorators
4. **Polling workers → BullMQ jobs**: bỏ cơ chế `queuedAt`/`syncedAt` flag polling
5. **Collection prefix**: thêm `lcm_` vào tất cả collection names
6. **Module `call` để v2**: tránh phức tạp dual-database ở v1

## 5. Rủi ro khi port

| Rủi ro | Mức độ | Biện pháp |
|--------|--------|-----------|
| Mất data khi migrate MongoDB schema | Cao | Viết migration script riêng, test trên staging trước |
| MSSQL payment sync bị gián đoạn | Cao | Giữ lcm cũ chạy song song đến khi lcm mới stable |
| Import Excel logic phức tạp | Trung bình | Port nguyên logic, chỉ đổi queue mechanism |
| Performance của aggregation queries | Trung bình | Verify index sau khi chuyển Mongoose |
| Auth token incompatibility | Thấp | Dùng chung JWT secret với IAM |
