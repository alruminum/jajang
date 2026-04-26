/**
 * Promise-based sleep helper.
 * 재사용: crossfade 볼륨 ramp, fade-out 등에서 공통 사용.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
