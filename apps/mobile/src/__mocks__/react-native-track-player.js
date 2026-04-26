// RN-track-player stub — V1 데모 빌드용
const noop = () => {};
const noopAsync = () => Promise.resolve();
export const Capability = { Play: 'play', Pause: 'pause', SkipToNext: 'skipNext', SkipToPrevious: 'skipPrev', Stop: 'stop', SeekTo: 'seek' };
export const State = { Playing: 'playing', Paused: 'paused', Stopped: 'stopped', Buffering: 'buffering', None: 'none' };
export const Event = { PlaybackState: 'playback-state', PlaybackError: 'playback-error', PlaybackTrackChanged: 'playback-track-changed', RemotePlay: 'remote-play', RemotePause: 'remote-pause', RemoteSeek: 'remote-seek', RemoteStop: 'remote-stop' };
export const RepeatMode = { Off: 0, Track: 1, Queue: 2 };
export const AppKilledPlaybackBehavior = { ContinuePlayback: 'continue', PausePlayback: 'pause', StopPlaybackAndRemoveNotification: 'stop' };
export const useTrackPlayerEvents = () => {};
export const useProgress = () => ({ position: 0, duration: 0, buffered: 0 });
export const usePlaybackState = () => ({ state: State.None });
export default {
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
