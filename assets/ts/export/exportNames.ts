/** Метка времени для имён файлов: 2026-06-24-18-30-45 */
export function exportTimestampTag(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('-');
}

export function sessionZipFilename(date = new Date()): string {
  return `sgl-сессия-${exportTimestampTag(date)}.zip`;
}

export function sessionVideoFilename(date = new Date()): string {
  return `sgl-сессия-${exportTimestampTag(date)}.webm`;
}

export function sessionCinemaVideoFilename(date = new Date()): string {
  return `sgl-мандала-${exportTimestampTag(date)}.webm`;
}

export function mandalaPngFilename(date = new Date()): string {
  return `sgl-мандала-${exportTimestampTag(date)}.png`;
}

export function mandalaSvgFilename(date = new Date()): string {
  return `sgl-мандала-${exportTimestampTag(date)}.svg`;
}

export function patternsPngZipFilename(date = new Date()): string {
  return `sgl-узоры-${exportTimestampTag(date)}.zip`;
}
