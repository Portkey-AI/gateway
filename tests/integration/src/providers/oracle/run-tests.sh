#!/bin/bash
# Run Oracle integration tests using OCI config file
#
# Usage:
#   ./run-tests.sh [PROFILE_NAME] [MODELS] [TEST_TYPE]
#
# Arguments:
#   PROFILE_NAME  OCI profile name (default: API_KEY_AUTH)
#   MODELS        Comma-separated list of models to test (optional)
#   TEST_TYPE     Type of tests to run: chat, embed, all (default: all)
#
# Environment variables (can override arguments):
#   ORACLE_PROFILE       OCI profile name
#   ORACLE_TEST_MODELS   Comma-separated list of chat models to test
#   ORACLE_EMBED_MODEL   Embedding model to test
#
# Examples:
#   ./run-tests.sh API_KEY_AUTH
#   ./run-tests.sh API_FREE_TIER "meta.llama-4-maverick-17b-128e-instruct-fp8,xai.grok-3-fast"
#   ./run-tests.sh API_FREE_TIER "" embed
#   ORACLE_TEST_MODELS="google.gemini-2.5-flash" ./run-tests.sh

PROFILE="${ORACLE_PROFILE:-${1:-API_KEY_AUTH}}"
MODELS="${ORACLE_TEST_MODELS:-$2}"
TEST_TYPE="${3:-all}"
OCI_CONFIG="$HOME/.oci/config"

if [ ! -f "$OCI_CONFIG" ]; then
  echo "Error: OCI config not found at $OCI_CONFIG"
  exit 1
fi

echo "Using OCI profile: $PROFILE"

# Parse OCI config file (handles "key = value" format with spaces)
parse_config() {
  local profile="$1"
  local key="$2"
  awk -v profile="[$profile]" -v key="$key" '
    $0 == profile { found=1; next }
    /^\[/ { found=0 }
    found && $1 == key { gsub(/^[^=]+=[ \t]*/, ""); print; exit }
  ' "$OCI_CONFIG"
}

# Extract values from config
TENANCY=$(parse_config "$PROFILE" "tenancy")
USER=$(parse_config "$PROFILE" "user")
FINGERPRINT=$(parse_config "$PROFILE" "fingerprint")
KEY_FILE=$(parse_config "$PROFILE" "key_file")
REGION=$(parse_config "$PROFILE" "region")

# Expand ~ in key_file path
KEY_FILE="${KEY_FILE/#\~/$HOME}"

if [ -z "$TENANCY" ] || [ -z "$USER" ] || [ -z "$FINGERPRINT" ] || [ -z "$KEY_FILE" ]; then
  echo "Error: Could not parse all required fields from profile [$PROFILE]"
  echo "  tenancy: $TENANCY"
  echo "  user: $USER"
  echo "  fingerprint: $FINGERPRINT"
  echo "  key_file: $KEY_FILE"
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "Error: Private key file not found: $KEY_FILE"
  exit 1
fi

# Read private key
PRIVATE_KEY=$(cat "$KEY_FILE")

# For GenAI, we need a compartment ID - use tenancy root if not specified
COMPARTMENT_ID="${ORACLE_COMPARTMENT_ID:-$TENANCY}"

# GenAI is available in us-chicago-1
GENAI_REGION="${ORACLE_REGION:-us-chicago-1}"

echo "Configuration:"
echo "  Tenancy: ${TENANCY:0:50}..."
echo "  User: ${USER:0:50}..."
echo "  Fingerprint: $FINGERPRINT"
echo "  Key file: $KEY_FILE"
echo "  Region: $GENAI_REGION"
echo "  Compartment: ${COMPARTMENT_ID:0:50}..."
if [ -n "$MODELS" ]; then
  echo "  Chat models: $MODELS"
else
  echo "  Chat models: (using defaults)"
fi
echo "  Test type: $TEST_TYPE"
echo ""

# Export environment variables
export ORACLE_TENANCY="$TENANCY"
export ORACLE_USER="$USER"
export ORACLE_FINGERPRINT="$FINGERPRINT"
export ORACLE_PRIVATE_KEY="$PRIVATE_KEY"
export ORACLE_COMPARTMENT_ID="$COMPARTMENT_ID"
export ORACLE_REGION="$GENAI_REGION"

if [ -n "$MODELS" ]; then
  export ORACLE_TEST_MODELS="$MODELS"
fi

# Run tests based on type
case "$TEST_TYPE" in
  chat)
    echo "Running Oracle chat completion tests..."
    echo ""
    npx jest tests/integration/src/providers/oracle/chatComplete.integration.test.ts --no-cache --verbose
    ;;
  embed)
    echo "Running Oracle embeddings tests..."
    echo ""
    npx jest tests/integration/src/providers/oracle/embed.integration.test.ts --no-cache --verbose
    ;;
  all)
    echo "Running all Oracle integration tests..."
    echo ""
    npx jest tests/integration/src/providers/oracle --no-cache --verbose
    ;;
  *)
    echo "Error: Unknown test type '$TEST_TYPE'. Use: chat, embed, or all"
    exit 1
    ;;
esac
