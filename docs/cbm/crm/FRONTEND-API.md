# CBM CRM — Tài liệu Nghiệp vụ & API

> Dành cho Frontend Developer  
> Base URL: `https://api.hydrabyte.co/cbm`  
> Tất cả endpoints yêu cầu header: `Authorization: Bearer <JWT_TOKEN>`

---

## Mục lục

1. [Company (Công ty)](#1-company-công-ty)
2. [Contact (Liên hệ)](#2-contact-liên-hệ)
3. [Interaction (Tương tác)](#3-interaction-tương-tác)

---

## 1. Company (Công ty)

### 1.1 Entity Schema

Company là entity quản lý tổ chức/công ty đối tác — bao gồm khách hàng, đối tác, nhà cung cấp. Đây là master record cho các module CRM và Finance.

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `types[]` | `customer` | Khách hàng |
| `types[]` | `partner` | Đối tác |
| `types[]` | `vendor` | Nhà cung cấp |
| `status` | `active` | Đang hoạt động |
| `status` | `inactive` | Ngừng hoạt động |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439011"` |
| `name` | `string` | ✅ | Tên công ty (tối đa 200 ký tự) | `"Công ty TNHH ABC"` |
| `types` | `string[]` | - | Phân loại (multi-value) | `["customer", "partner"]` |
| `taxCode` | `string` | - | Mã số thuế (tối đa 20 ký tự) | `"0123456789"` |
| `website` | `string` | - | Website (tối đa 200 ký tự) | `"https://abc.vn"` |
| `industry` | `string` | - | Ngành nghề (tối đa 100 ký tự) | `"Công nghệ thông tin"` |
| `phone` | `string` | - | Số điện thoại (tối đa 50 ký tự) | `"+84 24 1234 5678"` |
| `email` | `string` | - | Email liên hệ (tối đa 200 ký tự) | `"info@abc.vn"` |
| `address` | `object` | - | Địa chỉ (xem bên dưới) | |
| `tags` | `string[]` | - | Nhãn phân loại tự do | `["vip", "q1-target"]` |
| `notes` | `string` | - | Ghi chú nội bộ (tối đa 2000 ký tự) | |
| `status` | `string` | - | Trạng thái (mặc định: `active`) | `"active"` |

#### Nested Object: `address`

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `street` | `string` | Số nhà, tên đường |
| `city` | `string` | Thành phố |
| `province` | `string` | Tỉnh/thành phố |
| `country` | `string` | Quốc gia |
| `postalCode` | `string` | Mã bưu điện |

#### Trường kế thừa từ BaseSchema

| Trường | Kiểu | Ý nghĩa |
|--------|------|---------|
| `owner.orgId` | `string` | ID tổ chức sở hữu |
| `createdBy` | `object` | Người tạo |
| `updatedBy` | `object` | Người cập nhật lần cuối |
| `isDeleted` | `boolean` | Soft delete flag |
| `deletedAt` | `Date` | Thời điểm xoá |
| `createdAt` | `Date` | Thời điểm tạo |
| `updatedAt` | `Date` | Thời điểm cập nhật |

---

### 1.2 API Endpoints

#### `POST /companies`

Tạo công ty mới. Status mặc định là `active`.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `name` | `string` | ✅ | `"Công ty TNHH ABC"` |
| `types` | `string[]` | - | `["customer"]` |
| `taxCode` | `string` | - | `"0123456789"` |
| `website` | `string` | - | `"https://abc.vn"` |
| `industry` | `string` | - | `"Công nghệ thông tin"` |
| `phone` | `string` | - | `"+84 24 1234 5678"` |
| `email` | `string` | - | `"info@abc.vn"` |
| `address` | `object` | - | `{ "city": "Hà Nội", "country": "VN" }` |
| `tags` | `string[]` | - | `["vip"]` |
| `notes` | `string` | - | |

**Request Sample**
```json
{
  "name": "Công ty TNHH ABC Technology",
  "types": ["customer"],
  "taxCode": "0123456789",
  "website": "https://abc.vn",
  "industry": "Công nghệ thông tin",
  "phone": "+84 24 1234 5678",
  "email": "info@abc.vn",
  "address": {
    "street": "123 Nguyễn Huệ",
    "city": "Hà Nội",
    "country": "VN"
  },
  "tags": ["vip"],
  "notes": "Khách hàng tiềm năng Q2"
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Tạo thành công, trả về object company |
| `400 Bad Request` | Dữ liệu không hợp lệ |
| `401 Unauthorized` | Chưa xác thực |

```json
// 201 Created
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "Công ty TNHH ABC Technology",
  "types": ["customer"],
  "taxCode": "0123456789",
  "website": "https://abc.vn",
  "industry": "Công nghệ thông tin",
  "phone": "+84 24 1234 5678",
  "email": "info@abc.vn",
  "address": {
    "street": "123 Nguyễn Huệ",
    "city": "Hà Nội",
    "country": "VN"
  },
  "tags": ["vip"],
  "notes": "Khách hàng tiềm năng Q2",
  "status": "active",
  "owner": { "orgId": "69b6d88e8aaa1f3071e51777" },
  "createdAt": "2026-04-09T10:00:00.000Z",
  "updatedAt": "2026-04-09T10:00:00.000Z"
}
```

---

#### `GET /companies`

Danh sách công ty với phân trang, tìm kiếm và thống kê.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `search` | `string` | Tìm kiếm trong: name, taxCode, notes (regex), tags (exact) | `?search=ABC` |
| `page` | `number` | Trang hiện tại (mặc định: 1) | `?page=1` |
| `limit` | `number` | Số kết quả mỗi trang (mặc định: 20) | `?limit=20` |
| `sort` | `string` | Sắp xếp | `?sort=createdAt:desc` |
| `filter[status]` | `string` | Lọc theo trạng thái | `?filter[status]=active` |
| `filter[types]` | `string` | Lọc theo loại | `?filter[types]=customer` |
| `filter[tags]` | `string` | Lọc theo tag | `?filter[tags]=vip` |

> Hỗ trợ toán tử `parseQueryString`: `field:gt`, `field:gte`, `field:lt`, `field:lte`, `field:ne`, `field:in`, `field:nin`, `field:regex`

**Response**

```json
// 200 OK
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Công ty TNHH ABC Technology",
      "types": ["customer"],
      "status": "active",
      "createdAt": "2026-04-09T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "statistics": {
    "total": 45,
    "byStatus": {
      "active": 38,
      "inactive": 7
    }
  }
}
```

---

#### `GET /companies/:id`

Lấy chi tiết công ty theo ID.

**Params**

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` (ObjectId) | ID công ty |

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về object company đầy đủ |
| `404 Not Found` | Không tìm thấy công ty |
| `401 Unauthorized` | Chưa xác thực |

---

#### `PATCH /companies/:id`

Cập nhật thông tin công ty.

**Body** — Tất cả các field đều optional (giống CreateCompanyDto nhưng không có field bắt buộc).

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về object company đã cập nhật |
| `404 Not Found` | Không tìm thấy công ty |
| `400 Bad Request` | Dữ liệu không hợp lệ |

---

#### `DELETE /companies/:id`

Xoá mềm công ty (soft delete). Không phân biệt trạng thái.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Xoá thành công |
| `404 Not Found` | Không tìm thấy công ty |

---

#### `POST /companies/:id/activate`

Kích hoạt công ty. Chuyển trạng thái `inactive → active`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về company với status `active` |
| `400 Bad Request` | Công ty đã ở trạng thái `active` |
| `404 Not Found` | Không tìm thấy công ty |

---

#### `POST /companies/:id/deactivate`

Vô hiệu hoá công ty. Chuyển trạng thái `active → inactive`.

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về company với status `inactive` |
| `400 Bad Request` | Công ty đã ở trạng thái `inactive` |
| `404 Not Found` | Không tìm thấy công ty |

---

### 1.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/companies` | Tạo công ty mới |
| `GET` | `/companies` | Danh sách công ty (phân trang + thống kê) |
| `GET` | `/companies/:id` | Chi tiết công ty |
| `PATCH` | `/companies/:id` | Cập nhật công ty |
| `DELETE` | `/companies/:id` | Xoá mềm công ty |
| `POST` | `/companies/:id/activate` | Kích hoạt công ty |
| `POST` | `/companies/:id/deactivate` | Vô hiệu hoá công ty |

---

## 2. Contact (Liên hệ)

### 2.1 Entity Schema

Contact là entity quản lý cá nhân — đại diện khách hàng, đầu mối liên hệ của đối tác hoặc nhà cung cấp. Một contact có thể thuộc một Company hoặc là freelancer/cá nhân độc lập.

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `types[]` | `customer` | Khách hàng |
| `types[]` | `partner` | Đối tác |
| `types[]` | `vendor` | Nhà cung cấp |
| `status` | `active` | Đang hoạt động |
| `status` | `inactive` | Ngừng hoạt động |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439012"` |
| `name` | `string` | ✅ | Họ tên (tối đa 200 ký tự) | `"Nguyễn Văn A"` |
| `types` | `string[]` | - | Phân loại (multi-value) | `["customer"]` |
| `companyId` | `string` | - | ID công ty liên kết (tùy chọn) | `"507f1f77bcf86cd799439011"` |
| `email` | `string` | - | Email (tối đa 200 ký tự, validate format) | `"nva@abc.vn"` |
| `phone` | `string` | - | Số điện thoại (tối đa 50 ký tự) | `"+84 912 345 678"` |
| `jobTitle` | `string` | - | Chức vụ (tối đa 100 ký tự) | `"Giám đốc kỹ thuật"` |
| `address` | `string` | - | Địa chỉ (tối đa 200 ký tự) | `"123 Nguyễn Huệ, Hà Nội"` |
| `platformLinks` | `object[]` | - | Liên kết tài khoản chat (xem bên dưới) | |
| `tags` | `string[]` | - | Nhãn phân loại | `["vip", "hot-lead"]` |
| `notes` | `string` | - | Ghi chú nội bộ (tối đa 2000 ký tự) | |
| `status` | `string` | - | Trạng thái (mặc định: `active`) | `"active"` |

#### Nested Object: `platformLinks[]`

Lưu trữ thông tin tài khoản của contact trên các nền tảng chat (Discord, Telegram, Zalo, Slack...).

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|--------|------|----------|---------|
| `platform` | `string` | ✅ | Tên nền tảng (tối đa 50 ký tự) |
| `platformUserId` | `string` | ✅ | User ID trên nền tảng đó |
| `platformUsername` | `string` | - | Username/display name trên nền tảng |

> Cặp `(platform, platformUserId)` phải là duy nhất trong một contact.

#### Trường kế thừa từ BaseSchema

Tương tự Company: `owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 2.2 API Endpoints

#### `POST /contacts`

Tạo contact mới. Status mặc định là `active`.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `name` | `string` | ✅ | `"Nguyễn Văn A"` |
| `types` | `string[]` | - | `["customer"]` |
| `companyId` | `string` | - | `"507f1f77bcf86cd799439011"` |
| `email` | `string` | - | `"nva@abc.vn"` |
| `phone` | `string` | - | `"+84 912 345 678"` |
| `jobTitle` | `string` | - | `"Giám đốc kỹ thuật"` |
| `address` | `string` | - | `"123 Nguyễn Huệ, Hà Nội"` |
| `platformLinks` | `object[]` | - | `[{ "platform": "discord", "platformUserId": "107499..." }]` |
| `tags` | `string[]` | - | `["vip"]` |
| `notes` | `string` | - | |

**Request Sample**
```json
{
  "name": "Nguyễn Văn A",
  "types": ["customer"],
  "companyId": "507f1f77bcf86cd799439011",
  "email": "nva@abc.vn",
  "phone": "+84 912 345 678",
  "jobTitle": "Giám đốc kỹ thuật",
  "platformLinks": [
    {
      "platform": "discord",
      "platformUserId": "1074993237363802122",
      "platformUsername": "nva#0001"
    }
  ],
  "tags": ["vip"]
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Tạo thành công |
| `400 Bad Request` | Dữ liệu không hợp lệ (email sai format...) |
| `401 Unauthorized` | Chưa xác thực |

---

#### `GET /contacts`

Danh sách contact với phân trang và tìm kiếm.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `search` | `string` | Tìm trong: name, email, notes (regex), tags (exact) | `?search=nguyen` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=20` |
| `sort` | `string` | Sắp xếp | `?sort=name:asc` |
| `filter[companyId]` | `string` | Lọc theo công ty | `?filter[companyId]=507f...` |
| `filter[status]` | `string` | Lọc theo trạng thái | `?filter[status]=active` |
| `filter[types]` | `string` | Lọc theo loại | `?filter[types]=customer` |

**Response**

```json
// 200 OK
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  },
  "statistics": {
    "total": 120,
    "byStatus": {
      "active": 105,
      "inactive": 15
    }
  }
}
```

---

#### `GET /contacts/:id`

Lấy chi tiết contact theo ID.

**Response**: `200 OK` | `404 Not Found`

---

#### `PATCH /contacts/:id`

Cập nhật thông tin contact. Không thể cập nhật `status` qua endpoint này (dùng action endpoints Phase 3).

**Body** — Tất cả field optional, tương tự CreateContactDto.

---

#### `DELETE /contacts/:id`

Xoá mềm contact.

**Response**: `200 OK` | `404 Not Found`

---

#### `POST /contacts/:id/platform-links`

Thêm một liên kết nền tảng chat cho contact.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `platform` | `string` | ✅ | `"telegram"` |
| `platformUserId` | `string` | ✅ | `"987654321"` |
| `platformUsername` | `string` | - | `"@nva_telegram"` |

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Trả về contact đã cập nhật |
| `409 Conflict` | Cặp `(platform, platformUserId)` đã tồn tại |
| `404 Not Found` | Không tìm thấy contact |

---

#### `DELETE /contacts/:id/platform-links/:platform/:platformUserId`

Xóa một liên kết nền tảng khỏi contact.

**Params**

| Tên | Kiểu | Ý nghĩa |
|-----|------|---------|
| `id` | `string` | ID contact |
| `platform` | `string` | Tên nền tảng, ví dụ: `discord` |
| `platformUserId` | `string` | User ID trên nền tảng |

**Response**

| Status | Mô tả |
|--------|-------|
| `200 OK` | Trả về contact đã cập nhật |
| `400 Bad Request` | Không tìm thấy platform link |
| `404 Not Found` | Không tìm thấy contact |

---

### 2.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/contacts` | Tạo contact mới |
| `GET` | `/contacts` | Danh sách contact (phân trang + thống kê) |
| `GET` | `/contacts/:id` | Chi tiết contact |
| `PATCH` | `/contacts/:id` | Cập nhật contact |
| `DELETE` | `/contacts/:id` | Xoá mềm contact |
| `POST` | `/contacts/:id/platform-links` | Thêm liên kết nền tảng |
| `DELETE` | `/contacts/:id/platform-links/:platform/:platformUserId` | Xoá liên kết nền tảng |

---

## 3. Interaction (Tương tác)

### 3.1 Entity Schema

Interaction ghi lại lịch sử tương tác với một contact — cuộc gọi, email, cuộc họp, ghi chú. Đây là timeline append-only cho CRM, phục vụ theo dõi quan hệ khách hàng.

#### Enums

| Enum | Giá trị | Ý nghĩa |
|------|---------|---------|
| `type` | `call` | Cuộc gọi điện thoại |
| `type` | `email` | Email |
| `type` | `meeting` | Cuộc họp |
| `type` | `note` | Ghi chú |
| `type` | `other` | Khác |

#### Fields

| Trường | Kiểu | Bắt buộc | Ý nghĩa | Ví dụ |
|--------|------|----------|---------|-------|
| `_id` | `string` (ObjectId) | Auto | ID duy nhất | `"507f1f77bcf86cd799439013"` |
| `contactId` | `string` | ✅ | ID contact liên quan | `"507f1f77bcf86cd799439012"` |
| `companyId` | `string` | - | ID công ty liên quan (tùy chọn) | `"507f1f77bcf86cd799439011"` |
| `type` | `string` | ✅ | Loại tương tác | `"call"` |
| `date` | `Date` | ✅ | Thời điểm tương tác xảy ra | `"2026-04-07T10:00:00.000Z"` |
| `summary` | `string` | ✅ | Nội dung / tóm tắt (tối đa 5000 ký tự) | `"Thảo luận hợp đồng Q2"` |
| `outcome` | `string` | - | Kết quả / hành động tiếp theo (tối đa 2000 ký tự) | `"Gửi báo giá trước thứ 6"` |
| `tags` | `string[]` | - | Nhãn phân loại | `["renewal", "priority"]` |
| `notes` | `string` | - | Ghi chú bổ sung (tối đa 2000 ký tự) | |

#### Trường kế thừa từ BaseSchema

Tương tự Company: `owner`, `createdBy`, `updatedBy`, `isDeleted`, `deletedAt`, `createdAt`, `updatedAt`

---

### 3.2 API Endpoints

#### `POST /interactions`

Tạo bản ghi tương tác mới.

**Body**

| Trường | Kiểu | Bắt buộc | Ví dụ |
|--------|------|----------|-------|
| `contactId` | `string` | ✅ | `"507f1f77bcf86cd799439012"` |
| `companyId` | `string` | - | `"507f1f77bcf86cd799439011"` |
| `type` | `string` | ✅ | `"call"` |
| `date` | `Date` | ✅ | `"2026-04-07T10:00:00.000Z"` |
| `summary` | `string` | ✅ | `"Cuộc gọi về gia hạn hợp đồng"` |
| `outcome` | `string` | - | `"Khách đồng ý, gửi hợp đồng trước 9/4"` |
| `tags` | `string[]` | - | `["renewal"]` |
| `notes` | `string` | - | |

**Request Sample**
```json
{
  "contactId": "507f1f77bcf86cd799439012",
  "companyId": "507f1f77bcf86cd799439011",
  "type": "call",
  "date": "2026-04-07T10:00:00.000Z",
  "summary": "Gọi điện thảo luận điều khoản gia hạn hợp đồng Q2",
  "outcome": "Khách đồng ý nguyên tắc, chờ gửi bản hợp đồng chính thức",
  "tags": ["renewal", "priority"]
}
```

**Response**

| Status | Mô tả |
|--------|-------|
| `201 Created` | Tạo thành công |
| `400 Bad Request` | Dữ liệu không hợp lệ |
| `401 Unauthorized` | Chưa xác thực |

---

#### `GET /interactions`

Danh sách tương tác với phân trang và tìm kiếm. Thường dùng kết hợp filter `contactId` để lấy timeline của một contact.

**Query String**

| Param | Kiểu | Ý nghĩa | Ví dụ |
|-------|------|---------|-------|
| `search` | `string` | Tìm trong: summary, outcome, notes (regex), tags (exact) | `?search=renewal` |
| `filter[contactId]` | `string` | Lọc theo contact | `?filter[contactId]=507f...` |
| `filter[companyId]` | `string` | Lọc theo công ty | `?filter[companyId]=507f...` |
| `filter[type]` | `string` | Lọc theo loại | `?filter[type]=call` |
| `sort` | `string` | Sắp xếp | `?sort=date:desc` |
| `page` | `number` | Trang | `?page=1` |
| `limit` | `number` | Số kết quả/trang | `?limit=50` |

**Response**

```json
// 200 OK
{
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "contactId": "507f1f77bcf86cd799439012",
      "type": "call",
      "date": "2026-04-07T10:00:00.000Z",
      "summary": "Gọi điện thảo luận điều khoản gia hạn hợp đồng Q2",
      "outcome": "Khách đồng ý nguyên tắc",
      "tags": ["renewal"],
      "createdAt": "2026-04-09T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1
  }
}
```

> **Lưu ý:** Interaction không trả về `statistics` trong response (khác với Company và Contact).

---

#### `GET /interactions/:id`

Lấy chi tiết một bản ghi tương tác.

**Response**: `200 OK` | `404 Not Found`

---

#### `PATCH /interactions/:id`

Cập nhật nội dung tương tác. `contactId` và `companyId` **không thể thay đổi** sau khi tạo.

**Body** — Các field có thể cập nhật:

| Trường | Kiểu | Ví dụ |
|--------|------|-------|
| `type` | `string` | `"meeting"` |
| `date` | `Date` | `"2026-04-08T14:00:00.000Z"` |
| `summary` | `string` | |
| `outcome` | `string` | |
| `tags` | `string[]` | |
| `notes` | `string` | |

**Response**: `200 OK` | `404 Not Found` | `400 Bad Request`

---

#### `DELETE /interactions/:id`

Xoá mềm bản ghi tương tác.

**Response**: `200 OK` | `404 Not Found`

---

### 3.3 Tóm tắt Endpoints

| Method | URL | Mô tả |
|--------|-----|-------|
| `POST` | `/interactions` | Tạo bản ghi tương tác |
| `GET` | `/interactions` | Danh sách tương tác |
| `GET` | `/interactions/:id` | Chi tiết tương tác |
| `PATCH` | `/interactions/:id` | Cập nhật tương tác |
| `DELETE` | `/interactions/:id` | Xoá mềm tương tác |

---

## Ghi chú đặc biệt — CRM

### Soft Delete
Tất cả entity CRM chỉ dùng **soft delete** — record vẫn tồn tại trong DB với `isDeleted: true`. Không có endpoint khôi phục; nếu cần phải tạo lại.

### Org-scoped
Tất cả query đều tự động lọc theo `owner.orgId` từ JWT token. User chỉ thấy data của tổ chức mình.

### Statistics
`GET /companies` và `GET /contacts` trả về thêm field `statistics.byStatus` với số lượng theo từng trạng thái. `GET /interactions` không có statistics.

### Quan hệ giữa entities
- Contact có thể `companyId` → Company (tùy chọn, không validate tồn tại ở service layer)
- Interaction bắt buộc có `contactId` → Contact; tùy chọn có `companyId` → Company
- `contactId` và `companyId` trong Interaction **không thể thay đổi** sau khi tạo

### Platform Links
Platform links của Contact được quản lý qua sub-endpoints riêng (không qua PATCH). Thêm từng link một, xoá bằng `platform + platformUserId`.
