# Epic 02 — Impl 실행 순서 및 의존성

**Epic**: 02 — 목소리 녹음 & 품질 검증  
**Impl 수**: 8개 (01~08)  
**생성일**: 2026-04-24

---

## 실행 순서

```
01-server-songs-api
        │
        ▼
02-server-recording-upload ──▶ 03-server-quality-check
        │                              │
        │           ┌──────────────────┘
        │           │
        ▼           ▼
04-app-song-select-screen (01 서버 완료 후)
        │
        ▼
05-app-record-mode-screen
        │
        ▼
06-app-record-guide-screen
        │
        ▼
07-app-record-screen
        │
        ▼
08-app-preview-screen (02+03 서버 완료 후 완전 연동)
```

---

## Impl 요약표

| 파일 | depth | 커버 스토리 | 선행 impl | 예상 소요 |
|---|---|---|---|---|
| 01-server-songs-api.md | std | Story 1 (서버) | Epic 01 완료 | 2~3h |
| 02-server-recording-upload.md | std | Story 5 (업로드) | 01 | 3~4h |
| 03-server-quality-check.md | std | Story 5 (SNR + 삭제 스케줄러) | 02 | 3~4h |
| 04-app-song-select-screen.md | std | Story 1 (앱) | Epic01/03, 01서버 | 4~5h |
| 05-app-record-mode-screen.md | std | Story 2 (모드 선택) | 04 | 1~2h |
| 06-app-record-guide-screen.md | std | Story 2 (가이드 + challenge) | 05 | 2~3h |
| 07-app-record-screen.md | std | Story 3 (실시간 녹음) | 06 | 5~6h |
| 08-app-preview-screen.md | std | Story 4+5 (미리듣기 + 검증 + 업로드) | 07, 02, 03 | 5~6h |

**총 예상 소요**: 25~33시간 (1인 주말 개발 기준 3주말)

---

## 병렬 실행 가능 구간

```
[Week 1]
  서버 트랙:  01 → 02 → 03
  앱 트랙:    04 → 05 (01 서버 완료 후 시작)

[Week 2]
  앱 트랙:    06 → 07

[Week 3]
  앱 트랙:    08 (02+03 서버 완료 후 완전 연동)
```

1인 개발이므로 병렬 실행은 참고용. 서버 01~03 먼저 완성 후 앱 연동이 실제 흐름에 적합.

---

## Epic 02 완료 기준 (전체 수용 기준 체크)

### Story 1 — 자장가 선택
- [ ] 6곡 목록 UI (곡명 + 작곡가 + 미리듣기 버튼)
- [ ] 미리듣기: 탭 → 재생, 다시 탭 → 정지 (동시 2곡 재생 불가)
- [ ] 곡 선택 → 앰버 테두리 + CTA 활성화
- [ ] CTA 탭 → S08 RecordMode 이동
- [ ] 무료 유저 3/3 소진 → UpgradeSheet variant=generation_exhausted

### Story 2 — 녹음 모드 선택 & 가이드
- [ ] S08: 허밍/쉿 카드 UI + 탭 즉시 S09 이동
- [ ] S09: 가이드 3항목 + challenge-response 문구 (서버 랜덤)
- [ ] S09: 마이크 권한 요청 → 허용: S10 / 거부: 설정 이동 안내

### Story 3 — 실시간 녹음
- [ ] 3초 카운트다운 자동 시작
- [ ] 실시간 음량 파형 시각화 (100ms 주기)
- [ ] 타이머 표시 (경과/최대 60초)
- [ ] 30초 미만 종료: 연장 유도 다이얼로그
- [ ] 60초 도달: 자동 종료 + S11 이동
- [ ] 무음 10초 이상: 경고 텍스트 노출

### Story 4 — 녹음 미리듣기
- [ ] 정적 파형 + 재생/일시정지 컨트롤
- [ ] "다시 녹음할게요" → 로컬 파일 삭제 + S10 초기화
- [ ] "이 목소리로 만들기" → Story 5 품질 검증 시작

### Story 5 — 샘플 품질 검증
- [ ] 클라이언트 1차: 길이/음량/클리핑 검증
- [ ] S3 업로드 (presigned PUT URL 방식)
- [ ] 서버 2차: SNR 검증 (POST /recordings/{id}/validate)
- [ ] 검증 실패 유형별 안내 메시지 (too_quiet, snr_too_low, clipping)
- [ ] 검증 통과 → Generating 화면 이동 (Epic 03 연동 placeholder)
- [ ] Celery Beat 24h 삭제 스케줄러 동작 확인

---

## 다음 에픽 의존성

Epic 03 (AI 생성) 시작 전 필요:
- `voice_samples` 테이블 + `/recordings/` 엔드포인트 — 업로드 완료 sample_id 필요
- `selectedSongKey` (RecordingSlice) — generations/init song_key 파라미터
- `uploadedSampleId` (RecordingSlice) — generations/start 연동

---

## 신규 파일 목록 (engineer 참조용)

### 서버 (`apps/api/`)
```
app/api/v1/songs.py
app/api/v1/recordings.py
app/api/v1/challenges.py
app/schemas/songs.py
app/schemas/recordings.py
app/services/songs_service.py
app/services/recording_service.py
app/services/quality_check_service.py
app/models/voice_sample.py
app/tasks/cleanup.py
app/migrations/versions/002_voice_samples.py
```

### 앱 (`apps/mobile/`)
```
src/screens/SongSelectScreen.tsx
src/screens/RecordModeScreen.tsx
src/screens/RecordGuideScreen.tsx
src/screens/RecordScreen.tsx
src/screens/PreviewScreen.tsx
src/components/SongListItem.tsx
src/components/WaveformVisualizer.tsx   (신규 + 수정)
src/services/api/songs.ts
src/services/api/recordings.ts
src/services/api/challenges.ts
src/store/recordingSlice.ts
src/utils/audio-quality.ts
src/navigation/types.ts                 (수정 — 신규 screen 타입 추가)
```
