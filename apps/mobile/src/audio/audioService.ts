/**
 * RNTP PlaybackService — 별도 JS 스레드에서 실행되는 백그라운드 핸들러
 *
 * 잠금화면/미디어 알림의 재생/일시정지/중지 버튼 이벤트를 처리한다.
 * 이 모듈은 RNTP가 직접 require()로 로드하므로 CommonJS 형식으로 export.
 *
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/01-app-audio-engine.md §4-7
 */
import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
};
