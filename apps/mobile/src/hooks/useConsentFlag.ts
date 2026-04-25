import AsyncStorage from '@react-native-async-storage/async-storage';

const CONSENT_KEY = 'consent_given';
const CONSENT_VERSION_KEY = 'consent_version';
const CURRENT_CONSENT_VERSION = '1';  // 정책 변경 시 버전 업

export async function getConsentFlag(): Promise<boolean> {
  const [given, version] = await Promise.all([
    AsyncStorage.getItem(CONSENT_KEY),
    AsyncStorage.getItem(CONSENT_VERSION_KEY),
  ]);
  return given === 'true' && version === CURRENT_CONSENT_VERSION;
}

export async function setConsentFlag(): Promise<void> {
  await AsyncStorage.multiSet([
    [CONSENT_KEY, 'true'],
    [CONSENT_VERSION_KEY, CURRENT_CONSENT_VERSION],
  ]);
}

export async function clearConsentFlag(): Promise<void> {
  await AsyncStorage.multiRemove([CONSENT_KEY, CONSENT_VERSION_KEY]);
}
