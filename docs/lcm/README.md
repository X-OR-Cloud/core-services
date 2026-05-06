# LCM — Loan Collection Management

Service quản lý thu hồi nợ (Loan Collection Management) cho các đối tác tài chính/ngân hàng. LCM là phiên bản thiết kế lại của `lcm-service` cũ, được port vào monorepo hydra-services theo đúng conventions của hệ thống.

## Business Domain

LCM phục vụ nghiệp vụ **thu hồi nợ tín dụng tiêu dùng**:

- Nhận danh sách hợp đồng vay quá hạn từ đối tác (ngân hàng, công ty tài chính)
- Phân công nhân viên (call agent, field agent) liên lạc khách hàng
- Ghi nhận kết quả liên lạc, cam kết thanh toán (PTP), điều tra thông tin
- Đồng bộ giao dịch thanh toán từ hệ thống đối tác
- Theo dõi hiệu suất thu hồi theo nhân viên, đội, tháng

## Service Info

| Thuộc tính | Giá trị |
|-----------|---------|
| **Service name** | `lcm` |
| **Port (dev)** | `3011` |
| **Port (prod)** | `3410–3419` |
| **Database** | MongoDB — `core_lcm` |
| **App modes** | `api`, `wrk` |

## Modules

| Module | Collection | Mô tả |
|--------|-----------|-------|
| [partner](design/data-model.md#partner) | `lcm_partners` | Đối tác / ngân hàng uỷ thác thu hồi |
| [customer](design/data-model.md#customer) | `lcm_customers` | Khách hàng vay |
| [contract](design/data-model.md#contract) | `lcm_contracts` | Hợp đồng vay — dư nợ, quá hạn, bucket |
| [activity](design/data-model.md#activity) | `lcm_activities` | Hoạt động liên lạc (call, SMS, visit, ...) |
| [result](design/data-model.md#result) | `lcm_results` | Danh mục kết quả activity |
| [transaction](design/data-model.md#transaction) | `lcm_transactions` | Giao dịch thanh toán thu hồi được |
| [investigation](design/data-model.md#investigation) | `lcm_investigations` | Điều tra thông tin khách hàng |
| [reference](design/data-model.md#reference) | `lcm_references` | Người tham chiếu của khách hàng |
| [staff](design/data-model.md#staff) | `lcm_staffs` | Nhân viên thu hồi |
| [team](design/data-model.md#team) | `lcm_teams` | Đội / nhóm nhân viên |
| [performance](design/data-model.md#performance) | `lcm_performance` | KPI tháng theo nhân viên |
| [import-data](design/data-model.md#importdata) | `lcm_import_data` | Quản lý file import từ đối tác |
| [export-data](design/data-model.md#exportdata) | `lcm_export_data` | Quản lý file export |
| [report](design/data-model.md#report) | *(aggregation)* | Báo cáo tổng hợp |

## Documentation Index

| File | Nội dung |
|------|---------|
| [analysis.md](analysis.md) | Phân tích lcm cũ — giữ gì, đổi gì, gap analysis |
| [design/architecture.md](design/architecture.md) | Kiến trúc service, app modes, cấu trúc module |
| [design/data-model.md](design/data-model.md) | Schema thiết kế mới theo BaseSchema conventions |
| [design/api-design.md](design/api-design.md) | API endpoints, auth, request/response patterns |
| [design/workers.md](design/workers.md) | BullMQ jobs — import, payment sync, data sync |
| [design/integrations.md](design/integrations.md) | Tích hợp với iam, noti và external systems |
| [implementation-plan.md](implementation-plan.md) | Thứ tự triển khai, effort estimate, checklist |

## Quick Start (sau khi implement)

```bash
# Build
./node_modules/.bin/nx run lcm:build

# Dev API
./node_modules/.bin/nx run lcm:api

# Dev Worker
./node_modules/.bin/nx run lcm:wrk

# TypeScript check
npx tsc --noEmit -p services/lcm/tsconfig.app.json

# Health check
curl http://localhost:3011/health
```
