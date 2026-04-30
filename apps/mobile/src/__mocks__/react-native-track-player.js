// RN-track-player stub — V1 데모 빌드용 (CJS 변환: jest 환경 interop 대응)
const noop = () => {};
const noopAsync = () => Promise.resolve();

const Capability = { Play: 'play', Pause: 'pause', SkipToNext: 'skipNext', SkipToPrevious: 'skipPrev', Stop: 'stop', SeekTo: 'seek' };
const State = { Playing: 'playing', Paused: 'paused', Stopped: 'stopped', Buffering: 'buffering', None: 'none' };
const Event = { PlaybackState: 'playback-state', PlaybackError: 'playback-error', PlaybackTrackChanged: 'playback-track-changed', RemotePlay: 'remote-play', RemotePause: 'remote-pause', RemoteSeek: 'remote-seek', RemoteStop: 'remote-stop' };
const RepeatMode = { Off: 0, Track: 1, Queue: 2 };
const AppKilledPlaybackBehavior = { ContinuePlayback: 'continue', PausePlayback: 'pause', StopPlaybackAndRemoveNotification: 'stop' };
const useTrackPlayerEvents = () => {};
const useProgress = () => ({ position: 0, duration: 0, buffered: 0 });
const usePlaybackState = () => ({ state: State.None });

const TrackPlayer = {
  setupPlayer: noopAsync,
  updateOptions: noopAsync,
  add: noopAsync, play: noopAsync, pause: noopAsync, stop: noopAsync,
  reset: noopAsync, skip: noopAsync, seekTo: noopAsync, setVolume: noopAsync,
  getActiveTrack: () => Promise.resolve(null),
  getCurrentTrack: () => Promise.resolve(null),
  getQueue: () => Promise.resolve([]),
  getState: () => Promise.resolve(State.None),
  registerPlaybackService: noop,
  addEventListener: () => ({ remove: noop }),
  setRepeatMode: noopAsync,
};

module.exports = {
  __esModule: true,
  default: TrackPlayer,
  Capability,
  State,
  Event,
  RepeatMode,
  AppKilledPlaybackBehavior,
  useTrackPlayerEvents,
  useProgress,
  usePlaybackState,
};
