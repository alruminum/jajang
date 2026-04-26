// AdMob stub — V1 데모 빌드용. 실제 출시 시 react-native-google-mobile-ads 재설치.
export const BannerAd = () => null;
export const BannerAdSize = { BANNER: 'BANNER', LARGE_BANNER: 'LARGE_BANNER', ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' };
export const TestIds = { BANNER: 'test-banner', REWARDED: 'test-rewarded' };
export const RewardedAd = { createForAdRequest: () => ({ load: () => {}, show: () => {}, addAdEventListener: () => () => {} }) };
export const RewardedAdEventType = { LOADED: 'loaded', EARNED_REWARD: 'earned' };
export const AdEventType = { ERROR: 'error', CLOSED: 'closed' };
export default { initialize: () => Promise.resolve() };
