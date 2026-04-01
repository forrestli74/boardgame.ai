#!/usr/bin/env bash
set -e

# Summarize token usage from batch CLI stderr logs.
# Usage: pnpm boardgame config.json 2>&1 | ./scripts/token-usage.sh

jq -s '{
  calls: length,
  inputTokens: [.[].inputTokens] | add,
  outputTokens: [.[].outputTokens] | add,
  totalTokens: [.[].totalTokens] | add
}' <(jq -c 'select(.type == "llm-call")' /dev/stdin)
