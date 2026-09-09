const DAY_MS = 24 * 60 * 60 * 1000;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Excel 1900-date-system serial (e.g. 46155) → JS Date at noon UTC. */
export function excelSerialToDate(serial: number): Date {
  return new Date((serial - 25569) * 86400 * 1000 + 12 * DAY_MS);
}

/** Normalize QB / Excel date cells to YYYY-MM-DD for IFM upload rows. */
export function formatUploadDate(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;

  const mdy = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const serial = Number(v);
  if (/^\d+(\.\d+)?$/.test(v) && serial >= 1 && serial < 100000) {
    return isoDate(excelSerialToDate(serial));
  }

  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);
  return v;
}
