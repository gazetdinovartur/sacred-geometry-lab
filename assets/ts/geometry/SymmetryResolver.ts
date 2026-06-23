/** Ритм → симметрия: 3→△, 4→□, 5→☆, 7→7-луч, иначе 6 */
export function symmetryFromRhythm(recentOnsets: number): number {
  if (recentOnsets <= 0) {
    return 6;
  }

  const mod = recentOnsets % 8;

  if (mod === 3 || recentOnsets === 3) {
    return 3;
  }
  if (mod === 4 || recentOnsets === 4) {
    return 4;
  }
  if (mod === 5 || recentOnsets === 5) {
    return 5;
  }
  if (mod === 7 || recentOnsets === 7) {
    return 7;
  }

  return 6;
}

export function symmetryLabel(value: number): string {
  const labels: Record<number, string> = {
    3: '3 · △',
    4: '4 · □',
    5: '5 · ☆',
    6: '6',
    7: '7 · ✦',
  };
  return labels[value] ?? String(value);
}

export function blendGeometryParams(
  snapshots: { params: import('../types').GeometryParams }[],
): import('../types').GeometryParams {
  if (snapshots.length === 0) {
    throw new Error('Cannot blend empty snapshots');
  }

  if (snapshots.length === 1) {
    return structuredClone(snapshots[0].params);
  }

  const n = snapshots.length;
  const sum = structuredClone(snapshots[0].params);

  for (let i = 1; i < n; i += 1) {
    const p = snapshots[i].params;
    sum.radius += p.radius;
    sum.rays += p.rays;
    sum.rotationSpeed += p.rotationSpeed;
    sum.hue += p.hue;
    sum.opacity += p.opacity;
    sum.symmetry += p.symmetry;
    sum.lineWidth += p.lineWidth;
    sum.waveAmplitude += p.waveAmplitude;
    sum.spiralTurns += p.spiralTurns;
    sum.dotCount += p.dotCount;
    sum.elementCount += p.elementCount;
    sum.pitchAngle += p.pitchAngle;
    sum.breathRing = Math.max(sum.breathRing, p.breathRing);
  }

  sum.radius /= n;
  sum.rays = Math.round(sum.rays / n);
  sum.rotationSpeed /= n;
  sum.hue /= n;
  sum.opacity = Math.min(sum.opacity / n, 0.85);
  sum.symmetry = Math.round(sum.symmetry / n);
  sum.lineWidth /= n;
  sum.waveAmplitude /= n;
  sum.spiralTurns /= n;
  sum.dotCount = Math.round(sum.dotCount / n);
  sum.elementCount = Math.round(sum.elementCount / n);
  sum.pitchAngle /= n;

  return sum;
}
