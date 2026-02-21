#!/bin/bash

# Test script for webhook signature verifier example
# Demonstrates that external middleware can register and handle routes

set -e

PORT=${1:-8787}
BASE_URL="http://localhost:$PORT"
SECRET="demo-secret-key"
TESTS_PASSED=0
TESTS_FAILED=0

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Webhook Signature Verifier Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Base URL: ${YELLOW}$BASE_URL${NC}"
echo -e "Secret: ${YELLOW}$SECRET${NC}"
echo ""

# Helper function to run a test
run_test() {
  local test_name=$1
  local expected_status=$2
  local method=$3
  local url=$4
  local headers=$5
  local data=$6

  echo -e "${YELLOW}Test: $test_name${NC}"

  # Build curl arguments array to avoid eval
  local curl_args=('-s' '-w' $'\n%{http_code}' '-X' "$method")

  # Add headers if provided
  if [ -n "$headers" ]; then
    # Parse headers safely without eval
    local IFS=' '
    read -ra header_array <<<"$headers"
    curl_args+=("${header_array[@]}")
  fi

  # Add data if provided
  if [ -n "$data" ]; then
    curl_args+=('-d' "$data")
  fi

  # Add URL
  curl_args+=("$BASE_URL$url")

  # Run the test safely without eval
  local response=$(curl "${curl_args[@]}")
  local status_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')

  # Check result
  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASS${NC} (HTTP $status_code)"
    echo "Response: $body" | jq . 2>/dev/null || echo "Response: $body"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC} (Expected HTTP $expected_status, got $status_code)"
    echo "Response: $body" | jq . 2>/dev/null || echo "Response: $body"
    ((TESTS_FAILED++))
  fi
  echo ""
}

# Test 1: Health check
run_test \
  "Health check endpoint" \
  "200" \
  "GET" \
  "/webhooks/health" \
  "-H 'Content-Type: application/json'"

# Test 2: Valid signature
PAYLOAD='{"event":"order.created","data":{"orderId":"123"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
run_test \
  "Valid webhook signature" \
  "200" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json' -H 'X-Signature: $SIGNATURE'" \
  "$PAYLOAD"

# Test 3: Invalid signature
run_test \
  "Invalid webhook signature" \
  "403" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json' -H 'X-Signature: invalid-signature'" \
  "$PAYLOAD"

# Test 4: Missing signature header
run_test \
  "Missing X-Signature header" \
  "401" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json'" \
  "$PAYLOAD"

# Test 5: Invalid JSON
INVALID_JSON="invalid json content"
SIGNATURE=$(echo -n "$INVALID_JSON" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
run_test \
  "Invalid JSON payload" \
  "400" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json' -H 'X-Signature: $SIGNATURE'" \
  "$INVALID_JSON"

# Test 6: Empty body
EMPTY_PAYLOAD=""
SIGNATURE=$(echo -n "$EMPTY_PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
run_test \
  "Empty request body" \
  "400" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json' -H 'X-Signature: $SIGNATURE'" \
  ""

# Test 7: Valid signature with different payload
PAYLOAD2='{"event":"user.registered","data":{"userId":"456","email":"test@example.com"}}'
SIGNATURE2=$(echo -n "$PAYLOAD2" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
run_test \
  "Valid signature with different payload" \
  "200" \
  "POST" \
  "/webhooks/verify" \
  "-H 'Content-Type: application/json' -H 'X-Signature: $SIGNATURE2'" \
  "$PAYLOAD2"

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  echo ""
  echo "This demonstrates that:"
  echo "  ✓ External middleware can register custom routes"
  echo "  ✓ Routes work exactly like standard Hono routes"
  echo "  ✓ Request/response handling works normally"
  echo "  ✓ No app wrapping or core modifications needed"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
