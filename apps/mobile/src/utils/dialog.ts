import { Alert } from 'react-native';

/**
 * Alert.alert 기반 확인 다이얼로그.
 * 확인 → true, 취소/dismiss → false
 */
export function showConfirmDialog(title: string, message?: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: '취소', style: 'cancel', onPress: () => resolve(false) },
        { text: '확인', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
