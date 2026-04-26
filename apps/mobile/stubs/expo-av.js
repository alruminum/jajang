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

const AndroidOutputFormat = {
  DEFAULT: 0, THREE_GPP: 1, MPEG_4: 2, AMR_NB: 3, AMR_WB: 4, AAC_ADTS: 6,
};

const AndroidAudioEncoder = {
  DEFAULT: 0, AMR_NB: 1, AMR_WB: 2, AAC: 3, HE_AAC: 4, AAC_ELD: 5,
};

const IOSOutputFormat = {
  LINEARPCM: 'lpcm', AC3: 'ac-3', '60958AC3': 'cac3', APPLEIMA4: 'ima4',
  MPEG4AAC: 'aac ', MPEG4CELP: 'celp', MPEG4HVXC: 'hvxc', MPEG4TWINVQ: 'twvq',
  MACE3: 'MAC3', MACE6: 'MAC6', ULAW: 'ulaw', ALAW: 'alaw',
  QDESIGN: 'QDMC', QDESIGN2: 'QDM2', QUALCOMM: 'Qclp',
  MPEGLAYER1: '.mp1', MPEGLAYER2: '.mp2', MPEGLAYER3: '.mp3',
  APPLELOSSLESS: 'alac', MPEG4AAC_HE: 'aach', MPEG4AAC_LD: 'aacl',
  MPEG4AAC_ELD: 'aace', MPEG4AAC_ELD_SBR: 'aacf', MPEG4AAC_ELD_V2: 'aacg',
  MPEG4AAC_HE_V2: 'aacp', MPEG4AAC_SPATIAL: 'aacs', AMR: 'samr',
  AMR_WB: 'sawb', AUDIBLE: 'AUDB', ILBC: 'ilbc', DVIINTELIMA: 0x6d730011,
  MICROSOFTGSM: 0x6d730031, AES3: 'aes3', ENHANCEDAC3: 'ec-3',
};

const IOSAudioQuality = { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 };

const Audio = {
  Recording,
  Sound,
  RecordingOptionsPresets,
  InterruptionModeIOS,
  InterruptionModeAndroid,
  AndroidOutputFormat,
  AndroidAudioEncoder,
  IOSOutputFormat,
  IOSAudioQuality,
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
  AndroidOutputFormat,
  AndroidAudioEncoder,
  IOSOutputFormat,
  IOSAudioQuality,
};
