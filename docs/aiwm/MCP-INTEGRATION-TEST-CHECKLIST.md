# MCP Integration Test Checklist

## Overview
Checklist đầy đủ để test MCP tool integration cho AIWM và CBM services.

## Prerequisites
- ✅ AIWM service chạy ở port 3305
- ✅ CBM service chạy ở port 3001
- ✅ MongoDB đang chạy
- ✅ Đã seed 29 CBM tools vào database
- ✅ Có admin token để tạo agent

---

## Phase 1: Seed CBM Tools

### 1.1 Run Seed Script
```bash
chmod +x scripts/seed-cbm-tools.sh
./scripts/seed-cbm-tools.sh
```

**Expected Output:**
- ✅ Login successful
- ✅ 6 Document Management tools created
- ✅ 13 Work Management tools created
- ✅ 10 Project Management tools created
- ✅ Total: 29 CBM API tools

### 1.2 Verify Tools in Database
```bash
# List all CBM tools
curl -s -X GET "http://localhost:3305/tools?filter[tags]=cbm&limit=100" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep '"name"'
```

**Check:**
- [ ] Tất cả 29 tools có name bắt đầu bằng `cbm_`
- [ ] Mỗi tool có type = 'api'
- [ ] Mỗi tool có status = 'active'
- [ ] Mỗi tool có execution.baseUrl = "http://cbm:3001"
- [ ] Mỗi tool có execution.path (không phải endpoint)

---

## Phase 2: Agent Setup & Connection

### 2.1 Create Test Agent
```bash
# Get node ID first
NODE_ID=$(curl -s -X GET "http://localhost:3305/nodes?limit=1" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys, json; print(json.load(sys.stdin)['data'][0]['_id'])")

# Create instruction
INSTRUCTION_RESPONSE=$(curl -s -X POST "http://localhost:3305/instructions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MCP Test Agent Instruction",
    "content": "You are a test agent for MCP integration. You can create and manage documents, works, and projects.",
    "status": "active"
  }')

INSTRUCTION_ID=$(echo "$INSTRUCTION_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['_id'])")

# Get tool IDs (get first 5 tools for testing)
TOOL_IDS=$(curl -s -X GET "http://localhost:3305/tools?filter[tags]=cbm&limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
ids = [t['_id'] for t in data['data']]
print(json.dumps(ids))
")

# Create managed agent with allowed tools
AGENT_RESPONSE=$(curl -s -X POST "http://localhost:3305/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"MCP Test Agent\",
    \"description\": \"Test agent for MCP integration\",
    \"type\": \"managed\",
    \"status\": \"active\",
    \"nodeId\": \"$NODE_ID\",
    \"instructionId\": \"$INSTRUCTION_ID\",
    \"allowedToolIds\": $TOOL_IDS,
    \"settings\": {
      \"auth_roles\": [\"agent\", \"document.editor\", \"work.editor\", \"project.editor\"],
      \"claude_model\": \"claude-3-5-sonnet-latest\"
    }
  }")

AGENT_ID=$(echo "$AGENT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['_id'])")
echo "Agent ID: $AGENT_ID"
```

**Check:**
- [ ] Agent created successfully
- [ ] Agent type = 'managed'
- [ ] Agent có allowedToolIds (5 tools)
- [ ] Agent có settings.auth_roles

### 2.2 Regenerate Credentials
```bash
CREDS_RESPONSE=$(curl -s -X POST "http://localhost:3305/agents/$AGENT_ID/credentials/regenerate" \
  -H "Authorization: Bearer $TOKEN")

AGENT_SECRET=$(echo "$CREDS_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['secret'])")
echo "Agent Secret: $AGENT_SECRET"
```

**Check:**
- [ ] Secret generated
- [ ] envConfig contains AIWM_AGENT_SECRET
- [ ] installScript generated

### 2.3 Agent Connect
```bash
CONNECT_RESPONSE=$(curl -s -X POST "http://localhost:3305/agents/$AGENT_ID/connect" \
  -H "Content-Type: application/json" \
  -d "{\"secret\": \"$AGENT_SECRET\"}")

AGENT_TOKEN=$(echo "$CONNECT_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['accessToken'])")
echo "Agent Token: $AGENT_TOKEN"

# Verify response structure
echo "$CONNECT_RESPONSE" | python3 -m json.tool
```

**Check:**
- [ ] Response có accessToken
- [ ] Response có expiresIn = 86400 (24h)
- [ ] Response có tokenType = "bearer"
- [ ] Response có **mcpEndpoint** = "http://localhost:3305/mcp" ⭐
- [ ] Response có instruction
- [ ] Response có tools array
- [ ] Response có settings

---

## Phase 3: MCP Tools List

### 3.1 Call POST /mcp/tools/list
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/list" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -m json.tool
```

**Check:**
- [ ] Response có field `tools` (array)
- [ ] tools.length = 5 (số lượng allowedToolIds)
- [ ] Mỗi tool có: name, description, inputSchema
- [ ] **Không có** execution details (baseUrl, path, method) - chỉ public inputSchema
- [ ] inputSchema là valid JSON Schema

### 3.2 Verify Tool Names
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/list" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
for tool in data['tools']:
    print(f\"- {tool['name']}\")
"
```

**Check:**
- [ ] Tool names match với allowedToolIds
- [ ] Chỉ tools có type='api' và status='active' được return

---

## Phase 4: MCP Tools Call - Document Management

### 4.1 Create Document
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_createOne",
    "arguments": {
      "summary": "Test Document from MCP",
      "content": "This is a test document created via MCP tools/call endpoint",
      "type": "markdown"
    }
  }' | python3 -m json.tool
```

**Check:**
- [ ] Response có field `content` (array)
- [ ] content[0].type = "text"
- [ ] content[0].text chứa JSON string của CBM response
- [ ] Parse JSON từ text thành công
- [ ] Có _id, summary, content, createdAt trong response

### 4.2 List Documents
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_findMany",
    "arguments": {
      "page": 1,
      "limit": 10
    }
  }' | python3 -m json.tool
```

**Check:**
- [ ] Response có pagination
- [ ] Response có data array
- [ ] Document vừa tạo có trong list

### 4.3 Get Document by ID
```bash
# Extract document ID from create response
DOC_ID="<paste-id-here>"

curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_documents_findById\",
    \"arguments\": {
      \"id\": \"$DOC_ID\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Response trả về đúng document
- [ ] Path parameter {id} được replace thành công

### 4.4 Update Document
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_documents_updateOne\",
    \"arguments\": {
      \"id\": \"$DOC_ID\",
      \"summary\": \"Updated Test Document\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Document updated successfully
- [ ] summary changed

### 4.5 Delete Document
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_documents_deleteOne\",
    \"arguments\": {
      \"id\": \"$DOC_ID\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Document soft deleted
- [ ] deletedAt field set

---

## Phase 5: MCP Tools Call - Work Management

### 5.1 Create Work
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_works_createOne\",
    \"arguments\": {
      \"title\": \"Test Work from MCP\",
      \"type\": \"task\",
      \"reporter\": {
        \"type\": \"agent\",
        \"id\": \"$AGENT_ID\"
      },
      \"description\": \"Testing work creation via MCP\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Work created với reporter type = "agent"
- [ ] Work type = "task" (immutable)
- [ ] Nested ReporterAssigneeDto được xử lý đúng

### 5.2 Start Work (State Transition)
```bash
WORK_ID="<paste-work-id-here>"

curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_works_start\",
    \"arguments\": {
      \"id\": \"$WORK_ID\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Work status changed: backlog/todo → in_progress
- [ ] State transition successful

### 5.3 Block Work
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_works_block\",
    \"arguments\": {
      \"id\": \"$WORK_ID\",
      \"reason\": \"Waiting for API documentation\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Work status: in_progress → blocked
- [ ] Reason field set correctly

### 5.4 Other Work Actions
Test các actions sau:
- [ ] cbm_works_unblock: blocked → in_progress
- [ ] cbm_works_requestReview: in_progress → review
- [ ] cbm_works_complete: review → done
- [ ] cbm_works_reopen: done → in_progress
- [ ] cbm_works_cancel: any → cancelled

---

## Phase 6: MCP Tools Call - Project Management

### 6.1 Create Project
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_projects_createOne",
    "arguments": {
      "name": "Test Project from MCP",
      "description": "Testing project creation via MCP",
      "tags": ["test", "mcp"]
    }
  }' | python3 -m json.tool
```

**Check:**
- [ ] Project created successfully
- [ ] Status = "draft" (default)

### 6.2 Activate Project
```bash
PROJECT_ID="<paste-project-id-here>"

curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_projects_activate\",
    \"arguments\": {
      \"id\": \"$PROJECT_ID\"
    }
  }" | python3 -m json.tool
```

**Check:**
- [ ] Project status: draft → active

### 6.3 Other Project Actions
Test các actions sau:
- [ ] cbm_projects_hold: active → on_hold
- [ ] cbm_projects_resume: on_hold → active
- [ ] cbm_projects_complete: active → completed
- [ ] cbm_projects_archive: completed → archived

---

## Phase 7: Error Handling

### 7.1 Tool Not Found
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_nonexistent_tool",
    "arguments": {}
  }'
```

**Check:**
- [ ] Status code: 404
- [ ] Response có error object
- [ ] error.code = "TOOL_NOT_FOUND" hoặc tương tự

### 7.2 Tool Not in Allowed List
```bash
# Get a tool that's not in allowedToolIds
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_projects_archive",
    "arguments": {}
  }'
```

**Check (nếu tool không trong allowedToolIds):**
- [ ] Status code: 400
- [ ] Error message: "Tool is not in agent's allowed tools list"

### 7.3 Missing Required Field
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_createOne",
    "arguments": {
      "summary": "Missing content field"
    }
  }'
```

**Check:**
- [ ] Status code: 400
- [ ] CBM validation error được wrapped trong MCP error format
- [ ] error.details.message chứa validation message từ CBM

### 7.4 Missing Path Parameter
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_findById",
    "arguments": {}
  }'
```

**Check:**
- [ ] Status code: 400
- [ ] Error: "Missing required path parameter: id"

### 7.5 Invalid Enum Value
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_createOne",
    "arguments": {
      "summary": "Test",
      "content": "Test content",
      "type": "invalid_type"
    }
  }'
```

**Check:**
- [ ] Status code: 400
- [ ] CBM validation error về enum

---

## Phase 8: Authentication & RBAC

### 8.1 Verify Agent JWT Used for CBM
```bash
# In CBM logs, verify JWT contains:
# - username: "agent:<agentId>"
# - roles: ["agent", "document.editor", "work.editor", "project.editor"]
# - type: "agent"
```

**Check (in CBM service logs):**
- [ ] CBM receives requests with agent JWT
- [ ] CBM validates JWT successfully
- [ ] CBM applies RBAC based on roles in JWT

### 8.2 Test Different Agent Roles
Create agent with limited roles:
```bash
# Create agent with only ["agent"] role
# Try to create/update documents
```

**Check:**
- [ ] Agent với role "agent" có quyền cơ bản
- [ ] Agent không có role "document.editor" không thể update documents (nếu CBM enforce RBAC)

### 8.3 Test Without JWT
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/list" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Check:**
- [ ] Status code: 401 Unauthorized
- [ ] Error message về missing/invalid JWT

---

## Phase 9: Performance & Edge Cases

### 9.1 Large Payload
```bash
# Create document với content rất lớn (100KB+)
LARGE_CONTENT=$(python3 -c "print('x' * 100000)")

curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"cbm_documents_createOne\",
    \"arguments\": {
      \"summary\": \"Large document\",
      \"content\": \"$LARGE_CONTENT\",
      \"type\": \"text\"
    }
  }"
```

**Check:**
- [ ] Request thành công hoặc timeout gracefully
- [ ] No memory issues

### 9.2 Query Parameters với Special Characters
```bash
curl -s -X POST "http://localhost:3305/mcp/tools/call" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "cbm_documents_findMany",
    "arguments": {
      "page": 1,
      "limit": 10,
      "filter": {"summary": "Test & Special < > Characters"}
    }
  }'
```

**Check:**
- [ ] Special characters được encode đúng
- [ ] Query thành công

### 9.3 Concurrent Requests
```bash
# Run 10 parallel requests
for i in {1..10}; do
  curl -s -X POST "http://localhost:3305/mcp/tools/call" \
    -H "Authorization: Bearer $AGENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "cbm_documents_findMany",
      "arguments": {"page": 1, "limit": 10}
    }' &
done
wait
```

**Check:**
- [ ] All requests complete successfully
- [ ] No race conditions
- [ ] Response times reasonable

---

## Phase 10: Integration Verification

### 10.1 End-to-End Flow
```bash
# Complete workflow: Create → Read → Update → Delete
```

**Check:**
- [ ] Agent connect → get mcpEndpoint
- [ ] Agent discover tools → get filtered list
- [ ] Agent execute tool → create document
- [ ] Agent execute tool → read document
- [ ] Agent execute tool → update document
- [ ] Agent execute tool → delete document
- [ ] All operations successful

### 10.2 Verify in CBM Database
```bash
# Connect to MongoDB and verify:
# - Documents created by agent have correct owner
# - createdBy/updatedBy fields set correctly
# - Audit trail captured
```

**Check:**
- [ ] CBM database has correct records
- [ ] Owner/creator fields match agent

### 10.3 Verify AIWM Logs
```bash
# Check AIWM service logs
```

**Check:**
- [ ] Agent connection logged
- [ ] Tools list requests logged
- [ ] Tool execution logged with tool name and agentId
- [ ] Errors logged với correlation IDs

---

## Summary Checklist

### ✅ Core Functionality
- [ ] Seed script tạo 29 tools thành công
- [ ] Agent connect trả về mcpEndpoint
- [ ] POST /mcp/tools/list trả về filtered tools
- [ ] POST /mcp/tools/call proxy requests to CBM thành công

### ✅ Document Management (6 tools)
- [ ] cbm_documents_findMany
- [ ] cbm_documents_findById
- [ ] cbm_documents_getContent
- [ ] cbm_documents_createOne
- [ ] cbm_documents_updateOne
- [ ] cbm_documents_deleteOne

### ✅ Work Management (13 tools)
- [ ] cbm_works_findMany
- [ ] cbm_works_findById
- [ ] cbm_works_createOne
- [ ] cbm_works_updateOne
- [ ] cbm_works_deleteOne
- [ ] cbm_works_start
- [ ] cbm_works_block
- [ ] cbm_works_unblock
- [ ] cbm_works_requestReview
- [ ] cbm_works_complete
- [ ] cbm_works_reopen
- [ ] cbm_works_cancel
- [ ] cbm_works_canTrigger

### ✅ Project Management (10 tools)
- [ ] cbm_projects_findMany
- [ ] cbm_projects_findById
- [ ] cbm_projects_createOne
- [ ] cbm_projects_updateOne
- [ ] cbm_projects_deleteOne
- [ ] cbm_projects_activate
- [ ] cbm_projects_hold
- [ ] cbm_projects_resume
- [ ] cbm_projects_complete
- [ ] cbm_projects_archive

### ✅ Error Handling
- [ ] Tool not found
- [ ] Tool not in allowed list
- [ ] Missing required fields
- [ ] Missing path parameters
- [ ] Invalid enum values
- [ ] CBM service errors wrapped correctly

### ✅ Authentication & Security
- [ ] Agent JWT used for CBM requests
- [ ] RBAC applied based on agent roles
- [ ] Unauthorized requests rejected

### ✅ Performance
- [ ] Large payloads handled
- [ ] Special characters encoded correctly
- [ ] Concurrent requests work

---

## Notes

- **Agent JWT**: AIWM sử dụng trực tiếp agent JWT (từ connect) để gọi CBM, không generate user JWT riêng
- **Path vs Endpoint**: Tool schema sử dụng `execution.path` chứ không phải `execution.endpoint`
- **Tool Filtering**: Chỉ tools có type='api', status='active', và có trong allowedToolIds mới được expose qua MCP
- **MCP Protocol**: Response format theo Anthropic MCP standard với `content` array
