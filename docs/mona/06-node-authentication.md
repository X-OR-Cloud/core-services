# Metrics Module - Node Authentication

**Version**: 2.0
**Date**: 2026-01-27
**Status**: Design Specification

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Node Schema Updates](#node-schema-updates)
3. [AIWM API - Verify Credentials](#aiwm-api---verify-credentials)
4. [IAM API - Node Authentication](#iam-api---node-authentication)
5. [Authentication Flow](#authentication-flow)

---

## 1. Overview

### Purpose

Node authentication cho phép node daemon tự động xác thực và nhận JWT token để push metrics về AIWM service.

### Architecture

```
Node Daemon → IAM (/auth/node/login) → AIWM (/nodes/verify-credentials) → JWT Token
Node Daemon → AIWM (/metrics/push/node) with JWT → Metrics stored
```

---

## 2. Node Schema Updates

### 2.1 Schema Changes

**File**: `services/aiwm/src/modules/node/node.schema.ts`

Thêm các fields sau vào Node schema:

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { BaseSchema } from '@hydrabyte/base';
import * as bcrypt from 'bcrypt';

@Schema({ timestamps: true })
export class Node extends BaseSchema {
  // ... existing fields ...

  // Authentication credentials
  @Prop({ required: true, unique: true, index: true })
  apiKey!: string; // Auto-generated UUID

  @Prop({ required: true, select: false })
  secretHash!: string; // Bcrypt hashed secret

  @Prop({ type: [String], default: ['node-operator'] })
  roles!: string[]; // Role-based access control

  @Prop({ default: true })
  isActive!: boolean; // Enable/disable node authentication

  @Prop()
  lastAuthAt?: Date; // Track last authentication time

  // Helper method to verify secret
  async verifySecret(plainSecret: string): Promise<boolean> {
    return bcrypt.compare(plainSecret, this.secretHash);
  }
}

export const NodeSchema = SchemaFactory.createForClass(Node);

// Add method to schema
NodeSchema.methods.verifySecret = async function(plainSecret: string): Promise<boolean> {
  return bcrypt.compare(plainSecret, this.secretHash);
};
```

### 2.2 Credential Generation

When creating a new node:

```typescript
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

async createNode(dto: CreateNodeDto) {
  // Generate credentials
  const apiKey = randomUUID(); // e.g., "a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p"
  const secret = randomUUID(); // Generate once, show to user
  const secretHash = await bcrypt.hash(secret, 10);

  const node = await this.nodeModel.create({
    ...dto,
    apiKey,
    secretHash,
    roles: ['node-operator'],
    isActive: true,
  });

  // Return credentials ONCE (user must save them)
  return {
    node,
    credentials: {
      apiKey,
      secret, // Only shown once!
    },
  };
}
```

**Important**: Secret chỉ hiển thị **1 lần** khi tạo node. User phải lưu lại.

---

## 3. AIWM API - Verify Credentials

### 3.1 Endpoint Specification

**Endpoint**: `POST /nodes/verify-credentials`

**Purpose**: Internal API cho IAM service verify node credentials

**Authentication**: API Key (service-to-service)

```
X-API-Key: <INTERNAL_API_KEY>
```

**Request Body**:

```typescript
interface VerifyNodeCredentialsDto {
  nodeId: string;
  apiKey: string;
  secret: string;
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "valid": true,
    "node": {
      "_id": "65a0000000000000000000001",
      "name": "gpu-worker-01",
      "roles": ["node-operator"],
      "isActive": true,
      "owner": {
        "orgId": "org_001"
      }
    }
  }
}
```

**Error Response**: `401 Unauthorized`

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid node credentials"
  }
}
```

### 3.2 Implementation

**File**: `services/aiwm/src/modules/node/node.controller.ts`

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '@hydrabyte/base';

@Controller('nodes')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @Post('verify-credentials')
  @UseGuards(ApiKeyGuard) // Internal API only
  async verifyCredentials(@Body() dto: VerifyNodeCredentialsDto) {
    const node = await this.nodeService.verifyCredentials(dto);

    if (!node) {
      throw new UnauthorizedException('Invalid node credentials');
    }

    return {
      success: true,
      data: {
        valid: true,
        node: {
          _id: node._id,
          name: node.name,
          roles: node.roles,
          isActive: node.isActive,
          owner: {
            orgId: node.owner?.orgId,
          },
        },
      },
    };
  }
}
```

**File**: `services/aiwm/src/modules/node/node.service.ts`

```typescript
async verifyCredentials(dto: VerifyNodeCredentialsDto): Promise<Node | null> {
  // Find node by ID and apiKey
  const node = await this.nodeModel
    .findOne({
      _id: dto.nodeId,
      apiKey: dto.apiKey,
      isActive: true,
    })
    .select('+secretHash') // Include secretHash field
    .exec();

  if (!node) {
    return null;
  }

  // Verify secret
  const isValidSecret = await node.verifySecret(dto.secret);
  if (!isValidSecret) {
    return null;
  }

  // Update last auth time
  await this.nodeModel.updateOne(
    { _id: node._id },
    { lastAuthAt: new Date() }
  );

  return node;
}
```

### 3.3 API Key Guard

**File**: `libs/base/src/guards/api-key.guard.ts`

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expectedApiKey = this.configService.get('INTERNAL_API_KEY');

    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
```

**Environment Variable**:

```env
# services/aiwm/.env
INTERNAL_API_KEY=your-secure-random-key-here
```

---

## 4. IAM API - Node Authentication

### 4.1 Endpoint Specification

**Endpoint**: `POST /auth/node/login`

**Purpose**: Node daemon login để nhận JWT token

**Authentication**: None (public endpoint)

**Request Body**:

```typescript
interface NodeLoginDto {
  nodeId: string;
  apiKey: string;
  secret: string;
}
```

**Response**: `200 OK`

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 604800,
    "node": {
      "_id": "65a0000000000000000000001",
      "name": "gpu-worker-01",
      "roles": ["node-operator"]
    }
  }
}
```

**Error Response**: `401 Unauthorized`

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid credentials"
  }
}
```

### 4.2 Implementation

**File**: `services/iam/src/modules/auth/auth.controller.ts`

```typescript
import { Controller, Post, Body } from '@nestjs/common';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('node/login')
  async nodeLogin(@Body() dto: NodeLoginDto) {
    return this.authService.nodeLogin(dto);
  }
}
```

**File**: `services/iam/src/modules/auth/auth.service.ts`

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  async nodeLogin(dto: NodeLoginDto) {
    // Call AIWM to verify credentials
    const aiwmUrl = this.configService.get('AIWM_SERVICE_URL');
    const internalApiKey = this.configService.get('INTERNAL_API_KEY');

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${aiwmUrl}/nodes/verify-credentials`,
          {
            nodeId: dto.nodeId,
            apiKey: dto.apiKey,
            secret: dto.secret,
          },
          {
            headers: {
              'X-API-Key': internalApiKey,
              'Content-Type': 'application/json',
            },
          }
        )
      );

      const { valid, node } = response.data.data;

      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Generate JWT token with orgId from node data
      const payload = {
        sub: node._id,
        nodeId: node._id,
        orgId: node.owner?.orgId || '',
        roles: node.roles,
        type: 'node',
      };

      const token = this.jwtService.sign(payload, {
        expiresIn: '7d', // 7 days
      });

      return {
        success: true,
        data: {
          token,
          expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
          node: {
            _id: node._id,
            name: node.name,
            roles: node.roles,
          },
        },
      };
    } catch (error) {
      if (error.response?.status === 401) {
        throw new UnauthorizedException('Invalid credentials');
      }
      throw error;
    }
  }
}
```

**Environment Variables**:

```env
# services/iam/.env
AIWM_SERVICE_URL=http://localhost:3003
INTERNAL_API_KEY=your-secure-random-key-here
JWT_SECRET=your-jwt-secret-here
```

---

## 5. Authentication Flow

### 5.1 Complete Flow Diagram

```
┌──────────────┐
│ Node Daemon  │
└──────┬───────┘
       │
       │ 1. POST /auth/node/login
       │    { nodeId, apiKey, secret }
       ▼
┌──────────────┐
│ IAM Service  │
└──────┬───────┘
       │
       │ 2. POST /nodes/verify-credentials
       │    { nodeId, apiKey, secret }
       │    Header: X-API-Key
       ▼
┌──────────────┐
│ AIWM Service │◄──── Verify credentials
└──────┬───────┘      Check apiKey & secret
       │              Return node data + roles
       │ 3. Response: { valid: true, node }
       ▼
┌──────────────┐
│ IAM Service  │◄──── Generate JWT token
└──────┬───────┘      Payload: { nodeId, roles, type: 'node' }
       │
       │ 4. Response: { token, expiresIn, node }
       ▼
┌──────────────┐
│ Node Daemon  │◄──── Save token
└──────┬───────┘      Use for metrics push
       │
       │ 5. POST /metrics/push/node
       │    Header: Authorization: Bearer <token>
       ▼
┌──────────────┐
│ AIWM Service │◄──── Verify JWT
└──────────────┘      Extract nodeId from token
                      Check nodeId matches request
                      Accept metrics
```

### 5.2 JWT Token Structure

```json
{
  "sub": "65a0000000000000000000001",
  "nodeId": "65a0000000000000000000001",
  "orgId": "org_001",
  "roles": ["node-operator"],
  "type": "node",
  "iat": 1706313600,
  "exp": 1706918400
}
```

**Token Claims**:
- `sub`: Subject (node ID)
- `nodeId`: Node identifier
- `orgId`: Organization ID (from node.owner.orgId)
- `roles`: Array of role strings (for future RBAC)
- `type`: Token type ("node")
- `iat`: Issued at (timestamp)
- `exp`: Expires at (timestamp)

### 5.3 Node Daemon Usage Example

```bash
#!/bin/bash
# Node daemon authentication script

NODE_ID="65a0000000000000000000001"
API_KEY="a7b2c3d4-e5f6-4g7h-8i9j-0k1l2m3n4o5p"
SECRET="b8c3d4e5-f6g7-5h8i-9j0k-1l2m3n4o5p6q"

# Login to get token
TOKEN_RESPONSE=$(curl -s -X POST http://localhost:3000/auth/node/login \
  -H "Content-Type: application/json" \
  -d "{
    \"nodeId\": \"$NODE_ID\",
    \"apiKey\": \"$API_KEY\",
    \"secret\": \"$SECRET\"
  }")

TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.data.token')

# Save token for later use
echo $TOKEN > /var/lib/node-daemon/token

# Push metrics with token
curl -X POST http://localhost:3003/metrics/push/node \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "'$NODE_ID'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "cpu": { "usage": 45.8, "cores": 16, "loadAverage": [2.5, 2.8, 3.1] },
    "memory": { "total": 68719476736, "used": 34359738368, "free": 30359738368, "cached": 4000000000 },
    "status": "online",
    "websocketConnected": true,
    "uptime": 86400
  }'
```

---

## 6. Security Considerations

### 6.1 Credential Storage

- ✅ **apiKey**: Plain text in DB (UUID, low entropy risk)
- ✅ **secret**: Bcrypt hashed in DB (never stored plain)
- ✅ **Secrets shown only once** during node creation
- ✅ **No API to retrieve plain secret** after creation

### 6.2 Service-to-Service Auth

- ✅ **API Key** for IAM ↔ AIWM communication
- ✅ **Shared secret** via environment variable
- ✅ **Internal network only** (recommended)

### 6.3 JWT Token Security

- ✅ **Short expiry**: 7 days (configurable)
- ✅ **Signed with secret**: HS256 algorithm
- ✅ **Role-based claims**: For future RBAC
- ✅ **Auto-refresh**: Node daemon refreshes before expiry

### 6.4 Rate Limiting

- **Node Login**: 5 attempts per 15 minutes per nodeId
- **Metrics Push**: 1 request per minute per node (existing)

---

**Next**: Update [03-api-design.md](./03-api-design.md) with authentication details
