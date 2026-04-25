/**
 * recording-store.test.ts
 * RecordingSlice (Zustand) — 상태 초기화, 액션, 리셋 검증
 * impl: docs/milestones/v1/epics/epic-02-recording/impl/04-app-song-select-screen.md §2
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useRecordingStore } from '@store/recordingSlice'

// 각 테스트 전 스토어를 초기 상태로 복원
beforeEach(() => {
  useRecordingStore.setState({
    selectedSongKey: null,
    recordingMode: null,
    localAudioUri: null,
    uploadedSampleId: null,
    qualityValidationPassed: null,
  })
})

// ────────────────────────────────────────────
// 초기 상태
// ────────────────────────────────────────────
describe('RecordingSlice — 초기 상태', () => {
  it('selectedSongKey는 null로 초기화된다', () => {
    expect(useRecordingStore.getState().selectedSongKey).toBeNull()
  })

  it('recordingMode는 null로 초기화된다', () => {
    expect(useRecordingStore.getState().recordingMode).toBeNull()
  })

  it('localAudioUri는 null로 초기화된다', () => {
    expect(useRecordingStore.getState().localAudioUri).toBeNull()
  })

  it('uploadedSampleId는 null로 초기화된다', () => {
    expect(useRecordingStore.getState().uploadedSampleId).toBeNull()
  })

  it('qualityValidationPassed는 null로 초기화된다', () => {
    expect(useRecordingStore.getState().qualityValidationPassed).toBeNull()
  })
})

// ────────────────────────────────────────────
// setSelectedSong
// ────────────────────────────────────────────
describe('RecordingSlice — setSelectedSong', () => {
  it('selectedSongKey를 지정한 key 값으로 갱신한다', () => {
    useRecordingStore.getState().setSelectedSong('brahms')
    expect(useRecordingStore.getState().selectedSongKey).toBe('brahms')
  })

  it('다른 곡으로 재호출 시 selectedSongKey가 덮어써진다', () => {
    useRecordingStore.getState().setSelectedSong('brahms')
    useRecordingStore.getState().setSelectedSong('mozart')
    expect(useRecordingStore.getState().selectedSongKey).toBe('mozart')
  })
})

// ────────────────────────────────────────────
// setRecordingMode
// ────────────────────────────────────────────
describe('RecordingSlice — setRecordingMode', () => {
  it("recordingMode를 'humming'으로 설정한다", () => {
    useRecordingStore.getState().setRecordingMode('humming')
    expect(useRecordingStore.getState().recordingMode).toBe('humming')
  })

  it("recordingMode를 'shush'으로 설정한다", () => {
    useRecordingStore.getState().setRecordingMode('shush')
    expect(useRecordingStore.getState().recordingMode).toBe('shush')
  })
})

// ────────────────────────────────────────────
// setLocalAudioUri
// ────────────────────────────────────────────
describe('RecordingSlice — setLocalAudioUri', () => {
  it('localAudioUri를 파일 URI 문자열로 설정한다', () => {
    useRecordingStore.getState().setLocalAudioUri('file:///tmp/recording.m4a')
    expect(useRecordingStore.getState().localAudioUri).toBe('file:///tmp/recording.m4a')
  })

  it('localAudioUri를 null로 초기화할 수 있다', () => {
    useRecordingStore.getState().setLocalAudioUri('file:///tmp/recording.m4a')
    useRecordingStore.getState().setLocalAudioUri(null)
    expect(useRecordingStore.getState().localAudioUri).toBeNull()
  })
})

// ────────────────────────────────────────────
// setUploadedSampleId
// ────────────────────────────────────────────
describe('RecordingSlice — setUploadedSampleId', () => {
  it('uploadedSampleId를 서버 sample_id로 설정한다', () => {
    useRecordingStore.getState().setUploadedSampleId('sample-uuid-001')
    expect(useRecordingStore.getState().uploadedSampleId).toBe('sample-uuid-001')
  })

  it('uploadedSampleId를 null로 초기화할 수 있다', () => {
    useRecordingStore.getState().setUploadedSampleId('sample-uuid-001')
    useRecordingStore.getState().setUploadedSampleId(null)
    expect(useRecordingStore.getState().uploadedSampleId).toBeNull()
  })
})

// ────────────────────────────────────────────
// setQualityValidationPassed
// ────────────────────────────────────────────
describe('RecordingSlice — setQualityValidationPassed', () => {
  it('qualityValidationPassed를 true로 설정한다', () => {
    useRecordingStore.getState().setQualityValidationPassed(true)
    expect(useRecordingStore.getState().qualityValidationPassed).toBe(true)
  })

  it('qualityValidationPassed를 false로 설정한다', () => {
    useRecordingStore.getState().setQualityValidationPassed(false)
    expect(useRecordingStore.getState().qualityValidationPassed).toBe(false)
  })
})

// ────────────────────────────────────────────
// resetRecordingFlow
// ────────────────────────────────────────────
describe('RecordingSlice — resetRecordingFlow', () => {
  it('모든 녹음 상태 필드를 null로 리셋한다', () => {
    const s = useRecordingStore.getState()
    s.setSelectedSong('brahms')
    s.setRecordingMode('humming')
    s.setLocalAudioUri('file:///tmp/recording.m4a')
    s.setUploadedSampleId('sample-001')
    s.setQualityValidationPassed(true)

    useRecordingStore.getState().resetRecordingFlow()

    const after = useRecordingStore.getState()
    expect(after.selectedSongKey).toBeNull()
    expect(after.recordingMode).toBeNull()
    expect(after.localAudioUri).toBeNull()
    expect(after.uploadedSampleId).toBeNull()
    expect(after.qualityValidationPassed).toBeNull()
  })

  it('리셋 후 setSelectedSong 재호출 시 정상 갱신된다', () => {
    useRecordingStore.getState().setSelectedSong('brahms')
    useRecordingStore.getState().resetRecordingFlow()
    useRecordingStore.getState().setSelectedSong('mozart')
    expect(useRecordingStore.getState().selectedSongKey).toBe('mozart')
  })
})
