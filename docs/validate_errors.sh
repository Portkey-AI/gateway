#!/bin/bash

# Base URL - change if running on a different port
BASE_URL="http://localhost:8787/v1/chat/completions"

echo "Starting Phase 1 Error Validation..."
echo "-----------------------------------"

# 1. Invalid Content Type
echo "1. Testing INVALID_CONTENT_TYPE..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: text/plain" \
  -d "test" | jq .
echo -e "\n-----------------------------------"

# 2. Missing Required Header
echo "2. Testing MISSING_REQUIRED_HEADER..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -d '{}' | jq .
echo -e "\n-----------------------------------"

# 3. Invalid Provider
echo "3. Testing INVALID_PROVIDER..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-provider: invalid-provider" \
  -d '{}' | jq .
echo -e "\n-----------------------------------"

# 4. Invalid Config (Malformed JSON)
echo "4. Testing INVALID_CONFIG (Malformed JSON)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-config: {invalid-json" \
  -d '{}' | jq .
echo -e "\n-----------------------------------"

# 5. Invalid Custom Host
echo "5. Testing INVALID_CUSTOM_HOST..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-provider: openai" \
  -H "x-portkey-custom-host: ftp://example.com" \
  -d '{}' | jq .
echo -e "\n-----------------------------------"

echo -e "\n-----------------------------------"

echo "Phase 2: Provider Error Validation"
echo "-----------------------------------"

# 6. Provider Authentication Error (Requires internet and valid route to provider)
# This attempts to call OpenAI with an invalid key
echo "6. Testing PROVIDER_AUTHENTICATION_ERROR (Invalid API Key)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-provider: openai" \
  -H "Authorization: Bearer sk-invalid-key" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}]
  }' | jq .
echo -e "\n-----------------------------------"

# 7. Provider Bad Request
# This attempts to call OpenAI with an invalid parameter
echo "7. Testing PROVIDER_BAD_REQUEST (Invalid Parameter)..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-provider: openai" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "invalid_param": "should_fail"
  }' | jq .
echo -e "\n-----------------------------------"

# 8. No Healthy Targets
echo "8. Testing NO_HEALTHY_TARGETS..."
curl -s -X POST "$BASE_URL" \
  -H "Content-Type: application/json" \
  -H "x-portkey-config: {\"strategy\": {\"mode\": \"loadbalance\"}, \"targets\": []}" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}]
  }' | jq .
echo -e "\n-----------------------------------"

echo "Validation Complete."

