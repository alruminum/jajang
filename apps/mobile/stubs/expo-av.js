// Stub for expo-av (deprecated in Expo SDK 55).
// All methods are no-ops returning resolved promises so the app can boot.

const noop = () => {};
const noopAsync = async () => {};

const Recording = function Recording() {};
Recording.prototype.prepareToRecordAsync = noopAsync;
Recording.prototype.startAsync = noopAsync;
Recording.prototype.pauseAsync = noopAsync;
Recording.prototype.stopAndUnloadAsync = noopAsync;
Recording.prototype.getStatusAsync = async () => ({
  canRecord: false,
  isRecording: false,
  isDoneRecording: false,
  durationMillis: 0,
  metering: -160,
});
Recording.prototype.getURI = () => null;
Recording.prototype.setOnRecordingStatusUpdate = noop;
Recording.prototype.setProgressUpdateInterval = noop;

const Sound = function Sound() {};
Sound.prototype.loadAsync = noopAsync;
Sound.prototype.unloadAsync = noopAsync;
Sound.prototype.playAsync = noopAsync;
Sound.prototype.pauseAsync = noopAsync;
Sound.prototype.stopAsync = noopAsync;
Sound.prototype.setPositionAsync = noopAsync;
Sound.prototype.setVolumeAsync = noopAsync;
Sound.prototype.setIsLoopingAsync = noopAsync;
Sound.prototype.getStatusAsync = async () => ({
  isLoaded: false,
  isPlaying: false,
  durationMillis: 0,
  positionMillis: 0,
});
Sound.prototype.setOnPlaybackStatusUpdate = noop;
Sound.createAsync = async () => ({ sound: new Sound(), status: { isLoaded: false } });

const RecordingOptionsPresets = {
  HIGH_QUALITY: {},
  LOW_QUALITY: {},
};

const InterruptionModeIOS = {
  MixWithOthers: 0,
  DoNotMix: 1,
  DuckOthers: 2,
};

const InterruptionModeAndroid = {
  DoNotMix: 1,
  DuckOthers: 2,
};

const Audio = {
  Recording,
  Sound,
  RecordingOptionsPresets,
  InterruptionModeIOS,
  InterruptionModeAndroid,
  requestPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  setAudioModeAsync: noopAsync,
  setIsEnabledAsync: noopAsync,
};

module.exports = {
  Audio,
  Sound,
  Recording,
  RecordingOptionsPresets,
  InterruptionModeIOS,
  InterruptionModeAndroid,
};
