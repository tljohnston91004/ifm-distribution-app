import type { RseReadyPurchaseLine } from "@/lib/ifm/rse-import";

/** Keystroke/RSE sometimes stores vendor number in the vendor name field (e.g. "1"). */
export function isPlaceholderVendorName(name: string | null | undefined): boolean {
  if (!name?.trim()) return true;
  const n = name.trim();
  if (/^vendor\s+\d+$/i.test(n)) return true;
  if (n === "1" || /^unknown vendor$/i.test(n)) return true;
  if (/^\d+$/.test(n)) return true;
  return n.length < 2;
}

export function resolveDisplayVendorName(line: {
  vendorName: string | null;
  vendorId?: string | null;
  vendorGroupName?: string | null;
}): string {
  const group = line.vendorGroupName?.trim();
  if (group && !isPlaceholderVendorName(group)) return group;

  const name = line.vendorName?.trim();
  if (name && !isPlaceholderVendorName(name)) return name;

  const id = line.vendorId?.trim();
  if (id && !isPlaceholderVendorName(id)) return id;

  return "Unknown vendor";
}

/** Best display name per vendor id from all RSE PRE lines in the active queue. */
export function buildVendorNameMapFromRse(lines: RseReadyPurchaseLine[]): Map<string, string> {
  const byVendorId = new Map<string, string>();

  for (const line of lines) {
    const display = resolveDisplayVendorName({
      vendorName: line.vendorName,
      vendorId: line.vendorId,
      vendorGroupName: line.vendorGroupName ?? null,
    });

    if (line.preLineId) {
      byVendorId.set(`line:${line.preLineId}`, display);
    }

    const id = line.vendorId?.trim();
    if (!id) continue;

    const existing = byVendorId.get(`id:${id}`);
    if (!existing || isPlaceholderVendorName(existing)) {
      byVendorId.set(`id:${id}`, display);
    } else if (!isPlaceholderVendorName(display) && display.length > existing.length) {
      byVendorId.set(`id:${id}`, display);
    }
  }

  return byVendorId;
}

export function resolveCandidateVendorName(
  candidate: { vendorName: string; id: string },
  sourceRefId: string | null | undefined,
  nameMap: Map<string, string>,
): string {
  if (sourceRefId && nameMap.has(`line:${sourceRefId}`)) {
    const mapped = nameMap.get(`line:${sourceRefId}`)!;
    if (!isPlaceholderVendorName(mapped)) return mapped;
  }

  const stored = candidate.vendorName?.trim() ?? "";
  if (!isPlaceholderVendorName(stored)) return stored;

  if (/^\d+$/.test(stored) && nameMap.has(`id:${stored}`)) {
    const mapped = nameMap.get(`id:${stored}`)!;
    if (!isPlaceholderVendorName(mapped)) return mapped;
  }

  return stored || "Unknown vendor";
}
