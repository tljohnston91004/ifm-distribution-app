import type {
  DataConfidence,
  EvidenceStrength,
  FundingBucket,
  FundingSource,
  FundingStatus,
  IfmDecisionLabel,
  OpenPoCommitmentStatus,
  ReadinessLabel,
  RecommendationStatus,
  RseClassification,
  UrgencyLevel,
} from "./enums";

// Configurable thresholds (Document 2 §11). Mirrors ReviewSettings.
export interface IfmSettingsInput {
  protectedCashReserve: number;
  ownerApprovalThreshold: number;
  materialPurchaseAmount: number;
  arHighConfidenceFactor: number;
  arMediumConfidenceFactor: number;
  arLowConfidenceFactor: number;
  vendorConcentrationLimit: number;
  emergencyHoldbackAmount: number;
  holdbackPercent: number;
  approvalExpirationDays: number;
}

export interface CashPositionInput {
  cashOnHand: number;
  availableOperatingCash?: number | null;
  restrictedCash?: number | null;
  dataConfidence: DataConfidence;
}

export interface RequiredOutflowInput {
  amount: number;
  dueDate: Date;
  requiredStatus: "must-pay" | "flexible" | "unknown";
  canDelay?: boolean | null;
}

export interface ApItemInput {
  amountDue: number;
  dueDate: Date;
  criticalVendorFlag?: boolean;
}

export interface ArItemInput {
  expectedAmount: number;
  expectedCollectionDate: Date;
  collectionConfidence: DataConfidence | "High" | "Medium" | "Low";
  includedInCoreFunding: boolean;
  factoredFlag: boolean;
}

export interface OpenPoInput {
  remainingOpenAmount: number;
  cashExposureAmount: number;
  commitmentStatus: OpenPoCommitmentStatus;
}

export interface LocInput {
  remainingAvailability: number;
  borrowingBaseLimit?: number | null;
  managementDrawLimit?: number | null;
  approvalRequired: boolean;
}

export interface FactoringInput {
  eligibleArAmount: number;
  advanceRate: number;
  factoringFee: number;
  reserveHoldback?: number | null;
  approvalRequired: boolean;
}

export interface FinancingInput {
  fundingSourceType: "LOC" | "factoring" | "other";
  approvedForInventoryAmount: number;
  approvalRequired: boolean;
  loc?: LocInput | null;
  factoring?: FactoringInput | null;
}

export interface CandidateEvidenceInput {
  sourceType: string;
  evidenceStrength: EvidenceStrength;
}

export interface CandidateInput {
  id: string;
  vendorName: string;
  estimatedTotalCost: number;
  needReason: string;
  urgencyLevel: UrgencyLevel;
  sourceOfRequest: string;
  dataConfidence: DataConfidence;
  evidence: CandidateEvidenceInput[];
  // RSE linkage (optional)
  rseClassification?: RseClassification | null;
  belowMin?: boolean | null;
  demandSupportLevel?: "strong" | "moderate" | "weak" | null;
  // Cash conversion timing inputs (optional)
  expectedSellThroughDate?: Date | null;
  vendorPaymentDueDate?: Date | null;
  // Vendor offer / promo-buy split (Document 4 §11). When present, only the normal-need
  // portion is treated as fundable; the incremental portion is excluded unless supported.
  vendorOffer?: { requiredAmount: number; normalNeededAmount: number } | null;
}

export interface FundingRunInput {
  reviewDate: Date;
  fundingWindowStart: Date;
  fundingWindowEnd: Date;
  settings: IfmSettingsInput;
  cashPositions: CashPositionInput[];
  requiredOutflows: RequiredOutflowInput[];
  apItems: ApItemInput[];
  arItems: ArItemInput[];
  openPurchaseOrders: OpenPoInput[];
  financingSources: FinancingInput[];
  candidates: CandidateInput[];
  // Confirmed-none-exist flags (Document 3 §7): a domain explicitly confirmed empty.
  confirmedNone?: Partial<Record<"cash" | "outflows" | "ap" | "ar" | "openPo" | "candidates", boolean>>;
  manualCashAdditions?: number;
  manualCashReductions?: number;
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export interface CoreFundingResult {
  cashOnHand: number;
  confidentExpectedInflows: number;
  protectedCashReserve: number;
  requiredOutflowsTotal: number;
  apPressureTotal: number;
  openPoExposureTotal: number;
  manualCashAdditions: number;
  manualCashReductions: number;
  coreAvailableInventoryFunding: number;
  negativeWarning: boolean;
  fundingConfidence: DataConfidence;
}

export interface SupplementalFundingResult {
  approvedLocCapacity: number;
  approvedNetFactoring: number;
  otherApprovedFunding: number;
  supplementalFundingCapacity: number;
  fundingConfidence: DataConfidence;
}

export interface TotalFundingResult {
  core: CoreFundingResult;
  supplemental: SupplementalFundingResult;
  totalPotentialInventoryFunding: number;
}

export type CashConversionStatus = "Good Match" | "Caution" | "Mismatch" | "Unknown";

export interface CandidateDecisionResult {
  candidateId: string;
  vendorName: string;
  requestedAmount: number;
  evidenceRank: number;
  rsePriority: "high" | "medium" | "caution" | "low" | "review";
  cashConversion: CashConversionStatus;
  fundingBucket: FundingBucket;
  allocationPriority: number;
  allocatedAmount: number;
  unfundedAmount: number;
  fundingSource: FundingSource;
  fundingStatus: FundingStatus;
  recommendationStatus: RecommendationStatus;
  decisionLabel: IfmDecisionLabel;
  approvedAmount: number;
  delayedAmount: number;
  excludedAmount: number;
  ownerApprovalRequired: boolean;
  financingApprovalRequired: boolean;
  decisionReason: string;
  confidenceLevel: DataConfidence;
}

export interface ReadinessResult {
  label: ReadinessLabel;
  blockingReasons: string[];
  limitations: string[];
}

export interface FundingRunResult {
  readiness: ReadinessResult;
  funding: TotalFundingResult;
  decisions: CandidateDecisionResult[];
}
