import type { DataConfidence } from "../enums";

const ORDER: DataConfidence[] = [
  "High Confidence",
  "Medium Confidence",
  "Low Confidence",
  "Insufficient Data",
];

// Normalize loose confidence labels ("High", "Medium", "Low") to the controlled enum.
export function normalizeConfidence(value: string | null | undefined): DataConfidence {
  if (!value) return "Insufficient Data";
  const v = value.trim().toLowerCase();
  if (v.startsWith("high")) return "High Confidence";
  if (v.startsWith("med")) return "Medium Confidence";
  if (v.startsWith("low")) return "Low Confidence";
  if (v.startsWith("insufficient")) return "Insufficient Data";
  return "Medium Confidence";
}

// Lowest (worst) confidence among the inputs. Empty input => Insufficient Data.
export function worstConfidence(values: DataConfidence[]): DataConfidence {
  if (values.length === 0) return "Insufficient Data";
  return values.reduce((worst, cur) =>
    ORDER.indexOf(cur) > ORDER.indexOf(worst) ? cur : worst
  );
}

// AR inclusion factor by collection confidence (Document 4 §4).
export function arInclusionFactor(
  confidence: DataConfidence,
  settings: { arHighConfidenceFactor: number; arMediumConfidenceFactor: number; arLowConfidenceFactor: number }
): number {
  switch (confidence) {
    case "High Confidence":
      return settings.arHighConfidenceFactor;
    case "Medium Confidence":
      return settings.arMediumConfidenceFactor;
    case "Low Confidence":
      return settings.arLowConfidenceFactor;
    default:
      return 0; // Insufficient Data is not counted toward core funding.
  }
}
