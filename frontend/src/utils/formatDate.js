/**
 * Format date to YYYY-MM-DD for display.
 * Handles ISO strings (2026-02-10T21:00:00.000Z), Date objects, and date strings.
 * Uses string extraction for ISO format to avoid timezone shifts.
 */
export function formatDate(value) {
  if (!value) return '-';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
