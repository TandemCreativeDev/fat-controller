#!/usr/bin/env bash
# Runs every gate; prints one PASS line, or FAIL: <step> with the log tail.
set -uo pipefail
cd "$(dirname "$0")/.."
log_dir="${TMPDIR:-/tmp}/fat-controller-gates"
mkdir -p "$log_dir"
log="$log_dir/gates-$(date +%Y%m%d-%H%M%S).log"

run() {
  local name="$1"; shift
  echo "=== $name" >>"$log"
  if ! "$@" >>"$log" 2>&1; then
    echo "FAIL: $name"
    tail -n 30 "$log"
    echo "full log: $log"
    exit 1
  fi
}

run typecheck pnpm -s typecheck
run lint pnpm -s lint
run test pnpm -s test
run build pnpm -s build
echo "PASS (log: $log)"
