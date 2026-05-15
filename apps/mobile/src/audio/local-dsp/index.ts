// apps/mobile/src/audio/local-dsp/index.ts
// Singleton exports for production use in screens.
// task 09 산출물 파일은 수정하지 않고 이 파일에서 인스턴스 생성.

import { LocalDspService } from './LocalDspService';
import { LocalCounterRepo } from './LocalCounterRepo';
import { defaultDspBridge } from './MinimalDspBridge';

export { LocalDspService } from './LocalDspService';
export { LocalCounterRepo, FreeLimitReachedError } from './LocalCounterRepo';
export { defaultDspBridge } from './MinimalDspBridge';
export type { LocalGenerationJob, JobStatus, DspStep, DspResult } from './types';

/** Production singleton — shared across screens. */
export const localDspService = new LocalDspService(defaultDspBridge, new LocalCounterRepo());
