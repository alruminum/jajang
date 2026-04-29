---
depth: std
---

# impl/11 — 자산: 가사 데이터 + BGM 트랙 매핑 — #133

**Epic**: 02 — 목소리 녹음 & 품질 검증
**커버 스토리**: Story 2/3 자산 (가사 텍스트 + BGM 곡→URL 매핑)
**선행 조건**: 없음 (가장 먼저 구현)
**이슈**: #133
**예상 소요**: 1~2시간

---

## 1. 생성/수정할 파일 목록

```
apps/mobile/src/data/
├── lyrics.ts                          [신규 — 6곡 한국어 가사 상수]
└── bgmTracks.ts                       [신규 — SONG_NAMES wrapper, BGM 트랙 lookup]
apps/mobile/src/services/songs.ts      [수정 — twinkle title 표기 정정]
```

---

## 2. 설계 결정

### 번들 포함 vs 서버 API

가사 데이터는 앱 번들에 TypeScript 상수로 포함. 이유:
- 6곡 전체 가사 텍스트 용량 수 KB 미만 — 번들 크기 영향 무시 가능
- 앱 오픈 즉시 동기 접근 (S09 화면에서 로딩 스피너 없음)
- 서버 API 의존성 없음 → 오프라인에서도 가사 표시 가능
- 가사 변경은 앱 업데이트 주기와 동일 (MVP에서 허용 가능)

### 곡명 SSOT: 서버 `title_ko` → `SONG_NAMES` 한 곳

곡명(한국어)의 권위 소스 순위는 다음과 같이 한다:
1. **서버 `title_ko`** — `apps/api/app/services/songs_service.py` `SongMeta(...)` (운영 SSOT)
2. **클라이언트 미러: `SONG_NAMES`** — `apps/mobile/src/services/songs.ts:4` (서버 fetch 전 화면 즉시 표시용 캐시)
3. 그 외 컴포넌트(`MiniPlayer`, `CompletedTrackCard`, `S06HomeScreen`, `S13PlayScreen`, `AudioEngine`, `DeleteTracksSheet`) 는 모두 (2)를 import 해서 사용한다.

따라서 본 impl에서 **새 곡명 매핑 객체를 만들지 않는다**. `bgmTracks.ts`는 `SONG_NAMES` 를 import 해 wrapper helper만 제공한다. `LYRICS` entry 도 `titleKo` 를 자체 보관하지 않고 lookup 시점에 `SONG_NAMES` 에서 조합한다 (drift 방지).

### twinkle 표기 정정 (선행 작업)

현재 상태:
- 서버 `title_ko = '반짝반짝 작은 별'` (`apps/api/app/services/songs_service.py:24`)
- `tracks_service.py:31`, `DeleteTracksSheet.tsx:77` 도 `'반짝반짝 작은 별'`
- **drift**: `apps/mobile/src/services/songs.ts:8` `twinkle: 'Twinkle Twinkle'`

본 impl은 SONG_NAMES 를 곡명 SSOT 로 승격시키므로 `'반짝반짝 작은 별'` 로 정정한다. `CompletedTrackCard.test.tsx:40` 의 기대값(`['twinkle', 'Twinkle Twinkle']`)도 함께 갱신.

### BGM 자산: songKey → 런타임 URL

BGM 음원 자체는 `songsApi.getPreviewUrl(songKey)` 로 런타임에 획득 (presigned URL 만료). `bgmTracks.ts` 는 곡명 lookup helper 만 보관 — 별도 BGM 전용 엔드포인트 / 매핑 객체 불필요.

---

## 3. lyrics.ts 스키마

곡명은 보관하지 않는다 (SONG_NAMES SSOT). `lines` 만 매핑.

```typescript
// apps/mobile/src/data/lyrics.ts

export interface LyricEntry {
  lines: string[]           // 1절 4~6줄
}

export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye'

export const LYRICS: Record<SongKey, LyricEntry> = {
  brahms: {
    lines: [
      '잘 자라 우리 아기',
      '앞뜰과 뒷동산에',
      '새들도 양들도',
      '모두 자는데',
      '달님은 영창으로',
      '은구슬 금구슬을',
    ],
  },
  hush: {
    lines: [
      '쉿 아가야 울지 마',
      '엄마가 작은 새를 사줄게',
      '새가 노래 못 하면',
      '반짝이는 반지를 사줄게',
      '아가야 잘 자렴',
      '엄마가 곁에 있어',
    ],
  },
  mozart: {
    lines: [
      '잘 자라 내 아기',
      '달빛 아래 포근히',
      '엄마 품에 안겨서',
      '달콤하게 꿈꾸렴',
      '아침이 올 때까지',
      '평온히 잠들어',
    ],
  },
  schubert: {
    lines: [
      '잠들어라 내 아기',
      '별빛이 가득한 밤',
      '천사들이 지켜보며',
      '꿈을 선물해줄 거야',
      '고요한 밤 속에서',
      '포근히 잠들어라',
    ],
  },
  twinkle: {
    lines: [
      '반짝반짝 작은 별',
      '아름답게 빛나네',
      '동쪽 하늘에서도',
      '서쪽 하늘에서도',
      '반짝반짝 작은 별',
      '아름답게 빛나네',
    ],
  },
  rockabye: {
    lines: [
      '자장자장 아가야',
      '나뭇가지 위에서',
      '바람이 살랑살랑',
      '요람이 흔들리네',
      '가지가 부러지면',
      '엄마가 받아줄게',
    ],
  },
}

export function getLyrics(songKey: string): LyricEntry | null {
  return (LYRICS as Record<string, LyricEntry>)[songKey] ?? null
}
```

호출부에서 곡명이 필요한 경우 `SONG_NAMES[songKey]` 를 함께 사용한다.

---

## 4. bgmTracks.ts 스키마 (SONG_NAMES wrapper)

신규 매핑 객체를 만들지 않고 `SONG_NAMES` 를 lookup 한다.

```typescript
// apps/mobile/src/data/bgmTracks.ts

import { SONG_NAMES } from '@services/songs'

export type SongKey = 'brahms' | 'hush' | 'mozart' | 'schubert' | 'twinkle' | 'rockabye'

export interface BgmTrackMeta {
  titleKo: string   // S10 BGM chip 등 화면 표시용 — SONG_NAMES SSOT 에서 lookup
}

export function getBgmTrackMeta(songKey: string): BgmTrackMeta | null {
  const titleKo = SONG_NAMES[songKey]
  return titleKo ? { titleKo } : null
}
```

설계 이유:
- 곡명 매핑을 `SONG_NAMES` 한 곳으로 단일화 — drift 발생 지점 0
- Story 2 task("BGM 트랙 메타 모듈 신규 생성") 충족 (파일 + helper 존재)
- BGM URL 은 `songsApi.getPreviewUrl(songKey)` 가 별도로 제공 — 본 모듈 책임 아님

---

## 4-1. songs.ts twinkle 표기 정정

```diff
 export const SONG_NAMES: Record<string, string> = {
   brahms: '브람스 자장가',
   mozart: '모차르트 자장가',
   schubert: '슈베르트 자장가',
-  twinkle: 'Twinkle Twinkle',
+  twinkle: '반짝반짝 작은 별',
   rockabye: 'Rock-a-bye Baby',
   hush: 'Hush Little Baby',
 };
```

테스트 동기화: `apps/mobile/src/__tests__/components/CompletedTrackCard.test.tsx:40` 기대값을 `['twinkle', '반짝반짝 작은 별']` 로 수정.

---

## 5. 가사 텍스트 확정 원칙

**저작권**: 6곡 모두 저작권 만료(Public Domain) 원곡 한국어 번안. 번안 가사는 직접 작성한 것으로 별도 저작권 귀속 없음. PRD §F5 참조.

**가사 줄 수**: 4~6줄 (PRD §F2 명세). 현재 초안은 6줄. 출시 전 최종 검수 필요.

**fallback 안전망**: `getLyrics(songKey) === null` 케이스 — S09/S10에서 가사 박스 숨김 + "허밍해 주세요" 텍스트. 6곡 모두 매핑되어 있으므로 실제 발생하지 않으나 코드 방어 처리 유지.

---

## 6. 수용 기준

- [ ] `getLyrics('brahms')` → { lines } 반환 (6줄)
- [ ] `getLyrics('hush')` → { lines } 반환 (6줄)
- [ ] `getLyrics('mozart')` → { lines } 반환 (6줄)
- [ ] `getLyrics('schubert')` → { lines } 반환 (6줄)
- [ ] `getLyrics('twinkle')` → { lines } 반환 (6줄)
- [ ] `getLyrics('rockabye')` → { lines } 반환 (6줄)
- [ ] `getLyrics('unknown_key')` → null 반환
- [ ] `getBgmTrackMeta('brahms')` → { titleKo: '브람스 자장가' } 반환
- [ ] `getBgmTrackMeta('twinkle')` → { titleKo: '반짝반짝 작은 별' } 반환
- [ ] `getBgmTrackMeta('unknown')` → null 반환
- [ ] `SONG_NAMES.twinkle === '반짝반짝 작은 별'` (서버 title_ko 와 일치)
- [ ] `CompletedTrackCard.test.tsx` twinkle 기대값 갱신 후 통과

---

## 7. 주의사항

- `SongKey` 타입이 `lyrics.ts` 와 `bgmTracks.ts` 두 파일에 중복 선언됨. V2에서 공통 타입 파일(`src/data/types.ts`)로 추출 고려. MVP에서는 중복 허용 (두 파일 간 import 순환 방지 목적).
- 가사 텍스트는 1차 초안이므로 출시 전 UX/카피 검수 필요. engineer는 초안 그대로 구현 후 텍스트 변경은 데이터 파일만 수정하면 됨.
- twinkle 표기 정정은 `SONG_NAMES` 를 import 하는 모든 화면(`MiniPlayer`, `CompletedTrackCard`, `S06HomeScreen`, `S13PlayScreen`, `AudioEngine`, `DeleteTracksSheet`) 에 자동 반영된다 — 호출부 추가 수정 불필요. 단 스냅샷/렌더 테스트가 있으면 갱신 필요 (현재 확인된 곳: `CompletedTrackCard.test.tsx:40`).
