// Controlled enum lists — Document 3 §4.
// Stored as strings in the DB (SQLite has no native enums); these are the source of
// truth for validation and UI option lists.

export const RUN_STATUS = [
  "Draft",
  "Data Uploaded",
  "Validation Needed",
  "Not Ready - Critical Data Missing",
  "Ready with Limitations",
  "Ready for Calculation",
  "Calculation Complete",
  "Internal Review Needed",
  "Approved for Customer Output",
  "Approved with Limitations",
  "Returned for Data Correction",
  "Closed",
  "Archived",
] as const;
export type RunStatus = (typeof RUN_STATUS)[number];

export const DATA_CONFIDENCE = [
  "High Confidence",
  "Medium Confidence",
  "Low Confidence",
  "Insufficient Data",
] as const;
export type DataConfidence = (typeof DATA_CONFIDENCE)[number];

export const FRESHNESS_STATUS = ["Current", "Acceptable", "Stale", "Unknown"] as const;
export type FreshnessStatus = (typeof FRESHNESS_STATUS)[number];

export const FUNDING_SOURCE = [
  "Operating Cash",
  "Expected AR Collections",
  "Line of Credit",
  "Factored Receivables",
  "Vendor Extended Terms",
  "Combination Funding",
  "Not Funded",
  "Funding Source Unclear",
] as const;
export type FundingSource = (typeof FUNDING_SOURCE)[number];

export const FUNDING_STATUS = [
  "Cash Fundable",
  "Fundable with Expected Inflows",
  "Fundable with LOC Approval",
  "Fundable with Factoring Approval",
  "Fundable with Vendor Terms",
  "Not Currently Fundable",
  "Funding Source Unclear",
] as const;
export type FundingStatus = (typeof FUNDING_STATUS)[number];

export const RECOMMENDATION_STATUS = [
  "Recommended",
  "Recommended with Caution",
  "Partially Recommended",
  "Not Recommended",
  "Hold Until More Data",
  "Owner Review Required",
  "Emergency Review Required",
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUS)[number];

export const IFM_DECISION_LABEL = [
  "Approve",
  "Approve with Caution",
  "Reduce Order",
  "Split Purchase",
  "Delay Purchase",
  "Hold Until More Data",
  "Owner Approval Required",
  "Emergency Review Required",
  "Decline Vendor Offer",
  "Take Partial Vendor Offer",
  "Take Full Vendor Offer",
] as const;
export type IfmDecisionLabel = (typeof IFM_DECISION_LABEL)[number];

export const OPEN_PO_COMMITMENT_STATUS = [
  "Purchase Candidate Only",
  "Draft / Not Sent",
  "Sent but Changeable",
  "Vendor Confirmed",
  "Partially Shipped",
  "Fully Shipped",
  "Received but Not Billed",
  "Billed / AP Created",
  "Closed",
] as const;
export type OpenPoCommitmentStatus = (typeof OPEN_PO_COMMITMENT_STATUS)[number];

export const EXPORT_USE_STATUS = [
  "Review Only",
  "Customer-Facing",
  "Internal Reviewer Only",
  "Operational Action Support",
  "Keystroke Import-Ready",
] as const;
export type ExportUseStatus = (typeof EXPORT_USE_STATUS)[number];

export const FUNDING_BUCKET = [
  "Must-Fund / Service Protection",
  "Normal Replenishment",
  "Vendor Promo / Opportunity Buy",
  "Emergency Reserve / Holdback",
  "Delayed / Watchlist",
] as const;
export type FundingBucket = (typeof FUNDING_BUCKET)[number];

export const READINESS_LABEL = [
  "Ready",
  "Ready with Limitations",
  "Not Ready",
  "Action-Area Blocked",
] as const;
export type ReadinessLabel = (typeof READINESS_LABEL)[number];

// Evidence strength — Document 3 purchase_candidate_sources.
export const EVIDENCE_STRENGTH = ["strong", "moderate", "weak", "unsupported"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTH)[number];

// RSE classification families — Document 4 §9.
export const RSE_CLASSIFICATION = [
  "fast",
  "moderate",
  "seasonal",
  "slow",
  "overstock",
  "none",
] as const;
export type RseClassification = (typeof RSE_CLASSIFICATION)[number];

export const URGENCY_LEVEL = ["low", "medium", "high", "emergency"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVEL)[number];
