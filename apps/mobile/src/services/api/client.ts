// apps/mobile/src/services/api/client.ts
// tracksApi 등 api/ 하위 모듈이 사용하는 공통 axios 인스턴스
// 테스트에서는 vi.mock('@services/api/client') 로 통째로 교체됨

export { api as apiClient } from '../api.ts'
