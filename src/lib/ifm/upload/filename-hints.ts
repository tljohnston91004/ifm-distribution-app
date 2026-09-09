import type { UploadDomainId } from "./domains";
import { UPLOAD_DOMAINS } from "./domains";

/** Guess the intended upload domain from a filename (client + server hint). */
export function guessUploadDomainFromFilename(filename: string): UploadDomainId | null {
  const base = filename.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? filename.toLowerCase();

  if (/balance[_\s-]?sheet|(^|\/)bs[_\s.-]|_bs\./.test(base)) return "cash_positions";
  if (/ap[_\s-]?(detail|aging)|a\/p|accounts[_\s-]?payable/.test(base)) return "ap_items";
  if (/profit[_\s-]?(and|&)[_\s-]?loss|p&l|pnl|profit_loss/.test(base)) return "required_outflows";
  if (/\bar[_\s-]?(detail|aging|\.xls)|accounts[_\s-]?receivable/.test(base)) return "ar_items";
  if (/open[_\s-]?po|purchase[_\s-]?order/.test(base)) return "open_purchase_orders";

  return null;
}

export function domainLabel(id: UploadDomainId): string {
  return UPLOAD_DOMAINS.find((d) => d.id === id)?.label ?? id;
}

export function filenameDomainMismatchMessage(
  filename: string,
  targetDomainId: UploadDomainId,
): string | null {
  const guessed = guessUploadDomainFromFilename(filename);
  if (!guessed || guessed === targetDomainId) return null;
  return `“${filename}” looks like ${domainLabel(guessed)} data. Upload it on the “${domainLabel(guessed)}” card — not “${domainLabel(targetDomainId)}”.`;
}
