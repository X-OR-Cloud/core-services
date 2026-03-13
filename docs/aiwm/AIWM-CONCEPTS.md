# X-OR Stack AI — Tổng quan các Khái niệm & Thực thể

> Tài liệu này mô tả các khái niệm cốt lõi trong hệ thống X-OR Stack AI (AI Workload Manager) theo hướng dễ hiểu, phù hợp cho toàn bộ team tech. Không đi sâu vào chi tiết triển khai kỹ thuật.

---

## Mục lục

1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Agent](#2-agent)
3. [Model](#3-model)
4. [Deployment](#4-deployment)
5. [Node](#5-node)
6. [Instruction](#6-instruction)
7. [Tool](#7-tool)
8. [Guardrail](#8-guardrail)
9. [PII Pattern](#9-pii-pattern)
10. [Conversation & Message](#10-conversation--message)
11. [Execution](#11-execution)
12. [Workflow](#12-workflow)
13. [Memory](#13-memory)
14. [Connection](#14-connection)
15. [Resource](#15-resource)
16. [Reminder](#16-reminder)
17. [Mối quan hệ giữa các thực thể](#17-mối-quan-hệ-giữa-các-thực-thể)

---

## 1. Tổng quan hệ thống

X-OR Stack AI là dịch vụ trung tâm quản lý toàn bộ vòng đời của các tác nhân AI (agent): từ cấu hình, triển khai, vận hành đến giám sát.

Hệ thống cho phép:
- Đăng ký và quản lý các mô hình AI (LLM, vision, embedding...)
- Triển khai mô hình lên các máy chủ (node) hoặc kết nối với API của nhà cung cấp bên ngoài
- Tạo và vận hành các agent sử dụng mô hình đó để thực thi tác vụ
- Kết nối agent với người dùng qua chat, Discord, Telegram
- Đảm bảo an toàn nội dung qua guardrail và PII redaction

### Sơ đồ kiến trúc tổng thể

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS / CONSUMERS                            │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │  Web / App   │  │ Claude/AI    │  │  Discord  │  │     Telegram       │ │
│  │  (Browser)   │  │  Agent (SDK) │  │   Bot     │  │       Bot          │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘  └────────┬───────────┘ │
└─────────┼────────────────┼────────────────┼──────────────────┼─────────────┘
          │                │                │                  │
          │ REST/WS        │ MCP Protocol   │                  │
          │                │                └──────────────────┘
          ▼                ▼                         │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           X-OR Stack AI SERVICE                                      │
│                                                                             │
│  ┌──────────────────────────────┐   ┌──────────────────────────────────┐   │
│  │        API Server            │   │         MCP Server               │   │
│  │  PORT 3003                   │   │  PORT 3355                       │   │
│  │                              │   │                                  │   │
│  │  ┌─────────────────────┐     │   │  48 Built-in Tools:              │   │
│  │  │  REST API           │     │   │  • CBM: Doc/Project/Work mgmt    │   │
│  │  │  /agents /models    │     │   │  • IAM: User management          │   │
│  │  │  /nodes /tools ...  │     │   │  • X-OR Stack AI: Agent/Memory/Reminder   │   │
│  │  └─────────────────────┘     │   │                                  │   │
│  │  ┌─────────────────────┐     │   │  Per-session McpServer           │   │
│  │  │  WS Gateway /ws/chat│     │   │  Tools filtered by allowedToolIds│   │
│  │  │  (Redis pub/sub)    │     │   └──────────────────────────────────┘   │
│  │  └─────────────────────┘     │                                          │
│  │  ┌─────────────────────┐     │   ┌──────────────────────────────────┐   │
│  │  │  WS Gateway /ws/node│     │   │       BullMQ Workers             │   │
│  │  │  (Node commands)    │     │   │  • NodeProcessor                 │   │
│  │  └─────────────────────┘     │   │  • ModelProcessor                │   │
│  └──────────────────────────────┘   └──────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        22 Feature Modules                            │  │
│  │  Agent · Node · Chat · Model · Deployment · Instruction · Tool       │  │
│  │  Guardrail · PII · Configuration · Execution · Workflow · Resource   │  │
│  │  Conversation · Message · Action · Connection · Memory · Reminder    │  │
│  │  AgentWorker · WorkflowStep · Reports · Util · MCP                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │    MongoDB       │  │      Redis       │  │  External LLM Providers  │  │
│  │  core_X-OR Stack AI DB    │  │  Queue + Pub/Sub  │  │  OpenAI · Anthropic      │  │
│  │  (all entities)  │  │  + WS Presence   │  │  Google · Azure · Ollama │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          │ WebSocket /ws/node
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GPU NODE CLUSTER                                    │
│                                                                             │
│  ┌─────────────────────────┐      ┌─────────────────────────┐              │
│  │        Node A           │      │        Node B           │              │
│  │  (GPU Worker)           │      │  (GPU Worker)           │              │
│  │                         │      │                         │              │
│  │  ┌───────────────────┐  │      │  ┌───────────────────┐  │              │
│  │  │  Deployment       │  │      │  │  Deployment       │  │              │
│  │  │  (Model running)  │  │      │  │  (Model running)  │  │              │
│  │  │  ┌─────────────┐  │  │      │  └───────────────────┘  │              │
│  │  │  │  Resource   │  │  │      │                         │              │
│  │  │  │  (container)│  │  │      │  ┌───────────────────┐  │              │
│  │  │  └─────────────┘  │  │      │  │  Managed Agent    │  │              │
│  │  └───────────────────┘  │      │  │  (deployed here)  │  │              │
│  └─────────────────────────┘      │  └───────────────────┘  │              │
│                                   └─────────────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Sơ đồ các thành phần và mối quan hệ

```
                   ╔══════════════════════════════════════════╗
                   ║            CẤU HÌNH AGENT                ║
                   ╠══════════════════════════════════════════╣
                   ║                                          ║
   ┌───────────┐   ║  ┌─────────────┐   ┌─────────────────┐  ║
   │  Model    │   ║  │ Instruction │   │    Guardrail    │  ║
   │  (AI mô   │   ║  │ (system     │   │  (content       │  ║
   │  hình)    │   ║  │  prompt)    │   │   safety)       │  ║
   └─────┬─────┘   ║  └──────┬──────┘   └────────┬────────┘  ║
         │         ║         │                    │           ║
         ▼         ║         │         ┌──────────┘           ║
   ┌───────────┐   ║         │         │  ┌───────────────┐   ║
   │Deployment │   ║         └─────────┼─►│     AGENT     │◄──╣
   │(model     │───╬──────────────────►│  │               │   ║
   │ running)  │   ║                   │  │ type:         │   ║
   └───────────┘   ║  ┌─────────────┐  │  │  managed      │   ║
         ▲         ║  │    Tool     │  │  │  autonomous   │   ║
         │         ║  │  (actions   │──┼─►│  hosted       │   ║
   ┌───────────┐   ║  │   agent     │  │  │               │   ║
   │   Node    │   ║  │   can do)   │  │  └───────┬───────┘   ║
   │ (GPU svr) │   ║  └─────────────┘  │          │           ║
   └───────────┘   ║  ┌─────────────┐  │          │           ║
                   ║  │  PII Pattern│  │          │           ║
                   ║  │  (redaction)│──┘          │           ║
                   ║  └─────────────┘             │           ║
                   ╚══════════════════════════════╪═══════════╝
                                                  │
                        ┌─────────────────────────┼─────────────────────────┐
                        │                         │                         │
                        ▼                         ▼                         ▼
               ┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
               │  CONVERSATION   │     │    EXECUTION     │     │   CONNECTION    │
               │  (chat session) │     │  (task run log)  │     │ Discord/Telegram│
               │                 │     │                  │     │                 │
               │  ┌───────────┐  │     │  ┌────────────┐  │     │  ┌───────────┐  │
               │  │ Messages  │  │     │  │  Workflow  │  │     │  │  Routes   │  │
               │  └───────────┘  │     │  │ (template) │  │     │  │ (channel  │  │
               │  ┌───────────┐  │     │  └────────────┘  │     │  │  → agent) │  │
               │  │  Memory   │  │     │  ┌────────────┐  │     │  └───────────┘  │
               │  │(long-term)│  │     │  │   Steps    │  │     └─────────────────┘
               │  └───────────┘  │     │  └────────────┘  │
               │  ┌───────────┐  │     └──────────────────┘
               │  │ Reminder  │  │
               │  └───────────┘  │
               └─────────────────┘
```

### Luồng vận hành chính

```
[1] Setup hạ tầng
    Node đăng ký → (admin duyệt) → Node online
    Model đăng ký → Deployment tạo trên Node → Deployment running

[2] Tạo Agent
    Instruction (viết system prompt)
    + Deployment (chọn model đang chạy)
    + Tool (cấp quyền công cụ)
    + Guardrail (cài bộ lọc)
    → Agent (configured, ready)

[3] Vận hành
    User/Bot → Conversation → Chat Gateway (/ws/chat)
                                    │
                              Agent nhận message
                                    │
                          ┌─────────┴──────────┐
                          │                    │
                    Gọi Tool              Gọi LLM (qua Deployment)
                    (CBM/IAM/API)         → trả lời
                          │                    │
                          └─────────┬──────────┘
                                    │
                             Log vào Execution
                             (input, output, tokens, cost)
```

---

## 2. Agent

### Agent là gì?

Agent là một **tác nhân AI** — một thực thể có danh tính, mục đích, và khả năng hành động trong hệ thống. Mỗi agent được cấu hình để thực hiện một vai trò cụ thể: trả lời hỗ trợ khách hàng, phân tích dữ liệu, tự động hóa tác vụ...

Agent **không chứa mô hình AI** — nó *sử dụng* mô hình thông qua một Deployment. Hãy hình dung Agent giống như một nhân viên, còn Deployment là cái máy tính mà nhân viên đó dùng.

### Phân loại Agent

| Loại | Mô tả | Ai quản lý? |
|------|-------|-------------|
| **managed** | Được hệ thống triển khai trực tiếp lên một Node | Hệ thống X-OR Stack AI |
| **autonomous** | Người dùng tự triển khai trên môi trường của họ, kết nối về X-OR Stack AI | Người dùng |
| **hosted** | Chạy bên trong X-OR Stack AI như một worker nền | Hệ thống X-OR Stack AI |

### Trạng thái của Agent

```
inactive → idle → busy → suspended
```

- **inactive**: Chưa kết nối hoặc bị tắt
- **idle**: Đang kết nối, sẵn sàng nhận việc
- **busy**: Đang xử lý tác vụ
- **suspended**: Tạm dừng (bị khóa hoặc lỗi)

### Khả năng của Agent

- **Instruction**: Có thể được giao một bộ hướng dẫn hành vi (system prompt)
- **Tools**: Có thể dùng các công cụ được cấp phép (tìm kiếm, đọc tài liệu, gọi API...)
- **Guardrail**: Chịu ràng buộc an toàn nội dung
- **Memory**: Ghi nhớ thông tin qua các phiên làm việc
- **Anonymous tokens**: Có thể cấp token cho người dùng ẩn danh (chatbot widget công khai)
- **Multi-platform**: Có thể kết nối qua Chat WebSocket, Discord, Telegram

### Xác thực Agent

Agent dùng `secret` (mã bí mật) để xác thực khi kết nối vào hệ thống, tương tự API key.

---

## 3. Model

### Model là gì?

Model là **bản ghi đăng ký** một mô hình AI trong hệ thống — có thể là mô hình ngôn ngữ (LLM), mô hình nhận diện ảnh (vision), embedding, hoặc giọng nói (voice).

Model **không chạy trực tiếp** — nó cần được *triển khai* (Deployment) mới có thể sử dụng được.

### Phân loại theo cách triển khai

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| **self-hosted** | Tải về và chạy trên Node GPU của hệ thống | Llama 3.1, Mistral |
| **api-based** | Gọi API của nhà cung cấp bên ngoài | GPT-4, Claude, Gemini |

### Vòng đời Model (self-hosted)

```
queued → downloading → downloaded → deploying → active ↔ inactive
```

### Vòng đời Model (api-based)

```
validating → active ↔ inactive
```

---

## 4. Deployment

### Deployment là gì?

Deployment là **một bản triển khai cụ thể** của một Model, đang chạy và sẵn sàng nhận request. Giống như sự khác biệt giữa bản thiết kế (Model) và công trình thực tế đang vận hành (Deployment).

Nhiều Agent có thể dùng chung một Deployment.

### Vòng đời Deployment

```
queued → deploying → running ↔ stopped
                  └→ failed/error
```

### Chỉ số theo dõi

Deployment ghi lại: số request đã xử lý, tổng token đã dùng, tổng chi phí — giúp giám sát hiệu quả sử dụng.

---

## 5. Node

### Node là gì?

Node là **máy chủ vật lý hoặc ảo** trong hệ thống — thường là máy có GPU để chạy mô hình AI. Node kết nối với X-OR Stack AI qua WebSocket để nhận lệnh và báo cáo trạng thái.

### Vai trò Node

| Vai trò | Chức năng |
|---------|-----------|
| **worker** | Chạy model và xử lý inference |
| **controller** | Điều phối các worker khác |
| **proxy** | Định tuyến request |
| **storage** | Lưu trữ model files |

### Vòng đời Node

```
pending → installing → online ↔ offline/maintenance
```

### Thông tin Node theo dõi

- Phần cứng: CPU, RAM, GPU (model, số lượng, VRAM)
- Mạng: IP công khai, IP nội bộ
- Hệ điều hành: distro, kernel, version
- Container runtime: Docker/containerd
- Trạng thái kết nối: thời gian heartbeat cuối cùng

---

## 6. Instruction

### Instruction là gì?

Instruction là **bộ hướng dẫn hành vi** dành cho Agent — thực chất là *system prompt* xác định tính cách, vai trò, ngữ cảnh và các ràng buộc hành vi của Agent đó.

Một Instruction có thể được dùng lại cho nhiều Agent. Instruction hỗ trợ tham chiếu động đến tài liệu CBM (`@document:...`) hoặc thông tin dự án (`@project:...`) để inject context.

**Ví dụ:** "Bạn là trợ lý hỗ trợ khách hàng cho công ty X. Hãy trả lời lịch sự, ngắn gọn..."

---

## 7. Tool

### Tool là gì?

Tool là **công cụ mà Agent có thể sử dụng** để thực hiện hành động — vượt ra ngoài khả năng trả lời thuần túy của mô hình ngôn ngữ.

### Phân loại Tool

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| **builtin** | Công cụ tích hợp sẵn trong X-OR Stack AI | ListAgents, ListProjects, CreateTask |
| **mcp** | Tool chạy theo chuẩn MCP (Model Context Protocol) | Tool từ marketplace |
| **api** | Gọi HTTP API bên ngoài | Webhook, REST API nội bộ |
| **custom** | Tool tùy chỉnh do người dùng định nghĩa | Logic nghiệp vụ riêng |

### Builtin Tools có sẵn

X-OR Stack AI cung cấp 48 built-in tools chia theo nhóm:

- **CBM — Quản lý tài liệu**: Tạo, đọc, cập nhật, xóa, chia sẻ tài liệu
- **CBM — Quản lý dự án**: Tạo dự án, quản lý thành viên, chuyển trạng thái
- **CBM — Quản lý công việc**: Tạo task/epic/subtask, cập nhật trạng thái, ưu tiên
- **IAM**: Danh sách người dùng
- **X-OR Stack AI**: Danh sách agent, instruction, memory, reminder

### Cấp quyền Tool cho Agent

Mỗi Agent chỉ được dùng các Tool nằm trong `allowedToolIds`. Admin cấp quyền tường minh — Agent không tự ý gọi Tool ngoài danh sách.

---

## 8. Guardrail

### Guardrail là gì?

Guardrail là **bộ lọc an toàn nội dung** — kiểm tra input/output của Agent và chặn nội dung vi phạm trước khi gửi đến người dùng.

### Cách hoạt động

- **Blocked keywords**: Danh sách từ khóa bị cấm (ví dụ: `['hack', 'violence', 'spam']`)
- **Blocked topics**: Chủ đề bị cấm theo category (ví dụ: `['political', 'medical-advice']`)
- **Custom message**: Thông báo hiển thị khi nội dung bị chặn

Guardrail được gắn vào Agent — mỗi Agent có thể dùng một Guardrail khác nhau tùy ngữ cảnh triển khai.

---

## 9. PII Pattern

### PII Pattern là gì?

PII Pattern là **quy tắc phát hiện và ẩn thông tin nhận dạng cá nhân** (Personally Identifiable Information) trong các cuộc hội thoại.

Hệ thống tự động áp dụng các pattern này lên nội dung tin nhắn để thay thế thông tin nhạy cảm trước khi lưu trữ hoặc xử lý.

### Ví dụ Pattern

| Tên | Ví dụ phát hiện | Thay thế bằng |
|-----|----------------|---------------|
| Email Address | `user@example.com` | `[EMAIL_REDACTED]` |
| Phone Number | `0912 345 678` | `[PHONE_REDACTED]` |
| CCCD (Vietnam ID) | `079123456789` | `[ID_REDACTED]` |
| Credit Card | `4111 1111 1111 1111` | `[CARD_REDACTED]` |
| API Key / JWT | `sk-abc123...` | `[CREDENTIAL_REDACTED]` |

---

## 10. Conversation & Message

### Conversation là gì?

Conversation là **một phiên hội thoại** — tập hợp các tin nhắn trao đổi giữa người dùng và Agent trong một ngữ cảnh liên tục.

Mỗi cuộc hội thoại có:
- Danh sách **participants** (người tham gia: user + agent)
- **Lịch sử message** theo thứ tự thời gian
- **Context summary** tự động tóm tắt sau mỗi 10 tin nhắn (giảm token usage)
- Thống kê: tổng tokens, tổng cost, số tin nhắn

### Loại hội thoại

| Loại | Mô tả |
|------|-------|
| **chat** | Hội thoại thông thường |
| **support** | Hỗ trợ khách hàng |
| **workflow** | Hội thoại gắn với một workflow |

### Người dùng Anonymous

Hệ thống hỗ trợ người dùng **không cần đăng nhập** (anonymous) — phù hợp cho chatbot widget nhúng vào website. Anonymous token do Agent cấp, có thể đặt thời hạn.

---

## 11. Execution

### Execution là gì?

Execution là **hồ sơ theo dõi một lần chạy tác vụ** — ghi lại toàn bộ quá trình thực thi từ đầu đến cuối: các bước, kết quả từng bước, thời gian, lỗi, và kết quả cuối cùng.

Execution được tạo mỗi khi một Deployment hoặc Workflow được kích hoạt chạy.

### Vòng đời Execution

```
pending → running → completed
                 └→ failed
                 └→ cancelled
                 └→ timeout
```

### Execution Steps

Mỗi Execution gồm nhiều **steps** (bước), thực thi tuần tự hoặc có điều kiện:

- Mỗi step có trạng thái riêng: `pending → running → completed/failed/skipped`
- Bước có thể phụ thuộc vào bước khác (`dependsOn`)
- Bước có thể đánh dấu `optional` — bỏ qua nếu thất bại mà không hủy cả execution
- Step LLM ghi lại: input, output, số token, chi phí, reasoning (với reasoning model)

### Retry & Timeout

Execution hỗ trợ tự động thử lại khi thất bại (`maxRetries`) và giới hạn thời gian chạy (`timeoutSeconds`).

---

## 12. Workflow

### Workflow là gì?

Workflow là **bản thiết kế** của một chuỗi tác vụ AI — định nghĩa các bước cần thực hiện, thứ tự, và điều kiện chuyển đổi.

Workflow là *định nghĩa* (template), còn Execution là *lần chạy thực tế* từ định nghĩa đó.

### Trạng thái Workflow

```
draft → active ↔ archived
```

### Chế độ thực thi

| Chế độ | Mô tả |
|--------|-------|
| **internal** | Chạy bằng engine native của X-OR Stack AI |
| **langgraph** | Chạy theo định dạng LangGraph |

---

## 13. Memory

### Memory là gì?

Memory là **bộ nhớ dài hạn** của Agent — lưu trữ thông tin quan trọng vượt qua ranh giới của từng cuộc hội thoại.

Khác với context window (chỉ tồn tại trong một phiên), Memory được lưu vào database và Agent có thể truy cập lại ở các phiên sau.

### Phân loại Memory

| Category | Mô tả | Ví dụ |
|----------|-------|-------|
| **user-preferences** | Sở thích của người dùng | "Thích câu trả lời ngắn gọn" |
| **decisions** | Quyết định đã được thống nhất | "Dùng PostgreSQL cho project X" |
| **notes** | Ghi chú quan trọng | "User đang làm việc với team backend" |
| **lessons** | Bài học từ lỗi trước | "Không dùng format markdown trong Slack" |

### Cấu trúc Memory

Mỗi memory entry có `key` (định danh dạng slug, duy nhất trong cùng category của agent) và `content` (nội dung thực tế, tối đa 2000 ký tự).

---

## 14. Connection

### Connection là gì?

Connection là **cấu hình kết nối** để đưa Agent lên các nền tảng nhắn tin bên ngoài — hiện tại hỗ trợ **Discord** và **Telegram**.

Mỗi Connection có các **routes** (quy tắc định tuyến): khi có tin nhắn đến từ kênh/server nào đó, tự động chuyển cho Agent nào xử lý.

### Ví dụ sử dụng

```
Connection "VTV Support Bot"
  Provider: Discord
  Routes:
    - Guild: VTV Server, Channel: #support → Agent: Customer Support AI
    - Guild: VTV Server, Channel: #internal → Agent: Internal Assistant
```

### Cài đặt định tuyến

- `requireMention`: Chỉ phản hồi khi bot bị @mention
- `allowAnonymous`: Cho phép người dùng ngoài tổ chức chat với agent

---

## 15. Resource

### Resource là gì?

Resource là **đơn vị cơ sở hạ tầng** được triển khai trên một Node — có thể là container chạy inference, container ứng dụng thông thường, hoặc máy ảo (VM).

Resource là "vật thể thực tế đang chạy" trên Node, còn Deployment là "hồ sơ quản lý" của nó.

### Phân loại Resource

| Loại | Mô tả |
|------|-------|
| **inference-container** | Container chạy mô hình AI (vllm, triton) |
| **application-container** | Container ứng dụng thông thường |
| **virtual-machine** | Máy ảo trên Node |

### Vòng đời Resource

```
queued → deploying → running ↔ stopping → stopped
                          └→ failed/error
```

### Thông tin theo dõi

Container: IP, ports, volumes, environment, logs, số lần restart
VM: SSH endpoint, VNC endpoint, disk layout, network interfaces

---

## 16. Reminder

### Reminder là gì?

Reminder là **lịch nhắc nhở** cho Agent — cho phép lên lịch để Agent thực hiện một hành động hoặc gửi một tin nhắn vào thời điểm xác định.

**Ví dụ:** Nhắc Agent gửi báo cáo tổng hợp mỗi sáng thứ Hai, hoặc follow up với người dùng sau 24 giờ.

### Trạng thái

```
pending → done
```

---

## 17. Mối quan hệ giữa các thực thể

### Sơ đồ tổng quan

```
                    ┌─────────────┐
                    │   Workflow  │ (template)
                    └──────┬──────┘
                           │ run as
                           ▼
Node ──────────── Deployment ──────── Model
 │   (hosts)          │   (uses)       │
 │                    │                │ (registered from)
 ▼                    ▼                │ HuggingFace / OpenAI API
Resource          Execution ◄──────────┘
(container/VM)    (run logs)
                      ▲
           ┌──────────┴──────────┐
           │                     │
        Agent ──────────── Conversation
        (AI actor)         (chat session)
           │                     │
     ┌─────┼─────┐               ▼
     │     │     │            Messages
     │     │     │
Instruction │  Guardrail
(behavior)  │  (safety)
            │
         Tool ─── Memory ─── Connection
       (actions) (recall)   (Discord/Telegram)
```

### Bảng phụ thuộc nhanh

| Để tạo... | Cần có sẵn... |
|-----------|--------------|
| Deployment | Model + Node (self-hosted) hoặc Model (api-based) |
| Agent | Deployment + Instruction (khuyến nghị) |
| Execution | Deployment hoặc Workflow |
| Connection (route) | Agent |
| Conversation | Agent |
| Memory | Agent |
| Reminder | Agent |

---

*Tài liệu này phản ánh trạng thái hệ thống tại thời điểm rà soát (2026-03-13). Cập nhật khi có thay đổi kiến trúc lớn.*
