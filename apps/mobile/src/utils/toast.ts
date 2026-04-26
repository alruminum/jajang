import { Alert } from 'react-native';

/**
 * 간단한 토스트 메시지 표시.
 * MVP: Alert.alert 기반 (추후 react-native-toast-message 등으로 교체 가능).
 */
export function showToast(message: string): void {
  Alert.alert(message, undefined, [{ text: '확인' }]);
}
