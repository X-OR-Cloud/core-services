#!/bin/bash

# Test Model API Config functionality
# This script demonstrates storing API authentication config for API-based models

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2OTFlYmEwODUxN2Y5MTc5NDNhZTFmYTEiLCJ1c2VybmFtZSI6ImFkbWluQHgtb3IuY2xvdWQiLCJzdGF0dXMiOiJhY3RpdmUiLCJyb2xlcyI6WyJvcmdhbml6YXRpb24ub3duZXIiXSwib3JnSWQiOiI2OTFlYjllNjUxN2Y5MTc5NDNhZTFmOWQiLCJncm91cElkIjoiIiwiYWdlbnRJZCI6IiIsImFwcElkIjoiIiwiaWF0IjoxNzYzNzEyOTgzLCJleHAiOjE3NjM3MTY1ODN9.loIFlVcyfHrs1YRsH471r2UMX4fAYucnXGe7BRK3jAo"

echo "======================================"
echo "Testing Model apiConfig Field"
echo "======================================"

echo ""
echo "1. Creating API-based Model with apiConfig..."
MODEL_RESPONSE=$(curl -s -X POST http://localhost:3305/models \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "GPT-4 Turbo",
    "type": "llm",
    "description": "OpenAI GPT-4 Turbo model with API authentication",
    "version": "2024-11-20",
    "deploymentType": "api-based",
    "provider": "openai",
    "apiEndpoint": "https://api.openai.com/v1",
    "modelIdentifier": "gpt-4-turbo-2024-11-20",
    "requiresApiKey": true,
    "apiConfig": {
      "apiKey": "sk-test123456789",
      "organization": "org-test123",
      "customHeader": "X-Custom-Value",
      "rateLimit": "100",
      "timeout": "30000"
    },
    "status": "active"
  }')

echo "$MODEL_RESPONSE" | jq '.'

# Extract model ID
MODEL_ID=$(echo "$MODEL_RESPONSE" | jq -r '._id // .id // ""')

if [ -z "$MODEL_ID" ] || [ "$MODEL_ID" == "null" ]; then
  echo "❌ Failed to create model"
  exit 1
fi

echo ""
echo "✅ Model created with ID: $MODEL_ID"

echo ""
echo "2. Retrieving model to verify apiConfig..."
curl -s -X GET "http://localhost:3305/models/$MODEL_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

echo ""
echo "3. Updating model apiConfig..."
curl -s -X PUT "http://localhost:3305/models/$MODEL_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiConfig": {
      "apiKey": "sk-updated-key-xyz",
      "organization": "org-updated-456",
      "newField": "newValue"
    }
  }' | jq '.'

echo ""
echo "4. Verifying updated apiConfig..."
curl -s -X GET "http://localhost:3305/models/$MODEL_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.apiConfig'

echo ""
echo "======================================"
echo "Test completed!"
echo "Model ID: $MODEL_ID"
echo "======================================"
