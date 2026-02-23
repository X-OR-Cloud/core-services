# Node Module - Roadmap

> Last updated: 2026-02-23
> Status: Planning — awaiting implementation

## Decisions Made

### Status Enum Alignment (C1)

Gateway code checks for `status === 'inactive'` and `status === 'banned'` but schema only has:
`['pending', 'installing', 'online', 'offline', 'maintenance']`

**Decision**: Keep current schema statuses. Remove dead checks from gateway OR add `inactive`/`banned` to enum if needed later. For now, gateway should only block nodes in `maintenance` or future explicit disabled state.

### SystemInfo vs Deprecated Fields (C2)

Static system info now lives in `systemInfo` (structured). Old flat fields (cpuCores, ramTotal, etc.) are `@deprecated` on schema.

Dynamic metrics (cpuUsage, ramUsage, uptimeSeconds) must move to `MetricData` time-series collection — NOT stored in Node document.

**Decision**:
- Phase 1: Accept both `systemInfo` and legacy flat fields in `node.register` (already implemented)
- Phase 2: Stop writing deprecated fields from gateway. Keep in schema for read backward compat.
- Phase 3: Migrate data + drop deprecated fields from schema.

### In-memory vs Redis Connection Tracking (C3)

`NodeConnectionService` uses in-memory `Map`. Works for single instance.

**Decision**: Keep in-memory for now (single AIWM instance). Plan Redis migration when horizontal scaling is needed.

---

## Implementation Plan

### P0 — Must Fix (Foundation)

#### P0-1: Status Enum Alignment in Gateway

- [ ] Remove check for `status === 'inactive'` (not in schema) from `handleConnection`
- [ ] Remove check for `status === 'banned'` (not in schema) from `handleConnection`
- [ ] Only block nodes explicitly flagged — use `maintenance` status as the "disabled" state for now
- [ ] OR: Add `inactive` and `banned` to schema enum if the business logic requires them (discuss first)

#### P0-2: Stop Writing Dynamic Data to Node Document

- [ ] Remove `uptimeSeconds`, `cpuUsage`, `ramUsage` from `updateHeartbeat()` in `node.service.ts`
- [ ] `updateHeartbeat()` should only update: `status`, `lastHeartbeat`, `updatedAt`
- [ ] `storeMetrics()` should forward to MONA or MetricData collection — not write to Node document
- [ ] Update `UpdateNodeDto` to remove deprecated dynamic fields from API

### P1 — Important Improvements

#### P1-1: Implement Update Node API

- [ ] Uncomment and implement `updateNode()` in `node.service.ts`
- [ ] Uncomment `PUT /nodes/:id` in `node.controller.ts`
- [ ] Emit `node.updated` event via `NodeProducer`
- [ ] Validate: cannot change `apiKey` / `secretHash` via update (use regenerate-credentials)

#### P1-2: Implement Delete Node API

- [ ] Uncomment and implement `remove()` in `node.service.ts`
- [ ] Uncomment `DELETE /nodes/:id` in `node.controller.ts`
- [ ] On delete: disconnect WebSocket if node is online, emit `node.deleted` event
- [ ] Soft delete only (isDeleted: true)

#### P1-3: Stale Connection Monitor

- [ ] `NodeConnectionService.findStaleConnections()` is implemented but never called
- [ ] Add a cron job (NestJS `@Cron`) to run every 2 min
- [ ] For each stale connection (no heartbeat > 5min): disconnect socket + set status offline
- [ ] Log stale node IDs for debugging

#### P1-4: CORS Cleanup

- [ ] Remove hardcoded `origin: '*'` from `NodeGateway`
- [ ] Use env variable (`WEBSOCKET_CORS_ORIGIN`) or rely on Nginx in production
- [ ] For dev: optionally enable via `NODE_ENV !== 'production'` check

#### P1-5: Statistics — Add byRole

- [ ] Current `findAll()` aggregates `byStatus` only
- [ ] Add `byRole` aggregation (count nodes per role)
- [ ] Return `statistics: { total, byStatus, byRole }` consistent with Agent module pattern

### P2 — Planned (Needs Coordination)

#### P2-1: NodeProcessor + NOTI Integration

- [ ] Create `NodeProcessor` to consume events from `nodes.queue`
- [ ] Bridge to NOTI service for node lifecycle notifications (node online/offline)
- **Dependency**: NOTI service must be tested first

#### P2-2: Pending Commands on Register

- [ ] `register.ack` currently returns `pendingCommands: []` (hardcoded)
- [ ] Implement: fetch pending commands from DB on registration
- [ ] Commands that were sent but not ACK'd (e.g., after node restart) should be re-sent
- **Dependency**: Requires command persistence design

#### P2-3: MetricData Collection

- [ ] Design time-series schema for node metrics (cpu, ram, disk, gpu per timestamp)
- [ ] Update `storeMetrics()` to write to MetricData collection
- [ ] Update `updateHeartbeat()` to write heartbeat metrics to MetricData
- [ ] Query API for MONA integration
- **Dependency**: MONA service schema alignment

#### P2-4: Deployment Status/Logs Handling

- [ ] `handleDeploymentStatus()` — implement DB update for deployment status
- [ ] `handleDeploymentLogs()` — implement log storage or forwarding
- **Dependency**: Deployment module schema must be finalized

### P3 — Future

#### P3-1: Redis-Based Connection Tracking

- [ ] Replace in-memory `NodeConnectionService` Map with Redis
- [ ] Required for horizontal scaling (multiple AIWM instances)
- [ ] Design: Redis key `node:connection:{nodeId}` with socket session info
- **Note**: Socket.IO itself would also need Redis adapter for multi-instance

#### P3-2: Node Groups

- [ ] `groupId` is tracked in `NodeConnection` but no Group concept in schema
- [ ] Design Node group schema and API
- [ ] Allow targeting commands to a group of nodes

#### P3-3: Deprecated Field Migration

- [ ] After P0-2 and P2-3 are done, run migration script
- [ ] Convert existing flat fields → `systemInfo` for historical data
- [ ] Drop deprecated `@Prop` fields from `node.schema.ts`

---

## Notes

- `controllerId` in connection.ack and register.ack is hardcoded as `'controller-main'` — should come from config
- `serverVersion` in connection.ack is hardcoded as `'1.0.0'` — should come from `package.json`
- `heartbeatInterval` and `metricsInterval` in register.ack are hardcoded — should be configurable
- Update/Delete APIs are commented out in both service and controller — they need implementation before exposing
