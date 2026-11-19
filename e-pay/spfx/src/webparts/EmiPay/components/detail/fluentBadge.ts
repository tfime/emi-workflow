/** Màu chữ badge theo kind (Fluent Text / span). */
export function badgeColor(kind: string): string {
  if (kind === 'warn') return '#92400e';
  if (kind === 'ok') return '#166534';
  if (kind === 'info') return '#1d4ed8';
  if (kind === 'danger') return '#b91c1c';
  return '#4b5563';
}

export function badgeBg(kind: string): string {
  if (kind === 'warn') return '#fef3c7';
  if (kind === 'ok') return '#dcfce7';
  if (kind === 'info') return '#dbeafe';
  if (kind === 'danger') return '#fee2e2';
  return '#f3f4f6';
}
