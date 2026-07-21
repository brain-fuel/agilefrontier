#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [ -x "${GOPLUS_BIN:-}" ]; then
	"$GOPLUS_BIN" gen ./planner
	GOOS=js GOARCH=wasm "$GOPLUS_BIN" gen ./cmd/agilefrontierwasm
elif [ -x /tmp/goplus-goal3-check ]; then
	/tmp/goplus-goal3-check gen ./planner
	GOOS=js GOARCH=wasm /tmp/goplus-goal3-check gen ./cmd/agilefrontierwasm
fi
GOOS=js GOARCH=wasm go build -o "$repo_root/public/agilefrontier.wasm" ./cmd/agilefrontierwasm
goroot="$(go env GOROOT)"
if [ -f "$goroot/lib/wasm/wasm_exec.js" ]; then source_glue="$goroot/lib/wasm/wasm_exec.js"; else source_glue="$goroot/misc/wasm/wasm_exec.js"; fi
cp "$source_glue" "$repo_root/public/wasm_exec.js"
