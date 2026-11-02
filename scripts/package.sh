#!/usr/bin/env sh
# Validates and builds the release zip. All the work is in package.js, so it
# runs the same on Windows (node scripts/package.js) as here.
set -e
cd "$(dirname "$0")/.."
exec node scripts/package.js "$@"
