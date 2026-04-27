---
depth: simple
---

# #109 터치가 두세 번 눌러야 되는 이슈

## 근본 원인 분석

### 원인 A — FAB Z-order 역전 (최우선)
`S06HomeScreen`에서 FAB가 `miniPlayerWrapper`보다 **먼저** 렌더링됨.  
React Native는 나중에 렌더된 요소가 높은 Z-order를 가지므로,  
`miniPlayerWrapper` → `MiniPlayer` bar TouchableOpacity(height: 64)가  
FAB 전체 영역(화면 하단 [32px, 88px])을 커버하여 터치를 흡수.

- `pointerEvents="box-none"` 단독으로는 bar TouchableOpacity가 FAB 영역과 겹치는 구간([34px, 88px], safe area 34px 가정)에서 여전히 bar가 터치를 먼저 처리함 → **렌더 순서 변경 필수**

### 원인 B — MiniPlayer Animated.View 슬라이드 중 터치 흡수
`slideAnim` 80→0 (300ms) 애니메이션 진행 중 Animated.View가 `pointerEvents` 미지정 상태로  
safe area paddingBottom 영역을 커버 → 화면 진입 직후 300ms 내 탭 시 이벤트 흡수만 하고 핸들러 미실행.

### 원인 C — TrackCard hitSlop 숫자형
`hitSlop={8}` (숫자형) — React Native 일부 버전에서 동작 불일치. 객체형 권장.

---

## 수정 계획

### 파일 1: `apps/mobile/src/screens/S06HomeScreen.tsx`

**변경 1-A: FAB를 miniPlayerWrapper 이후로 렌더 순서 변경 (Z-order 근본 수정)**

```diff
-      {/* FAB — 새 자장가 만들기 (항상 노출) */}
-      <TouchableOpacity
-        style={styles.fab}
-        onPress={() => navigation.navigate('SongSelect')}
-        accessibilityLabel="새 자장가 만들기"
-      >
-        <Text style={styles.fabIcon}>+</Text>
-      </TouchableOpacity>
-
       {/* C06 미니 플레이어 — 하단 고정 오버레이 */}
       {showMiniPlayer && (
-        <View style={styles.miniPlayerWrapper}>
+        <View style={styles.miniPlayerWrapper} pointerEvents="box-none">
           <MiniPlayer />
         </View>
       )}
+
+      {/* FAB — 새 자장가 만들기 (miniPlayerWrapper 이후 렌더: Z-order 확보) */}
+      <TouchableOpacity
+        style={styles.fab}
+        onPress={() => navigation.navigate('SongSelect')}
+        accessibilityLabel="새 자장가 만들기"
+      >
+        <Text style={styles.fabIcon}>+</Text>
+      </TouchableOpacity>
```

> `pointerEvents="box-none"` on wrapper: wrapper 자체는 터치 통과, 자식(MiniPlayer)으로만 hit test 위임.  
> 렌더 순서 변경으로 FAB가 항상 MiniPlayer 위에 있음.

---

### 파일 2: `apps/mobile/src/components/MiniPlayer.tsx`

**변경 2-A: Animated.View에 pointerEvents="box-none" 추가**

```diff
     <Animated.View
+      pointerEvents="box-none"
       style={[
         styles.container,
         { paddingBottom: insets.bottom, transform: [{ translateY: slideAnim }] },
       ]}
     >
```

> 슬라이드 애니메이션 진행 중 Animated.View의 safe area paddingBottom 영역 터치가 통과됨.  
> 실제 인터랙션(bar TouchableOpacity, playButton TouchableOpacity)은 자식 레벨에서 정상 처리.

---

### 파일 3: `apps/mobile/src/components/TrackCard.tsx`

**변경 3-A: 재생버튼 hitSlop 숫자형 → 객체형**

```diff
         <TouchableOpacity
           style={styles.playBtn}
           onPress={() => onPlay(track)}
-          hitSlop={8}
+          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
           accessibilityLabel="재생"
         >
```

---

## 수정 파일 목록

| 파일 | 변경 유형 | 라인 |
|---|---|---|
| `apps/mobile/src/screens/S06HomeScreen.tsx` | FAB 렌더 순서 변경 (230→ 이후) + miniPlayerWrapper `pointerEvents` 추가 | L221-234 |
| `apps/mobile/src/components/MiniPlayer.tsx` | Animated.View `pointerEvents="box-none"` 추가 | L167 |
| `apps/mobile/src/components/TrackCard.tsx` | `hitSlop={8}` → `hitSlop={{ top:8, bottom:8, left:8, right:8 }}` | L85 |

## 기존 테스트 안전성 확인

| 테스트 파일 | assertion 대상 | 영향 여부 |
|---|---|---|
| `S06HomeScreen.test.tsx` | `accessibilityLabel` / navigation mock 호출 여부 | ❌ 영향 없음 — 렌더 순서 변경이어도 label·onPress 핸들러 유지됨 |
| `TrackCard.test.tsx` | 텍스트 내용·accessibilityLabel·accessibilityHint·onPlay 호출 | ❌ 영향 없음 — `hitSlop` 타입 변경은 assertion 대상 아님 |

## 결정 근거

- **렌더 순서 변경 채택**: `zIndex`/`elevation` 추가보다 렌더 순서 변경이 플랫폼 간 동작 일관성 보장. Android는 `elevation`, iOS는 Z-order가 다르게 동작하므로 렌더 순서를 명시적으로 바꾸는 것이 단일 소스 수정.
- **pointerEvents="box-none"**: wrapper와 Animated.View 모두 적용하여 투명 여백 영역(safe area padding) 터치가 아래 요소로 통과되도록 보장. 렌더 순서 변경과 조합하여 중첩 시나리오를 이중으로 방어.
- **hitSlop 객체형**: RN 공식 문서 권장 형식. 숫자형은 레거시 동작이므로 명시적 방향 지정으로 교체.
