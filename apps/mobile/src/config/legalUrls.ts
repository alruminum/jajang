/**
 * 법적 문서 URL 상수
 *
 * V1: 상수 관리 (URL 변경 시 앱 업데이트 필요)
 * V2 개선: 서버 GET /config/legal-urls 로 동적 주입 권장
 *
 * 출시 전 실제 URL로 교체 필요
 * 한국어 문서 URL 사용 (기본 로케일 한국어)
 */
export const LEGAL_URLS = {
  privacyPolicy: 'https://jajang.app/privacy',
  termsOfService: 'https://jajang.app/terms',
} as const;
