# CLAUDE.md - AIWM Service

## Service Overview

AIWM (AI Workload Manager) is the core service for AI operations. Port 3003 (dev), 3330-3339 (prod).

Dual mode: API (HTTP/WebSocket) + MCP (AI agent integration).

## Modules

| Module | Path | Description |
|--------|------|-------------|
| Agent | `src/modules/agent/` | AI agent management (managed + autonomous types) |
| Node | `src/modules/node/` | Worker node management + WebSocket gateway (`/ws/node`) |
| Chat | `src/modules/chat/` | Real-time chat WebSocket gateway (`/ws/chat`) |
| Model | `src/modules/model/` | AI model metadata and lifecycle |
| Deployment | `src/modules/deployment/` | Model deployment + inference proxy |
| Instruction | `src/modules/instruction/` | System prompts and guidelines |
| Tool | `src/modules/tool/` | MCP tools, built-in tools, custom tools |
| Guardrail | `src/modules/guardrail/` | Safety constraints for agents |
| Configuration | `src/modules/configuration/` | Key-value configuration management |
| Conversation | `src/modules/conversation/` | Chat conversation management |
| Message | `src/modules/message/` | Chat message storage and retrieval |
| Execution | `src/modules/execution/` | Workflow execution orchestration |
| Workflow | `src/modules/workflow/` | Workflow definition and steps |
| Resource | `src/modules/resource/` | Infrastructure resource management |
| Reports | `src/modules/reports/` | Analytics and reporting |
| PII | `src/modules/pii/` | PII detection and redaction |

## Module-Specific Documentation

When working on a specific module, read the corresponding docs:

- **Agent module**: Read `docs/aiwm/agents/` directory AND `docs/aiwm/agent/OVERVIEW.md` + `docs/aiwm/agent/ROADMAP.md`
- **Node module**: Read `docs/aiwm/node/OVERVIEW.md` + `docs/aiwm/node/ROADMAP.md` AND `docs/aiwm/node-agent/` directory (client integration)
- **Instruction module**: Read `docs/aiwm/instruction/OVERVIEW.md` + `docs/aiwm/instruction/ROADMAP.md`
- **Chat/WebSocket**: Read `docs/aiwm/CHAT-WEBSOCKET-ARCHITECTURE.md`
- **Deployment**: Read `docs/aiwm/DEPLOYMENT-INFERENCE-PLAN.md`
- **Tool**: Read `docs/aiwm/tools/TOOL-TYPES-AND-EXECUTION.md`
- **Workflow**: Read `docs/aiwm/workflow-feature/` directory
- **Configuration**: Read `docs/aiwm/configuration-management-proposal-v2.md`

## Key Architecture Patterns

### WebSocket Gateways
- **NodeGateway** (`/ws/node`): Node worker connections. JWT auth in `afterInit` middleware. In-memory connection tracking via `NodeConnectionService`.
- **ChatGateway** (`/ws/chat`): User/Agent chat. JWT auth in `handleConnection`. Redis-based presence tracking via `ChatService`.

### Queue System (BullMQ)
- Producers in `src/queues/producers/` — emit events
- Processors in `src/queues/processors/` — consume events (currently: NodeProcessor, ModelProcessor)
- Config in `src/config/queue.config.ts`

### Agent Types
- **managed**: System-deployed to nodes via WebSocket commands (agent.start/update/delete). Has secret for auth.
- **autonomous**: User self-deploys following install guide. Has secret for auth. Uses user's own environment.
- See `docs/aiwm/agents/AGENT-TYPE-CLASSIFICATION.md` for full details.

## Commands

```bash
nx run aiwm:api    # API mode (REST + WebSocket)
nx run aiwm:mcp    # MCP mode
nx run aiwm:wrk    # Worker mode
nx run aiwm:build  # Build
```
