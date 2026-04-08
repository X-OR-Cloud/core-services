# Đề xuất: Tách riêng các WebSocket Mode trong AIWM

**Ngày**: 2026-04-08  
**Trạng thái**: Chờ duyệt  
**Ưu tiên**: Cao (Node WS) / Trung bình (Chat WS)

---

## 1. Bối cảnh

Hiện tại, mode `api` của service AIWM khởi động một process duy nhất chạy đồng thời:

- **REST API** — toàn bộ các controller HTTP
- **ChatGateway** — WebSocket `/ws/chat` phục vụ user, agent, và anonymous client
- **NodeGateway** — WebSocket `/ws/node` phục vụ các GPU worker node

Cả ba thành phần được load thông qua `AppModule` (32 modules) trong `bootstrap-api.ts`, không có cơ chế tách biệt.

---

## 2. Vấn đề hiện tại

### 2.1 Node WebSocket — vấn đề nghiêm trọng

`NodeGateway` dùng `NodeConnectionService` để lưu socket connections **in-memory**:

```
NodeConnectionService {
  private connections: Map<nodeId, Socket>
}
```

**Hệ quả khi scale horizontal API:**
- Node worker kết nối vào instance A → chỉ instance A biết node đó online
- Instance B nhận request deploy/inference → không tìm thấy node → lỗi
- Không thể chạy nhiều hơn 1 replica API pod nếu có node workers

### 2.2 Chat WebSocket — vấn đề vừa phải

`ChatGateway` đã dùng Redis pub/sub → an toàn hơn khi multi-instance. Vấn đề chính là isolation và debug:

- Log của chat events lẫn với log REST API và node events
- Không thể restart/redeploy chat WS riêng lẻ mà không ảnh hưởng API
- Khó autoscale riêng theo traffic pattern (chat thường spike theo giờ, API baseline đều hơn)

### 2.3 Debug khó

Khi một mode bị lỗi, toàn bộ process bị ảnh hưởng. Ví dụ:
- Memory leak trong ChatGateway → ảnh hưởng REST API latency
- Deadlock trong NodeGateway → không thể nhận request API mới

---

## 3. Kiến trúc đề xuất

### 3.1 Các mode sau khi tách

| Mode | Command | Trách nhiệm | Modules load |
|------|---------|-------------|--------------|
| `api` | `nx run aiwm:api` | REST API thuần — không có WS gateway | AppModule trừ ChatModule gateway + NodeGateway |
| `nws` | `nx run aiwm:nws` | Node WebSocket `/ws/node` | NodeGatewayModule + NodeModule (service only) |
| `cws` | `nx run aiwm:cws` | Chat WebSocket `/ws/chat` | ChatGatewayModule + các module phụ thuộc |
| `wrk` | `nx run aiwm:wrk` | BullMQ worker | WorkerModule (không đổi) |
| `mcp` | `nx run aiwm:mcp` | MCP server | AppModule for DI (không đổi) |
| `agt` | `nx run aiwm:agt` | Hosted agent runner | AgentWorkerModule (không đổi) |
| `con` | `nx run aiwm:con` | Connection bridge | ConnectionWorkerModule (không đổi) |

### 3.2 Sơ đồ sau khi tách

```
┌─────────────────────────────────────────────────────┐
│                    NGINX / Load Balancer              │
└──────────┬──────────────────┬────────────────────────┘
           │                  │
    /api/* (HTTP)      /ws/node, /ws/chat (WS)
           │                  │
  ┌────────▼──────┐   ┌───────▼────────────────────────┐
  │  api process  │   │  nws process  │  cws process   │
  │  (stateless)  │   │  (in-memory)  │  (redis-based) │
  │  N replicas   │   │  1 replica    │  M replicas    │
  └───────────────┘   └───────────────────────────────┘
```

---

## 4. Kế hoạch triển khai

### Phase 1 — Tách Node WS (ưu tiên cao)

**Bước 1: Tách NodeModule thành 2 module**

```
NodeModule (hiện tại)
├── node.controller.ts   → giữ trong NodeModule
├── node.service.ts      → giữ trong NodeModule  
├── node.schema.ts       → giữ trong NodeModule
├── node.gateway.ts      → chuyển sang NodeGatewayModule
└── node-connection.service.ts → chuyển sang NodeGatewayModule
```

Tạo `NodeGatewayModule`:
- Import `NodeModule` (để dùng `NodeService`)
- Chứa `NodeGateway` + `NodeConnectionService`
- Không được import bởi `AppModule` trong api mode

**Bước 2: Tạo `bootstrap-node-ws.ts`**

```typescript
export async function bootstrapNodeWs() {
  const app = await NestFactory.create(NodeWsModule);
  await app.listen(process.env.PORT || 3006);
}
```

**Bước 3: Thêm mode `nws` vào `main.ts` và `project.json`**

**Bước 4: Cập nhật `AppModule` (api mode)**

- Xóa `NodeGatewayModule` khỏi imports
- Giữ nguyên `NodeModule` (controller + service vẫn cần cho REST API)

**Bước 5: Giải quyết NodeConnectionService cross-module**

Hiện tại `DeploymentModule` và các module khác dùng `NodeConnectionService` để gửi lệnh trực tiếp qua socket. Sau khi tách, cần chuyển sang **Redis pub/sub**:

```
api/deployment → publish redis channel "node:command:{nodeId}"
nws process → subscribe + forward qua socket đến node worker
```

Đây là thay đổi lớn nhất và cần implement cẩn thận.

### Phase 2 — Tách Chat WS (ưu tiên trung bình)

**Bước 1: Tạo `ChatGatewayModule`**

```
ChatModule (hiện tại)
├── chat.controller.ts     → giữ trong ChatModule
├── chat.service.ts        → giữ trong ChatModule
├── chat.gateway.ts        → chuyển sang ChatGatewayModule
└── chat-presence.service.ts → chuyển sang ChatGatewayModule
```

**Bước 2: Tạo `bootstrap-chat-ws.ts`**

**Bước 3: Thêm mode `cws` vào `main.ts` và `project.json`**

`ChatGateway` đã dùng Redis pub/sub nên không cần thay đổi logic lớn như Node WS.

---

## 5. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Mức độ | Biện pháp |
|--------|--------|-----------|
| `NodeConnectionService` được dùng bởi nhiều module | Cao | Chuyển sang Redis pub/sub cho node commands |
| Tăng số process cần monitor | Thấp | Thêm health check endpoint cho từng mode |
| Thứ tự khởi động (api cần nws up trước?) | Trung bình | Các mode độc lập — api gửi lệnh qua Redis, không cần nws up trước |
| Nginx routing cần cập nhật | Thấp | Đã có config WS riêng, chỉ cần cập nhật upstream |

---

## 6. Cấu hình Nginx sau khi tách

```nginx
upstream aiwm_api {
    server aiwm-api:3003;
    server aiwm-api-2:3003;  # có thể thêm replica
}

upstream aiwm_node_ws {
    server aiwm-nws:3006;    # chỉ 1 instance (in-memory)
}

upstream aiwm_chat_ws {
    server aiwm-cws-1:3007;
    server aiwm-cws-2:3007;  # có thể scale (Redis-based)
}

server {
    location /api/ {
        proxy_pass http://aiwm_api;
    }

    location /ws/node {
        proxy_pass http://aiwm_node_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /ws/chat {
        proxy_pass http://aiwm_chat_ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 7. Tiêu chí hoàn thành

- [ ] `nx run aiwm:api` khởi động thành công, không load ChatGateway và NodeGateway
- [ ] `nx run aiwm:nws` khởi động thành công, node worker kết nối được
- [ ] `nx run aiwm:cws` khởi động thành công, user/agent chat được
- [ ] Node commands (deploy, agent.start, agent.update) vẫn hoạt động qua Redis pub/sub
- [ ] Scale 2 replica `api` — không bị lỗi routing node command
- [ ] Build TypeScript pass: `npx tsc --noEmit -p services/aiwm/tsconfig.app.json`

---

## 8. Ước tính công việc

| Phase | Công việc chính | Độ phức tạp |
|-------|----------------|-------------|
| Phase 1 - Node WS | Tách NodeGatewayModule + Redis pub/sub cho node commands | Cao |
| Phase 2 - Chat WS | Tách ChatGatewayModule | Thấp-Trung bình |

Phase 1 cần được implement và test kỹ trước Phase 2.
