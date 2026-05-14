// apps/mobile/src/audio/local-dsp/LocalDspService.ts
// Orchestrates device-local DSP generation: counter gate → job tracking → bridge execution → store update.

import { useGenerationStore } from '../../store/generationSlice';
import { buildSteps } from './DspPipeline';
import { FreeLimitReachedError, LocalCounterRepo } from './LocalCounterRepo';
import type { IDspBridge } from './MinimalDspBridge';
import type { LocalGenerationJob } from './types';

// Module-scope in-memory job map (resets on app restart — intentional for local DSP jobs)
const jobs = new Map<string, LocalGenerationJob>();

/** Generate a session-unique jobId without uuid dependency. */
function generateJobId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export class LocalDspService {
  constructor(
    private readonly bridge: IDspBridge,
    private readonly counterRepo: LocalCounterRepo,
  ) {}

  /**
   * Start a local DSP job.
   *
   * Flow:
   *   1. peek counter — throw FreeLimitReachedError if count >= limit (bridge.execute not called)
   *   2. create job (status=pending), call setSessionId + setPollState({kind:'polling'})
   *   3. set status=processing, call setPollState({kind:'polling'})
   *   4. execute DSP chain
   *   5. success: increment counter, status=completed, setPollState({kind:'completed'})
   *      failure: status=failed, setPollState({kind:'failed'}) — no re-throw, no increment
   *
   * @returns jobId of the created job
   */
  async startJob(params: {
    inputUri: string;
    songKey: string;
    outputUri: string;
  }): Promise<string> {
    const { inputUri, songKey, outputUri } = params;
    const store = useGenerationStore.getState();

    // 1. Counter gate — must happen BEFORE job creation so bridge.execute is never called
    const counter = await this.counterRepo.peek();
    if (counter.count >= counter.limit) {
      throw new FreeLimitReachedError(counter.count, counter.limit);
    }

    // 2. Create job (status=pending)
    const jobId = generateJobId();
    const job: LocalGenerationJob = {
      jobId,
      status: 'pending',
      inputUri,
      outputUri: null,
      songKey,
      createdAt: Date.now(),
    };
    jobs.set(jobId, job);

    store.setSessionId(jobId);
    store.setPollState({ kind: 'polling', elapsedSec: 0 });

    // 3. Transition to processing
    job.status = 'processing';
    store.setPollState({ kind: 'polling', elapsedSec: 0 });

    // 4. Execute DSP chain
    try {
      const steps = buildSteps({ inputUri, songKey, outputUri });
      const result = await this.bridge.execute(steps, inputUri, outputUri);

      // 5a. Success path
      await this.counterRepo.increment(); // single tx — increment directly after execute
      job.status = 'completed';
      job.outputUri = result.outputUri;
      store.setPollState({ kind: 'completed', presignedUrl: result.outputUri });
    } catch (err) {
      // 5b. Failure path — do not re-throw, do not call increment
      const errorMessage = err instanceof Error ? err.message : String(err);
      job.status = 'failed';
      job.error = errorMessage;
      store.setPollState({ kind: 'failed', error: errorMessage });
    }

    return jobId;
  }

  /**
   * Best-effort cancel of an in-progress job.
   *
   * If the job is currently 'processing', we mark it cancelled here.
   * NOTE: The DSP bridge executes synchronously in the JS thread; there is no mid-execution
   * interruption mechanism. If execute() is still running, the success path will overwrite
   * the 'failed' state with 'completed' once it resolves. This is a known limitation (task 09).
   */
  cancel(jobId: string): void {
    const job = jobs.get(jobId);
    if (job && job.status === 'processing') {
      job.status = 'failed';
      job.error = 'cancelled';
      useGenerationStore.getState().setPollState({ kind: 'failed', error: 'cancelled' });
    }
  }

  /** Return current job snapshot or null if not found. */
  pollStatus(jobId: string): LocalGenerationJob | null {
    return jobs.get(jobId) ?? null;
  }
}
