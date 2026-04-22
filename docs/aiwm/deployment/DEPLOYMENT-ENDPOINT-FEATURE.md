# Deployment Endpoint Integration Feature

## Overview
The Deployment module now includes a virtual `endpoint` field that provides comprehensive integration information for calling deployment inference endpoints.

## Feature Details

### Virtual Field: `endpoint`
When retrieving deployments via `GET /deployments` or `GET /deployments/:id`, each deployment now includes an `endpoint` object with the following structure:

```json
{
  "url": "https://api.x-or.cloud/dev/aiwm-v2/deployments/{id}/inference/{provider-path}",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer <ACCESS_TOKEN>"
  },
  "body": {
    // Provider-specific sample request body
  },
  "description": "# Integration Guide in Markdown..."
}
```

### Components

#### 1. URL (`url`)
- Automatically constructed from:
  - Base API URL from configuration (`AIWM_BASE_API_URL`)
  - Deployment ID
  - Provider-specific inference path

**Examples:**
- OpenAI: `/deployments/{id}/inference/v1/chat/completions`
- Anthropic: `/deployments/{id}/inference/v1/messages`
- Google: `/deployments/{id}/inference/v1beta/models/{model}:generateContent`
- Self-hosted: `/deployments/{id}/inference/v1/chat/completions`

#### 2. Headers (`headers`)
Default headers required for the request:
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <ACCESS_TOKEN>"
}
```

#### 3. Sample Body (`body`)
Provider-specific sample request body:

**OpenAI/Self-hosted:**
```json
{
  "messages": [{ "role": "user", "content": "Hello, how are you?" }],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

**Anthropic:**
```json
{
  "messages": [{ "role": "user", "content": "Hello, how are you?" }],
  "max_tokens": 1024,
  "temperature": 0.7
}
```

**Google:**
```json
{
  "contents": [{
    "parts": [{ "text": "Hello, how are you?" }]
  }]
}
```

#### 4. Integration Guide (`description`)
Markdown-formatted guide including:
- **Provider Information**: Model name and provider
- **Authentication**: Details about USER_ACCESS_TOKEN and APP_ACCESS_TOKEN
- **Provider Documentation**: Link to official provider docs
- **Example Request**: Complete curl command
- **Response Format**: Notes about response structure

### Provider Support

The feature supports the following providers:

| Provider | Display Name | Inference Path | Docs URL |
|----------|--------------|----------------|----------|
| `openai` | OpenAI | `/v1/chat/completions` | https://platform.openai.com/docs/api-reference |
| `anthropic` | Anthropic (Claude) | `/v1/messages` | https://docs.anthropic.com/en/api/messages |
| `google` | Google (Gemini) | `/v1beta/models/{model}:generateContent` | https://ai.google.dev/api/rest |
| `azure` | Azure OpenAI | `/v1/chat/completions` | - |
| `cohere` | Cohere | `/v1/chat/completions` | - |
| `self-hosted` | Self-Hosted | `/v1/chat/completions` | https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html |

### Configuration Integration

The feature integrates with the Configuration module to read:
- **`AIWM_BASE_API_URL`**: Base URL for constructing endpoint URLs
  - Default: `http://localhost:3003`
  - Example: `https://api.x-or.cloud/dev/aiwm-v2`

### Implementation Details

#### Files Modified

1. **`deployment.dto.ts`**
   - Added `EndpointInfoDto` class with Swagger documentation

2. **`deployment.service.ts`**
   - Added `buildEndpointInfo()` method to construct endpoint information
   - Added `getProviderDisplayName()` helper method
   - Added `buildIntegrationGuide()` method to generate markdown guide
   - Injected `ConfigurationService` for reading base URL

3. **`deployment.controller.ts`**
   - Modified `findById()` to include endpoint field
   - Modified `findAll()` to include endpoint field for each deployment
   - Updated Swagger documentation

4. **`deployment.module.ts`**
   - Imported `ConfigurationModule` to access configuration service

### API Examples

#### Get Single Deployment with Endpoint Info
```bash
curl -X GET "http://localhost:3003/deployments/{id}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "GPT-4 Production",
  "status": "running",
  "modelId": "507f1f77bcf86cd799439012",
  ...
  "endpoint": {
    "url": "http://localhost:3003/deployments/507f1f77bcf86cd799439011/inference/v1/chat/completions",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer <ACCESS_TOKEN>"
    },
    "body": {
      "messages": [{ "role": "user", "content": "Hello, how are you?" }],
      "temperature": 0.7,
      "max_tokens": 1000
    },
    "description": "## Integration Guide\n\nThis deployment uses **OpenAI** provider..."
  }
}
```

#### List Deployments with Endpoint Info
```bash
curl -X GET "http://localhost:3003/deployments?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "data": [
    {
      "_id": "...",
      "name": "...",
      ...
      "endpoint": { ... }
    }
  ],
  "pagination": { ... },
  "statistics": { ... }
}
```

### Testing

Run the test script to verify the feature:
```bash
./scripts/test-deployment-endpoint-info.sh
```

The script will:
1. Authenticate with IAM
2. Fetch deployments list
3. Display endpoint information from list view
4. Fetch single deployment
5. Display detailed endpoint information

### Benefits

1. **Self-Documenting API**: Each deployment provides its own integration guide
2. **Provider Flexibility**: Supports multiple AI providers with correct paths
3. **Developer Experience**: Developers get sample code and documentation instantly
4. **Configuration Driven**: Base URL can be configured per environment
5. **Token Guidance**: Clear instructions about USER_ACCESS_TOKEN vs APP_ACCESS_TOKEN

### Future Enhancements

Potential improvements:
- [ ] Add SDK code samples (Python, JavaScript, etc.)
- [ ] Include rate limiting information
- [ ] Add cost estimation per request
- [ ] Support for streaming endpoints
- [ ] Interactive API playground link
- [ ] Webhook integration examples

## Notes

- The `endpoint` field is **virtual** (not stored in database)
- Computed dynamically on each request
- Requires `AIWM_BASE_API_URL` configuration to be set for correct URLs
- Falls back to `http://localhost:3003` if configuration not found
