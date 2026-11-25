#!/usr/bin/env bash
# Debug-launches an app on a Samsung TV and forwards its DevTools port to 127.0.0.1:9222.
#   TV=<tv ip> tools/samsung.sh MnfnSolid1.Moonfin
set -euo pipefail
TV=${TV:?set TV to the Samsung address}
APP=$1
SDB=~/tizen-studio/tools/sdb
$SDB connect "$TV:26101" >/dev/null
# A debug launch hangs while the app is already running, so close it first.
curl -s -m 5 -X DELETE "http://$TV:8001/api/v2/applications/$APP" >/dev/null || true
sleep 2
out=$(timeout 25 $SDB -s "$TV:26101" shell 0 debug "$APP" 2>&1 || true)
port=$(printf '%s' "$out" | grep -o 'port: [0-9]*' | grep -o '[0-9]*' | head -1)
if [ -z "$port" ]; then
  echo "no debug port: $out" >&2
  exit 1
fi
$SDB -s "$TV:26101" forward tcp:9222 "tcp:$port" >/dev/null
echo "$port"
