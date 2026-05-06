---
depth: std
---

# impl/05 — [Story 5 / #195] 서버: 홈 MasterAudio 목록 + S06 빈 상태/카드 데이터

**Epic**: 03 — DSP 음원 후처리 생성
**커버 스토리**: Story 5 (홈 화면 음원 목록 — MasterAudio 기반)
**선행 조건**: impl/01 (MasterAudio ORM), impl/03 (`api/v1/masters.py` 라우터 신설)
**예상 소요**: 3~4시간

> **[v1.3.1 신규]** 구 impl/05(`tracks_service` + `GET /tracks`) 폐기 → MasterAudio 기반 재정의.
> **scope 분리**: impl/03 §6 에 `GET /masters/me` 핸들러는 *이미 작성됨*. 본 impl 은 (a) presigned URL 캐싱 / (b) 페이지네이션 / (c) 클라이언트 측 S06 통합을 추가 명시.

---

## 1. 생성/수정 파일

```
apps/api/app/
├── api/v1/
│   └── masters.py                       [수정 — cursor 기반 페이지네이션 + Cache-Control 헤더]
├── schemas/
│   └── sessions.py                      [수정 — MastersListResponse 에 next_cursor 추가]
└── services/
    └── masters_service.py               [신규 — masters_list / build_master_item 분리]

apps/mobile/src/
├── screens/
│   └── HomeScreen.tsx                   [수정 — MasterAudio 목록 노출 + 빈 상태 + has_pending 카드]
├── components/
│   ├── MasterAudioCard.tsx              [신규 — 곡명 + 생성일 + 재생 버튼]
│   └── EmptyMastersState.tsx            [신규 — "아직 자장가가 없어요" + "자장가 만들기" CTA]
├── services/api/
│   └── masters.ts                       [신규 — fetchMastersMe(cursor?)]
└── store/
    └── mastersSlice.ts                  [신규 — RTK slice (items, hasPending, isLoading)]
```

---

## 2. 인터페이스

서버:

```python
# api/v1/masters.py
@router.get("/me", response_model=MastersListResponse)
async def get_my_masters(
    cursor: str | None = None,           # ISO8601 completed_at (이전 페이지 마지막 값)
    limit: int = Query(20, le=50),
    auth = Depends(require_auth_with_entitlement),
    db: AsyncSession = Depends(get_db),
) -> MastersListResponse:
    """
    완료된 master_audios 목록 (DESC by completed_at) + has_pending + next_cursor.
    cursor 동작: completed_at < cursor 인 row 만 반환 (keyset pagination).
    """
```

```python
# schemas/sessions.py
class MastersListResponse(BaseModel):
    items: list[MasterAudioItem]
    has_pending: bool
    next_cursor: str | None = None       # 다음 페이지 cursor (없으면 None)
```

```python
# services/masters_service.py
async def list_completed_masters(
    db: AsyncSession,
    user_id: uuid.UUID,
    cursor: datetime | None,
    limit: int,
) -> tuple[list[MasterAudio], list[RecordingSession], datetime | None]:
    """완료 master 목록 + 다음 cursor. 매 호출마다 limit+1 fetch 후 마지막 row completed_at = next_cursor."""

async def has_pending_masters(db: AsyncSession, user_id: uuid.UUID) -> bool:
    """status IN (pending, processing) 1건 이상 여부."""
```

클라이언트:

```typescript
// services/api/masters.ts
export type MasterItem = {
  session_id: string;
  song_key: string;
  presigned_url: string;
  completed_at: string;     // ISO
  dsp_duration_ms: number | null;
};

export type MastersListResponse = {
  items: MasterItem[];
  has_pending: boolean;
  next_cursor: string | null;
};

export async function fetchMastersMe(cursor?: string): Promise<MastersListResponse>;
```

```typescript
// store/mastersSlice.ts
type MastersState = {
  items: MasterItem[];
  hasPending: boolean;
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
};
// thunks: loadMasters() / loadMore()
```

---

## 3. 의사코드

```python
# services/masters_service.py
async def list_completed_masters(db, user_id, cursor, limit):
    stmt = (
        select(MasterAudio, RecordingSession)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status == "completed",
            MasterAudio.completed_at.isnot(None),
        )
        .order_by(MasterAudio.completed_at.desc(), MasterAudio.id.desc())
        .limit(limit + 1)
    )
    if cursor is not None:
        stmt = stmt.where(MasterAudio.completed_at < cursor)

    rows = (await db.execute(stmt)).all()
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = page[-1][0].completed_at if has_more else None
    masters = [r[0] for r in page]
    sessions = [r[1] for r in page]
    return masters, sessions, next_cursor


async def has_pending_masters(db, user_id):
    stmt = (
        select(MasterAudio.id)
        .join(RecordingSession, MasterAudio.session_id == RecordingSession.id)
        .where(
            RecordingSession.user_id == user_id,
            MasterAudio.status.in_(["pending", "processing"]),
        )
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
```

```python
# api/v1/masters.py
@router.get("/me", response_model=MastersListResponse)
async def get_my_masters(cursor=None, limit=20, auth=..., db=...):
    user_id = uuid.UUID(auth["sub"])
    parsed_cursor = datetime.fromisoformat(cursor) if cursor else None

    masters, sessions, next_cursor = await list_completed_masters(db, user_id, parsed_cursor, limit)
    has_pending = await has_pending_masters(db, user_id)

    items = [
        MasterAudioItem(
            session_id=str(s.id),
            song_key=s.song_key,
            presigned_url=storage_service.generate_presigned_url(m.s3_key),
            completed_at=m.completed_at,
            dsp_duration_ms=m.dsp_duration_ms,
        )
        for m, s in zip(masters, sessions)
    ]
    return MastersListResponse(
        items=items,
        has_pending=has_pending,
        next_cursor=next_cursor.isoformat() if next_cursor else None,
    )
```

```tsx
// screens/HomeScreen.tsx (요지)
function HomeScreen() {
  const dispatch = useDispatch();
  const { items, hasPending, isLoading } = useSelector(s => s.masters);

  useFocusEffect(useCallback(() => { dispatch(loadMasters()); }, []));

  if (isLoading && items.length === 0) return <Skeleton />;
  if (items.length === 0 && !hasPending) return <EmptyMastersState onCta={() => nav.navigate("Record")} />;

  return (
    <>
      {hasPending && <PendingMasterCard />}
      <FlatList
        data={items}
        keyExtractor={i => i.session_id}
        renderItem={({ item }) => (
          <MasterAudioCard
            songKey={item.song_key}
            completedAt={item.completed_at}
            onPlay={() => nav.navigate("Play", { url: item.presigned_url })}
          />
        )}
        onEndReached={() => dispatch(loadMore())}
      />
    </>
  );
}
```

---

## 4. 결정 근거

### keyset pagination (cursor by completed_at) — offset/limit 미채택
- offset 페이지네이션은 신규 master 생성 시 페이지 경계 깨짐
- `(completed_at DESC, id DESC)` 복합 정렬 + cursor `completed_at` → 안정적 무한 스크롤
- `master_audios` 인덱스 `idx_master_audios_user_completed` (impl/01 §2) 가 이 정렬 지원

### presigned URL 매번 재발급 (서버 캐싱 X)
- presigned URL TTL 1시간 (`storage_service.generate_presigned_url` 기본)
- 클라이언트가 페이지 재진입할 때마다 신선한 URL 필요 (TTL 만료 회피)
- 서버 캐싱 시 stale URL 위험 + Redis 의존성 증가

### has_pending 별도 query (단일 endpoint)
- 클라이언트가 `/sessions/{id}/status` 폴링 외 추가로 holistic pending 확인 필요
- list 와 같은 round-trip 으로 묶어 RTT 절약

---

## 5. 다른 모듈 경계

- **impl/02 (`dsp_processing.py`)**: DSP 완료 시 `master_audios.completed_at = NOW()` set → 본 list 의 source.
- **impl/03 (`masters.py` 신설)**: 본 impl 은 *이미 작성된* `masters.py` 를 cursor + service 분리로 리팩터.
- **impl/07 (S12 + pending 복원)**: `has_pending=true` 카드 탭 → S06 의 "생성 완료 음원 있음" 카드 노출. `has_pending` 의 의미는 "처리 중 세션 존재" — *완료된* "방금 도착" 카드는 SecureStore session_id 기반 (impl/07 책임).
- **Epic 04 (재생)**: `MasterAudioCard.onPlay` → `presigned_url` 을 PlayScreen 으로 전달. URL 만료 시 재진입 → loadMasters() 재실행.

---

## 6. 수용 기준

- [ ] (TEST) 완료 master 3건 → `items.length === 3` + `completed_at` DESC 정렬
- [ ] (TEST) 완료 master 0건 + pending 0건 → `items: []`, `has_pending: false` (클라이언트 `EmptyMastersState` 노출)
- [ ] (TEST) 완료 master 0건 + pending 1건 → `has_pending: true` + 클라이언트 PendingMasterCard 노출
- [ ] (TEST) limit=20, master 25건 → page1 20건 + `next_cursor` 존재. cursor 전달 시 page2 5건 + `next_cursor=null`
- [ ] (TEST) cursor 깨진 ISO 문자열 → 422 (Pydantic 검증)
- [ ] (TEST) `GET /masters/me` 응답 `presigned_url` GET 1시간 유효
- [ ] (TEST) 다른 유저 master → 본 응답에 미포함
- [ ] (TEST) MasterAudioCard 탭 → PlayScreen `params.url === presigned_url`
- [ ] (TEST) `EmptyMastersState` "자장가 만들기" CTA → RecordScreen 이동

---

## 7. 주의사항

- 페이지네이션 정렬키가 `(completed_at, id)` 복합이지만 cursor 는 `completed_at` 만. 동일 ms tie-breaker 미세 손실 가능 (1ms 동시 완료 → 1건 누락 가능). MVP 허용. 정합 강화 시 cursor 를 `(completed_at, id)` tuple base64 로 확장.
- `MasterAudioCard.completedAt` 표시는 i18n locale 의존. ko-KR 기본 + `Intl.DateTimeFormat` 사용.
- `onEndReached` 는 FlatList prop. iOS 에서 짧은 리스트 시 자동 트리거 — `onEndReachedThreshold=0.5` 설정 필요.

---

MODULE_PLAN_READY
