---
depth: simple
---
# impl: #142 expo-file-system v55 deleteAsync deprecation throw — legacy import 전환

## Overview

**증상**: S10에서 30초 이상 녹음 후 S11 "이 목소리로 만들기" 시 "파일 업로드에 실패했어요. 다시 시도해주세요" 토스트. handleReRecord 경로에서도 logcat에 `Method deleteAsync ... is deprecated. ... import the legacy API from "expo-file-system/legacy"` uncaught error 발생.

**근본 원인**: expo-file-system@55 루트 모듈은 `*Async` 메서드를 `legacyWarnings`로 재-export 하지만 호출 시 런타임 throw 한다 (참고: `node_modules/expo-file-system/build/legacyWarnings.d.ts`). 두 화면이 아직 루트 import를 사용해 `deleteAsync` 호출 즉시 throw → S11 useRecording 플로우의 catch 또는 uncaught promise rejection 으로 흘러 사용자에게 업로드 실패 메시지로 노출.

**해결**: 잔존 2개 파일의 import 경로를 `expo-file-system` → `expo-file-system/legacy` 로 교체. 함수 시그니처·인자·throw 의미 동일.

> 참고: `apps/mobile/src/services/api/recordings.ts` 는 #123 에서 이미 `/legacy` 로 전환 완료 — 본 issue 범위 외 (현재 검증 결과 line 4 `import * as FileSystem from 'expo-file-system/legacy'`). 본 PR 은 잔존 누락분만 정리.

## Depth 판정 근거: `simple`

- 단일 import path 1라인 교체 × 2 파일. 호출 시그니처(`deleteAsync(uri, { idempotent: true })`, `cacheDirectory`)는 legacy 모듈에서 동일 export.
- DOM/문구/testid/role 변경 없음.
- 호출부 로직·테스트 assertion 변경 없음.
- touched 파일을 assertion 하는 `__tests__` 파일 부재 (`grep -rn "S11PreviewScreen\|AccountDeletionScreen\|FileSystem" apps/mobile/src/__tests__` → 0건).
- depth: simple — TDD 선행 미요구. 기존 구조 수정.

## 영향 파일

| 파일 | 변경 유형 |
|---|---|
| `apps/mobile/src/screens/S11PreviewScreen.tsx` | import path `'expo-file-system'` → `'expo-file-system/legacy'` (line 13) |
| `apps/mobile/src/screens/AccountDeletionScreen.tsx` | import path `'expo-file-system'` → `'expo-file-system/legacy'` (line 31) |

## `/legacy` subpath 강제 사유

루트 `expo-file-system` 의 `deleteAsync`/`uploadAsync`/`writeAsStringAsync` 등은 `legacyWarnings` 로 재-export 되지만 호출 시 `@deprecated ... will throw in runtime` 실제로 throw. 또한 `cacheDirectory` 같은 상수도 legacy 진입점에서 값으로 노출되어야 안정. 따라서 `'/legacy'` 는 *선호* 가 아니라 SDK 55 환경에서 **유일한 동작 경로**.

검증 위치 (package.json `exports` map 기준):
- `node_modules/expo-file-system/build/legacy/FileSystem.d.ts:64` — `export declare function deleteAsync(fileUri: string, options?: DeletingOptions): Promise<void>`
- `node_modules/expo-file-system/build/legacy/FileSystem.d.ts:13` — `export declare const cacheDirectory: string | null`
- `node_modules/expo-file-system/legacy/` 디렉토리는 디스크에 없음 — `exports` map 으로만 resolve.

## 구현 계획

### `apps/mobile/src/screens/S11PreviewScreen.tsx`

라인 13:

```diff
- import * as FileSystem from 'expo-file-system';
+ import * as FileSystem from 'expo-file-system/legacy';
```

호출부(`handleReRecord` 의 `await FileSystem.deleteAsync(localAudioUri, { idempotent: true })`, line 97) 무변경. `DeletingOptions.idempotent` 는 legacy 모듈에서 동일 시그니처 지원.

### `apps/mobile/src/screens/AccountDeletionScreen.tsx`

라인 31:

```diff
- import * as FileSystem from 'expo-file-system'
+ import * as FileSystem from 'expo-file-system/legacy'
```

호출부(`clearLocalData` 의 `FileSystem.cacheDirectory` 가드 + `FileSystem.deleteAsync(FileSystem.cacheDirectory, { idempotent: true }).catch(...)`, line 119–126) 무변경. `cacheDirectory` 는 legacy 모듈에서 `string | null` 로 동일 export.

## 검증 기준

### 자동 (plan_validation 게이트 — 모두 통과 시 PASS)

| 항목 | 명령 | 기대 결과 |
|---|---|---|
| `expo-file-system/legacy` resolve | `cd /Users/dc.kim/project/jajang && node -e "console.log(require.resolve('expo-file-system/legacy'))"` | exit 0, build 경로 출력 |
| `deleteAsync` 시그니처 존재 | `grep -n "export declare function deleteAsync" node_modules/expo-file-system/build/legacy/FileSystem.d.ts` | 1건 매치 |
| `cacheDirectory` export 존재 | `grep -n "export declare const cacheDirectory" node_modules/expo-file-system/build/legacy/FileSystem.d.ts` | 1건 매치 |
| S11 import 교체 | `grep -c "from 'expo-file-system/legacy'" apps/mobile/src/screens/S11PreviewScreen.tsx` | `1` |
| S11 잔존 root import 0 | `grep -E "from 'expo-file-system'\$\|from \"expo-file-system\"\$" apps/mobile/src/screens/S11PreviewScreen.tsx` | 0건 |
| AccountDeletion import 교체 | `grep -c "from 'expo-file-system/legacy'" apps/mobile/src/screens/AccountDeletionScreen.tsx` | `1` |
| AccountDeletion 잔존 root import 0 | `grep -E "from 'expo-file-system'\$\|from \"expo-file-system\"\$" apps/mobile/src/screens/AccountDeletionScreen.tsx` | 0건 |
| 전체 mobile root import 0 | `grep -rEn "from ['\\\"]expo-file-system['\\\"]" apps/mobile/src` | 0건 (legacy subpath 만 남아야 함) |
| TypeScript 통과 | `cd apps/mobile && npx tsc --noEmit` | exit 0 |
| ESLint 통과 | `cd apps/mobile && npm run lint` | exit 0 |

### 수동 (engineer 디바이스 검증 — 머지 전)

| 항목 | 방법 | 기대 |
|---|---|---|
| 업로드 플로우 | S10 30초 녹음 → S11 "이 목소리로 만들기" | 토스트 미노출, Generating 화면 진입, API 서버 로그에 `PUT /_mock_s3` 도달 |
| 재녹음 정리 | S11 → "다시 녹음" 탭 | logcat 에 deleteAsync deprecation throw 사라짐, S10 정상 진입 |
| 계정 삭제 캐시 정리 | 설정 → 계정 탈퇴 완료 | 캐시 디렉토리 삭제 시도 후 Auth 루트로 reset 정상 |

## 범위 외 (절대 변경 금지)

- `apps/mobile/src/services/api/recordings.ts` — #123 에서 이미 `/legacy` 전환 완료. 본 PR 에서 재수정 금지.
- 호출부 로직 (handleReRecord, clearLocalData, uploadToS3 등) — import 경로 외 무변경.
- 토스트 메시지·에러 핸들러 형식 — 사용자 경험 회귀 방지 위해 유지.
- 다른 SDK·다른 화면의 import.
- `apps/mobile/package.json` 명시 의존성 추가 — 본 issue 와 별개 작업, transitive resolve 동작 확인됨.

---MARKER:LIGHT_PLAN_DONE---
