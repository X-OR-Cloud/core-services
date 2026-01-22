#!/bin/bash

# Test script for CBM Content Module
# Tests: CRUD operations, search, body update operations, attachments
# Note: Test locally with npx nx serve cbm

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API endpoints
IAM_URL="http://localhost:3000"
CBM_URL="http://localhost:3001"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  CBM Content Module Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Login
echo -e "${YELLOW}Step 1: Login${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$IAM_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin@1234"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('accessToken', ''))" 2>/dev/null || true)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ Login failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Login successful${NC}"
echo ""

# Create content
echo -e "${YELLOW}Step 2: Create test content${NC}"
CREATE_RESPONSE=$(curl -s -X POST "$CBM_URL/contents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "summary": "Product Launch Report Q4 2025",
    "body": "# Executive Summary\n\nOur Q4 launch exceeded expectations.\n\n## Features Delivered\n\n- Feature 1: User authentication\n- Feature 2: Document management",
    "contentType": "markdown",
    "labels": ["product", "launch", "q4"],
    "status": "draft"
  }')

CONTENT_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('_id', ''))" 2>/dev/null || true)

if [ -z "$CONTENT_ID" ]; then
  echo -e "${RED}✗ Create content failed${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Content created: $CONTENT_ID${NC}"
echo ""

# Search
echo -e "${YELLOW}Step 3: Search contents${NC}"
SEARCH_RESPONSE=$(curl -s -X GET "$CBM_URL/contents?search=product&status=draft" \
  -H "Authorization: Bearer $TOKEN")

FOUND=$(echo "$SEARCH_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('data', [])))" 2>/dev/null || echo "0")

if [ "$FOUND" -gt "0" ]; then
  echo -e "${GREEN}✓ Search found $FOUND content(s)${NC}"
else
  echo -e "${RED}✗ Search failed${NC}"
fi
echo ""

# Get full content
echo -e "${YELLOW}Step 4: Get full content${NC}"
FULL_RESPONSE=$(curl -s -X GET "$CBM_URL/contents/$CONTENT_ID/full" \
  -H "Authorization: Bearer $TOKEN")

if [ -n "$FULL_RESPONSE" ]; then
  echo -e "${GREEN}✓ Retrieved full content${NC}"
else
  echo -e "${RED}✗ Get full content failed${NC}"
fi
echo ""

# Update body - append operation
echo -e "${YELLOW}Step 5: Update body (append)${NC}"
APPEND_RESPONSE=$(curl -s -X PATCH "$CBM_URL/contents/$CONTENT_ID/body" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "operation": "append",
    "body": "\n\n## Changelog\n\n- 2025-12-18: Report created"
  }')

if echo "$APPEND_RESPONSE" | grep -q "Changelog"; then
  echo -e "${GREEN}✓ Append operation successful${NC}"
else
  echo -e "${RED}✗ Append operation failed${NC}"
fi
echo ""

# Add attachment
echo -e "${YELLOW}Step 6: Add attachment${NC}"
ATTACH_RESPONSE=$(curl -s -X POST "$CBM_URL/contents/$CONTENT_ID/attachments" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "attachment": {
      "id": "att_001",
      "type": "image",
      "storageProvider": "s3",
      "storageKey": "org/uuid-chart.png",
      "url": "https://cdn.example.com/org/uuid-chart.png",
      "originalName": "sales-chart.png",
      "size": 2048576,
      "mime": "image/png",
      "dimensions": { "width": 1920, "height": 1080 },
      "thumbnail": "data:image/png;base64,iVBORw0KGgoAAAANS..."
    }
  }')

if echo "$ATTACH_RESPONSE" | grep -q "att_001"; then
  echo -e "${GREEN}✓ Attachment added${NC}"
else
  echo -e "${RED}✗ Add attachment failed${NC}"
fi
echo ""

# List attachments
echo -e "${YELLOW}Step 7: List attachments${NC}"
LIST_ATT_RESPONSE=$(curl -s -X GET "$CBM_URL/contents/$CONTENT_ID/attachments" \
  -H "Authorization: Bearer $TOKEN")

ATT_COUNT=$(echo "$LIST_ATT_RESPONSE" | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('attachments', [])))" 2>/dev/null || echo "0")

if [ "$ATT_COUNT" -gt "0" ]; then
  echo -e "${GREEN}✓ Found $ATT_COUNT attachment(s)${NC}"
else
  echo -e "${RED}✗ List attachments failed${NC}"
fi
echo ""

# Cleanup
echo -e "${YELLOW}Step 8: Cleanup (soft delete)${NC}"
DELETE_RESPONSE=$(curl -s -X DELETE "$CBM_URL/contents/$CONTENT_ID" \
  -H "Authorization: Bearer $TOKEN")

if echo "$DELETE_RESPONSE" | grep -q "_id"; then
  echo -e "${GREEN}✓ Content deleted${NC}"
else
  echo -e "${RED}✗ Delete failed${NC}"
fi
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  All tests completed!${NC}"
echo -e "${BLUE}========================================${NC}"
