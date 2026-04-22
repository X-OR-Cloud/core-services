# AIWM Worker - Worker Node Client

TypeScript/Node.js worker client that connects to the AIWM Controller and manages GPU resources, deployments, and models.

## Features

- ✅ **WebSocket Client** - Connects to AIWM Controller with JWT authentication
- ✅ **Hardware Detection** - Detects CPU, RAM, disk, and NVIDIA GPUs
- ✅ **Automatic Registration** - Registers node with controller on connection
- ✅ **Heartbeat & Metrics** - Sends regular heartbeat and detailed metrics
- ✅ **Command Handlers** - Processes commands from controller:
  - Deployment management (create, stop, restart)
  - Model download and caching
  - System health checks
- ✅ **Docker Integration** - Ready for Docker operations (dockerode)
- ✅ **Graceful Shutdown** - Handles SIGTERM/SIGINT signals

## Prerequisites

- Node.js 18+ / Node.js 20+
- NVIDIA GPU with nvidia-smi (optional, for GPU detection)
- Docker (optional, for deployment management)

## Configuration

Create or update `.env` file:

```bash
# Worker Configuration
NODE_ENV=development
LOG_LEVEL=debug

# Controller Connection
CONTROLLER_URL=http://localhost:3003
CONTROLLER_WS_URL=ws://localhost:3003/ws/node
NODE_TOKEN=<your-jwt-token>  # Get from AIWM controller

# Node Information
NODE_ID=<your-node-id>  # Must match the nodeId in the token
NODE_NAME=worker-node-01

# Heartbeat & Metrics
HEARTBEAT_INTERVAL=30000  # 30 seconds
METRICS_INTERVAL=60000    # 60 seconds

# Docker Configuration
DOCKER_SOCKET=/var/run/docker.sock

# GPU Detection
NVIDIA_SMI_PATH=/usr/bin/nvidia-smi
```

## Getting a Token

1. **Create a Node in AIWM Controller:**
   ```bash
   curl -X POST http://localhost:3003/api/nodes \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "nodeId": "node-001",
       "name": "GPU Node 01",
       "role": "gpu",
       "status": "active"
     }'
   ```

2. **Generate Worker Token:**
   ```bash
   curl -X POST http://localhost:3003/api/nodes/node-001/token \
     -H "Authorization: Bearer <admin-token>" \
     -H "Content-Type: application/json" \
     -d '{
       "expiresIn": 86400,
       "description": "Production GPU Node 01"
     }'
   ```

3. **Copy the token to `.env`:**
   ```bash
   NODE_ID=node-001
   NODE_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

## Development

```bash
# Build the worker
npx nx build aiwm-worker

# Run in development mode
npx nx serve aiwm-worker

# Run in production mode
node dist/services/aiwm-worker/main.js
```

## Architecture

```
aiwm-worker/
├── src/
│   ├── modules/
│   │   ├── hardware/              # Hardware detection service
│   │   │   ├── hardware.service.ts
│   │   │   └── hardware.module.ts
│   │   └── websocket/             # WebSocket client
│   │       ├── websocket-client.service.ts
│   │       └── websocket-client.module.ts
│   ├── app.module.ts
│   └── main.ts
├── .env
└── README.md
```

## Hardware Detection

The worker automatically detects:

- **Operating System**: Platform, distribution, version, architecture
- **CPU**: Model, cores, usage
- **RAM**: Total, used, free, usage percentage
- **Disk**: Total, used, free, usage percentage
- **GPU (NVIDIA)**: Model, memory, CUDA version, driver version
- **Docker**: Runtime type, version
- **Network**: Private and public IP addresses

## Message Flow

```
Worker Node                                     AIWM Controller
    │                                                  │
    │  1. Connect with JWT token                      │
    ├─────────────────────────────────────────────────>│
    │                                                  │
    │  2. connection.ack (success)                    │
    │<─────────────────────────────────────────────────┤
    │                                                  │
    │  3. node.register (hardware info)               │
    ├─────────────────────────────────────────────────>│
    │                                                  │
    │  4. register.ack (controller config)            │
    │<─────────────────────────────────────────────────┤
    │                                                  │
    │  5. telemetry.heartbeat (every 30s)             │
    ├─────────────────────────────────────────────────>│
    │                                                  │
    │  6. telemetry.metrics (every 60s)               │
    ├─────────────────────────────────────────────────>│
    │                                                  │
    │  7. deployment.create (command)                 │
    │<─────────────────────────────────────────────────┤
    │                                                  │
    │  8. command.ack (acknowledged)                  │
    ├─────────────────────────────────────────────────>│
    │                                                  │
    │  9. command.result (success/error)              │
    ├─────────────────────────────────────────────────>│
```

## Supported Commands

### Deployment Commands
- `deployment.create` - Create new deployment
- `deployment.stop` - Stop deployment
- `deployment.restart` - Restart deployment
- `deployment.update` - Update deployment config
- `deployment.delete` - Delete deployment

### Model Commands
- `model.download` - Download model from registry
- `model.cache` - Cache model locally
- `model.delete` - Delete cached model

### System Commands
- `system.healthCheck` - Get system health status
- `system.restart` - Restart worker daemon
- `system.update` - Update worker version

## Testing

To test the worker without GPU:
- The service will work without `nvidia-smi`
- GPU arrays will be empty but worker will still connect and function
- Useful for development and testing

## Deployment

### Systemd Service (Linux)

Create `/etc/systemd/system/aiwm-worker.service`:

```ini
[Unit]
Description=AIWM Worker Node
After=network.target docker.service

[Service]
Type=simple
User=aiwm-worker
WorkingDirectory=/opt/aiwm-worker
EnvironmentFile=/opt/aiwm-worker/.env
ExecStart=/usr/bin/node /opt/aiwm-worker/main.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable aiwm-worker
sudo systemctl start aiwm-worker
sudo systemctl status aiwm-worker
```

### Docker Container

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY dist/services/aiwm-worker /app
COPY services/aiwm-worker/.env /app/.env

CMD ["node", "main.js"]
```

## Troubleshooting

### Worker not connecting

1. Check token is valid and not expired
2. Verify CONTROLLER_WS_URL is correct
3. Check network connectivity to controller
4. View logs for authentication errors

### GPU not detected

1. Verify nvidia-smi is installed: `nvidia-smi`
2. Check NVIDIA_SMI_PATH in .env
3. Ensure user has permissions to run nvidia-smi

### Docker commands failing

1. Verify Docker is installed: `docker version`
2. Check user is in docker group: `groups`
3. Verify Docker socket path in .env

## License

Copyright © 2025 Hydra Services
