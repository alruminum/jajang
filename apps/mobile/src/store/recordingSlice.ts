import { create } from 'zustand';

export interface RecordingSlice {
  // 선택 상태 (S07)
  selectedSongKey: string | null;

  // 녹음 흐름 상태
  recordingMode: 'humming' | 'shush' | null;
  localAudioUri: string | null;          // 녹음 완료 후 로컬 파일 URI
  uploadedSampleId: string | null;       // 서버 sample_id (업로드 완료 후)
  qualityValidationPassed: boolean | null;
  recordingLevels: number[];             // 녹음 중 수집한 metering 레벨 (0~1, S11 정적 파형용)

  // 액션
  setSelectedSong: (key: string) => void;
  setRecordingMode: (mode: 'humming' | 'shush') => void;
  setLocalAudioUri: (uri: string | null) => void;
  setUploadedSampleId: (id: string | null) => void;
  setQualityValidationPassed: (passed: boolean) => void;
  setRecordingLevels: (levels: number[]) => void;
  resetRecordingFlow: () => void;        // 새 녹음 시작 시 상태 초기화
}

const initialState = {
  selectedSongKey: null,
  recordingMode: null,
  localAudioUri: null,
  uploadedSampleId: null,
  qualityValidationPassed: null,
  recordingLevels: [],
} as const satisfies Omit<RecordingSlice, keyof Pick<RecordingSlice,
  'setSelectedSong' | 'setRecordingMode' | 'setLocalAudioUri' |
  'setUploadedSampleId' | 'setQualityValidationPassed' | 'setRecordingLevels' | 'resetRecordingFlow'>>;

export const useRecordingStore = create<RecordingSlice>()((set) => ({
  ...initialState,

  setSelectedSong: (key) => set({ selectedSongKey: key }),
  setRecordingMode: (mode) => set({ recordingMode: mode }),
  setLocalAudioUri: (uri) => set({ localAudioUri: uri }),
  setUploadedSampleId: (id) => set({ uploadedSampleId: id }),
  setQualityValidationPassed: (passed) => set({ qualityValidationPassed: passed }),
  setRecordingLevels: (levels) => set({ recordingLevels: levels }),
  resetRecordingFlow: () => set(initialState),
}));
