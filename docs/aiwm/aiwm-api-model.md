# AIWM API - Model Management

## Overview

Model Management API cho phép quản lý các AI/ML models, bao gồm cả self-hosted models (chạy trên GPU nodes) và API-based models (forward requests tới external AI providers).

**Base URL (Production):** `https://xsai-api.x-or.cloud/aiwm`

**Authentication:** Bearer Token (JWT)

---

## Model Types

### Type Categories

| Type | Description | Use Cases |
|------|-------------|-----------|
| `llm` | Large Language Models | Text generation, chat, completion (GPT, Claude, Llama) |
| `vision` | Image/Visual Models | Image understanding, OCR, image generation (GPT-4V, Stable Diffusion) |
| `embedding` | Embedding Models | Text/image embeddings, semantic search |
| `voice` | Voice Models | ASR (speech-to-text), TTS (text-to-speech), Whisper |

### Deployment Types

| Type | Description | Initial Status |
|------|-------------|----------------|
| `self-hosted` | Model chạy trên GPU nodes của hệ thống | `queued` |
| `api-based` | Forward requests tới external AI providers (OpenAI, Anthropic, etc.) | `validating` |

### Framework Options (Self-hosted only)

| Framework | Best For | Supported Types |
|-----------|----------|-----------------|
| `vllm` | Optimized for LLM inference | `llm`, `vision` (multimodal LLMs) |
| `triton` | Multi-purpose inference server | All types (`llm`, `vision`, `embedding`, `voice`) |

---

## Status Lifecycle

### Self-hosted Models

```
Initial Status: queued

queued → downloading → downloaded → deploying → active
   ↓          ↓            ↓
download-failed  deploy-failed  error

active ↔ inactive (user toggle via activate/deactivate APIs)
```

**Status Descriptions:**
- `queued`: Waiting to download from repository
- `downloading`: Downloading model files from HuggingFace/storage
- `downloaded`: Model files downloaded successfully
- `deploying`: Deploying model to GPU node
- `active`: Model is active and ready for inference
- `inactive`: Model is disabled by user
- `download-failed`: Failed to download model files
- `deploy-failed`: Failed to deploy to node
- `error`: Unexpected error occurred

### API-based Models

```
Initial Status: validating

validating → active
    ↓
invalid-credentials

active ↔ inactive (user toggle via activate/deactivate APIs)
```

**Status Descriptions:**
- `validating`: Validating API credentials
- `active`: Model is active and ready to forward requests
- `inactive`: Model is disabled by user
- `invalid-credentials`: API credentials are invalid
- `error`: Unexpected error occurred

---

## Data Transfer Objects (DTOs)

### CreateModelDto

**Required for both deployment types:**

```json
{
  "name": "string (max 100 chars)",
  "type": "llm | vision | embedding | voice",
  "description": "string (max 500 chars)",
  "deploymentType": "self-hosted | api-based",
  "scope": "public | org | private (optional, default: public)"
}
```

**Additional fields for self-hosted models:**

```json
{
  "repository": "string (required)",
  "framework": "vllm | triton (required)",
  "fileName": "string (required)",
  "fileSize": "number (required, bytes)",
  "downloadPath": "string (optional)",
  "nodeId": "string (optional, MongoDB ObjectId)"
}
```

**Additional fields for API-based models:**

```json
{
  "provider": "string (required, e.g., 'openai', 'anthropic')",
  "apiEndpoint": "string (required, e.g., 'https://api.openai.com/v1')",
  "modelIdentifier": "string (required, e.g., 'gpt-4-turbo-2024-11-20')",
  "apiConfig": {
    "apiKey": "string",
    "organization": "string",
    "customHeader": "string",
    "rateLimit": "string",
    "timeout": "string"
  }
}
```

**Optional fields (both deployment types):**

```json
{
  "protocol": "rest | ws (optional, for voice models only)",
  "scope": "public | org | private (optional, default: public)"
}
```

**Notes:**
- `name`: Include version in name (e.g., "GPT-4.1-2024-11-20", "Llama-3.1-8B")
- `status`: Auto-initialized, không cần truyền khi tạo mới
- `protocol`: Chỉ áp dụng cho voice models — `rest` = HTTP request/response (TTS/STT thông thường), `ws` = realtime bidirectional (Gemini Live, OpenAI Realtime)
- `apiConfig`: Store API authentication and configuration as key-value pairs

### UpdateModelDto

All fields are optional. Same structure as CreateModelDto but all fields can be omitted.

**Note:** Để thay đổi status, nên sử dụng activate/deactivate APIs thay vì update trực tiếp.

---

## API Endpoints

### 1. Create Model

**Endpoint:** `POST /models`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body Example (Self-hosted LLM):**
```json
{
  "name": "Llama-3.1-8B-Instruct",
  "type": "llm",
  "description": "Meta's Llama 3.1 8B Instruct model optimized for chat",
  "deploymentType": "self-hosted",
  "repository": "meta-llama/Llama-3.1-8B-Instruct",
  "framework": "vllm",
  "fileName": "model.safetensors",
  "fileSize": 8589934592,
  "scope": "org"
}
```

**Request Body Example (API-based Vision):**
```json
{
  "name": "GPT-4.1-Vision-2024-11-20",
  "type": "vision",
  "description": "OpenAI GPT-4.1 with vision capabilities",
  "deploymentType": "api-based",
  "provider": "openai",
  "apiEndpoint": "https://api.openai.com/v1",
  "modelIdentifier": "gpt-4-turbo-2024-11-20",
  "apiConfig": {
    "apiKey": "sk-proj-...",
    "organization": "org-...",
    "rateLimit": "100"
  },
  "scope": "public"
}
```

**Response (201 Created):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "type": "llm",
  "description": "Meta's Llama 3.1 8B Instruct model optimized for chat",
  "deploymentType": "self-hosted",
  "status": "queued",
  "repository": "meta-llama/Llama-3.1-8B-Instruct",
  "framework": "vllm",
  "fileName": "model.safetensors",
  "fileSize": 8589934592,
  "scope": "org",
  "owner": {
    "orgId": "691eb9e6517f917943ae1f9d",
    "userId": "691eba08517f917943ae1fa1"
  },
  "createdAt": "2025-01-20T10:00:00.000Z",
  "updatedAt": "2025-01-20T10:00:00.000Z"
}
```

---

### 2. List Models (with Pagination)

**Endpoint:** `GET /models`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Query Parameters:**
- `page`: number (optional, default: 1)
- `limit`: number (optional, default: 10)

**Request:**
```bash
GET https://xsai-api.x-or.cloud/aiwm/models?page=1&limit=10
```

**Response (200 OK):**
```json
{
  "data": [
    {
      "_id": "67891234abcd5678ef901234",
      "name": "Llama-3.1-8B-Instruct",
      "type": "llm",
      "status": "active",
      "deploymentType": "self-hosted",
      "framework": "vllm",
      "scope": "org",
      "createdAt": "2025-01-20T10:00:00.000Z"
    },
    {
      "_id": "67891234abcd5678ef901235",
      "name": "GPT-4.1-Vision-2024-11-20",
      "type": "vision",
      "status": "active",
      "deploymentType": "api-based",
      "provider": "openai",
      "scope": "public",
      "createdAt": "2025-01-20T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

---

### 3. Get Model by ID

**Endpoint:** `GET /models/{id}`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Request:**
```bash
GET https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234
```

**Response (200 OK):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "type": "llm",
  "description": "Meta's Llama 3.1 8B Instruct model optimized for chat",
  "deploymentType": "self-hosted",
  "status": "active",
  "repository": "meta-llama/Llama-3.1-8B-Instruct",
  "framework": "vllm",
  "fileName": "model.safetensors",
  "fileSize": 8589934592,
  "downloadPath": "/models/llama-3.1-8b-instruct",
  "nodeId": "67891234abcd5678ef901236",
  "scope": "org",
  "owner": {
    "orgId": "691eb9e6517f917943ae1f9d",
    "userId": "691eba08517f917943ae1fa1"
  },
  "createdBy": "691eba08517f917943ae1fa1",
  "updatedBy": "691eba08517f917943ae1fa1",
  "createdAt": "2025-01-20T10:00:00.000Z",
  "updatedAt": "2025-01-20T12:00:00.000Z"
}
```

**Response (404 Not Found):**
```json
{
  "statusCode": 404,
  "message": "Model with ID 67891234abcd5678ef901234 not found",
  "error": "Not Found"
}
```

---

### 4. Update Model

**Endpoint:** `PUT /models/{id}`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body Example:**
```json
{
  "description": "Updated description for Llama 3.1 8B model",
  "scope": "public",
  "apiConfig": {
    "apiKey": "sk-new-key-...",
    "organization": "org-updated-..."
  }
}
```

**Response (200 OK):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "description": "Updated description for Llama 3.1 8B model",
  "scope": "public",
  "updatedAt": "2025-01-20T13:00:00.000Z"
}
```

**Error Response (400 Bad Request - Model in use):**
```json
{
  "statusCode": 400,
  "message": "Cannot update model 'Llama-3.1-8B-Instruct'. It is currently being used by active deployments: [deployment names]",
  "error": "Bad Request"
}
```

---

### 5. Delete Model (Soft Delete)

**Endpoint:** `DELETE /models/{id}`

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Request:**
```bash
DELETE https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234
```

**Response (200 OK):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "deletedAt": "2025-01-20T14:00:00.000Z"
}
```

**Error Response (400 Bad Request - Model in use):**
```json
{
  "statusCode": 400,
  "message": "Cannot delete model 'Llama-3.1-8B-Instruct'. It is currently being used by 2 active deployment(s): Deployment A (id: xxx), Deployment B (id: yyy)",
  "error": "Bad Request"
}
```

---

### 6. Activate Model

**Endpoint:** `POST /models/{id}/activate`

**Description:** Change model status to `active`. Only allowed from specific statuses.

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Request:**
```bash
POST https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234/activate
```

**Response (200 OK):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "status": "active",
  "updatedAt": "2025-01-20T15:00:00.000Z"
}
```

**Error Response (400 Bad Request - Invalid transition):**
```json
{
  "statusCode": 400,
  "message": "Cannot activate model 'Llama-3.1-8B-Instruct' from status 'downloading'. Current status must be one of: inactive, validating, downloaded, deploying",
  "error": "Bad Request"
}
```

**Allowed status transitions to `active`:**
- From: `inactive`, `validating`, `downloaded`, `deploying`

---

### 7. Deactivate Model

**Endpoint:** `POST /models/{id}/deactivate`

**Description:** Change model status to `inactive`. Cannot deactivate if model is being used by active deployments.

**Headers:**
```
Authorization: Bearer {JWT_TOKEN}
```

**Request:**
```bash
POST https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234/deactivate
```

**Response (200 OK):**
```json
{
  "_id": "67891234abcd5678ef901234",
  "name": "Llama-3.1-8B-Instruct",
  "status": "inactive",
  "updatedAt": "2025-01-20T16:00:00.000Z"
}
```

**Error Response (400 Bad Request - Already inactive):**
```json
{
  "statusCode": 400,
  "message": "Model 'Llama-3.1-8B-Instruct' is already inactive",
  "error": "Bad Request"
}
```

**Error Response (400 Bad Request - Model in use):**
```json
{
  "statusCode": 400,
  "message": "Cannot deactivate model 'Llama-3.1-8B-Instruct'. It is currently being used by 1 active deployment(s): Production Deployment (id: xxx)",
  "error": "Bad Request"
}
```

---

## Common Error Responses

### 401 Unauthorized
```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Unauthorized"
}
```

### 403 Forbidden (Insufficient permissions)
```json
{
  "statusCode": 403,
  "message": "You do not have permission to perform this action",
  "error": "Forbidden"
}
```

### 400 Bad Request (Validation error)
```json
{
  "statusCode": 400,
  "message": [
    "name must be a string",
    "type must be one of: llm, vision, embedding, voice"
  ],
  "error": "Bad Request"
}
```

### 500 Internal Server Error
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "error": "Internal Server Error"
}
```

---

## Usage Examples

### Example 1: Create Self-hosted Whisper Model for Voice Recognition

```bash
curl -X POST https://xsai-api.x-or.cloud/aiwm/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Whisper-Large-v3-2024",
    "type": "voice",
    "description": "OpenAI Whisper Large v3 for speech recognition",
    "deploymentType": "self-hosted",
    "repository": "openai/whisper-large-v3",
    "framework": "triton",
    "fileName": "model.bin",
    "fileSize": 3000000000,
    "protocol": "rest",
    "scope": "org"
  }'
```

### Example 2: Create API-based Claude Model

```bash
curl -X POST https://xsai-api.x-or.cloud/aiwm/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude-3.5-Sonnet-2024-10-22",
    "type": "llm",
    "description": "Anthropic Claude 3.5 Sonnet with improved reasoning",
    "deploymentType": "api-based",
    "provider": "anthropic",
    "apiEndpoint": "https://api.anthropic.com/v1",
    "modelIdentifier": "claude-3-5-sonnet-20241022",
    "apiConfig": {
      "apiKey": "sk-ant-api03-...",
      "anthropic-version": "2023-06-01"
    },
    "scope": "public"
  }'
```

### Example 3: List Models with Filters

```bash
# Get all active LLM models
curl -X GET "https://xsai-api.x-or.cloud/aiwm/models?page=1&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### Example 4: Activate Model

```bash
# Activate a model after deployment
curl -X POST https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234/activate \
  -H "Authorization: Bearer $TOKEN"
```

### Example 5: Update API Configuration

```bash
# Update API keys for API-based model
curl -X PUT https://xsai-api.x-or.cloud/aiwm/models/67891234abcd5678ef901234 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiConfig": {
      "apiKey": "sk-new-rotated-key-...",
      "organization": "org-updated"
    }
  }'
```

---

## Best Practices

### 1. Model Naming Convention
- Include version in model name: `GPT-4.1-2024-11-20`, `Llama-3.1-8B`
- Use descriptive names: `Whisper-Large-v3-Vietnamese`

### 2. Status Management
- Use activate/deactivate APIs instead of direct status updates
- Check model status before creating deployments
- Handle status transitions properly in your application

### 3. API Configuration Security
- Rotate API keys regularly
- Use environment-specific keys (dev/staging/prod)
- Never log or expose `apiConfig` in client-side code

### 4. Error Handling
- Always check for model-in-use errors before updates/deletes
- Handle validation errors gracefully
- Implement retry logic for transient errors

### 5. Pagination
- Use appropriate page size (10-50 items)
- Implement infinite scroll or pagination UI
- Cache results when appropriate

---

## Related Documentation

- [Deployment API](./aiwm-api-deployment.md) - Deploy models to nodes
- [Node API](./aiwm-api-node.md) - Manage GPU nodes
- [Tool API](./aiwm-api-tool.md) - MCP tools management
- [Instruction API](./aiwm-api-instruction.md) - Agent instructions

---

## Support

For issues or questions:
- GitHub: https://github.com/x-or/hydra-services
- Email: support@x-or.cloud
