# Technical Design: Service Knowledge Base (KB) for AI Agents

## 1. Tóm tắt về Knowledge Base (KB)

**Knowledge Base (KB)** là một hệ thống lưu trữ và quản lý tri thức tập trung, cho phép AI Agent truy xuất thông tin chính xác từ các nguồn dữ liệu nội bộ (văn bản, quy trình, chính sách...). Thay vì chỉ dựa vào kiến thức huấn luyện sẵn, Agent sử dụng KB để thực hiện cơ chế **RAG (Retrieval-Augmented Generation)**, giúp câu trả lời luôn cập nhật, minh bạch và có trích dẫn nguồn tin cậy.

## 2. Các chức năng trên Giao diện (Frontend)

* **Quản lý Nguồn dữ liệu (Data Source):** Cho phép upload file (PDF, Docx, TXT) hoặc liên kết link website/database.
* **Quản lý Collection/Domain:** Gom nhóm tài liệu theo từng chủ đề (ví dụ: Hành chính công, Quy định nội bộ).
* **Cấu hình RAG cho Agent:**
* Nút gạt **"Enable Knowledge Base (RAG)"**.
* Dropdown chọn các **Domain** tri thức cần ưu tiên.
* Tùy chọn **"Show Citations"**: Hiển thị đoạn trích dẫn và nguồn tài liệu dưới câu trả lời của AI.


* **Trình kiểm tra (Playground):** Ô chat thử nghiệm để xem Agent tìm được đoạn văn bản (Chunk) nào từ câu hỏi cụ thể.

## 3. Kiến trúc Backend

Kiến trúc dựa trên sự phối hợp giữa Database truyền thống và Vector Database:

* **API Gateway:** Tiếp nhận yêu cầu từ FE hoặc Agent.
* **Embedding Service:** Sử dụng các model (như `text-embedding-004`) để chuyển văn bản thành vector.
* **Vector Database (Qdrant):** Lưu trữ các vector và metadata (link tới MongoDB ID).
* **Document Store (MongoDB):** Lưu trữ nội dung đầy đủ của tài liệu gốc, metadata chi tiết và lịch sử xử lý.
* **Worker/Indexing Pipeline:** Xử lý tác vụ nặng như đọc file, chia nhỏ văn bản (Chunking) và đẩy vào Qdrant.

## 4. Luồng xử lý (Workflow)

### Luồng Indexing (Nạp dữ liệu)

1. **FE** gửi file -> **BE** lưu file gốc vào Storage.
2. **BE** chia nhỏ file thành các đoạn (Chunks).
3. **Embedding Service** vector hóa các đoạn này.
4. **BE** lưu nội dung vào **MongoDB** và lưu Vector + `mongo_id` vào **Qdrant**.

### Luồng Query (Khi Agent hoạt động)

1. **User** đặt câu hỏi -> **BE** lấy câu hỏi đi Vector hóa.
2. **Search:** Tìm trong **Qdrant** lấy ra Top-K các đoạn văn bản tương đồng nhất.
3. **Refine (Optional):** Đưa các đoạn tìm được qua một LLM nhỏ để trích xuất (Extract) đúng đoạn text ngắn nhất chứa câu trả lời.
4. **Augment:** Gắn đoạn trích này vào **System Prompt** cùng với câu hỏi gốc.
5. **Generate:** Gửi toàn bộ Prompt cho LLM chính để trả lời người dùng.

## 5. Các Tool KB cung cấp cho Agent

Để Agent chủ động hơn, KB cung cấp các hàm (Functions) sau:

* `search_knowledge(query, domain)`: Tìm kiếm thông tin trong một vùng tri thức.
* `list_domains()`: Liệt kê các kho tri thức khả dụng.
* `get_document_metadata(doc_id)`: Lấy thông tin chi tiết về nguồn gốc tài liệu (Tên file, Ngày cập nhật).

## 6. Thiết kế Entity (Entity Design)

### MongoDB: `collections_metadata`

| Trường | Kiểu dữ liệu | Mô tả |
| --- | --- | --- |
| `id` | ObjectId | ID duy nhất |
| `name` | String | Tên Domain (vđ: "Luật đất đai") |
| `description` | String | Mô tả để Agent hiểu khi nào nên dùng |
| `status` | Enum | Processing, Ready, Error |

### MongoDB: `documents`

| Trường | Kiểu dữ liệu | Mô tả |
| --- | --- | --- |
| `id` | ObjectId | ID tài liệu |
| `collection_id` | ObjectId | Thuộc Domain nào |
| `original_url` | String | Link file gốc |
| `raw_content` | String | Nội dung văn bản thô |

### Qdrant: `vectors_payload`

| Trường | Kiểu dữ liệu | Mô tả |
| --- | --- | --- |
| `vector` | Float[] | Mảng vector đặc trưng |
| `mongo_id` | String | Link tới `documents.id` trong MongoDB |
| `text_chunk` | String | Nội dung của đoạn văn bản nhỏ |
| `metadata` | JSON | Thông tin bổ trợ (vị trí trang, chương...) |

---

Hy vọng bản tóm tắt này giúp anh hệ thống hóa lại mọi thứ một cách mạch lạc. Anh có muốn em bổ sung thêm chi tiết nào vào phần kiến trúc hay luồng xử lý không?
