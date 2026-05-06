# LCM — Data Model

Tất cả schema kế thừa `BaseSchema` từ `@hydrabyte/base`. `BaseSchema` cung cấp sẵn: `_id`, `orgId`, `isDeleted`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.

Collection names dùng prefix `lcm_` và phải khai báo tường minh (tránh lỗi obfuscation khi build production).

## Quan hệ tổng quan

```
Partner ──┬── Customer ──┬── Contract ──┬── Activity ──── Result
          │               │              ├── Transaction
          │               ├── Investigation
          │               └── Reference
          │
          └── Staff ─── Team
                └── Performance
```

---

## Partner

`collection: 'lcm_partners'`

Đối tác / ngân hàng uỷ thác thu hồi nợ.

```typescript
@Schema({ timestamps: true, collection: 'lcm_partners' })
export class Partner extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;               // Mã định danh đối tác, ví dụ: 'VPBANK', 'FECREDIT'

  @Prop({ required: true })
  name: string;

  @Prop()
  businessCode: string;       // Mã số doanh nghiệp

  @Prop()
  address: string;

  @Prop()
  note: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  startedAt: Date;            // Ngày bắt đầu hợp tác

  @Prop()
  endedAt: Date;              // Ngày kết thúc hợp tác (nếu có)
}
```

---

## Customer

`collection: 'lcm_customers'`

Khách hàng vay. Một customer có thể có nhiều contracts (đa vay).

```typescript
@Schema({ timestamps: true, collection: 'lcm_customers' })
export class Customer extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  partnerCode: string;        // Thuộc đối tác nào

  @Prop()
  callStaffCode: string;      // Nhân viên call được phân công

  @Prop()
  fieldStaffCode: string;     // Nhân viên field được phân công

  @Prop({ required: true })
  fullname: string;

  @Prop()
  gender: string;             // 'male' | 'female'

  @Prop()
  dob: string;                // Date of birth — string để tránh TZ issues

  @Prop()
  identityNumber: string;     // CMND / CCCD / Passport

  @Prop()
  mobileNumber: string;

  @Prop()
  officeNumber: string;

  @Prop()
  email: string;

  @Prop()
  temporaryAddress: string;   // Địa chỉ tạm trú

  @Prop()
  permanentAddress: string;   // Địa chỉ thường trú

  @Prop()
  officeAddress: string;

  @Prop()
  officeName: string;

  @Prop()
  jobPosition: string;

  @Prop()
  businessDomain: string;     // Lĩnh vực kinh doanh

  @Prop({ default: 'active', enum: ['active', 'closed', 'inactive'] })
  status: string;

  @Prop({ default: 0 })
  priority: number;           // Độ ưu tiên liên lạc (cao hơn = ưu tiên trước)

  // --- Computed/cached fields (cập nhật sau mỗi activity hoặc import) ---

  @Prop({ type: Object })
  lastActivity: {             // Cache hoạt động gần nhất
    activityId: string;
    type: string;
    resultCode: string;
    performAt: Date;
  };

  @Prop({ default: 0 })
  acim: number;               // Activity Count In Month — số lần liên lạc trong tháng

  @Prop({ default: 0 })
  tpaim: number;              // Total Payment Amount In Month

  @Prop({ default: 0 })
  tpafpim: number;            // Total Payment Amount From Partner In Month

  @Prop({ type: [String], default: [] })
  rcim: string[];             // Result Codes In Month — danh sách kết quả đã ghi nhận

  @Prop({ type: [String], default: [] })
  contractCodes: string[];    // Tất cả mã hợp đồng của customer này

  @Prop({ default: 0 })
  lovdd: number;              // Largest OVD Days — số ngày quá hạn lớn nhất trong các contracts

  @Prop()
  nextOVDDate: Date;          // Ngày đến hạn trả gần nhất

  @Prop({ type: Object })
  lastPTPActivity: {          // Cache PTP (Promise To Pay) gần nhất
    activityId: string;
    ptpDate: Date;
    ptpAmount: number;
  };

  @Prop()
  lastPaidDate: Date;

  @Prop({ default: 0 })
  lastPaidAmount: number;

  @Prop()
  note: string;
}
```

---

## Contract

`collection: 'lcm_contracts'`

Hợp đồng vay — đơn vị cốt lõi của nghiệp vụ thu hồi. Một customer có thể có nhiều contracts.

```typescript
@Schema({ timestamps: true, collection: 'lcm_contracts' })
export class Contract extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;               // Mã hợp đồng (từ hệ thống đối tác)

  @Prop({ required: true })
  partnerCode: string;

  @Prop({ required: true })
  customerCode: string;

  @Prop()
  guid: string;               // GUID từ hệ thống gốc (dùng để đối chiếu khi import)

  @Prop()
  customerCIF: string;        // Customer ID trong hệ thống ngân hàng

  @Prop()
  accountNo: string;          // Số tài khoản vay

  @Prop()
  productGroup: string;       // Loại sản phẩm: 'personal-loan', 'credit-card', 'mortgage', ...

  // --- Số dư & thanh toán ---

  @Prop({ default: 0 })
  originalBalance: number;    // Số tiền vay ban đầu

  @Prop({ default: 0 })
  totalBalance: number;       // Tổng dư nợ hiện tại

  @Prop({ default: 0 })
  ovdBalance: number;         // Dư nợ quá hạn (Overdue Balance)

  @Prop({ default: 0 })
  performingBalance: number;  // Dư nợ đang còn trong hạn

  @Prop({ default: 0 })
  periodicalPaymentAmount: number; // Số tiền phải trả định kỳ

  @Prop({ default: 0 })
  prAmount: number;           // Principal Amount — gốc

  @Prop({ default: 0 })
  inAmount: number;           // Interest Amount — lãi

  @Prop({ default: 0 })
  peAmount: number;           // Penalty Amount — phạt

  @Prop({ default: 0 })
  psAmount: number;           // Principal Shortfall Amount

  @Prop({ default: 0 })
  totalPaymentAmount: number; // Tổng đã thanh toán (ghi nhận trong hệ thống LCM)

  @Prop({ default: 0 })
  totalPaymentAmountFromPartner: number; // Tổng đã thanh toán theo đối tác xác nhận

  // --- Thời hạn & quá hạn ---

  @Prop()
  valueDate: Date;            // Ngày giải ngân

  @Prop()
  maturityDate: Date;         // Ngày đáo hạn

  @Prop()
  ovdDate: Date;              // Ngày bắt đầu quá hạn

  @Prop({ default: 0 })
  ovdDays: number;            // Số ngày quá hạn — field quan trọng nhất

  @Prop({ default: 0 })
  bucket: number;             // Risk bucket: 1-30, 31-60, 61-90, 91-180, 181-360, 360+

  @Prop()
  dueDayOfMonth: number;      // Ngày thanh toán hàng tháng (ví dụ: 15)

  @Prop()
  term: string;               // Kỳ hạn vay (ví dụ: '24M', '36M')

  @Prop()
  interestRate: number;       // Lãi suất %/năm

  // --- Thông tin chi nhánh ---

  @Prop()
  branchCode: string;

  @Prop()
  branchName: string;

  // --- Lịch sử thanh toán gần nhất ---

  @Prop({ default: 0 })
  lastPaymentAmount: number;

  @Prop()
  lastPaymentDate: Date;

  // --- Trạng thái ---

  @Prop({ default: 'active', enum: ['active', 'draft', 'closed', 'inactive'] })
  status: string;

  // --- Import tracking ---

  @Prop()
  importDataId: string;       // ID của ImportData record tạo ra contract này
}
```

**Bucket convention:**

| `bucket` | Ý nghĩa |
|---------|---------|
| 1 | 1–30 ngày quá hạn |
| 2 | 31–60 ngày |
| 3 | 61–90 ngày |
| 4 | 91–180 ngày |
| 5 | 181–360 ngày |
| 6 | > 360 ngày |

---

## Activity

`collection: 'lcm_activities'`

Mỗi lần nhân viên liên lạc khách hàng — call, SMS, visit, email, chat, letter, skip.

```typescript
@Schema({ timestamps: true, collection: 'lcm_activities' })
export class Activity extends BaseSchema {
  @Prop({ required: true })
  staffCode: string;          // Nhân viên thực hiện

  @Prop({ required: true })
  contractCode: string;       // Hợp đồng được liên lạc

  @Prop({ required: true })
  customerCode: string;

  @Prop({ required: true, enum: ['call', 'sms', 'email', 'chat', 'letter', 'visit', 'skip'] })
  type: string;

  @Prop({ type: Object })
  contactInfo: {
    relation: { code: string; name: string };  // Mối quan hệ người được liên lạc
    fullname: string;
    phoneNumber: string;
    facebookId?: string;
    zaloId?: string;
    address?: string;
    note?: string;
  };

  @Prop()
  resultCode: string;         // Kết quả (xem Result entity) — empty = chưa báo cáo

  @Prop()
  resultParentCode: string;   // Parent của resultCode

  @Prop()
  ptpDate: Date;              // Promise To Pay date — ngày khách hẹn thanh toán

  @Prop({ default: 0 })
  ptpAmount: number;          // Số tiền khách hẹn trả

  @Prop()
  note: string;

  @Prop()
  performAt: Date;            // Thời điểm thực hiện (có thể khác createdAt nếu nhập muộn)
}
```

---

## Result

`collection: 'lcm_results'`

Danh mục kết quả activity. Được quản lý bởi admin, dùng như lookup table.

```typescript
@Schema({ timestamps: true, collection: 'lcm_results' })
export class Result extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;               // Ví dụ: 'PAID', 'PROMISED', 'REFUSED', 'NOT_CONTACT'

  @Prop()
  parentCode: string;         // Phân loại cha, ví dụ: 'CONTACT', 'NO_CONTACT'

  @Prop({ required: true })
  name: string;               // Tên hiển thị

  @Prop()
  note: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  isSelectable: boolean;      // false = chỉ dùng làm parent category, không chọn được trong UI

  @Prop({ default: 0 })
  index: number;              // Thứ tự hiển thị
}
```

**Ví dụ result codes:**

| Code | Parent | Ý nghĩa |
|------|--------|---------|
| `PAID` | `CONTACT` | Đã thanh toán |
| `PROMISED` | `CONTACT` | Hẹn ngày thanh toán |
| `PARTIAL_PAID` | `CONTACT` | Thanh toán một phần |
| `REFUSED` | `CONTACT` | Từ chối thanh toán |
| `NOT_OWNER` | `CONTACT` | Không phải chủ số |
| `NOT_CONTACT` | — | Không liên lạc được |
| `WRONG_NUMBER` | `NOT_CONTACT` | Sai số |
| `NO_ANSWER` | `NOT_CONTACT` | Không bắt máy |

---

## Transaction

`collection: 'lcm_transactions'`

Giao dịch thanh toán. Nguồn gốc có thể từ import file hoặc đồng bộ tự động từ MSSQL.

```typescript
@Schema({ timestamps: true, collection: 'lcm_transactions' })
export class Transaction extends BaseSchema {
  @Prop({ required: true })
  partnerCode: string;

  @Prop({ required: true })
  customerCode: string;

  @Prop({ required: true })
  contractCode: string;

  @Prop()
  staffCode: string;          // Nhân viên ghi nhận (nếu manual)

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  date: Date;                 // Ngày thanh toán thực tế

  @Prop()
  importDataId: string;       // Từ file import nào (nếu có)

  @Prop()
  externalRef: string;        // Reference từ hệ thống đối tác (để tránh duplicate)

  @Prop({ default: 'lcm', enum: ['lcm', 'partner', 'mssql'] })
  source: string;             // Nguồn gốc giao dịch
}
```

---

## Investigation

`collection: 'lcm_investigations'`

Kết quả điều tra thông tin khách hàng (tìm SĐT mới, địa chỉ, mạng xã hội).

```typescript
@Schema({ timestamps: true, collection: 'lcm_investigations' })
export class Investigation extends BaseSchema {
  @Prop({ required: true })
  customerCode: string;

  @Prop({ required: true })
  staffCode: string;

  @Prop({ required: true, enum: ['phone-number', 'email', 'address', 'social-network', 'other'] })
  typeCode: string;

  @Prop({ required: true })
  value: string;              // SĐT / email / địa chỉ / URL mạng XH tìm được

  @Prop()
  note: string;

  @Prop()
  date: Date;

  @Prop()
  importDataId: string;
}
```

---

## Reference

`collection: 'lcm_references'`

Người tham chiếu — người thân / bạn bè của khách hàng được ghi nhận khi vay.

```typescript
@Schema({ timestamps: true, collection: 'lcm_references' })
export class Reference extends BaseSchema {
  @Prop({ required: true })
  customerCode: string;

  @Prop()
  relationCode: string;       // 'parent', 'spouse', 'sibling', 'friend', 'colleague', ...

  @Prop()
  fullname: string;

  @Prop()
  gender: string;

  @Prop()
  dob: string;

  @Prop()
  identityNumber: string;

  @Prop()
  mobileNumber: string;

  @Prop()
  officeNumber: string;

  @Prop()
  email: string;

  @Prop()
  temporaryAddress: string;

  @Prop()
  permanentAddress: string;

  @Prop()
  note: string;

  @Prop()
  importDataId: string;
}
```

---

## Staff

`collection: 'lcm_staffs'`

Nhân viên thu hồi nợ (call agent, field agent, supervisor).

```typescript
@Schema({ timestamps: true, collection: 'lcm_staffs' })
export class Staff extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;               // Mã nhân viên

  @Prop({ required: true })
  fullname: string;

  @Prop()
  email: string;

  @Prop()
  phoneNumber: string;

  @Prop({ required: true, enum: ['call', 'field', 'supervisor', 'admin'] })
  type: string;               // Loại nhân viên

  @Prop()
  teamCode: string;           // Thuộc đội nào

  @Prop()
  partnerCodes: string[];     // Có thể handle nhiều đối tác

  @Prop()
  iamUserId: string;          // Link với IAM user (để auth)

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @Prop()
  note: string;
}
```

---

## Team

`collection: 'lcm_teams'`

Đội / nhóm nhân viên.

```typescript
@Schema({ timestamps: true, collection: 'lcm_teams' })
export class Team extends BaseSchema {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop()
  leaderStaffCode: string;    // Trưởng nhóm

  @Prop()
  partnerCodes: string[];     // Đội phụ trách đối tác nào

  @Prop({ default: 'active', enum: ['active', 'inactive'] })
  status: string;

  @Prop()
  note: string;
}
```

---

## Performance

`collection: 'lcm_performance'`

KPI hàng tháng theo nhân viên — lưu cả chỉ tiêu (targets) và kết quả thực tế (results).

```typescript
@Schema({ timestamps: true, collection: 'lcm_performance' })
export class Performance extends BaseSchema {
  @Prop({ required: true })
  year: number;

  @Prop({ required: true })
  month: number;              // 1–12

  @Prop({ required: true })
  staffCode: string;

  @Prop({ type: [Object], default: [] })
  targets: Array<{
    code: string;             // Ví dụ: 'total_calls', 'collection_amount', 'recovery_rate'
    type: 'number' | 'percentage';
    value: number;
  }>;

  @Prop({ type: [Object], default: [] })
  results: Array<{
    code: string;
    type: 'number' | 'percentage';
    value: number;
  }>;
}
```

---

## ImportData

`collection: 'lcm_import_data'`

Quản lý lifecycle của file import từ đối tác. Một file có thể chứa nhiều sheets, mỗi sheet map vào một collection.

```typescript
@Schema({ timestamps: true, collection: 'lcm_import_data' })
export class ImportData extends BaseSchema {
  @Prop({ required: true })
  fileName: string;

  @Prop()
  fileId: string;             // File ID trên storage (S3, GridFS, ...)

  @Prop({ required: true })
  partnerCode: string;

  @Prop({ type: Object })
  info: {
    rowCount?: number;
    sheets?: Array<{ name: string; rowCount: number }>;
  };

  @Prop({ type: Object, required: true })
  settings: {
    closeAll: boolean;        // Đóng tất cả contract cũ trước khi import
    sheets: Array<{
      name: string;           // Tên sheet trong Excel
      toCollection: 'customers' | 'contracts' | 'investigations' | 'activities' | 'references' | 'transactions';
      rule: 'replace-all' | 'delete-all' | 'append';
      fieldMappings?: Record<string, string>; // Excel column → entity field
    }>;
  };

  @Prop({ default: 'new', enum: ['new', 'read', 'queued', 'processing', 'failed', 'cancelled', 'done'] })
  status: string;

  @Prop({ type: Object })
  processResult: {
    totalRows: number;
    successRows: number;
    failedRows: number;
    errors?: Array<{ row: number; message: string }>;
  };

  @Prop()
  note: string;
}
```

**ImportData status machine:**

```
new → read → queued → processing → done
                              └──→ failed
      cancelled (at any stage before processing)
```

---

## ExportData

`collection: 'lcm_export_data'`

Theo dõi các job export data ra file.

```typescript
@Schema({ timestamps: true, collection: 'lcm_export_data' })
export class ExportData extends BaseSchema {
  @Prop({ required: true })
  partnerCode: string;

  @Prop({ required: true, enum: ['activities', 'contracts', 'customers', 'transactions', 'performance'] })
  targetCollection: string;

  @Prop({ type: Object })
  filter: Record<string, any>; // MongoDB query filter

  @Prop({ default: 'pending', enum: ['pending', 'processing', 'done', 'failed'] })
  status: string;

  @Prop()
  fileId: string;             // Kết quả file sau khi export xong

  @Prop()
  fileName: string;

  @Prop()
  note: string;
}
```
