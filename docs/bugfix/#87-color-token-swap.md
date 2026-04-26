---
depth: simple
---
# bugfix/#87 — hex 색상 일괄 교체 (amber → sage)

**이슈**: #87
**레이블**: bug, v01
**범위**: `apps/mobile/src/**` 내 하드코딩 hex 문자열 교체. 신규 파일·모듈·의존성 추가 없음.

---

## 결정 근거

중앙 토큰 파일 도입은 별도 에픽으로 분리한다.
이번 작업은 디자이너 색상 변경(amber `#F5C97A` → sage `#82B090`)의 즉각 반영만 처리한다.
"지금 바꿀 것"과 "나중에 설계할 것"을 같은 PR에 묶으면 검증 범위가 커지고 롤백 단위가 깨진다.

---

## 수정 대상 파일 (33개)

> `grep -ri "F5C97A" apps/mobile/src` 기준 32개 + `#E8A94A` 추가 파일 1개.

```
apps/mobile/src/screens/S02PrivacyScreen.tsx
apps/mobile/src/screens/S03OnboardingScreen.tsx
apps/mobile/src/screens/S04SignupScreen.tsx
apps/mobile/src/screens/S05LoginScreen.tsx
apps/mobile/src/screens/S06HomeScreen.tsx
apps/mobile/src/screens/S07SongSelectScreen.tsx
apps/mobile/src/screens/S10RecordScreen.tsx
apps/mobile/src/screens/S11PreviewScreen.tsx
apps/mobile/src/screens/S12GeneratingScreen.tsx
apps/mobile/src/screens/S13PlayScreen.tsx
apps/mobile/src/screens/S14UpgradeSheet.tsx
apps/mobile/src/screens/S15SubscribeScreen.tsx
apps/mobile/src/screens/S16SettingsScreen.tsx
apps/mobile/src/screens/S17TrialExpiredScreen.tsx
apps/mobile/src/screens/AccountDeletionScreen.tsx
apps/mobile/src/screens/LegalScreen.tsx
apps/mobile/src/screens/RecordScreen.tsx
apps/mobile/src/screens/RecordGuideScreen.tsx
apps/mobile/src/screens/RecordModeScreen.tsx
apps/mobile/src/components/CompletedTrackCard.tsx
apps/mobile/src/components/DeleteTracksSheet.tsx
apps/mobile/src/components/EmptyTrackState.tsx
apps/mobile/src/components/MiniPlayer.tsx
apps/mobile/src/components/SongListItem.tsx
apps/mobile/src/components/TimerBottomSheet.tsx
apps/mobile/src/components/TrackCard.tsx
apps/mobile/src/components/TrialBadge.tsx
apps/mobile/src/components/TrialExpiryBanner.tsx
apps/mobile/src/components/VolumeSlider.tsx
apps/mobile/src/components/WaveformVisualizer.tsx
apps/mobile/src/hooks/useBackNavigation.tsx
apps/mobile/src/navigation/MainNavigator.tsx
apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx
```

---

## 교체 매핑

| 기존 값 | 교체 값 | 비고 |
|---|---|---|
| `#F5C97A` | `#82B090` | amber accent → sage accent (대문자) |
| `#f5c97a` | `#82b090` | 소문자 변형 |
| `#F5C97A22` | `#82B09022` | 14% 투명도 (hex AA = 약 13.7%) |
| `#F5C97A33` | `#82B09033` | 20% 투명도 변형 (있으면 교체) |
| `#F5C97A44` | `#82B09044` | 27% 투명도 변형 (있으면 교체) |
| `#F5C97A55` | `#82B09055` | 33% 투명도 변형 (있으면 교체) |
| `#E8A94A` | `#5A8A6A` | 보조 amber → 보조 sage |
| `#e8a94a` | `#5a8a6a` | 소문자 변형 |
| `rgba(245, 201, 122,` | `rgba(130, 176, 144,` | rgba 형식 amber RGB → sage RGB (alpha 유지) |

> 투명도 2자리(`22` / `33` / `44` / `55`)는 현재 코드베이스에서 `#F5C97A22` 패턴이 grep 0건 확인됨.
> 그러나 향후 추가 가능성을 대비해 매핑 명시. `#E8A94A`는 S10, S11, RecordScreen, DeleteTracksSheet 4개 파일에서 확인됨.
> `rgba(245, 201, 122, ...)` 형식은 TrialExpiryBanner.tsx(L45,L48), TrialBadge.tsx(L28,L34) 4건 확인됨.
> 치환 공식: `#82B090` = R:130(0x82) G:176(0xB0) B:144(0x90). RGB 부분만 교체하고 쉼표 이후 alpha는 그대로 유지.

---

## 구현 레시피 (sed)

engineer는 아래 순서로 실행한다. 프로젝트 루트(`/Users/dc.kim/project/jajang`)에서 실행.

```bash
# 1. 대문자 단순 교체 (#F5C97A → #82B090)
#    투명도 변형(22/33/44/55)이 없음을 grep으로 먼저 확인했으므로
#    기본 6자리만 교체해도 안전. 만약 변형이 있다면 더 긴 패턴이 먼저 매칭되므로
#    8자리 패턴을 6자리 패턴보다 앞에 실행한다.

# 1a. 8자리 변형 먼저 (있으면 교체, 없으면 무해)
LC_ALL=C sed -i '' 's/#F5C97A22/#82B09022/g; s/#F5C97A33/#82B09033/g; s/#F5C97A44/#82B09044/g; s/#F5C97A55/#82B09055/g' \
  apps/mobile/src/screens/S02PrivacyScreen.tsx \
  apps/mobile/src/screens/S03OnboardingScreen.tsx \
  apps/mobile/src/screens/S04SignupScreen.tsx \
  apps/mobile/src/screens/S05LoginScreen.tsx \
  apps/mobile/src/screens/S06HomeScreen.tsx \
  apps/mobile/src/screens/S07SongSelectScreen.tsx \
  apps/mobile/src/screens/S10RecordScreen.tsx \
  apps/mobile/src/screens/S11PreviewScreen.tsx \
  apps/mobile/src/screens/S12GeneratingScreen.tsx \
  apps/mobile/src/screens/S13PlayScreen.tsx \
  apps/mobile/src/screens/S14UpgradeSheet.tsx \
  apps/mobile/src/screens/S15SubscribeScreen.tsx \
  apps/mobile/src/screens/S16SettingsScreen.tsx \
  apps/mobile/src/screens/S17TrialExpiredScreen.tsx \
  apps/mobile/src/screens/AccountDeletionScreen.tsx \
  apps/mobile/src/screens/LegalScreen.tsx \
  apps/mobile/src/screens/RecordScreen.tsx \
  apps/mobile/src/screens/RecordGuideScreen.tsx \
  apps/mobile/src/screens/RecordModeScreen.tsx \
  apps/mobile/src/components/CompletedTrackCard.tsx \
  apps/mobile/src/components/DeleteTracksSheet.tsx \
  apps/mobile/src/components/EmptyTrackState.tsx \
  apps/mobile/src/components/MiniPlayer.tsx \
  apps/mobile/src/components/SongListItem.tsx \
  apps/mobile/src/components/TimerBottomSheet.tsx \
  apps/mobile/src/components/TrackCard.tsx \
  apps/mobile/src/components/TrialBadge.tsx \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/VolumeSlider.tsx \
  apps/mobile/src/components/WaveformVisualizer.tsx \
  apps/mobile/src/hooks/useBackNavigation.tsx \
  apps/mobile/src/navigation/MainNavigator.tsx \
  apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx

# 1b. 6자리 대문자 교체
LC_ALL=C sed -i '' 's/#F5C97A/#82B090/g' \
  apps/mobile/src/screens/S02PrivacyScreen.tsx \
  apps/mobile/src/screens/S03OnboardingScreen.tsx \
  apps/mobile/src/screens/S04SignupScreen.tsx \
  apps/mobile/src/screens/S05LoginScreen.tsx \
  apps/mobile/src/screens/S06HomeScreen.tsx \
  apps/mobile/src/screens/S07SongSelectScreen.tsx \
  apps/mobile/src/screens/S10RecordScreen.tsx \
  apps/mobile/src/screens/S11PreviewScreen.tsx \
  apps/mobile/src/screens/S12GeneratingScreen.tsx \
  apps/mobile/src/screens/S13PlayScreen.tsx \
  apps/mobile/src/screens/S14UpgradeSheet.tsx \
  apps/mobile/src/screens/S15SubscribeScreen.tsx \
  apps/mobile/src/screens/S16SettingsScreen.tsx \
  apps/mobile/src/screens/S17TrialExpiredScreen.tsx \
  apps/mobile/src/screens/AccountDeletionScreen.tsx \
  apps/mobile/src/screens/LegalScreen.tsx \
  apps/mobile/src/screens/RecordScreen.tsx \
  apps/mobile/src/screens/RecordGuideScreen.tsx \
  apps/mobile/src/screens/RecordModeScreen.tsx \
  apps/mobile/src/components/CompletedTrackCard.tsx \
  apps/mobile/src/components/DeleteTracksSheet.tsx \
  apps/mobile/src/components/EmptyTrackState.tsx \
  apps/mobile/src/components/MiniPlayer.tsx \
  apps/mobile/src/components/SongListItem.tsx \
  apps/mobile/src/components/TimerBottomSheet.tsx \
  apps/mobile/src/components/TrackCard.tsx \
  apps/mobile/src/components/TrialBadge.tsx \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/VolumeSlider.tsx \
  apps/mobile/src/components/WaveformVisualizer.tsx \
  apps/mobile/src/hooks/useBackNavigation.tsx \
  apps/mobile/src/navigation/MainNavigator.tsx \
  apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx

# 1c. 소문자 변형 교체
LC_ALL=C sed -i '' 's/#f5c97a22/#82b09022/g; s/#f5c97a33/#82b09033/g; s/#f5c97a44/#82b09044/g; s/#f5c97a55/#82b09055/g; s/#f5c97a/#82b090/g' \
  apps/mobile/src/screens/S02PrivacyScreen.tsx \
  apps/mobile/src/screens/S03OnboardingScreen.tsx \
  apps/mobile/src/screens/S04SignupScreen.tsx \
  apps/mobile/src/screens/S05LoginScreen.tsx \
  apps/mobile/src/screens/S06HomeScreen.tsx \
  apps/mobile/src/screens/S07SongSelectScreen.tsx \
  apps/mobile/src/screens/S10RecordScreen.tsx \
  apps/mobile/src/screens/S11PreviewScreen.tsx \
  apps/mobile/src/screens/S12GeneratingScreen.tsx \
  apps/mobile/src/screens/S13PlayScreen.tsx \
  apps/mobile/src/screens/S14UpgradeSheet.tsx \
  apps/mobile/src/screens/S15SubscribeScreen.tsx \
  apps/mobile/src/screens/S16SettingsScreen.tsx \
  apps/mobile/src/screens/S17TrialExpiredScreen.tsx \
  apps/mobile/src/screens/AccountDeletionScreen.tsx \
  apps/mobile/src/screens/LegalScreen.tsx \
  apps/mobile/src/screens/RecordScreen.tsx \
  apps/mobile/src/screens/RecordGuideScreen.tsx \
  apps/mobile/src/screens/RecordModeScreen.tsx \
  apps/mobile/src/components/CompletedTrackCard.tsx \
  apps/mobile/src/components/DeleteTracksSheet.tsx \
  apps/mobile/src/components/EmptyTrackState.tsx \
  apps/mobile/src/components/MiniPlayer.tsx \
  apps/mobile/src/components/SongListItem.tsx \
  apps/mobile/src/components/TimerBottomSheet.tsx \
  apps/mobile/src/components/TrackCard.tsx \
  apps/mobile/src/components/TrialBadge.tsx \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/VolumeSlider.tsx \
  apps/mobile/src/components/WaveformVisualizer.tsx \
  apps/mobile/src/hooks/useBackNavigation.tsx \
  apps/mobile/src/navigation/MainNavigator.tsx \
  apps/mobile/src/__tests__/screens/S08RecordModeScreen.test.tsx

# 2. #E8A94A 교체 (4개 파일에서 확인됨 + DeleteTracksSheet 추가)
LC_ALL=C sed -i '' 's/#E8A94A/#5A8A6A/g; s/#e8a94a/#5a8a6a/g' \
  apps/mobile/src/screens/S10RecordScreen.tsx \
  apps/mobile/src/screens/S11PreviewScreen.tsx \
  apps/mobile/src/screens/RecordScreen.tsx \
  apps/mobile/src/components/DeleteTracksSheet.tsx

# 3. rgba(245, 201, 122, ...) 교체 — TrialExpiryBanner, TrialBadge
#    alpha 값(0.1 / 0.15 / 0.25 / 0.3)은 그대로 유지, RGB 부분만 교체
LC_ALL=C sed -i '' 's/rgba(245, 201, 122,/rgba(130, 176, 144,/g' \
  apps/mobile/src/components/TrialExpiryBanner.tsx \
  apps/mobile/src/components/TrialBadge.tsx
```

---

## 검증

교체 후 아래 명령으로 잔존 여부를 확인한다. 모두 0건이어야 통과.

```bash
# F5C97A 잔존 확인 (대소문자 무시) — hex 형식
echo "=== F5C97A 잔존 (hex) ==="
grep -ri "F5C97A" apps/mobile/src/ | wc -l
# 기대값: 0

# E8A94A 잔존 확인
echo "=== E8A94A 잔존 ==="
grep -ri "E8A94A" apps/mobile/src/ | wc -l
# 기대값: 0

# rgba(245, 201, 122, ...) 잔존 확인 — FAIL-2 보완: rgba 형식 별도 탐지
echo "=== rgba amber 잔존 ==="
grep -r "rgba(245" apps/mobile/src/ | grep "201, 122" | wc -l
# 기대값: 0

# 교체된 색상이 존재하는지 확인 (sanity check)
echo "=== 82B090 존재 확인 (0보다 커야 정상) ==="
grep -ri "82B090\|82b090" apps/mobile/src/ | wc -l

echo "=== rgba sage 존재 확인 (0보다 커야 정상) ==="
grep -r "rgba(130, 176, 144," apps/mobile/src/ | wc -l
```

---

## 주의사항

- **tsconfig.json / babel.config.js 수정 금지** — path alias 변경 없음
- **package.json 수정 금지** — 새 의존성 없음
- **새 파일 생성 금지** — 토큰 모듈 신설은 이 PR 범위 밖
- **테스트 파일 포함** — `S08RecordModeScreen.test.tsx`에도 `#F5C97A` 잔존 확인됨. 테스트 assertion 색상도 동일하게 교체. DOM/텍스트 assertion 변경이 아닌 색상 리터럴 변경이므로 depth: simple 유지.
- `DeleteTracksSheet.tsx`는 최초 grep(`F5C97A`) 결과 32개에 포함되지 않았으나 `#E8A94A`를 포함하여 총 33개 파일 대상.
- **App.tsx 제외**: `apps/mobile/App.tsx`는 `F5C97A` grep 결과에 포함되지 않음 — 해당 파일은 수정 대상 아님.
