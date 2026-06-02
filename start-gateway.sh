#!/usr/bin/env bash
set -euo pipefail

export HYBRID_DEPLOYMENT=ON
export ALBUS_BASEPATH=http://localhost:8080
export PORTKEY_API_KEY=$(cat /tmp/api-key)
export PORTKEY_CLIENT_AUTH=client_auth-PRIVATE_SEVICE
export PORT=${PORT:-9001}
export CIE_CAS_SIGNING_CERT_CHAIN=$(cat cas-signing-cert-chain.pem)

npx tsx --import ./console-prefix.js src/start-server.ts --mcp-node --llm-node 2>&1 | tee gateway.log
