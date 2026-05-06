# QA Tour 산출물

`mobile-qa-tour` 패키지가 생성하는 monkey + tour 리포트의 출력 디렉토리.

## 실행

```bash
cd apps/mobile

# 1) random monkey crash hunting
npm run qa:monkey                 # 1000 events, crash 0 검증

# 2) driven screenshot tour
npm run qa:tour                   # 6 화면 (S11 제외) screenshot + heuristics
```

## LLM 검수 (메인 Claude)

`<date>-tour/<screenId>.md` 의 `<!-- LLM REVIEW HERE -->` 슬롯 채우기:

1. screenshot Read (멀티모달)
2. `docs/ux-flow.md` §<screenId> read 후 비교
3. (S10) `mcp__pencil__get_screenshot(<nodeIds>)` reference 캡처 첨부
4. P0/P1 issue 발견 시 `mcp__github__create_issue` (label: `bug`, `design` + 현재 버전)

### S10 Pencil reference 채우기

1. `docs/qa/<date>-tour/S10.md` 의 `<!-- pencil ref slot ... -->` 슬롯 위치 확인
2. 메인 Claude 에서:
   ```
   mcp__pencil__batch_get({ filePath: '../../design/jajang.pen', nodeIds: ['llTp1', 'r97aM'] })
   mcp__pencil__get_screenshot({ filePath: '../../design/jajang.pen', nodeId: 'llTp1' })
   ```
3. 반환 png 를 `docs/qa/<date>-tour/S10-pencil-ref.png` 로 저장
4. S10.md 슬롯 아래에 `![pencil ref](S10-pencil-ref.png)` 추가
5. LLM 검수 단계에서 screenshot vs pencil ref 1:1 비교

## 운영 시점

- PR merge 전 (consumer 측 화면 변경 시)
- 마일스톤 종료 시 (7 화면 풀 tour)

## 한계

- iOS 미지원 (epic-15 후보)
- Pencil ref 는 S10 만 매핑 (epic-16 후보)
- S11/Generating/Play 는 30초 녹음 필요 (epic-17 후보)
- 휴리스틱은 false positive 가능 — LLM 시각 재확인 필수
- S07/S16/AccountDeletion 진입은 좌표 fallback (1080×1920 기준) — testID 신설 시 epic-18 에서 교체
