import type { CinemaSessionBundle, FeatureSnapshot } from '../types';
import { buildCinemaFramePlans, SYNCED_CINEMA_VIDEO_CONFIG } from './cinemaVideoTimeline';
import { buildVideoFramePlans, DEFAULT_VIDEO_CONFIG, type VideoFramePlan } from './videoTimeline';

export const MIN_FLIGHT_VIDEO_SAMPLES = 8;

export type FlightVideoPlan = {
  plans: VideoFramePlan[];
  fps: number;
  audioBlob: Blob | null;
};

/** Единый таймлайн для 3D-видео: Live или Process + голос, если записан. */
export function buildFlightVideoPlan(input: {
  cinemaBundle: CinemaSessionBundle | null;
  processSnapshots: FeatureSnapshot[];
}): FlightVideoPlan {
  const bundle = input.cinemaBundle;
  const process = input.processSnapshots;

  const audioBlob = bundle && bundle.audioBlob.size > 0 ? bundle.audioBlob : null;

  if (bundle && bundle.samples.length >= MIN_FLIGHT_VIDEO_SAMPLES) {
    return {
      plans: buildCinemaFramePlans(bundle, SYNCED_CINEMA_VIDEO_CONFIG),
      fps: SYNCED_CINEMA_VIDEO_CONFIG.fps,
      audioBlob,
    };
  }

  if (process.length >= 2) {
    return {
      plans: buildVideoFramePlans(process, DEFAULT_VIDEO_CONFIG),
      fps: DEFAULT_VIDEO_CONFIG.fps,
      audioBlob,
    };
  }

  throw new Error('Flight video needs a longer session or Process with 2+ stages');
}

export function canBuildFlightVideo(input: {
  cinemaBundle: CinemaSessionBundle | null;
  processSnapshots: FeatureSnapshot[];
}): boolean {
  const bundle = input.cinemaBundle;
  if (bundle && bundle.samples.length >= MIN_FLIGHT_VIDEO_SAMPLES) {
    return true;
  }
  return input.processSnapshots.length >= 2;
}
