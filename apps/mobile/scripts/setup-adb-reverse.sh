#!/usr/bin/env bash
set -euo pipefail

# 모든 연결된 Android 기기/에뮬레이터에 API(8000) + Metro(8081) reverse 설정.
# 실기기는 reverse 없으면 localhost:8000 도달 불가 → 가입/로그인 axios 실패.

if ! command -v adb >/dev/null 2>&1; then
  echo "✗ adb를 찾을 수 없음. Android SDK platform-tools를 PATH에 추가하세요." >&2
  exit 1
fi

devices=$(adb devices | awk 'NR>1 && $2=="device" {print $1}')

if [ -z "$devices" ]; then
  echo "✗ 연결된 Android 기기/에뮬레이터 없음 (adb devices 결과 비어 있음)" >&2
  exit 1
fi

for serial in $devices; do
  adb -s "$serial" reverse tcp:8000 tcp:8000 >/dev/null
  adb -s "$serial" reverse tcp:8081 tcp:8081 >/dev/null
  echo "✓ $serial reverse 설정 완료 (8000=API, 8081=Metro)"
done
