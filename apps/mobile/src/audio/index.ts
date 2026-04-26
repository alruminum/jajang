/**
 * audio 모듈 public re-export
 * impl: docs/milestones/v1/epics/epic-04-playback/impl/01-app-audio-engine.md
 */
export {
  setupAudioEngine,
  startPlayback,
  pausePlayback,
  resumePlayback,
  stopPlayback,
  setVolume,
  setTimer,
  clearTimer,
  getIsPlaying,
  getTimerRemainingMs,
  isVolumeControlLocked,
} from './AudioEngine';
