import type { CandidateInput, CashConversionStatus } from "../types";

const DAY = 24 * 60 * 60 * 1000;

// Cash conversion timing — Document 4 §12. Compares expected sell-through/collection timing
// against the vendor payment due date. "Near" is within the caution window (default 7 days).
export function cashConversionStatus(
  candidate: CandidateInput,
  cautionWindowDays = 7
): CashConversionStatus {
  const sellThrough = candidate.expectedSellThroughDate;
  const paymentDue = candidate.vendorPaymentDueDate;
  if (!sellThrough || !paymentDue) return "Unknown";

  const diffDays = (paymentDue.getTime() - sellThrough.getTime()) / DAY;
  if (diffDays > cautionWindowDays) return "Good Match"; // converts well before payment due
  if (diffDays >= -cautionWindowDays) return "Caution"; // converts near payment due
  return "Mismatch"; // converts after payment due
}
