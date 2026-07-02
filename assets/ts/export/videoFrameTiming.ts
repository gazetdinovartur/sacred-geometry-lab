import type { VideoFramePlan } from './videoTimeline';

/** Метки кадров по timeMs плана — синхрон с аудио. */
export function videoFrameTiming(
  plans: VideoFramePlan[],
  index: number,
  fps: number,
): { timestamp: number; duration: number } {
  const plan = plans[index];
  const timestamp = Math.round(plan.timeMs * 1000);
  const nextMs = plans[index + 1]?.timeMs ?? plan.timeMs + 1000 / fps;
  const duration = Math.max(1, Math.round((nextMs - plan.timeMs) * 1000));
  return { timestamp, duration };
}
