const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

export function weekIndexForDate(date: Date, reviewDate: Date, runwayWeeks: number): number | null {
  const base = startOfWeek(reviewDate);
  const target = startOfWeek(date);
  const diffWeeks = Math.floor((target.getTime() - base.getTime()) / (7 * DAY_MS));
  if (diffWeeks < 0 || diffWeeks >= runwayWeeks) return null;
  return diffWeeks;
}

function addToMap(map: Map<number, number>, week: number, amount: number) {
  map.set(week, Math.round(((map.get(week) ?? 0) + amount) * 100) / 100);
}

export interface DatedAmount {
  date: Date;
  amount: number;
}

export function buildApOutflowsByWeek(
  items: DatedAmount[],
  reviewDate: Date,
  runwayWeeks: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of items) {
    const w = weekIndexForDate(item.date, reviewDate, runwayWeeks);
    if (w !== null) addToMap(map, w, item.amount);
  }
  return map;
}

export function buildArInflowsByWeek(
  items: DatedAmount[],
  reviewDate: Date,
  runwayWeeks: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of items) {
    const w = weekIndexForDate(item.date, reviewDate, runwayWeeks);
    if (w !== null) addToMap(map, w, item.amount);
  }
  return map;
}

export function buildOtherOutflowsByWeek(
  items: DatedAmount[],
  reviewDate: Date,
  runwayWeeks: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (const item of items) {
    const w = weekIndexForDate(item.date, reviewDate, runwayWeeks);
    if (w !== null) addToMap(map, w, item.amount);
  }
  return map;
}
