# AIWM Service - API Documentation for Frontend Integration

## Overview

The **AIWM (AI Workflow Manager)** service manages AI infrastructure resources including GPU nodes, AI models, agents, deployments, and workflow executions. This document provides comprehensive API documentation for frontend developers to integrate with the AIWM Web Portal.

**Service Information:**
- **Base URL**: `http://localhost:3003/api`
- **WebSocket URL**: `ws://localhost:3003/ws/node`
- **Swagger Documentation**: `http://localhost:3003/api-docs`
- **Health Check**: `http://localhost:3003/api/health`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Common Patterns](#common-patterns)
3. [Entity Relationships](#entity-relationships)
4. [API Endpoints](#api-endpoints)
   - [Nodes (GPU Infrastructure)](#1-nodes-gpu-infrastructure)
   - [Models (AI Models)](#2-models-ai-models)
   - [Instructions (Agent Behavior)](#3-instructions-agent-behavior)
   - [Agents (AI Agents)](#4-agents-ai-agents)
   - [Deployments](#5-deployments)
   - [Executions (Workflows)](#6-executions-workflows)
   - [Tools](#7-tools)
   - [Conversations](#8-conversations)
   - [Messages](#9-messages)
5. [WebSocket Integration](#websocket-integration)
6. [Error Handling](#error-handling)

---

## Authentication

All API endpoints require JWT authentication via the IAM service.

### Getting an Access Token

```bash
# Login to IAM service
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "tonyh",
    "password": "123zXc_-"
  }'
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "68dcf365f6a92c0d4911b619",
    "username": "tonyh",
    "roles": ["universe.owner"],
    "orgId": "68dd05b175d9e3c17bf97f60"
  }
}
```

### Using the Token

Include the token in the `Authorization` header for all AIWM API requests:

```javascript
// JavaScript/TypeScript example
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

fetch('http://localhost:3003/api/nodes', {
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Common Patterns

### Pagination

All `GET` collection endpoints support pagination:

**Query Parameters:**
- `page` (number, default: 1) - Page number (1-indexed)
- `limit` (number, default: 10, max: 100) - Items per page
- `filter[field]` (string) - Filter by field value
- `sort` (string) - Sort fields (prefix `-` for descending)

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}
```

### Soft Delete

All entities support soft delete (not permanently removed):
- DELETE operations set `isDeleted: true` and `deletedAt` timestamp
- Soft-deleted records are automatically hidden from GET queries

### Audit Trail

All entities automatically track:
- `createdBy` - User ID who created the record
- `updatedBy` - User ID who last modified the record
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

### Multi-Tenant Isolation

All data is scoped by organization/group:
- Users only see data from their organization
- Data ownership is tracked via `owner.orgId`, `owner.userId`, `owner.groupId`

---

## Entity Relationships

```
┌──────────────┐
│     Node     │ (GPU Infrastructure)
│              │
│ - nodeId     │
│ - name       │
│ - status     │◄──────────┐
│ - cpuCores   │           │
│ - ramTotal   │           │
│ - gpuDevices │           │
└──────────────┘           │
       │                   │
       │ 1:N               │ N:1
       ▼                   │
┌──────────────┐           │
│    Model     │           │
│              │           │
│ - modelId    │           │
│ - name       │           │
│ - type       │           │
│ - framework  │           │
│ - nodeId     │───────────┘
└──────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐      ┌──────────────┐
│ Deployment   │      │    Agent     │
│              │      │              │
│ - deploymentId│     │ - agentId    │
│ - modelId    │      │ - name       │
│ - nodeId     │      │ - nodeId     │
│ - status     │      │ - status     │
└──────────────┘      └──────────────┘
       │                     │
       │                     │ 1:N
       │                     ▼
       │              ┌──────────────┐
       │              │Conversation  │
       │              │              │
       │              │ - agentId    │
       │              │ - modelId    │
       │              └──────────────┘
       │                     │
       │                     │ 1:N
       │                     ▼
       │              ┌──────────────┐
       │              │   Message    │
       │              │              │
       │              │ - content    │
       │              │ - role       │
       │              └──────────────┘
       │
       │ 1:N
       ▼
┌──────────────┐
│  Execution   │ (Workflow Orchestration)
│              │
│ - executionId│
│ - type       │
│ - status     │
│ - steps[]    │
│ - nodeId     │
└──────────────┘

┌──────────────┐
│     Tool     │ (Standalone)
│              │
│ - toolId     │
│ - name       │
│ - type       │
│ - endpoint   │
└──────────────┘
```

---

## API Endpoints

## 1. Nodes (GPU Infrastructure)

Nodes represent GPU-enabled infrastructure (servers/machines) that can run AI workloads.

### Entity Schema

```typescript
{
  _id: string;
  nodeId: string;              // Unique identifier (UUID)
  name: string;                // Human-readable name
  role: string[];              // ["controller", "worker", "proxy", "storage"]
  status: string;              // "online" | "offline" | "maintenance"
  isLocal: boolean;            // Local or remote node
  vpnIp?: string;              // VPN IP address
  websocketConnected: boolean; // WebSocket connection status
  lastHeartbeat: Date;         // Last heartbeat timestamp

  // Hardware specs
  cpuCores: number;
  ramTotal: number;            // MB
  ramFree: number;             // MB

  // GPU devices (array)
  gpuDevices?: [{
    deviceId: string;
    model: string;
    memoryTotal: number;       // MB
    memoryFree: number;        // MB
    utilization: number;       // 0-100%
    temperature: number;       // Celsius
  }];

  // Audit fields
  owner: {
    orgId: string;
    userId: string;
    groupId: string;
  };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 1.1 Register Node

Create a new GPU node in the system.

**Endpoint:** `POST /api/nodes`

**Request Body:**
```json
{
  "nodeId": "node-gpu-01",
  "name": "GPU Server 1",
  "role": ["worker"],
  "status": "offline",
  "isLocal": true,
  "cpuCores": 16,
  "ramTotal": 65536,
  "ramFree": 32768
}
```

**Response (201 Created):**
```json
{
  "_id": "68f2a1b3c4d5e6f7a8b9c0d1",
  "nodeId": "node-gpu-01",
  "name": "GPU Server 1",
  "role": ["worker"],
  "status": "offline",
  "isLocal": true,
  "websocketConnected": false,
  "lastHeartbeat": "2025-11-16T10:30:00.000Z",
  "cpuCores": 16,
  "ramTotal": 65536,
  "ramFree": 32768,
  "owner": {
    "orgId": "68dd05b175d9e3c17bf97f60",
    "userId": "68dcf365f6a92c0d4911b619",
    "groupId": ""
  },
  "createdAt": "2025-11-16T10:30:00.000Z",
  "updatedAt": "2025-11-16T10:30:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nodeId": "node-gpu-01",
    "name": "GPU Server 1",
    "role": ["worker"],
    "status": "offline",
    "isLocal": true,
    "cpuCores": 16,
    "ramTotal": 65536,
    "ramFree": 32768
  }'
```

### 1.2 Get All Nodes

Retrieve list of all nodes with pagination and filtering.

**Endpoint:** `GET /api/nodes`

**Query Parameters:**
- `page` (number, default: 1)
- `limit` (number, default: 10)
- `filter[status]` (string) - Filter by status: "online", "offline", "maintenance"
- `filter[isLocal]` (boolean) - Filter by local/remote
- `sort` (string) - Sort by field, e.g., `-createdAt`, `name`

**Response (200 OK):**
```json
{
  "data": [
    {
      "_id": "68f2a1b3c4d5e6f7a8b9c0d1",
      "nodeId": "node-gpu-01",
      "name": "GPU Server 1",
      "role": ["worker"],
      "status": "online",
      "websocketConnected": true,
      "lastHeartbeat": "2025-11-16T10:35:00.000Z",
      "cpuCores": 16,
      "ramTotal": 65536,
      "ramFree": 28000,
      "createdAt": "2025-11-16T10:30:00.000Z",
      "updatedAt": "2025-11-16T10:35:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

**cURL Examples:**
```bash
# Get all nodes
curl "http://localhost:3003/api/nodes" \
  -H "Authorization: Bearer $TOKEN"

# Get only online nodes
curl "http://localhost:3003/api/nodes?filter[status]=online" \
  -H "Authorization: Bearer $TOKEN"

# Get local nodes, sorted by name
curl "http://localhost:3003/api/nodes?filter[isLocal]=true&sort=name" \
  -H "Authorization: Bearer $TOKEN"

# Pagination: page 2, 20 items per page
curl "http://localhost:3003/api/nodes?page=2&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### 1.3 Get Node by ID

Retrieve a single node by its MongoDB ObjectId.

**Endpoint:** `GET /api/nodes/:id`

**Response (200 OK):**
```json
{
  "_id": "68f2a1b3c4d5e6f7a8b9c0d1",
  "nodeId": "node-gpu-01",
  "name": "GPU Server 1",
  "role": ["worker"],
  "status": "online",
  "websocketConnected": true,
  "cpuCores": 16,
  "ramTotal": 65536,
  "ramFree": 28000,
  "gpuDevices": [
    {
      "deviceId": "GPU-0",
      "model": "NVIDIA RTX 4090",
      "memoryTotal": 24576,
      "memoryFree": 20000,
      "utilization": 45,
      "temperature": 65
    }
  ],
  "createdAt": "2025-11-16T10:30:00.000Z",
  "updatedAt": "2025-11-16T10:35:00.000Z"
}
```

**cURL Example:**
```bash
curl "http://localhost:3003/api/nodes/68f2a1b3c4d5e6f7a8b9c0d1" \
  -H "Authorization: Bearer $TOKEN"
```

### 1.4 Update Node

Update node information.

**Endpoint:** `PUT /api/nodes/:id`

**Request Body:**
```json
{
  "name": "GPU Server 1 - Updated",
  "status": "maintenance",
  "ramFree": 30000
}
```

**Response (200 OK):**
```json
{
  "_id": "68f2a1b3c4d5e6f7a8b9c0d1",
  "nodeId": "node-gpu-01",
  "name": "GPU Server 1 - Updated",
  "status": "maintenance",
  "ramFree": 30000,
  "updatedBy": "68dcf365f6a92c0d4911b619",
  "updatedAt": "2025-11-16T10:40:00.000Z"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3003/api/nodes/68f2a1b3c4d5e6f7a8b9c0d1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPU Server 1 - Updated",
    "status": "maintenance"
  }'
```

### 1.5 Delete Node

Soft delete a node (sets `isDeleted: true`).

**Endpoint:** `DELETE /api/nodes/:id`

**Response (200 OK):**
```json
{
  "message": "Node deleted successfully"
}
```

**cURL Example:**
```bash
curl -X DELETE http://localhost:3003/api/nodes/68f2a1b3c4d5e6f7a8b9c0d1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 2. Models (AI Models)

Models represent AI/ML models that can be deployed on nodes.

### Entity Schema

```typescript
{
  _id: string;
  modelId: string;             // Unique identifier (UUID)
  name: string;                // Model name
  description: string;
  version: string;             // Model version (e.g., "1.0.0")
  type: string;                // "llm" | "diffusion" | "embedding" | "classifier"
  framework: string;           // "pytorch" | "tensorflow" | "onnx" | "huggingface"

  // Repository info
  repository: string;          // e.g., "huggingface.co/meta-llama/Llama-2-7b"
  fileName: string;            // Model file name
  fileSize: number;            // File size in bytes

  // Download status
  isDownloaded: boolean;
  downloadPath?: string;       // Local path where model is stored
  downloadProgress: number;    // 0-100%
  status: string;              // "queued" | "downloading" | "ready" | "error"

  // Node assignment
  nodeId: string;              // Which node has this model

  // Usage statistics
  totalInference: number;      // Total inference count
  totalTokens: number;         // Total tokens processed
  totalProcessingTime: number; // Total processing time (ms)

  tags?: string[];
  status: string;       // "active" | "inactive"

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2.1 Register Model

Register a new AI model in the system.

**Endpoint:** `POST /api/models`

**Request Body:**
```json
{
  "modelId": "llama-2-7b-v1",
  "name": "Llama 2 7B",
  "description": "Meta's Llama 2 7B parameter model",
  "version": "1.0.0",
  "type": "llm",
  "framework": "pytorch",
  "repository": "huggingface.co/meta-llama/Llama-2-7b-chat-hf",
  "fileName": "model.safetensors",
  "fileSize": 13476875264,
  "nodeId": "node-gpu-01",
  "tags": ["llm", "chat", "meta"]
}
```

**Response (201 Created):**
```json
{
  "_id": "68f2b2c3d4e5f6a7b8c9d0e1",
  "modelId": "llama-2-7b-v1",
  "name": "Llama 2 7B",
  "description": "Meta's Llama 2 7B parameter model",
  "version": "1.0.0",
  "type": "llm",
  "framework": "pytorch",
  "repository": "huggingface.co/meta-llama/Llama-2-7b-chat-hf",
  "fileName": "model.safetensors",
  "fileSize": 13476875264,
  "isDownloaded": false,
  "downloadProgress": 0,
  "status": "queued",
  "nodeId": "node-gpu-01",
  "totalInference": 0,
  "totalTokens": 0,
  "totalProcessingTime": 0,
  "tags": ["llm", "chat", "meta"],
  "status": "active",
  "createdAt": "2025-11-16T11:00:00.000Z",
  "updatedAt": "2025-11-16T11:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "llama-2-7b-v1",
    "name": "Llama 2 7B",
    "description": "Meta'\''s Llama 2 7B parameter model",
    "version": "1.0.0",
    "type": "llm",
    "framework": "pytorch",
    "repository": "huggingface.co/meta-llama/Llama-2-7b-chat-hf",
    "fileName": "model.safetensors",
    "fileSize": 13476875264,
    "nodeId": "node-gpu-01",
    "tags": ["llm", "chat", "meta"]
  }'
```

### 2.2 Get All Models

**Endpoint:** `GET /api/models`

**Query Parameters:**
- `filter[type]` - Filter by model type
- `filter[framework]` - Filter by framework
- `filter[nodeId]` - Filter by node
- `filter[isDownloaded]` - Filter by download status
- `sort` - Sort by field

**Response (200 OK):**
```json
{
  "data": [
    {
      "_id": "68f2b2c3d4e5f6a7b8c9d0e1",
      "modelId": "llama-2-7b-v1",
      "name": "Llama 2 7B",
      "type": "llm",
      "framework": "pytorch",
      "fileSize": 13476875264,
      "isDownloaded": true,
      "status": "ready",
      "nodeId": "node-gpu-01",
      "createdAt": "2025-11-16T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

**cURL Examples:**
```bash
# Get all models
curl "http://localhost:3003/api/models" \
  -H "Authorization: Bearer $TOKEN"

# Filter by LLM models
curl "http://localhost:3003/api/models?filter[type]=llm" \
  -H "Authorization: Bearer $TOKEN"

# Filter by node and downloaded status
curl "http://localhost:3003/api/models?filter[nodeId]=node-gpu-01&filter[isDownloaded]=true" \
  -H "Authorization: Bearer $TOKEN"
```

### 2.3 Get Model by ID

**Endpoint:** `GET /api/models/:id`

**cURL Example:**
```bash
curl "http://localhost:3003/api/models/68f2b2c3d4e5f6a7b8c9d0e1" \
  -H "Authorization: Bearer $TOKEN"
```

### 2.4 Update Model

**Endpoint:** `PUT /api/models/:id`

**Request Body:**
```json
{
  "status": "downloading",
  "downloadProgress": 45,
  "isDownloaded": false
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3003/api/models/68f2b2c3d4e5f6a7b8c9d0e1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "downloading",
    "downloadProgress": 45
  }'
```

### 2.5 Delete Model

**Endpoint:** `DELETE /api/models/:id`

**cURL Example:**
```bash
curl -X DELETE http://localhost:3003/api/models/68f2b2c3d4e5f6a7b8c9d0e1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 3. Instructions (Agent Behavior)

Instructions define how AI agents should behave, providing system prompts and guidelines for agent behavior and task execution.

### Entity Schema

```typescript
{
  _id: string;                 // MongoDB ObjectId (primary identifier)
  name: string;                // e.g., "Customer Support Agent v1"
  description?: string;
  systemPrompt: string;        // Main system prompt for the agent
  guidelines?: string[];       // Step-by-step rules/guidelines
  tags?: string[];             // ["customer-service", "polite", "helpful"]
  status: string;       // "active" | "inactive"

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3.1 Create Instruction

**Endpoint:** `POST /instructions`

**Request Body:**
```json
{
  "name": "Customer Support Agent v1",
  "description": "Instructions for customer support AI agent",
  "systemPrompt": "You are a helpful customer support agent. Always be polite, professional, and empathetic. Your goal is to resolve customer issues efficiently while maintaining a positive experience.",
  "guidelines": [
    "Always greet customers warmly",
    "Listen carefully to understand the issue",
    "Provide clear step-by-step solutions",
    "Escalate complex issues to human agents",
    "End with asking if there's anything else you can help with"
  ],
  "tags": ["customer-service", "support", "polite"],
  "status": "active"
}
```

**Response (201 Created):**
```json
{
  "_id": "68f3d4e5f6a7b8c9d0e1f2a3",
  "name": "Customer Support Agent v1",
  "description": "Instructions for customer support AI agent",
  "systemPrompt": "You are a helpful customer support agent. Always be polite, professional, and empathetic. Your goal is to resolve customer issues efficiently while maintaining a positive experience.",
  "guidelines": [
    "Always greet customers warmly",
    "Listen carefully to understand the issue",
    "Provide clear step-by-step solutions",
    "Escalate complex issues to human agents",
    "End with asking if there's anything else you can help with"
  ],
  "tags": ["customer-service", "support", "polite"],
  "status": "active",
  "owner": {
    "orgId": "68dd05b175d9e3c17bf97f60",
    "userId": "68dcf365f6a92c0d4911b619",
    "groupId": null
  },
  "createdBy": "68dcf365f6a92c0d4911b619",
  "updatedBy": "68dcf365f6a92c0d4911b619",
  "createdAt": "2025-11-19T10:00:00.000Z",
  "updatedAt": "2025-11-19T10:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/instructions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent v1",
    "description": "Instructions for customer support AI agent",
    "systemPrompt": "You are a helpful customer support agent. Always be polite, professional, and empathetic. Your goal is to resolve customer issues efficiently while maintaining a positive experience.",
    "guidelines": [
      "Always greet customers warmly",
      "Listen carefully to understand the issue",
      "Provide clear step-by-step solutions",
      "Escalate complex issues to human agents",
      "End with asking if there'\''s anything else you can help with"
    ],
    "tags": ["customer-service", "support", "polite"],
    "status": "active"
  }'
```

### 3.2 Get All Instructions

**Endpoint:** `GET /instructions`

**Query Parameters:**
- `page` (number) - Page number (default: 1)
- `limit` (number) - Items per page (default: 10, max: 100)
- `filter[isActive]` (boolean) - Filter by active status
- `filter[tags]` (string) - Filter by tag
- `sort` (string) - Sort fields (e.g., `name`, `-createdAt`)

**cURL Example:**
```bash
# Get all instructions
curl -X GET "http://localhost:3003/instructions?page=1&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Get only active instructions
curl -X GET "http://localhost:3003/instructions?filter[isActive]=true" \
  -H "Authorization: Bearer $TOKEN"

# Filter by tag
curl -X GET "http://localhost:3003/instructions?filter[tags]=customer-service" \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "_id": "68f3d4e5f6a7b8c9d0e1f2a3",
      "instructionId": "inst-cs-agent-v1",
      "name": "Customer Support Agent v1",
      "systemPrompt": "You are a helpful customer support agent...",
      "guidelines": ["Always greet customers warmly", "..."],
      "tags": ["customer-service", "support", "polite"],
      "status": "active",
      "createdAt": "2025-11-19T10:00:00.000Z",
      "updatedAt": "2025-11-19T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1
  }
}
```

### 3.3 Get Single Instruction

**Endpoint:** `GET /instructions/:id`

**cURL Example:**
```bash
curl -X GET http://localhost:3003/instructions/68f3d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "_id": "68f3d4e5f6a7b8c9d0e1f2a3",
  "instructionId": "inst-cs-agent-v1",
  "name": "Customer Support Agent v1",
  "description": "Instructions for customer support AI agent",
  "systemPrompt": "You are a helpful customer support agent. Always be polite, professional, and empathetic. Your goal is to resolve customer issues efficiently while maintaining a positive experience.",
  "guidelines": [
    "Always greet customers warmly",
    "Listen carefully to understand the issue",
    "Provide clear step-by-step solutions",
    "Escalate complex issues to human agents",
    "End with asking if there's anything else you can help with"
  ],
  "tags": ["customer-service", "support", "polite"],
  "status": "active",
  "owner": {
    "orgId": "68dd05b175d9e3c17bf97f60",
    "userId": "68dcf365f6a92c0d4911b619",
    "groupId": null
  },
  "createdBy": "68dcf365f6a92c0d4911b619",
  "updatedBy": "68dcf365f6a92c0d4911b619",
  "createdAt": "2025-11-19T10:00:00.000Z",
  "updatedAt": "2025-11-19T10:00:00.000Z"
}
```

### 3.4 Update Instruction

**Endpoint:** `PUT /instructions/:id`

**Request Body:**
```json
{
  "name": "Customer Support Agent v2",
  "systemPrompt": "Updated system prompt...",
  "guidelines": [
    "New guideline 1",
    "New guideline 2"
  ],
  "tags": ["customer-service", "support", "empathetic"],
  "status": "inactive"
}
```

**cURL Example:**
```bash
curl -X PUT http://localhost:3003/instructions/68f3d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support Agent v2",
    "systemPrompt": "Updated system prompt...",
    "guidelines": ["New guideline 1", "New guideline 2"],
    "tags": ["customer-service", "support", "empathetic"],
    "status": "inactive"
  }'
```

**Response (200 OK):**
```json
{
  "_id": "68f3d4e5f6a7b8c9d0e1f2a3",
  "name": "Customer Support Agent v2",
  "systemPrompt": "Updated system prompt...",
  "guidelines": ["New guideline 1", "New guideline 2"],
  "tags": ["customer-service", "support", "empathetic"],
  "status": "inactive",
  "updatedBy": "68dcf365f6a92c0d4911b619",
  "updatedAt": "2025-11-19T11:00:00.000Z"
}
```

**Business Logic Validation:**

When changing status to `inactive`, the system checks if any active agents (isDeleted=false) are using this instruction.

**Error Response (409 Conflict):** Occurs when attempting to deactivate an instruction that is in use by active agents.
```json
{
  "statusCode": 409,
  "message": "Cannot deactivate instruction. It is currently being used by the following active agents: Support Bot Alpha (ID: 68f4e5d6a7b8c9d0e1f2a3b4), Assistant Beta (ID: 68f4e5d6a7b8c9d0e1f2a3b5)",
  "error": "Conflict",
  "details": {
    "operation": "deactivate",
    "activeAgents": [
      {
        "id": "68f4e5d6a7b8c9d0e1f2a3b4",
        "name": "Support Bot Alpha"
      },
      {
        "id": "68f4e5d6a7b8c9d0e1f2a3b5",
        "name": "Assistant Beta"
      }
    ]
  }
}
```

### 3.5 Delete Instruction (Soft Delete)

**Endpoint:** `DELETE /instructions/:id`

**cURL Example:**
```bash
curl -X DELETE http://localhost:3003/instructions/68f3d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer $TOKEN"
```

**Response (200 OK):**
```json
{
  "message": "Instruction deleted successfully",
  "deletedAt": "2025-11-19T12:00:00.000Z"
}
```

**Business Logic Validation:**

Before soft deleting, the system checks if any active agents (isDeleted=false) are using this instruction.

**Error Response (409 Conflict):** Occurs when attempting to delete an instruction that is in use by active agents.
```json
{
  "statusCode": 409,
  "message": "Cannot delete instruction. It is currently being used by the following active agents: Support Bot Alpha (ID: 68f4e5d6a7b8c9d0e1f2a3b4), Assistant Beta (ID: 68f4e5d6a7b8c9d0e1f2a3b5)",
  "error": "Conflict",
  "details": {
    "operation": "delete",
    "activeAgents": [
      {
        "id": "68f4e5d6a7b8c9d0e1f2a3b4",
        "name": "Support Bot Alpha"
      },
      {
        "id": "68f4e5d6a7b8c9d0e1f2a3b5",
        "name": "Assistant Beta"
      }
    ]
  }
}
```

---

## 4. Agents (AI Agents)

Agents represent AI agents running on nodes with specific capabilities and behavior defined by Instructions.

### Entity Schema

```typescript
{
  _id: string;
  agentId: string;             // Unique identifier (UUID)
  name: string;
  description: string;
  role: string;                // Agent role (e.g., "assistant", "analyst")
  status: string;              // "active" | "inactive" | "busy"
  capabilities: string[];      // ["chat", "code", "analysis"]

  instructionId?: string;      // Reference to Instruction entity (optional)
  nodeId: string;              // Which node runs this agent

  // Performance metrics
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageResponseTime: number; // milliseconds
  averageLatency: number;      // milliseconds

  lastTask?: Date;
  lastHeartbeat?: Date;

  status: string;       // "active" | "inactive"
  permissions: string[];
  tags: string[];

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 4.1 Create Agent

**Endpoint:** `POST /api/agents`

**Request Body:**
```json
{
  "agentId": "agent-assistant-01",
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "role": "assistant",
  "status": "active",
  "capabilities": ["chat", "email", "ticketing"],
  "nodeId": "node-gpu-01",
  "permissions": ["read:tickets", "write:responses"],
  "tags": ["support", "customer-service"]
}
```

**Response (201 Created):**
```json
{
  "_id": "68f2c3d4e5f6a7b8c9d0e1f2",
  "agentId": "agent-assistant-01",
  "name": "Customer Support Agent",
  "description": "AI agent for customer support",
  "role": "assistant",
  "status": "active",
  "capabilities": ["chat", "email", "ticketing"],
  "nodeId": "node-gpu-01",
  "totalTasks": 0,
  "completedTasks": 0,
  "failedTasks": 0,
  "averageResponseTime": 0,
  "averageLatency": 0,
  "status": "active",
  "permissions": ["read:tickets", "write:responses"],
  "tags": ["support", "customer-service"],
  "createdAt": "2025-11-16T11:30:00.000Z",
  "updatedAt": "2025-11-16T11:30:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-assistant-01",
    "name": "Customer Support Agent",
    "description": "AI agent for customer support",
    "role": "assistant",
    "status": "active",
    "capabilities": ["chat", "email", "ticketing"],
    "nodeId": "node-gpu-01",
    "permissions": ["read:tickets", "write:responses"],
    "tags": ["support", "customer-service"]
  }'
```

### 4.2 Get All Agents

**Endpoint:** `GET /api/agents`

**Query Parameters:**
- `filter[status]` - Filter by status
- `filter[nodeId]` - Filter by node
- `filter[role]` - Filter by role

**cURL Examples:**
```bash
# Get all agents
curl "http://localhost:3003/api/agents" \
  -H "Authorization: Bearer $TOKEN"

# Get active agents only
curl "http://localhost:3003/api/agents?filter[status]=active" \
  -H "Authorization: Bearer $TOKEN"

# Get agents on specific node
curl "http://localhost:3003/api/agents?filter[nodeId]=node-gpu-01" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.3 Get Agent by ID

**Endpoint:** `GET /api/agents/:id`

**Query Parameters:**
- `populate` (string) - Populate relationships (e.g., `instruction`)

**Examples:**
```bash
# Get agent without instruction
curl -X GET http://localhost:3003/api/agents/68f2c3d4e5f6a7b8c9d0e1f2 \
  -H "Authorization: Bearer $TOKEN"

# Get agent with populated instruction
curl -X GET "http://localhost:3003/api/agents/68f2c3d4e5f6a7b8c9d0e1f2?populate=instruction" \
  -H "Authorization: Bearer $TOKEN"
```

**cURL Example:**
```bash
curl "http://localhost:3003/api/agents/68f2c3d4e5f6a7b8c9d0e1f2" \
  -H "Authorization: Bearer $TOKEN"
```

### 4.4 Update Agent

**Endpoint:** `PUT /api/agents/:id`

**cURL Example:**
```bash
curl -X PUT http://localhost:3003/api/agents/68f2c3d4e5f6a7b8c9d0e1f2 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "busy",
    "completedTasks": 150,
    "averageResponseTime": 1200
  }'
```

### 4.5 Delete Agent

**Endpoint:** `DELETE /api/agents/:id`

**cURL Example:**
```bash
curl -X DELETE http://localhost:3003/api/agents/68f2c3d4e5f6a7b8c9d0e1f2 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 5. Deployments

Deployments represent running instances of AI models on nodes.

### Entity Schema

```typescript
{
  _id: string;
  deploymentId: string;        // Unique identifier (UUID)
  name: string;
  description: string;
  environment: string;         // "development" | "staging" | "production"
  status: string;              // "pending" | "running" | "stopped" | "failed"

  modelId: string;             // Which model to deploy
  nodeId: string;              // Which node to deploy on
  deploymentType: string;      // "api" | "batch" | "streaming"

  replicas: number;            // Number of replicas
  hardwareProfile: string;     // "cpu" | "gpu" | "multi-gpu"

  // Runtime info
  isRunning: boolean;
  containerName?: string;
  containerPort?: number;
  endpoint?: string;           // API endpoint URL

  // Performance metrics
  totalInferences: number;
  averageLatency: number;      // milliseconds
  uptime: number;              // seconds
  lastHealthCheck?: Date;

  // Events log
  events: Array<{
    timestamp: Date;
    event: string;
    message: string;
    severity: "info" | "warning" | "error";
  }>;

  // Relations
  model: ModelDocument;        // Populated model reference
  node: NodeDocument;          // Populated node reference

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.1 Create Deployment

**Endpoint:** `POST /api/deployments`

**Request Body:**
```json
{
  "deploymentId": "deploy-llama-prod-01",
  "name": "Llama 2 Production Deployment",
  "description": "Production deployment for customer chat",
  "environment": "production",
  "status": "pending",
  "modelId": "llama-2-7b-v1",
  "nodeId": "node-gpu-01",
  "deploymentType": "api",
  "replicas": 2,
  "hardwareProfile": "gpu"
}
```

**Response (201 Created):**
```json
{
  "_id": "68f2d4e5f6a7b8c9d0e1f2a3",
  "deploymentId": "deploy-llama-prod-01",
  "name": "Llama 2 Production Deployment",
  "description": "Production deployment for customer chat",
  "environment": "production",
  "status": "pending",
  "modelId": "llama-2-7b-v1",
  "nodeId": "node-gpu-01",
  "deploymentType": "api",
  "replicas": 2,
  "hardwareProfile": "gpu",
  "isRunning": false,
  "totalInferences": 0,
  "averageLatency": 0,
  "uptime": 0,
  "events": [],
  "createdAt": "2025-11-16T12:00:00.000Z",
  "updatedAt": "2025-11-16T12:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/deployments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deploymentId": "deploy-llama-prod-01",
    "name": "Llama 2 Production Deployment",
    "description": "Production deployment for customer chat",
    "environment": "production",
    "status": "pending",
    "modelId": "llama-2-7b-v1",
    "nodeId": "node-gpu-01",
    "deploymentType": "api",
    "replicas": 2,
    "hardwareProfile": "gpu"
  }'
```

### 5.2 Get All Deployments

**Endpoint:** `GET /api/deployments`

**Query Parameters:**
- `filter[status]` - Filter by status
- `filter[environment]` - Filter by environment
- `filter[modelId]` - Filter by model
- `filter[nodeId]` - Filter by node
- `filter[isRunning]` - Filter by running status

**cURL Examples:**
```bash
# Get all deployments
curl "http://localhost:3003/api/deployments" \
  -H "Authorization: Bearer $TOKEN"

# Get running deployments only
curl "http://localhost:3003/api/deployments?filter[isRunning]=true" \
  -H "Authorization: Bearer $TOKEN"

# Get production deployments
curl "http://localhost:3003/api/deployments?filter[environment]=production" \
  -H "Authorization: Bearer $TOKEN"
```

### 5.3 Get Deployment by ID

**Endpoint:** `GET /api/deployments/:id`

**cURL Example:**
```bash
curl "http://localhost:3003/api/deployments/68f2d4e5f6a7b8c9d0e1f2a3" \
  -H "Authorization: Bearer $TOKEN"
```

### 5.4 Update Deployment

**Endpoint:** `PUT /api/deployments/:id`

**cURL Example:**
```bash
curl -X PUT http://localhost:3003/api/deployments/68f2d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "running",
    "replicas": 3,
    "totalInferences": 5000
  }'
```

### 5.5 Start Deployment

Start a deployment (change status to running).

**Endpoint:** `POST /api/deployments/:id/start`

**Response (200 OK):**
```json
{
  "message": "Deployment started successfully",
  "deployment": {
    "_id": "68f2d4e5f6a7b8c9d0e1f2a3",
    "deploymentId": "deploy-llama-prod-01",
    "status": "running",
    "isRunning": true,
    "endpoint": "http://10.10.0.100:8080/v1/chat",
    "updatedAt": "2025-11-16T12:05:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/deployments/68f2d4e5f6a7b8c9d0e1f2a3/start \
  -H "Authorization: Bearer $TOKEN"
```

### 5.6 Stop Deployment

Stop a running deployment.

**Endpoint:** `POST /api/deployments/:id/stop`

**Response (200 OK):**
```json
{
  "message": "Deployment stopped successfully",
  "deployment": {
    "_id": "68f2d4e5f6a7b8c9d0e1f2a3",
    "deploymentId": "deploy-llama-prod-01",
    "status": "stopped",
    "isRunning": false,
    "updatedAt": "2025-11-16T12:10:00.000Z"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/deployments/68f2d4e5f6a7b8c9d0e1f2a3/stop \
  -H "Authorization: Bearer $TOKEN"
```

### 5.7 Delete Deployment

**Endpoint:** `DELETE /api/deployments/:id`

**cURL Example:**
```bash
curl -X DELETE http://localhost:3003/api/deployments/68f2d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. Executions (Workflows)

Executions represent multi-step workflow orchestration for complex operations (e.g., deploy model, download model, setup agent).

### Entity Schema

```typescript
{
  _id: string;
  executionId: string;         // Unique identifier (UUID)
  name: string;                // Human-readable name
  description?: string;

  category: string;            // "deployment" | "model" | "agent" | "maintenance" | "batch"
  type: string;                // "deploy-model" | "download-model" | "setup-agent"

  status: string;              // "pending" | "running" | "completed" | "failed" | "cancelled" | "timeout"
  progress: number;            // 0-100%

  // Parent-child relationship
  parentExecutionId?: string;
  childExecutionIds: string[];

  // Steps (embedded documents)
  steps: Array<{
    index: number;             // 0, 1, 2, ...
    name: string;              // "Download model", "Start container"
    description?: string;
    status: string;            // "pending" | "running" | "completed" | "failed" | "skipped"
    progress: number;          // 0-100%

    // WebSocket command
    command?: {
      type: string;            // "model.download", "deployment.create"
      resource: { type: string; id: string };
      data: Record<string, any>;
    };

    nodeId?: string;           // Which node executes this step

    // Timing
    startedAt?: Date;
    completedAt?: Date;
    timeoutSeconds?: number;

    // Result
    result?: Record<string, any>;
    error?: {
      code: string;
      message: string;
      details?: any;
    };

    // Message tracking
    sentMessageId?: string;
    receivedMessageId?: string;

    // Dependencies
    dependsOn: number[];       // Indexes of dependent steps
    optional: boolean;         // Can be skipped if failed
  }>;

  // Related resources
  resourceType?: string;       // "deployment" | "model" | "node" | "agent"
  resourceId?: string;

  // Node assignment
  nodeId?: string;
  involvedNodeIds: string[];

  // Timing
  startedAt?: Date;
  completedAt?: Date;
  timeoutSeconds: number;
  timeoutAt?: Date;

  // Result and error
  result?: Record<string, any>;
  error?: {
    code: string;
    message: string;
    details?: any;
    nodeId?: string;
    stepIndex?: number;
  };

  // WebSocket message tracking
  sentMessageIds: string[];
  receivedMessageIds: string[];

  // Retry
  retryCount: number;
  maxRetries: number;
  retryAttempts: Date[];

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 6.1 Create Execution

**Endpoint:** `POST /api/executions`

**Request Body:**
```json
{
  "executionId": "exec-deploy-llama-001",
  "name": "Deploy Llama 2 Model",
  "description": "Multi-step deployment workflow",
  "category": "deployment",
  "type": "deploy-model",
  "timeoutSeconds": 3600,
  "resourceType": "deployment",
  "resourceId": "deploy-llama-prod-01",
  "nodeId": "node-gpu-01",
  "steps": [
    {
      "index": 0,
      "name": "Download model files",
      "status": "pending",
      "progress": 0,
      "command": {
        "type": "model.download",
        "resource": { "type": "model", "id": "llama-2-7b-v1" },
        "data": { "repository": "huggingface.co/meta-llama/Llama-2-7b" }
      },
      "nodeId": "node-gpu-01",
      "timeoutSeconds": 1800,
      "dependsOn": [],
      "optional": false
    },
    {
      "index": 1,
      "name": "Start container",
      "status": "pending",
      "progress": 0,
      "command": {
        "type": "deployment.start",
        "resource": { "type": "deployment", "id": "deploy-llama-prod-01" },
        "data": { "containerName": "llama-prod", "port": 8080 }
      },
      "nodeId": "node-gpu-01",
      "timeoutSeconds": 300,
      "dependsOn": [0],
      "optional": false
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "_id": "68f2e5f6a7b8c9d0e1f2a3b4",
  "executionId": "exec-deploy-llama-001",
  "name": "Deploy Llama 2 Model",
  "description": "Multi-step deployment workflow",
  "category": "deployment",
  "type": "deploy-model",
  "status": "pending",
  "progress": 0,
  "timeoutSeconds": 3600,
  "resourceType": "deployment",
  "resourceId": "deploy-llama-prod-01",
  "nodeId": "node-gpu-01",
  "involvedNodeIds": ["node-gpu-01"],
  "steps": [...],
  "sentMessageIds": [],
  "receivedMessageIds": [],
  "retryCount": 0,
  "maxRetries": 3,
  "retryAttempts": [],
  "createdAt": "2025-11-16T13:00:00.000Z",
  "updatedAt": "2025-11-16T13:00:00.000Z"
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/executions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @execution-payload.json
```

### 6.2 Get All Executions

**Endpoint:** `GET /api/executions`

**Query Parameters:**
- `status` - Filter by status
- `category` - Filter by category
- `type` - Filter by type
- `resourceType` - Filter by resource type
- `resourceId` - Filter by resource ID
- `nodeId` - Filter by node
- `page` - Page number
- `limit` - Items per page

**cURL Examples:**
```bash
# Get all executions
curl "http://localhost:3003/api/executions" \
  -H "Authorization: Bearer $TOKEN"

# Get running executions
curl "http://localhost:3003/api/executions?status=running" \
  -H "Authorization: Bearer $TOKEN"

# Get deployment executions
curl "http://localhost:3003/api/executions?category=deployment" \
  -H "Authorization: Bearer $TOKEN"

# Get executions for specific resource
curl "http://localhost:3003/api/executions?resourceType=deployment&resourceId=deploy-llama-prod-01" \
  -H "Authorization: Bearer $TOKEN"
```

### 6.3 Get Execution by ID

**Endpoint:** `GET /api/executions/:id`

**Response includes full execution details with all steps.**

**cURL Example:**
```bash
curl "http://localhost:3003/api/executions/exec-deploy-llama-001" \
  -H "Authorization: Bearer $TOKEN"
```

### 5.4 Start Execution

Begin execution of a pending workflow.

**Endpoint:** `POST /api/executions/:id/start`

**Request Body (optional):**
```json
{
  "force": false  // Force restart even if already running
}
```

**Response (200 OK):**
```json
{
  "_id": "68f2e5f6a7b8c9d0e1f2a3b4",
  "executionId": "exec-deploy-llama-001",
  "status": "running",
  "progress": 0,
  "startedAt": "2025-11-16T13:05:00.000Z",
  "steps": [
    {
      "index": 0,
      "name": "Download model files",
      "status": "running",
      "progress": 10,
      "startedAt": "2025-11-16T13:05:05.000Z"
    }
  ]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/executions/exec-deploy-llama-001/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"force": false}'
```

### 5.5 Cancel Execution

Cancel a running execution.

**Endpoint:** `POST /api/executions/:id/cancel`

**Request Body:**
```json
{
  "reason": "User requested cancellation"
}
```

**Response (200 OK):**
```json
{
  "_id": "68f2e5f6a7b8c9d0e1f2a3b4",
  "executionId": "exec-deploy-llama-001",
  "status": "cancelled",
  "error": {
    "code": "USER_CANCELLED",
    "message": "User requested cancellation"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/executions/exec-deploy-llama-001/cancel \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "User requested cancellation"}'
```

### 5.6 Retry Execution

Retry a failed/timeout execution.

**Endpoint:** `POST /api/executions/:id/retry`

**Request Body:**
```json
{
  "resetSteps": true  // Reset all steps to pending
}
```

**Response (200 OK):**
```json
{
  "_id": "68f2e5f6a7b8c9d0e1f2a3b4",
  "executionId": "exec-deploy-llama-001",
  "status": "running",
  "retryCount": 1,
  "retryAttempts": ["2025-11-16T13:20:00.000Z"]
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3003/api/executions/exec-deploy-llama-001/retry \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resetSteps": true}'
```

### 5.7 Get Execution Statistics

Get aggregate statistics across all executions.

**Endpoint:** `GET /api/executions/_statistics/summary`

**Response (200 OK):**
```json
{
  "total": 150,
  "byStatus": {
    "pending": 10,
    "running": 5,
    "completed": 120,
    "failed": 10,
    "cancelled": 3,
    "timeout": 2
  },
  "byCategory": {
    "deployment": 80,
    "model": 40,
    "agent": 20,
    "maintenance": 10
  }
}
```

**cURL Example:**
```bash
curl "http://localhost:3003/api/executions/_statistics/summary" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Tools

Tools represent external services/APIs that agents can use.

### Entity Schema

```typescript
{
  _id: string;
  toolId: string;              // Unique identifier
  name: string;
  description: string;
  type: string;                // "api" | "function" | "service"
  category: string;            // "search" | "database" | "calculation"
  provider: string;            // "internal" | "openai" | "google"
  endpoint: string;            // API endpoint URL
  version: string;
  status: string;              // "active" | "inactive" | "deprecated"

  // Schema definition
  parameters: {
    type: "object" | "array";
    properties: Record<string, any>;
    required: string[];
  };

  responseFormat: {
    type: "object" | "array" | "string" | "number" | "boolean";
    schema: Record<string, any>;
  };

  // Usage tracking
  usage: Array<{
    timestamp: Date;
    agentId: string;
    arguments: Record<string, any>;
    result: any;
    latency: number;
    success: boolean;
    error?: string;
  }>;

  totalUsage: number;
  totalFailures: number;
  averageLatency: number;

  tags: string[];
  documentation?: string;
  examples?: Array<{
    title: string;
    description: string;
    arguments: Record<string, any>;
    expectedOutput: any;
  }>;

  status: string;       // "active" | "inactive"

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Note:** Tool endpoints follow the same CRUD pattern as other entities:
- `POST /api/tools` - Create tool
- `GET /api/tools` - Get all tools
- `GET /api/tools/:id` - Get tool by ID
- `PUT /api/tools/:id` - Update tool
- `DELETE /api/tools/:id` - Delete tool

---

## 8. Conversations

Conversations track multi-turn interactions with AI agents.

### Entity Schema

```typescript
{
  _id: string;
  conversationId: string;      // Unique identifier
  title: string;
  description: string;
  agentId: string;             // Which agent handles this conversation
  modelId: string;             // Which model is used
  conversationType: string;    // "chat" | "task" | "analysis"
  status: string;              // "active" | "paused" | "completed"

  totalTokens: number;
  totalMessages: number;

  tags: string[];
  status: string;       // "active" | "inactive"

  participants: Array<{
    userId: string;
    role: string;
    joinedAt: Date;
    leftAt?: Date;
  }>;

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Note:** Conversation endpoints follow standard CRUD pattern.

---

## 9. Messages

Messages are individual messages within conversations.

### Entity Schema

```typescript
{
  _id: string;
  conversationId: string;
  agentId: string;
  role: string;                // "user" | "assistant" | "system"
  content: string;             // Message content
  name?: string;               // Speaker name

  // Function calling
  functionCall?: {
    name: string;
    arguments: Record<string, any>;
  };

  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;

  toolResults?: Array<{
    toolCallId: string;
    result: any;
  }>;

  // Performance tracking
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  latency?: number;            // milliseconds
  responseTime?: number;       // milliseconds
  error?: string;

  status: string;       // "active" | "inactive"

  // Audit fields
  owner: { orgId, userId, groupId };
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}
```

**Note:** Message endpoints follow standard CRUD pattern.

---

## WebSocket Integration

The AIWM service provides WebSocket communication for real-time node management.

### WebSocket Namespace

**URL:** `ws://localhost:3003/ws/node`

### Authentication

WebSocket connections require JWT authentication in the connection handshake:

```javascript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3003/ws/node', {
  auth: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  },
  transports: ['websocket', 'polling']
});
```

### Message Types

All WebSocket messages follow this format:

```typescript
{
  type: string;                // Message type
  messageId: string;           // Unique message ID (UUID)
  timestamp: string;           // ISO 8601 timestamp
  data?: any;                  // Message payload
  metadata?: {
    executionId?: string;
    stepIndex?: number;
    timeout?: number;
    priority?: "low" | "normal" | "high";
  };
}
```

### Client Events (Node → Server)

#### 1. Connection Acknowledgment

**Event:** `connection`

Sent automatically when connection is established.

**Server Response:**
```json
{
  "type": "connection.ack",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:00:00.000Z",
  "status": "success",
  "nodeId": "node-gpu-01",
  "controllerId": "controller-main",
  "serverVersion": "1.0.0"
}
```

#### 2. Node Registration

**Event:** `node.register`

**Payload:**
```json
{
  "type": "node.register",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:00:05.000Z",
  "data": {
    "hostname": "gpu-server-01",
    "ipAddress": "10.10.0.101",
    "publicIpAddress": "203.0.113.10",
    "os": "Ubuntu 22.04",
    "cpuCores": 16,
    "cpuModel": "AMD EPYC 7763",
    "ramTotal": 65536,
    "diskTotal": 2000000,
    "gpuDevices": [{
      "deviceId": "GPU-0",
      "model": "NVIDIA RTX 4090",
      "memoryTotal": 24576,
      "memoryFree": 24000
    }],
    "daemonVersion": "1.0.0",
    "uptimeSeconds": 3600,
    "containerRuntime": "docker"
  }
}
```

**Server Response:**
```json
{
  "type": "register.ack",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:00:06.000Z",
  "data": {
    "status": "success",
    "nodeId": "node-gpu-01",
    "registeredAt": "2025-11-16T14:00:06.000Z",
    "controllerInfo": {
      "controllerId": "controller-main",
      "heartbeatInterval": 30000,
      "metricsInterval": 60000,
      "timezone": "UTC"
    },
    "pendingCommands": []
  }
}
```

#### 3. Heartbeat

**Event:** `telemetry.heartbeat`

Sent every 30 seconds to indicate node is alive.

**Payload:**
```json
{
  "type": "telemetry.heartbeat",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:01:00.000Z",
  "data": {
    "status": "online",
    "uptimeSeconds": 3630,
    "cpuUsage": 45.5,
    "ramUsage": 28000,
    "activeDeployments": 2,
    "gpuStatus": [{
      "deviceId": "GPU-0",
      "utilization": 80,
      "memoryUsed": 18000,
      "temperature": 72
    }]
  }
}
```

#### 4. Metrics

**Event:** `telemetry.metrics`

Sent every 60 seconds with detailed metrics.

**Payload:**
```json
{
  "type": "telemetry.metrics",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:02:00.000Z",
  "data": {
    "cpu": {
      "usage": 45.5,
      "cores": 16,
      "temperature": 55
    },
    "ram": {
      "total": 65536,
      "used": 28000,
      "free": 37536,
      "usagePercent": 42.7
    },
    "disk": {
      "total": 2000000,
      "used": 500000,
      "free": 1500000,
      "usagePercent": 25
    },
    "gpu": [{
      "deviceId": "GPU-0",
      "model": "NVIDIA RTX 4090",
      "utilization": 80,
      "memoryTotal": 24576,
      "memoryUsed": 18000,
      "memoryFree": 6576,
      "temperature": 72,
      "powerUsage": 350,
      "fanSpeed": 75
    }],
    "network": {
      "rxBytes": 1000000000,
      "txBytes": 500000000,
      "rxPackets": 5000000,
      "txPackets": 3000000
    }
  }
}
```

#### 5. Command Acknowledgment

**Event:** `command.ack`

Sent when node receives a command from the server.

**Payload:**
```json
{
  "type": "command.ack",
  "messageId": "new-uuid",
  "timestamp": "2025-11-16T14:03:00.000Z",
  "data": {
    "originalMessageId": "command-message-id",
    "status": "received",
    "receivedAt": "2025-11-16T14:03:00.000Z"
  },
  "metadata": {
    "executionId": "exec-deploy-llama-001",
    "stepIndex": 0
  }
}
```

#### 6. Command Result

**Event:** `command.result`

Sent when command execution completes.

**Payload:**
```json
{
  "type": "command.result",
  "messageId": "new-uuid",
  "timestamp": "2025-11-16T14:05:00.000Z",
  "data": {
    "originalMessageId": "command-message-id",
    "status": "success",
    "progress": 100,
    "result": {
      "downloadedFiles": 12,
      "totalSize": 13476875264,
      "downloadPath": "/models/llama-2-7b"
    },
    "error": null
  },
  "metadata": {
    "executionId": "exec-deploy-llama-001",
    "stepIndex": 0
  }
}
```

**Error Example:**
```json
{
  "type": "command.result",
  "messageId": "new-uuid",
  "timestamp": "2025-11-16T14:05:00.000Z",
  "data": {
    "originalMessageId": "command-message-id",
    "status": "error",
    "progress": 45,
    "result": null,
    "error": {
      "code": "DOWNLOAD_FAILED",
      "message": "Network timeout during download",
      "details": {
        "retriedAttempts": 3,
        "lastError": "ETIMEDOUT"
      }
    }
  },
  "metadata": {
    "executionId": "exec-deploy-llama-001",
    "stepIndex": 0
  }
}
```

#### 7. Deployment Status

**Event:** `deployment.status`

Sent when deployment status changes.

**Payload:**
```json
{
  "type": "deployment.status",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:06:00.000Z",
  "data": {
    "deploymentId": "deploy-llama-prod-01",
    "status": "running",
    "containerId": "docker-container-id",
    "endpoint": "http://10.10.0.101:8080/v1/chat",
    "healthStatus": "healthy"
  }
}
```

#### 8. Deployment Logs

**Event:** `deployment.logs`

Sent periodically with deployment logs.

**Payload:**
```json
{
  "type": "deployment.logs",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:07:00.000Z",
  "data": {
    "deploymentId": "deploy-llama-prod-01",
    "logs": [
      {
        "timestamp": "2025-11-16T14:06:50.000Z",
        "level": "info",
        "message": "Model loaded successfully"
      },
      {
        "timestamp": "2025-11-16T14:06:55.000Z",
        "level": "info",
        "message": "Server listening on port 8080"
      }
    ]
  }
}
```

### Server Events (Server → Node)

#### 1. Model Download Command

**Event:** `model.download`

**Payload:**
```json
{
  "type": "model.download",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:10:00.000Z",
  "resource": {
    "type": "model",
    "id": "llama-2-7b-v1"
  },
  "data": {
    "repository": "huggingface.co/meta-llama/Llama-2-7b-chat-hf",
    "fileName": "model.safetensors",
    "downloadPath": "/models/llama-2-7b"
  },
  "metadata": {
    "executionId": "exec-deploy-llama-001",
    "stepIndex": 0,
    "timeout": 1800,
    "priority": "high"
  }
}
```

#### 2. Deployment Start Command

**Event:** `deployment.start`

**Payload:**
```json
{
  "type": "deployment.start",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:15:00.000Z",
  "resource": {
    "type": "deployment",
    "id": "deploy-llama-prod-01"
  },
  "data": {
    "modelPath": "/models/llama-2-7b",
    "containerName": "llama-prod",
    "port": 8080,
    "replicas": 2,
    "gpuDevices": ["GPU-0"]
  },
  "metadata": {
    "executionId": "exec-deploy-llama-001",
    "stepIndex": 1,
    "timeout": 300,
    "priority": "high"
  }
}
```

#### 3. Deployment Stop Command

**Event:** `deployment.stop`

**Payload:**
```json
{
  "type": "deployment.stop",
  "messageId": "uuid",
  "timestamp": "2025-11-16T14:20:00.000Z",
  "resource": {
    "type": "deployment",
    "id": "deploy-llama-prod-01"
  },
  "data": {
    "gracefulShutdown": true,
    "timeoutSeconds": 30
  },
  "metadata": {
    "priority": "normal"
  }
}
```

### WebSocket Client Example (JavaScript)

```javascript
import { io } from 'socket.io-client';

// Connect to WebSocket
const socket = io('ws://localhost:3003/ws/node', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});

// Connection established
socket.on('connect', () => {
  console.log('Connected to AIWM WebSocket');
});

// Receive connection acknowledgment
socket.on('connection.ack', (data) => {
  console.log('Connection acknowledged:', data);

  // Send registration
  socket.emit('node.register', {
    type: 'node.register',
    messageId: generateUUID(),
    timestamp: new Date().toISOString(),
    data: {
      hostname: 'gpu-server-01',
      ipAddress: '10.10.0.101',
      // ... other registration data
    }
  });
});

// Receive registration acknowledgment
socket.on('register.ack', (data) => {
  console.log('Registration successful:', data);

  // Start sending heartbeats
  setInterval(() => {
    socket.emit('telemetry.heartbeat', {
      type: 'telemetry.heartbeat',
      messageId: generateUUID(),
      timestamp: new Date().toISOString(),
      data: {
        status: 'online',
        uptimeSeconds: process.uptime(),
        // ... heartbeat data
      }
    });
  }, 30000); // Every 30 seconds
});

// Receive commands from server
socket.on('model.download', async (command) => {
  console.log('Received download command:', command);

  // Send acknowledgment
  socket.emit('command.ack', {
    type: 'command.ack',
    messageId: generateUUID(),
    timestamp: new Date().toISOString(),
    data: {
      originalMessageId: command.messageId,
      status: 'received'
    },
    metadata: command.metadata
  });

  // Execute command
  try {
    const result = await downloadModel(command.data);

    // Send success result
    socket.emit('command.result', {
      type: 'command.result',
      messageId: generateUUID(),
      timestamp: new Date().toISOString(),
      data: {
        originalMessageId: command.messageId,
        status: 'success',
        progress: 100,
        result: result
      },
      metadata: command.metadata
    });
  } catch (error) {
    // Send error result
    socket.emit('command.result', {
      type: 'command.result',
      messageId: generateUUID(),
      timestamp: new Date().toISOString(),
      data: {
        originalMessageId: command.messageId,
        status: 'error',
        error: {
          code: error.code,
          message: error.message
        }
      },
      metadata: command.metadata
    });
  }
});

// Handle disconnect
socket.on('disconnect', () => {
  console.log('Disconnected from AIWM WebSocket');
});

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
```

---

## Error Handling

All API endpoints return standardized error responses.

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "timestamp": "2025-11-16T15:00:00.000Z",
  "path": "/api/nodes",
  "correlationId": "550ecd9e-022e-4f92-8943-0a5a23eb7512",
  "errors": [
    "name must be a string",
    "cpuCores must be a number"
  ]
}
```

### Error Types

#### 400 Bad Request

Validation errors or invalid request data.

**Example:**
```bash
curl -X POST http://localhost:3003/api/nodes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Response
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    "nodeId must be a string",
    "name must be a string",
    "cpuCores must be a number"
  ]
}
```

#### 401 Unauthorized

Missing or invalid JWT token.

**Example:**
```bash
curl http://localhost:3003/api/nodes

# Response
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

#### 403 Forbidden

User lacks required permissions (RBAC).

**Example:**
```json
{
  "statusCode": 403,
  "message": "You do not have permission to delete"
}
```

#### 404 Not Found

Resource doesn't exist.

**Example:**
```json
{
  "statusCode": 404,
  "message": "Node with ID 999999999999999999999999 not found"
}
```

#### 500 Internal Server Error

Unexpected server error.

**Example:**
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

### Correlation ID

Every request/response includes an `x-correlation-id` header for end-to-end tracking:

```bash
# Client provides correlation ID
curl -H "x-correlation-id: my-custom-id" http://localhost:3003/api/nodes
# Response header: x-correlation-id: my-custom-id

# Server generates correlation ID if not provided
curl http://localhost:3003/api/nodes
# Response header: x-correlation-id: 76da91e5-9fc1-4f33-b096-1f1296bbd042
```

---

## Additional Resources

- **Swagger Documentation**: `http://localhost:3003/api-docs` - Interactive API documentation with request/response examples
- **Health Check**: `http://localhost:3003/api/health` - Service health status
- **IAM Service Documentation**: See `docs/IAM-AUTH-API.md` for authentication details

---

**Document Version**: 1.0.0
**Last Updated**: 2025-11-16
**Service**: AIWM (AI Workflow Manager)
**Base URL**: `http://localhost:3003/api`
