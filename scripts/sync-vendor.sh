#!/usr/bin/env bash
# Populate js/vendor/ from a local zkLicensing checkout.
#
# The zklicensing SDK build is small (< 1 MB) and is committed to git.
# o1js is ~65 MB — .gitignored — and must be resynced by every developer
# before running the app. Point ZKLIC_ROOT at your zkLicensing checkout.

set -euo pipefail

ZKLIC_ROOT="${ZKLIC_ROOT:-$HOME/claude/zklicensing/zklicensing}"
WEBAPP_ROOT="${WEBAPP_ROOT:-$HOME/claude/zklicensing/zklicensing.com}"

HERE="$(cd "$(dirname "$0")/.." && pwd)"
SDK_SRC="$ZKLIC_ROOT/packages/sdk/build"
O1JS_SRC="$WEBAPP_ROOT/node_modules/o1js/dist/web"

SDK_DST="$HERE/js/vendor/zklicensing"
O1JS_DST="$HERE/js/vendor/o1js"

[[ -d "$SDK_SRC"  ]] || { echo "SDK build not found: $SDK_SRC — run 'npm run build' in the SDK repo"; exit 1; }
[[ -d "$O1JS_SRC" ]] || { echo "o1js not found: $O1JS_SRC — run 'npm install' in the web app repo"; exit 1; }

mkdir -p "$SDK_DST" "$O1JS_DST"
rm -rf "$SDK_DST"/* "$O1JS_DST"/*
cp -R  "$SDK_SRC"/.  "$SDK_DST"/
cp -R  "$O1JS_SRC"/. "$O1JS_DST"/

# Rewrite bare `from 'o1js'` specifiers to relative paths. Import maps only
# work inside HTML documents; dedicated workers (like js/license.worker.js)
# resolve modules through the fetch spec and can't see them. A relative path
# resolves identically in both contexts.
find "$SDK_DST" -maxdepth 1 -name '*.js' -exec \
  sed -i.bak -E "s|from ['\"]o1js['\"]|from '../o1js/index.js'|g" {} \;
find "$SDK_DST" -maxdepth 1 -name '*.js.bak' -delete

echo "vendored:"
du -sh "$SDK_DST" "$O1JS_DST"
