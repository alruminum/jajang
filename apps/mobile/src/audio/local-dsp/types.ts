// apps/mobile/src/audio/local-dsp/types.ts
// Shared types for local DSP module (task 09)

/** 단방향 job 상태 — pending → processing → completed | failed */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** 디바이스 내 단일 DSP 처리 작업 */
export interface LocalGenerationJob {
  jobId: string;
  status: JobStatus;
  inputUri: string;
  outputUri: string | null; // status=completed 일 때만 non-null
  songKey: string;
  createdAt: number; // Date.now()
  error?: string;
}

/** DSP step 유형 */
export type DspStep =
  | { type: 'highpass'; f: number }
  | { type: 'eq'; f: number; width_type: 'h'; width: number; g: number }
  | { type: 'echo'; delay_ms: number; decay: number; in_gain: number; out_gain: number }
  | { type: 'crossfade-tri'; d_sec: number };

/** MinimalDspBridge 실행 결과 */
export interface DspResult {
  outputUri: string;
  durationMs: number;
}
