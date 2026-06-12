export const usd = (n: number | null | undefined): string =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const shortDate = (date: Date | string | null | undefined): string => {
  if (!date) return "—";
  const dt = typeof date === "string" ? new Date(date) : date;
  return dt.toISOString().slice(0, 10);
};
