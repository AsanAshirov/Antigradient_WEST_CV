#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --cache "${NPM_CACHE_DIR:-/tmp/carprint-npm-cache}" --no-audit --no-fund
python3 -m venv .venv
.venv/bin/python -m pip install --cache-dir "${PIP_CACHE_DIR:-/tmp/carprint-pip-cache}" -r server/requirements.lock.txt
npm run build
