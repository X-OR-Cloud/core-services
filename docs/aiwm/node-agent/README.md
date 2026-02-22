# Hydra Node Agent - Integration Guide

Node Agent is a standalone binary (Node.js/TypeScript) deployed on GPU/worker nodes. It connects to AIWM service for command execution and to MONA service for metrics reporting.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     AIWM Service                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ REST API │  │ Node Gateway │  │ Agent/Deployment   │  │
│  │ :3003    │  │ /ws/node     │  │ Management         │  │
│  └────┬─────┘  └──────┬───────┘  └───────────────────┘  │
│       │               │                                  │
└───────┼───────────────┼──────────────────────────────────┘
        │ HTTP          │ WebSocket (Socket.IO)
        │               │
┌───────┼───────────────┼──────────────────────────────────┐
│       │    Node Agent │                                  │
│  ┌────▼─────┐  ┌──────▼───────┐  ┌───────────────────┐  │
│  │ Auth     │  │ WS Client   │  │ Metrics Collector  │  │
│  │ Manager  │  │ (Socket.IO) │  │ (System Stats)     │  │
│  └──────────┘  └──────────────┘  └────────┬──────────┘  │
│                                           │              │
└───────────────────────────────────────────┼──────────────┘
                                            │ HTTP
┌───────────────────────────────────────────┼──────────────┐
│                 MONA Service              │              │
│  ┌────────────────────────────────────────▼──────────┐   │
│  │ POST /metrics/push/node                           │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

## Node Agent Lifecycle

```
1. Startup
   └─► Login (apiKey + secret) → JWT token
       └─► WebSocket connect (JWT auth)
           └─► Receive connection.ack
               ├─► Send node.register (system specs)
               │   └─► Receive register.ack (intervals config)
               └─► Start loops:
                   ├─► Heartbeat loop (every 30s)
                   ├─► Metrics push to MONA (every 60s)
                   ├─► Token refresh (before expiry)
                   └─► Listen for commands:
                       ├─► agent.start / agent.stop
                       ├─► deployment.create / stop / restart
                       └─► model.download / delete
```

## Configuration

Node Agent requires these parameters at startup:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `AIWM_BASE_URL` | AIWM service base URL | `http://localhost:3003` |
| `AIWM_WS_PATH` | WebSocket namespace | `/ws/node` |
| `MONA_BASE_URL` | MONA service base URL | `http://localhost:3005` |
| `NODE_API_KEY` | Node API key (UUID) | `f38057be-d172-...` |
| `NODE_SECRET` | Node secret (UUID) | `f568b866-a0fa-...` |

## Documents

| File | Content |
|------|---------|
| [01-authentication.md](./01-authentication.md) | Login, token refresh, credentials |
| [02-websocket-connection.md](./02-websocket-connection.md) | WebSocket connect, register, heartbeat, disconnect |
| [03-events-reference.md](./03-events-reference.md) | All WebSocket events and message structures |
| [04-metrics-mona.md](./04-metrics-mona.md) | MONA metrics push API |
| [05-agent-commands.md](./05-agent-commands.md) | Agent lifecycle commands (start/stop) |

## Port Reference

| Service | Dev Port | Description |
|---------|----------|-------------|
| AIWM API | 3003 | REST API + WebSocket |
| MONA API | 3005 | Metrics push/query |
