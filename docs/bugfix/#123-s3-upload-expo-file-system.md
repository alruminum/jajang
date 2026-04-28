---
depth: simple
---
# impl: #123 S3 업로드 실패 — fetch + Blob → expo-file-system uploadAsync 전환

## Overview

**증상**: S11PreviewScreen "이 목소리로 만들기" 탭 시 "파일 업로드에 실패했어요. 다시 시도해주세요" 토스트.
**근본 원인**: `apps/mobile/src/services/api/recordings.ts:45-46` 의 `await fetch(file://...)`가 React Native(Hermes) + Expo Bare 환경에서 신뢰성 있게 동작하지 않음 → Blob이 비거나 fetch 자체가 reject → 후속 PUT이 non-2xx → `S3 upload failed` throw.
**해결**: `expo-file-system` 의 `uploadAsync(presignedUrl, fileUri, { httpMethod: 'PUT', uploadType: BINARY_CONTENT, headers })` 으로 전환. fileUri를 native가 직접 스트림 업로드 → Blob 우회.

## Depth 판정 근거: `simple`

- 단일 함수 (`uploadToS3`) 내부 구현만 교체. 시그니처·반환 타입·throw 메시지 형식 모두 유지.
- 호출부 (`S11PreviewScreen.tsx:153`) 무변경.
- DOM/문구/testid 변경 없음.
- `recordings.ts`/`uploadToS3`를 assertion 하는 `__tests__` 파일 없음 (`grep -rn "recordings\|uploadToS3" apps/mobile/src/__tests__` → 0건). 회귀 테스트 변경 불필요.
- depth: simple — TDD 선행 미요구. 기존 구조 수정.

## 영향 파일

| 파일 | 변경 유형 |
|---|---|
| `apps/mobile/src/services/api/recordings.ts` | `uploadToS3` 본문 교체 + JSDoc 주석 갱신 |

> `expo-file-system@55.0.17` 은 워크스페이스 루트 (`/Users/dc.kim/project/jajang/node_modules/expo-file-system/`) 에 호이스팅으로 존재하며 다른 화면(`S11PreviewScreen.tsx:13`, `AccountDeletionScreen.tsx:31`)에서 이미 동일 패턴으로 import 중. `apps/mobile/package.json` deps에 명시 선언은 없으나 expo SDK 55 transitive 의존으로 안정적으로 호이스팅됨 — **본 impl은 기존 패턴과 동일한 가용성 보장에 의존하며 새 위험을 추가하지 않는다**. 명시 의존성 선언 (`npx expo install expo-file-system`) 은 본 issue 와 동기·해결방법 모두 다른 별개 작업 → 본 #123 범위 외, 후속 issue로 분리.

## 구현 계획

### `apps/mobile/src/services/api/recordings.ts`

상단 import 블록에 추가:
```ts
import * as FileSystem from 'expo-file-system/legacy'
```

> **`/legacy` subpath 강제 사유 (정확)** — SDK 55의 `expo-file-system` 루트 모듈은 `uploadAsync` 를 `legacyWarnings` 로 **재-export 하지만, 호출 시 `@deprecated` 런타임 throw** 한다 (`node_modules/expo-file-system/build/legacyWarnings.d.ts:55-57`: *"@deprecated Import this method from `expo-file-system/legacy`. This method will throw in runtime."*). 또한 enum `FileSystemUploadType` 은 루트에서 type-only 의존이며 값으로 re-export 되지 않으므로 `BINARY_CONTENT` 상수 자체가 루트 import로는 접근 불가. 따라서 `import * as FileSystem from 'expo-file-system/legacy'` 는 "선호"가 아니라 **런타임 동작 + 타입 모두를 위해 유일한 정답**이다. 루트 `expo-file-system` import (`S11PreviewScreen.tsx:13`, `AccountDeletionScreen.tsx:31`) 와 경로 불일치는 본 issue 범위 밖 — 본 함수는 반드시 `/legacy`.

`uploadToS3` 함수 본문 (현재 40~55라인) 교체:

```ts
/**
 * S3 presigned PUT URL로 파일 직접 업로드.
 * axios 인터셉터(JWT) 우회 — presigned URL은 S3로 직접 전송.
 * file:// URI 업로드는 expo-file-system 사용 (RN/Hermes의 fetch+Blob이 file:// 미지원).
 */
uploadToS3: async (
  presignedUrl: string,
  fileUri: string,
  contentType: string,
): Promise<void> => {
  const result = await FileSystem.uploadAsync(presignedUrl, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  })
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`S3 upload failed: ${result.status}`)
  }
},
```

### 변경 요점

- `fetch(fileUri)` + `.blob()` 제거 → `FileSystem.uploadAsync` 한 번 호출로 native가 file:// 경로를 직접 읽어 PUT.
- `uploadType: BINARY_CONTENT` — 파일 raw 바이트를 PUT body로 전송 (multipart 아님). presigned PUT은 raw body 요구.
- `headers: { 'Content-Type': contentType }` — 기존 동작 유지. presigned URL이 Content-Type 헤더와 함께 서명됐을 가능성에 대비.
- 결과는 `{ status, body, headers }` 객체. status 2xx 외엔 기존과 동일 메시지 (`S3 upload failed: ${status}`)로 throw → S11PreviewScreen catch 블록의 토스트 표시 로직 무변경.
- 함수 시그니처(`Promise<void>`)·반환·throw 형식 동일 → 호출부 영향 없음.

### 검증 시 engineer 확인 사항

- import 경로는 반드시 `expo-file-system/legacy`. 루트 `expo-file-system` 모듈은 `uploadAsync` 를 `legacyWarnings` 로 재-export 하지만 **런타임에 throw** 하며, `FileSystemUploadType` enum 은 루트에서 값으로 노출되지 않는다.
- 정확한 typedef 위치 (package.json `exports` 맵 기준):
  - `node_modules/expo-file-system/build/legacy/FileSystem.d.ts:149` — `uploadAsync(url, fileUri, options): Promise<FileSystemUploadResult>`
  - `node_modules/expo-file-system/build/legacy/FileSystem.types.d.ts:18-22` — `enum FileSystemUploadType { BINARY_CONTENT = 0, MULTIPART = 1 }`
  - 루트 `node_modules/expo-file-system/legacy/` 디렉토리는 **존재하지 않는다** (오직 package.json `exports` 맵으로만 resolve). 디렉토리 경로 직접 검사 금지 → 위 `build/legacy/...` 경로로 확인.
- 다른 화면 root `'expo-file-system'` import는 본 impl 범위 외 — uploadAsync 미사용이므로 런타임 throw 영향 없음.
- `tsc --noEmit` 통과 확인.

## 검증 기준

### 자동 (plan_validation 게이트 — 모두 통과 시 PASS)

| 항목 | 명령 | 기대 결과 |
|---|---|---|
| `expo-file-system/legacy` resolve 가능 | `cd /Users/dc.kim/project/jajang && node -e "console.log(require.resolve('expo-file-system/legacy'))"` | `node_modules/expo-file-system/src/legacy/index.ts` (또는 build 경로) 출력, exit 0 |
| `FileSystemUploadType.BINARY_CONTENT` 값 존재 | `grep -n "BINARY_CONTENT = 0" node_modules/expo-file-system/build/legacy/FileSystem.types.d.ts` | 1건 매치, exit 0 |
| `uploadAsync` 시그니처 존재 | `grep -n "export declare function uploadAsync" node_modules/expo-file-system/build/legacy/FileSystem.d.ts` | 1건 매치, exit 0 |
| `recordings.ts` 에 새 import 정확히 추가 | `grep -c "from 'expo-file-system/legacy'" apps/mobile/src/services/api/recordings.ts` | `1` |
| 기존 `fetch(fileUri)` 패턴 제거 | `grep -c "fetch(fileUri)" apps/mobile/src/services/api/recordings.ts` | `0` |
| 함수 시그니처 보존 | `grep -n "uploadToS3:" apps/mobile/src/services/api/recordings.ts` | `Promise<void>` 반환, 인자 3개(`presignedUrl, fileUri, contentType`) 순서 동일 |
| TypeScript 타입 오류 없음 | `cd apps/mobile && npx tsc --noEmit` | exit 0 |
| ESLint 통과 | `cd apps/mobile && npm run lint` | exit 0 |
| 영향 범위 한정 | `grep -rn "uploadToS3" apps/mobile/src/` | `S11PreviewScreen.tsx:153` + `recordings.ts` 정의 1곳, 총 2 hits 이내 |

### 수동 (engineer 디바이스 검증 — 머지 전)

| 항목 | 방법 |
|---|---|
| iOS 시뮬레이터: 녹음 → 업로드 → S3 200 | S10 → S11 → "이 목소리로 만들기" → Generating 화면 진입 |
| Android 에뮬레이터/실기기 동일 플로우 | iOS 동일 |
| 401/403/네트워크 단절 시 토스트 | 기존 catch 블록이 "파일 업로드에 실패했어요" 표시 (메시지 형식 무변경) |

## 범위 외 (절대 변경 금지)

- `S11PreviewScreen.tsx` — 호출부, 에러 메시지, 토스트 로직.
- `recordingsApi` 의 다른 메서드 (`initUpload`, `completeUpload`, `validateSample`).
- 서버측 presigned URL 생성 로직.
- 다른 화면의 `expo-file-system` 사용처.
