#!/usr/bin/env bash
# 반자동(토큰0·MCP): 신규 영상만 수집 → data/candidates-<date>.json
# 이후 번역(한글제목)+적합도 채점+노션 적재는 Claude가 MCP로 수행 ("radar 수집" 트리거).
set -uo pipefail
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
node src/fetch-uploads.mjs
