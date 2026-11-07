#!/usr/bin/env sh
# Validates and builds the release zip. All the work is in package.js, so it
# runs the same on Windows (node scripts/package.js) as here.
#
# Output: dist/ukti-X.Y.Z.zip and dist/ukti-latest.zip, the same bytes under
# two names. Upload BOTH to the GitHub Release. The website's download button
# points at releases/latest/download/ukti-latest.zip; without that file on
# the newest release, the button gives a 404.
set -e
cd "$(dirname "$0")/.."
exec node scripts/package.js "$@"
