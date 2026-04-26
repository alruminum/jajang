import { registerRootComponent } from 'expo';
import TrackPlayer from 'react-native-track-player';

import App from './App';
import { setupAudioEngine } from './src/audio/AudioEngine';

// 1. RNTP PlaybackService 등록 — setupPlayer() 호출 이전에 반드시 먼저 등록 (RNTP v4 요구사항)
//    백그라운드 핸들러: RemotePlay / RemotePause / RemoteStop 처리
TrackPlayer.registerPlaybackService(() => require('./src/audio/audioService'));

// 2. AudioEngine 초기화 (setupPlayer 1회 호출) — fire-and-forget
//    앱 마운트 전 비동기 초기화. 사용자 인터랙션 전 완료됨.
setupAudioEngine().catch(console.error);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
