# AIWM Worker Mode

AIWM service hỗ trợ **3 modes** chạy độc lập để tối ưu hóa scaling và resource management:

## 🎯 3 Modes

### 1. **API Mode** (Default)
```bash
# Start HTTP API only (NO worker)
MODE=api npx nx serve aiwm
# or
npm run serve:aiwm
```

**Chức năng:**
- ✅ HTTP REST API endpoints
- ✅ WebSocket connections
- ✅ Push jobs to BullMQ queue
- ❌ NO job processing

**Use case:** API instances phục vụ HTTP traffic

---

### 2. **Worker Mode**
```bash
# Start Worker only (NO HTTP server)
MODE=worker npx nx serve aiwm
```

**Chức năng:**
- ❌ NO HTTP server
- ✅ BullMQ worker consume queue jobs
- ✅ Execute workflow orchestration
- ✅ Call LLM deployments
- ✅ Update execution status

**Use case:** Background processing, scale riêng với API

---

### 3. **MCP Mode**
```bash
# Start MCP protocol server
MODE=mcp npx nx serve aiwm
```

**Chức năng:**
- ✅ MCP protocol server for AI agents
- ❌ NO HTTP REST API

**Use case:** AI agent integration via MCP

---

## 📦 PM2 Production Deployment

### Start All Services
```bash
# Build first
npx nx build aiwm

# Start via PM2 ecosystem
pm2 start ecosystem.config.js

# View services
pm2 list
```

### Service List
```
core.aiwm.api00     → API mode (Port 3330)
core.aiwm.api01     → API mode (Port 3331)
core.aiwm.api02     → API mode (Port 3332)
core.aiwm.api03     → API mode (Port 3333)
core.aiwm.mcp00     → MCP mode (Port 3334)
core.aiwm.mcp01     → MCP mode (Port 3335)
core.aiwm.mcp02     → MCP mode (Port 3336)
core.aiwm.ws00      → WebSocket mode (Port 3337)
core.aiwm.ws01      → WebSocket mode (Port 3338)
core.aiwm.worker00  → Worker mode (NO port, concurrency=5)
core.aiwm.worker01  → Worker mode (NO port, concurrency=5)
```

> See [docs/PORT-ALLOCATION.md](../../docs/PORT-ALLOCATION.md) for complete port allocation strategy

### Scale Independently
```bash
# Scale API instances
pm2 scale core.aiwm.api00 4

# Scale Worker instances for heavy processing
pm2 scale core.aiwm.worker00 10

# Restart only workers
pm2 restart core.aiwm.worker00 core.aiwm.worker01
```

---

## 🏗️ Architecture

```
┌──────────────────────────┐
│  Load Balancer (Nginx)   │
└────────────┬─────────────┘
             │
     ┌───────┴───────┐
     │               │
┌────▼────┐    ┌────▼────┐    ┌──────────┐
│ API #1  │    │ API #2  │    │ API #3   │
│ :3330   │    │ :3331   │    │ :3332    │
└────┬────┘    └────┬────┘    └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    │ Push jobs
                    ▼
            ┌───────────────┐
            │  Redis Queue  │
            │    (BullMQ)   │
            └───────┬───────┘
                    │ Consume jobs
     ┌──────────────┼──────────────┐
     │              │              │
┌────▼─────┐  ┌────▼─────┐  ┌────▼─────┐
│Worker #1 │  │Worker #2 │  │Worker #3 │
│Concur: 5 │  │Concur: 5 │  │Concur: 5 │
└──────────┘  └──────────┘  └──────────┘
     │              │              │
     └──────────────┼──────────────┘
                    │ Update status
                    ▼
            ┌───────────────┐
            │    MongoDB    │
            └───────────────┘
```

---

## 🔧 Configuration

### Environment Variables

#### API Mode
```bash
MODE=api
PORT=3330
SERVICE_NAME=aiwm
```

#### Worker Mode
```bash
MODE=worker
SERVICE_NAME=aiwm
WORKER_CONCURRENCY=5           # Process 5 jobs concurrently
REDIS_HOST=localhost
REDIS_PORT=6379
MONGODB_URI=mongodb://localhost:27017/aiwm
```

#### MCP Mode
```bash
MODE=mcp
PORT=3335
SERVICE_NAME=aiwm
```

---

## 🚀 Development

### Run API + Worker in development
```bash
# Terminal 1: API
MODE=api npx nx serve aiwm

# Terminal 2: Worker
MODE=worker npx nx serve aiwm
```

### Test workflow execution
```bash
# Trigger workflow via API
curl -X POST http://localhost:3003/executions/workflows/{workflowId}/trigger \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"input": {"topic": "test"}}'

# Check worker logs
pm2 logs core.aiwm.worker00

# Check queue status
curl http://localhost:3003/executions/_admin/queue/status \
  -H "Authorization: Bearer {token}"
```

---

## 📊 Monitoring

### View logs
```bash
# API logs
pm2 logs core.aiwm.api00

# Worker logs
pm2 logs core.aiwm.worker00

# All AIWM logs
pm2 logs core.aiwm
```

### View metrics
```bash
# PM2 dashboard
pm2 monit

# Queue metrics via API
curl http://localhost:3003/executions/_admin/queue/status
```

---

## 🎛️ Scaling Strategy

### Small Load (Development)
```
1 API instance + 1 Worker instance
```

### Medium Load (Production)
```
3 API instances + 2 Worker instances
- API: Handle 1000 req/s
- Workers: Process 10 concurrent workflows
```

### Heavy Load (High Traffic)
```
5+ API instances + 10+ Worker instances
- API: Scale horizontally for HTTP traffic
- Workers: Scale for LLM processing workload
```

### Cost Optimization
```
API instances:    Small (2 CPU, 4GB RAM) - $20/month each
Worker instances: Large (8 CPU, 16GB RAM) - $80/month each

Only scale what you need!
```

---

## ✅ Benefits

1. **Independent Scaling**: Scale API and Worker separately
2. **Resource Isolation**: API không bị block bởi heavy processing
3. **Cost Efficient**: Dùng small instances cho API, large cho Workers
4. **High Availability**: API/Worker crash riêng lẻ không ảnh hưởng nhau
5. **Easy Deployment**: Cùng 1 codebase, switch mode qua ENV variable

---

## 🐛 Troubleshooting

### Worker không nhận jobs
```bash
# Check Redis connection
redis-cli ping

# Check queue status
pm2 logs core.aiwm.worker00 --lines 50

# Restart worker
pm2 restart core.aiwm.worker00
```

### Jobs bị stuck
```bash
# Check BullMQ queue
redis-cli LLEN bull:workflow-executions:wait
redis-cli LLEN bull:workflow-executions:active

# Clear stuck jobs (careful!)
redis-cli DEL bull:workflow-executions:active
```

### High memory usage
```bash
# Check worker memory
pm2 list

# Increase max_memory_restart in ecosystem.config.js
max_memory_restart: '2G'  # Default: 1G

# Reload config
pm2 reload ecosystem.config.js
```
