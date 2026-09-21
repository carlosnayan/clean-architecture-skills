#!/usr/bin/env bash
# Roda o import-check contra um projeto Go. Uso: ./import-check.sh [caminho]
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="$(cd "${1:-.}" && pwd)"
cd "$here/import-check"
exec go run . "$target"
