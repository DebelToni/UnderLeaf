export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'Never';
  const delta = new Date(value).getTime() - Date.now();
  const absolute = Math.abs(delta);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absolute < 60_000) return formatter.format(Math.round(delta / 1_000), 'second');
  if (absolute < 3_600_000) return formatter.format(Math.round(delta / 60_000), 'minute');
  if (absolute < 86_400_000) return formatter.format(Math.round(delta / 3_600_000), 'hour');
  return formatter.format(Math.round(delta / 86_400_000), 'day');
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(value: string): string {
  return value.trim().split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export const collaboratorColors = ['#5e6ad2', '#2583e9', '#67a900', '#c98200', '#c84c57', '#8b5fbf'];

export function colorFor(value: string): string {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return collaboratorColors[Math.abs(hash) % collaboratorColors.length]!;
}
