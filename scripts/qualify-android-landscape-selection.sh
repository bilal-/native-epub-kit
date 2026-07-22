#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
adb_serial="${ADB_SERIAL:-emulator-5554}"
maestro_device="${MAESTRO_DEVICE:-$adb_serial}"
metro_deep_link="${METRO_DEEP_LINK:-}"
output_root="${OUTPUT_ROOT:-$repo_root/artifacts/LIB-014/android-selection-landscape-harness}"

if [[ -z "$metro_deep_link" ]]; then
  echo "METRO_DEEP_LINK must point at the running example-app development server." >&2
  exit 2
fi

physical_size="$(adb -s "$adb_serial" shell wm size | tr -d '\r')"
if [[ "$physical_size" != *"1080x2400"* ]]; then
  echo "Expected the qualified Pixel 8 API 36 emulator at 1080x2400; got: $physical_size" >&2
  exit 2
fi

mkdir -p "$output_root"

maestro --device "$maestro_device" test \
  -e METRO_DEEP_LINK="$metro_deep_link" \
  --format JUNIT \
  --output "$output_root/prepare.xml" \
  "$repo_root/apps/example/maestro/selection-android-landscape-prepare.yaml" \
  --test-output-dir "$output_root/prepare"

# Rotation recreates Android's system-owned floating toolbar while retaining
# the native selection. Android 16 omits that landscape window from Maestro's
# accessibility snapshot, so system input activates its visible Highlight item.
adb -s "$adb_serial" shell input tap 1565 685

maestro --device "$maestro_device" test \
  --format JUNIT \
  --output "$output_root/assert.xml" \
  "$repo_root/apps/example/maestro/selection-android-landscape-assert.yaml" \
  --test-output-dir "$output_root/assert"
