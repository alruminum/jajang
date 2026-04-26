---
depth: std
design: skipped
---

# impl/05 — 앱: 설정 > 법적 정보 화면 (S16 확장)

**Epic**: 06 — 개인정보 & 데이터 관리  
**Story**: Story 4 — 개인정보처리방침 & TOS 접근  
**예상 소요**: 2~3h (독립 모듈, 병렬 진행 가능)

---

## 1. 생성 / 수정 파일

| 경로 | 작업 |
|---|---|
| `/Users/dc.kim/project/jajang/apps/mobile/src/screens/LegalScreen.tsx` | 신규 — 개인정보처리방침 / 이용약관 목록 화면 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/screens/WebViewScreen.tsx` | 신규 (또는 기존 재사용) — 인앱 웹뷰 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/navigation/SettingsNavigator.tsx` | `LegalScreen`, `WebViewScreen` 라우트 추가 |
| `/Users/dc.kim/project/jajang/apps/mobile/src/config/legalUrls.ts` | 신규 — 법적 문서 URL 상수 |

---

## 2. 설계 결정 — 인앱 WebView vs 외부 브라우저

**채택: 인앱 WebView 기본, 외부 브라우저 fallback**

| 방식 | 장점 | 단점 |
|---|---|---|
| 인앱 WebView (`expo-web-browser` or `react-native-webview`) | UX 연속성, 뒤로가기 자연스러움 | 렌더링 이슈 가능성, 네트워크 의존 |
| 외부 브라우저 (`Linking.openURL`) | 구현 단순, 브라우저 캐시 활용 | 앱 이탈감 |

**결론**: `expo-web-browser`의 `openBrowserAsync` 사용. iOS Safari View Controller / Android Chrome Custom Tabs 활용으로 네이티브 경험 유지 + 추가 npm 패키지 불필요 (Expo SDK에 포함). `react-native-webview` 설치 불필요.

**대안 기각**: `react-native-webview` 인라인 — 별도 패키지 설치 필요, Expo bare workflow에서 네이티브 rebuild 필요. 단순 법적 문서 표시에 과한 의존성.

---

## 3. URL 관리

### `config/legalUrls.ts`

```typescript
// 환경변수에서 주입하거나 상수로 관리
// V1: 상수 관리 (URL 변경 시 앱 업데이트 필요)
// V2 개선: 서버 GET /config/legal-urls 로 동적 주입 권장

export const LEGAL_URLS = {
  privacyPolicy: 'https://jajang.app/privacy',
  termsOfService: 'https://jajang.app/terms',
} as const

// 출시 전 실제 URL로 교체 필요
// 한국어 문서 URL 사용 (기본 로케일 한국어)
```

**환경변수 추가 여부**: V1에서 URL은 자주 바뀌지 않으므로 상수 관리. 단, 배포 전 실제 URL 확인 필수. 별도 환경변수(`PRIVACY_POLICY_URL`, `TOS_URL`) 추가는 V2 옵션.

---

## 4. TypeScript 시그니처

### `screens/LegalScreen.tsx`

```typescript
import React, { useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { LEGAL_URLS } from '../config/legalUrls'

interface LegalItem {
  label: string
  url: string
  accessibilityLabel: string
}

const LEGAL_ITEMS: LegalItem[] = [
  {
    label: '개인정보처리방침',
    url: LEGAL_URLS.privacyPolicy,
    accessibilityLabel: '개인정보처리방침 보기',
  },
  {
    label: '이용약관',
    url: LEGAL_URLS.termsOfService,
    accessibilityLabel: '이용약관 보기',
  },
]

export function LegalScreen() {
  const handleOpenUrl = useCallback(async (url: string) => {
    await WebBrowser.openBrowserAsync(url, {
      // iOS: SFSafariViewController 스타일
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      // 앱 테마 컬러 (앰버) 적용
      toolbarColor: '#0D0F1A',
      controlsColor: '#F5C97A',
    })
  }, [])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>법적 정보</Text>
      {LEGAL_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.url}
          style={styles.row}
          onPress={() => handleOpenUrl(item.url)}
          accessibilityLabel={item.accessibilityLabel}
          accessibilityRole="link"
        >
          <Text style={styles.label}>{item.label}</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
      <Text style={styles.appVersion}>버전 {getAppVersion()}</Text>
    </View>
  )
}

function getAppVersion(): string {
  // expo-constants Application.nativeApplicationVersion
  const Constants = require('expo-constants').default
  return Constants.expoConfig?.version ?? '1.0.0'
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F1A', paddingTop: 16 },
  header: { color: '#EEF0F8', fontSize: 20, fontWeight: '600',
    paddingHorizontal: 20, paddingBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#2A2E48' },
  label: { flex: 1, color: '#EEF0F8', fontSize: 16 },
  arrow: { color: '#7B80A0', fontSize: 20 },
  appVersion: { color: '#7B80A0', fontSize: 13,
    paddingHorizontal: 20, paddingTop: 24 },
})
```

---

## 5. SettingsScreen 진입점 연결

`SettingsScreen.tsx` 법적 정보 섹션 (기존 와이어프레임에 이미 있는 항목):

```typescript
// SettingsScreen 에서 법적 정보 섹션
<SettingsRow
  label="개인정보처리방침"
  onPress={() => navigation.navigate('Legal')}  // LegalScreen 으로 이동
/>
<SettingsRow
  label="이용약관"
  onPress={() => navigation.navigate('Legal')}  // 동일 LegalScreen, 또는 직접 URL 열기
/>
```

**대안**: LegalScreen 거치지 않고 SettingsScreen 에서 직접 `WebBrowser.openBrowserAsync` 호출. 화면 수 줄임. 단, SettingsScreen 이 이미 많은 섹션을 다루므로 LegalScreen 분리가 유지보수에 유리. impl/03 과 함께 SettingsScreen 수정하면서 결정.

---

## 6. TOS 포함 항목 확인 (Story 4 수용 기준)

Story 4 수용 기준에서 이용약관 문서에 포함 필요:
- 제3자 목소리 업로드 금지
- 유튜브 등 외부 업로드 금지
- 음성 데이터 수집·삭제 방침
- 의료기기 아님 고지

**이 impl의 역할**: 화면에서 URL로 연결하는 것. TOS 문서 내용 자체는 법무/콘텐츠 팀 산출물. 수용 기준의 "TOS 문서 열람 시 제3자 목소리 금지 조항 포함 확인"은 QA 시점에 URL 접속 후 수동 확인.

---

## 7. 오프라인 대응

법적 문서는 네트워크 필요. 오프라인 시:
```typescript
const handleOpenUrl = async (url: string) => {
  try {
    await WebBrowser.openBrowserAsync(url, { ... })
  } catch (e) {
    // openBrowserAsync 는 네트워크 오류를 throw 하지 않음
    // 브라우저 자체에서 오프라인 안내 표시
    // 별도 처리 불필요
  }
}
```

`expo-web-browser` / Safari View Controller 는 오프라인 시 브라우저 자체 오류 페이지 표시. 앱 레벨에서 별도 처리 불필요. V1 수용 범위 내.

---

## 8. 네비게이션 등록

```typescript
// SettingsNavigator.tsx (또는 RootStack)
import { LegalScreen } from '../screens/LegalScreen'

// Stack.Screen 추가
<Stack.Screen
  name="Legal"
  component={LegalScreen}
  options={{ title: '법적 정보', headerStyle: { backgroundColor: '#0D0F1A' },
    headerTintColor: '#EEF0F8' }}
/>
```

---

## 9. 수용 기준

- [ ] 설정 > 법적 정보 탭: LegalScreen 진입
- [ ] 개인정보처리방침 탭: expo-web-browser 로 URL 열림
- [ ] 이용약관 탭: expo-web-browser 로 URL 열림
- [ ] iOS: SFSafariViewController (PAGE_SHEET) 로 표시
- [ ] Android: Chrome Custom Tabs 로 표시
- [ ] 앱 버전 번호 표시 (expo-constants 에서 읽음)
- [ ] accessibilityLabel 모든 항목에 지정
- [ ] `LEGAL_URLS` 상수에 실제 출시 URL 교체 확인 (QA 게이트)

---

## 10. 결정 근거

| 결정 | 근거 |
|---|---|
| `expo-web-browser` 채택 | Expo SDK 포함, 추가 패키지 불필요. iOS/Android 모두 네이티브 브라우저 경험 (SFSafariViewController / Chrome Custom Tabs) |
| 별도 `LegalScreen` 분리 | SettingsScreen 비대화 방지. 법적 문서 항목이 향후 추가될 가능성 (오픈소스 라이선스 등) |
| URL 상수 관리 (V1) | V1 단순성 우선. 서버 동적 주입은 V2 — URL 변경 빈도가 낮음 |
| 오프라인 별도 처리 없음 | 브라우저 자체 오프라인 안내로 충분. 법적 문서 오프라인 캐싱은 규제 문서 버전 관리 복잡도 증가 |

---

## 11. 다른 모듈 경계

- **impl/03**: SettingsScreen 수정 시 법적 정보 행(`개인정보처리방침`, `이용약관`) 은 impl/03 과 impl/05 가 동일 파일을 수정하지 않도록 조율. 권장: impl/03 이 SettingsScreen 에 `onNavigateToLegal` prop 또는 `navigation.navigate('Legal')` 호출만 추가하고, LegalScreen 구현은 이 impl 독립 담당.
- **환경변수**: `LEGAL_URLS` 가 환경변수로 승격될 경우 trd.md §8 환경변수 섹션 업데이트 필요.
