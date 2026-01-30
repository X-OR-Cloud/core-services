# Port Allocation Strategy

This document defines the standardized port allocation strategy for all services in the Hydra Services monorepo.

## 📋 Overview

### Design Principles

1. **Organized Hierarchy**: Template service first (reference), then core services (shared infrastructure), finally business services (domain-specific)
2. **Predictable Patterns**: Each service has a consistent local port and production range
3. **Production Scaling**: Each service gets 10 ports - 4 for API, 6 for specialized modes (MCP/WS)
4. **Future-Proof**: Reserved ports for new services and modes

### Port Ranges

| Environment | Range | Purpose |
|-------------|-------|---------|
| **Local Development** | 3000-3099 | Single port per service |
| **Production** | 3300-3999 | 10 ports per service (XX0-XX9) |

---

## 🎯 Port Allocation Table

### A. Infrastructure Services

| Service | Type | Local | Prod API | Prod MCP/WS | Description |
|---------|------|-------|----------|-------------|-------------|
| **Template** | Reference | **3000** | 3300-3303 | 3304-3309 | Service template (reference implementation) |
| **IAM** | Core | **3001** | 3310-3313 | 3314-3319 | Identity & Access Management |
| **NOTI** | Core | **3002** | 3320-3323 | 3324-3329 | Notification Service (REST + WebSocket) |

### B. Business Services

| Service | Type | Local | Prod API | Prod MCP/WS | Description |
|---------|------|-------|----------|-------------|-------------|
| **AIWM** | Business | **3003** | 3330-3333 | 3334-3339 | AI Workload Manager (API/MCP/WS) |
| **CBM** | Business | **3004** | 3340-3343 | 3344-3349 | Core Business Management |
| **MONA** | Business | **3005** | 3350-3353 | 3354-3359 | Monitoring & Analytics |

### C. Future Services (Reserved)

| Service | Local | Prod API | Prod MCP/WS | Notes |
|---------|-------|----------|-------------|-------|
| Service-07 | 3006 | 3360-3363 | 3364-3369 | Reserved for future service |
| Service-08 | 3007 | 3370-3373 | 3374-3379 | Reserved for future service |
| Service-09 | 3008 | 3380-3383 | 3384-3389 | Reserved for future service |
| Service-10 | 3009 | 3390-3393 | 3394-3399 | Reserved for future service |

---

## 📊 Production Port Structure

Each service receives **10 consecutive ports** in production:

```
┌─────────────────────────────────────────────────────────────┐
│  PRODUCTION PORT BREAKDOWN (XX0-XX9)                        │
├─────────────────────────────────────────────────────────────┤
│  XX0-XX3:  API Instances (4 ports)                          │
│            • HTTP/REST endpoints                             │
│            • Scale for high API traffic                      │
│            • Load balanced via Nginx/ALB                     │
│                                                              │
│  XX4-XX9:  Specialized Modes (6 ports)                      │
│            • MCP protocol servers                            │
│            • WebSocket connections                           │
│            • gRPC endpoints                                  │
│            • Future specialized protocols                    │
└─────────────────────────────────────────────────────────────┘
```

### Why 4:6 Ratio?

- **80% of traffic** is typically HTTP/REST API calls → 4 ports
- **20% of traffic** uses specialized protocols → 6 ports (allows higher instance count if needed)
- Flexible allocation based on service needs

---

## 🔍 Service Details

### Template Service (Reference Implementation)

**Purpose**: Demonstration service showing best practices for NestJS microservices

```yaml
Local Development:  3000
Production:
  API Instances:    3300, 3301, 3302, 3303  # 4 HTTP/REST instances
  Reserved:         3304-3309                # Future modes
```

**Usage**:
```bash
# Local
npx nx serve template

# Production (PM2)
pm2 start ecosystem.config.js --only core.template.api00
```

---

### IAM Service (Identity & Access Management)

**Purpose**: User authentication, authorization, organization management

```yaml
Local Development:  3001
Production:
  API Instances:    3310, 3311, 3312, 3313  # 4 HTTP/REST instances
  Reserved:         3314-3319                # Future modes (OAuth2, SSO)
```

**Usage**:
```bash
# Local
npx nx serve iam

# Production (PM2)
pm2 start ecosystem.config.js --only core.iam.api00,core.iam.api01
```

**Default Port in Code**: `process.env.PORT || 3001`

---

### NOTI Service (Notification Service)

**Purpose**: Real-time notifications via REST API and WebSocket

```yaml
Local Development:  3002
Production:
  API Instances:    3320, 3321, 3322, 3323  # 4 HTTP/REST instances
  WebSocket:        3324, 3325, 3326, 3327  # 4 WebSocket instances
  Reserved:         3328-3329                # Future modes
```

**Usage**:
```bash
# Local (API + WebSocket)
npx nx serve noti

# Production (PM2)
pm2 start ecosystem.config.js --only core.noti.api00,core.noti.ws00
```

**Default Port in Code**: `process.env.PORT || 3002`

---

### AIWM Service (AI Workload Manager)

**Purpose**: AI model deployment, agent orchestration, workflow execution

```yaml
Local Development:  3003 (API mode default)
Production:
  API Instances:    3330, 3331, 3332, 3333  # 4 HTTP/REST instances
  MCP Instances:    3334, 3335, 3336        # 3 MCP protocol instances
  WebSocket:        3337, 3338              # 2 WebSocket instances
  Reserved:         3339                     # Future modes
  Worker Mode:      No port (BullMQ queue consumer)
```

**Multi-Mode Service**:
- **API Mode**: HTTP REST API + WebSocket (default)
- **MCP Mode**: Model Context Protocol server for AI agents
- **Worker Mode**: Background job processor (no port)

**Usage**:
```bash
# Local - API Mode
npx nx run aiwm:api

# Local - MCP Mode
npx nx run aiwm:mcp

# Local - Worker Mode
npx nx run aiwm:wrk

# Production (PM2)
pm2 start ecosystem.config.js --only core.aiwm.api00,core.aiwm.mcp00,core.aiwm.worker00
```

**Default Port in Code**:
- API: `process.env.PORT || 3003`
- MCP: `process.env.PORT || 3335`

---

### CBM Service (Core Business Management)

**Purpose**: Business logic, document management, core workflows

```yaml
Local Development:  3004
Production:
  API Instances:    3340, 3341, 3342, 3343  # 4 HTTP/REST instances
  Reserved:         3344-3349                # Future modes
```

**Usage**:
```bash
# Local
npx nx run cbm:api

# Production (PM2)
pm2 start ecosystem.config.js --only core.cbm.api00,core.cbm.api01
```

**Default Port in Code**: `process.env.PORT || 3004`

---

### MONA Service (Monitoring & Analytics)

**Purpose**: Metrics collection, dashboard aggregation, system monitoring

```yaml
Local Development:  3005
Production:
  API Instances:    3350, 3351, 3352, 3353  # 4 HTTP/REST instances
  Reserved:         3354-3359                # Future modes (Prometheus, Grafana)
```

**Usage**:
```bash
# Local
npx nx serve mona

# Production (PM2)
pm2 start ecosystem.config.js --only core.mona.api00
```

**Default Port in Code**: `process.env.PORT || 3005`

---

## 🚀 Production Deployment

### PM2 Ecosystem Configuration

The `ecosystem.config.js` file manages production deployments with PM2:

```javascript
module.exports = {
  apps: [
    {
      name: 'core.iam.api00',
      script: './dist/services/iam/main.js',
      env: { PORT: 3310, SERVICE_NAME: 'iam' }
    },
    {
      name: 'core.iam.api01',
      script: './dist/services/iam/main.js',
      env: { PORT: 3311, SERVICE_NAME: 'iam' }
    },
    // ... more instances
  ]
}
```

### Load Balancing

Production instances are load balanced via Nginx:

```nginx
upstream iam_backend {
    server 127.0.0.1:3310;  # core.iam.api00
    server 127.0.0.1:3311;  # core.iam.api01
    server 127.0.0.1:3312;  # core.iam.api02
    server 127.0.0.1:3313;  # core.iam.api03
}

server {
    listen 443 ssl;
    server_name api.x-or.cloud;

    location /iam/ {
        proxy_pass http://iam_backend/;
    }
}
```

---

## 🔧 Environment Variables

### Local Development (.env)

```bash
# Service ports (defaults in code)
# IAM_PORT=3001
# NOTI_PORT=3002
# AIWM_PORT=3003
# CBM_PORT=3004
# MONA_PORT=3005
```

### Production (PM2 env)

```bash
# Set via ecosystem.config.js per instance
NODE_ENV=production
PORT=3310  # Dynamic per instance
SERVICE_NAME=iam
```

---

## 📝 Migration Checklist

When updating services to new port allocation:

### 1. Update Code
- [ ] Update `process.env.PORT || XXXX` default in `main.ts`
- [ ] Update any hardcoded port references

### 2. Update Documentation
- [ ] Service README.md
- [ ] CLAUDE.md reference
- [ ] API documentation

### 3. Update Infrastructure
- [ ] `ecosystem.config.js` PM2 configuration
- [ ] Nginx upstream configuration
- [ ] Docker Compose port mappings
- [ ] Kubernetes Service definitions

### 4. Update Development Tools
- [ ] `.vscode/launch.json` debug configurations
- [ ] `project.json` serve targets
- [ ] Environment variable templates

---

## 🔍 Quick Reference

### Local Development URLs

| Service | URL | Docs |
|---------|-----|------|
| Template | http://localhost:3000/api | http://localhost:3000/api-docs |
| IAM | http://localhost:3001 | http://localhost:3001/api-docs |
| NOTI | http://localhost:3002 | http://localhost:3002/api-docs |
| AIWM | http://localhost:3003 | http://localhost:3003/api-docs |
| CBM | http://localhost:3004 | http://localhost:3004/api-docs |
| MONA | http://localhost:3005 | http://localhost:3005/api-docs |

### Production URLs (Behind Nginx)

| Service | URL | Load Balanced Ports |
|---------|-----|---------------------|
| IAM | https://api.x-or.cloud/iam | 3310-3313 |
| NOTI | https://api.x-or.cloud/noti | 3320-3323 |
| AIWM | https://api.x-or.cloud/aiwm | 3330-3333 |
| CBM | https://api.x-or.cloud/cbm | 3340-3343 |
| MONA | https://api.x-or.cloud/mona | 3350-3353 |

---

## ❓ FAQ

### Q: Why Template service gets port 3000?
**A**: Template service is the reference implementation. Having it at 3000 (the conventional default) makes it easier to find and use as a starting point.

### Q: Can I use a different port locally?
**A**: Yes! Set `PORT` environment variable:
```bash
PORT=8080 npx nx serve iam
```

### Q: What if I need more than 4 API instances?
**A**: Use the 6 reserved ports (XX4-XX9). For example, AIWM API could use 3330-3336 (7 instances) if needed.

### Q: How do I add a new service?
**A**:
1. Choose next available local port (3006+)
2. Allocate next production range (3360-3369)
3. Update this document
4. Update CLAUDE.md
5. Create service README.md

### Q: What about Worker modes (no port)?
**A**: Services like AIWM worker don't need ports. They consume from BullMQ queue. Configure via PM2 with `MODE=worker` but no `PORT`.

---

## 📚 Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Development workflow and service overview
- [AIWM README](../services/aiwm/README.md) - AIWM service details
- [AIWM Worker Mode](../services/aiwm/WORKER-MODE.md) - Worker mode deployment
- [Template README](../services/template/README.md) - Template service reference

---

**Last Updated**: 2026-01-28
**Version**: 1.0.0
