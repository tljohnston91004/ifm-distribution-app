import { prisma } from "@/lib/db";
import { runFunding } from "@/lib/ifm/engine";
import { buildCashRunway } from "@/lib/ifm/runway/build-runway";
import type {
  CandidateInput,
  FinancingInput,
  FundingRunInput,
  IfmSettingsInput,
} from "@/lib/ifm/types";
import type { RseClassification } from "@/lib/ifm/enums";

function rseClassFromString(value: string | null | undefined): RseClassification | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  const letter = v.charAt(0);
  if (letter === "A" || letter === "B") return "fast";
  if (letter === "C" || letter === "D") return "moderate";
  if (letter === "E" || letter === "F") return "slow";
  const lower = value.toLowerCase();
  if (lower.includes("fast")) return "fast";
  if (lower.includes("overstock")) return "overstock";
  if (lower.includes("slow")) return "slow";
  if (lower.includes("seasonal")) return "seasonal";
  if (lower.includes("moderate")) return "moderate";
  if (lower.includes("none")) return "none";
  return null;
}

const DEFAULT_SETTINGS: IfmSettingsInput = {
  protectedCashReserve: 0,
  ownerApprovalThreshold: 25000,
  materialPurchaseAmount: 5000,
  arHighConfidenceFactor: 1.0,
  arMediumConfidenceFactor: 0.6,
  arLowConfidenceFactor: 0.2,
  vendorConcentrationLimit: 0.35,
  emergencyHoldbackAmount: 0,
  holdbackPercent: 0.1,
  approvalExpirationDays: 7,
};

type RunWithRelations = NonNullable<Awaited<ReturnType<typeof loadRun>>>;

export function loadRun(runId: string) {
  return prisma.ifmRun.findUnique({
    where: { id: runId },
    include: {
      company: { include: { reviewSettings: true } },
      cashPositions: true,
      requiredOutflows: true,
      apItems: true,
      arItems: true,
      financingSources: { include: { locCapacity: true, factoringOption: true } },
      openPurchaseOrders: true,
      inventorySnapshots: true,
      rseSignals: true,
      purchaseCandidates: { include: { sources: true, vendorOffer: true } },
    },
  });
}

// Map a persisted run + its relations into the pure engine input (Document 3 → engine types).
export function toFundingRunInput(run: RunWithRelations): FundingRunInput {
  const settingsRow = run.company.reviewSettings[0];
  const settings: IfmSettingsInput = settingsRow
    ? {
        protectedCashReserve: settingsRow.protectedCashReserve,
        ownerApprovalThreshold: settingsRow.ownerApprovalThreshold,
        materialPurchaseAmount: settingsRow.materialPurchaseAmount,
        arHighConfidenceFactor: settingsRow.arHighConfidenceFactor,
        arMediumConfidenceFactor: settingsRow.arMediumConfidenceFactor,
        arLowConfidenceFactor: settingsRow.arLowConfidenceFactor,
        vendorConcentrationLimit: settingsRow.vendorConcentrationLimit,
        emergencyHoldbackAmount: settingsRow.emergencyHoldbackAmount,
        holdbackPercent: settingsRow.holdbackPercent,
        approvalExpirationDays: settingsRow.approvalExpirationDays,
      }
    : DEFAULT_SETTINGS;

  // Index RSE signals by SKU so candidates can pick up classification/demand support.
  const rseBySku = new Map(run.rseSignals.map((s) => [s.skuOrItemId, s]));

  const financingSources: FinancingInput[] = run.financingSources.map((f) => ({
    fundingSourceType: (f.fundingSourceType as FinancingInput["fundingSourceType"]) ?? "other",
    approvedForInventoryAmount: f.approvedForInventoryAmount,
    approvalRequired: f.approvalRequired,
    loc: f.locCapacity
      ? {
          remainingAvailability: f.locCapacity.remainingAvailability,
          borrowingBaseLimit: f.locCapacity.borrowingBaseLimit,
          managementDrawLimit: f.locCapacity.managementDrawLimit,
          approvalRequired: f.approvalRequired,
        }
      : null,
    factoring: f.factoringOption
      ? {
          eligibleArAmount: f.factoringOption.eligibleArAmount,
          advanceRate: f.factoringOption.advanceRate,
          factoringFee: f.factoringOption.factoringFee,
          reserveHoldback: f.factoringOption.reserveHoldback,
          approvalRequired: f.approvalRequired,
        }
      : null,
  }));

  const candidates: CandidateInput[] = run.purchaseCandidates.map((c) => {
    const rse = c.skuOrItemId ? rseBySku.get(c.skuOrItemId) : undefined;
    return {
      id: c.id,
      vendorName: c.vendorName,
      estimatedTotalCost: c.estimatedTotalCost,
      needReason: c.needReason,
      urgencyLevel: (c.urgencyLevel as CandidateInput["urgencyLevel"]) ?? "medium",
      sourceOfRequest: c.sourceOfRequest,
      dataConfidence: c.dataConfidence as CandidateInput["dataConfidence"],
      evidence: c.sources.map((s) => ({
        sourceType: s.sourceType,
        evidenceStrength: s.evidenceStrength as CandidateInput["evidence"][number]["evidenceStrength"],
      })),
      rseClassification: rseClassFromString(rse?.rseClassification),
      belowMin: rse?.belowMinFlag ?? null,
      demandSupportLevel: (rse?.demandSupportLevel as CandidateInput["demandSupportLevel"]) ?? null,
      vendorOffer: c.vendorOffer
        ? {
            requiredAmount: c.vendorOffer.requiredOrderAmount,
            normalNeededAmount: c.vendorOffer.normalNeededPurchaseAmount,
          }
        : null,
    };
  });

  return {
    reviewDate: run.reviewDate,
    fundingWindowStart: run.fundingWindowStart,
    fundingWindowEnd: run.fundingWindowEnd,
    settings,
    cashPositions: run.cashPositions.map((c) => ({
      cashOnHand: c.cashOnHand,
      availableOperatingCash: c.availableOperatingCash,
      restrictedCash: c.restrictedCash,
      dataConfidence: c.dataConfidence as FundingRunInput["cashPositions"][number]["dataConfidence"],
    })),
    requiredOutflows: run.requiredOutflows.map((o) => ({
      amount: o.amount,
      dueDate: o.dueDate,
      requiredStatus: o.requiredStatus as "must-pay" | "flexible" | "unknown",
      canDelay: o.canDelay,
    })),
    apItems: run.apItems.map((a) => ({
      amountDue: a.amountDue,
      dueDate: a.dueDate,
      criticalVendorFlag: a.criticalVendorFlag,
    })),
    arItems: run.arItems.map((a) => ({
      expectedAmount: a.expectedAmount,
      expectedCollectionDate: a.expectedCollectionDate,
      collectionConfidence: a.collectionConfidence as FundingRunInput["arItems"][number]["collectionConfidence"],
      includedInCoreFunding: a.includedInCoreFunding,
      factoredFlag: a.factoredFlag,
    })),
    openPurchaseOrders: run.openPurchaseOrders.map((p) => ({
      remainingOpenAmount: p.remainingOpenAmount,
      cashExposureAmount: p.cashExposureAmount,
      commitmentStatus: p.commitmentStatus as FundingRunInput["openPurchaseOrders"][number]["commitmentStatus"],
    })),
    financingSources,
    candidates,
    manualCashAdditions: run.manualCashAddition,
    manualCashReductions: run.manualCashReduction,
  };
}

// Run the engine for a persisted run and persist calculation outputs, allocations, and decisions.
export async function computeRun(runId: string) {
  const run = await loadRun(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const input = toFundingRunInput(run);
  const result = runFunding(input);
  const { funding, decisions, readiness } = result;

  await prisma.$transaction(async (tx) => {
    await tx.fundingAllocation.deleteMany({ where: { ifmRunId: runId } });
    await tx.purchaseDecision.deleteMany({ where: { ifmRunId: runId } });
    await tx.fundingCalculation.deleteMany({ where: { ifmRunId: runId } });
    await tx.supplementalFundingCalculation.deleteMany({ where: { ifmRunId: runId } });
    await tx.cashRunwaySnapshot.deleteMany({ where: { ifmRunId: runId } });

    await tx.fundingCalculation.create({
      data: {
        ifmRunId: runId,
        cashOnHand: funding.core.cashOnHand,
        confidentExpectedInflows: funding.core.confidentExpectedInflows,
        protectedCashReserve: funding.core.protectedCashReserve,
        requiredOutflowsTotal: funding.core.requiredOutflowsTotal,
        apPressureTotal: funding.core.apPressureTotal,
        openPoExposureTotal: funding.core.openPoExposureTotal,
        manualCashAdditions: funding.core.manualCashAdditions,
        manualCashReductions: funding.core.manualCashReductions,
        coreAvailableInventoryFunding: funding.core.coreAvailableInventoryFunding,
        supplementalFundingCapacity: funding.supplemental.supplementalFundingCapacity,
        totalPotentialInventoryFunding: funding.totalPotentialInventoryFunding,
        fundingConfidence: funding.core.fundingConfidence,
      },
    });

    await tx.supplementalFundingCalculation.create({
      data: {
        ifmRunId: runId,
        approvedLocCapacity: funding.supplemental.approvedLocCapacity,
        approvedNetFactoring: funding.supplemental.approvedNetFactoring,
        otherApprovedFunding: funding.supplemental.otherApprovedFunding,
        supplementalFundingCapacity: funding.supplemental.supplementalFundingCapacity,
        fundingConfidence: funding.supplemental.fundingConfidence,
      },
    });

    for (const d of decisions) {
      await tx.fundingAllocation.create({
        data: {
          ifmRunId: runId,
          purchaseCandidateId: d.candidateId,
          fundingBucket: d.fundingBucket,
          requestedAmount: d.requestedAmount,
          allocatedAmount: d.allocatedAmount,
          unfundedAmount: d.unfundedAmount,
          allocationPriority: d.allocationPriority,
          allocationReason: d.decisionReason,
          fundingSource: d.fundingSource,
          confidenceLevel: d.confidenceLevel,
        },
      });
      await tx.purchaseDecision.create({
        data: {
          ifmRunId: runId,
          purchaseCandidateId: d.candidateId,
          systemDecisionLabel: d.decisionLabel,
          fundingStatus: d.fundingStatus,
          recommendationStatus: d.recommendationStatus,
          approvedAmount: d.approvedAmount,
          delayedAmount: d.delayedAmount,
          excludedAmount: d.excludedAmount,
          ownerApprovalRequired: d.ownerApprovalRequired,
          financingApprovalRequired: d.financingApprovalRequired,
          decisionReason: d.decisionReason,
          confidenceLevel: d.confidenceLevel,
          decisionStatus: "System",
        },
      });
    }

    await tx.ifmRun.update({
      where: { id: runId },
      data: {
        runStatus: readiness.label === "Not Ready" ? "Not Ready - Critical Data Missing" : "Calculation Complete",
      },
    });

    const settingsRow = run.company.reviewSettings[0];
    const runwayWeeks = run.runwayWeeks || settingsRow?.runwayWeeks || 13;
    const rseBySku = new Map(run.rseSignals.map((s) => [s.skuOrItemId, s]));
    const runway = buildCashRunway({
      reviewDate: run.reviewDate,
      runwayWeeks,
      startingCash: funding.core.cashOnHand + run.manualCashAddition - run.manualCashReduction,
      protectedReserve: funding.core.protectedCashReserve,
      candidates: run.purchaseCandidates.map((c) => ({
        id: c.id,
        vendorName: c.vendorName,
        skuOrItemId: c.skuOrItemId,
        estimatedTotalCost: c.estimatedTotalCost,
        orderTerms: c.orderTerms,
        termsStatus: c.termsStatus,
        approvedClass: rseBySku.get(c.skuOrItemId ?? "")?.rseClassification ?? null,
        expectedPurchaseDate: c.expectedPurchaseDate,
      })),
      sellThroughDaysJson: settingsRow?.sellThroughDaysJson ?? null,
      factoringActive: settingsRow?.factoringActive ?? false,
      factoringAdvanceRate: settingsRow?.factoringAdvanceRate ?? 0.8,
      factoringReserveRate: settingsRow?.factoringReserveRate ?? 0.2,
      factoringAdvanceLagDays: settingsRow?.factoringAdvanceLagDays ?? 1,
      typicalCustomerPayDays: settingsRow?.typicalCustomerPayDays ?? 30,
      collectionLagDays: settingsRow?.collectionLagDays ?? 0,
    });

    await tx.cashRunwaySnapshot.create({
      data: {
        ifmRunId: runId,
        runwayWeeks,
        startingCash: runway.weeks[0]?.openingBalance ?? funding.core.cashOnHand,
        minCashBalance: runway.minCashBalance,
        minCashWeekIndex: runway.minCashWeekIndex,
        belowReserveFlag: runway.belowReserveFlag,
        weeksJson: JSON.stringify(runway.weeks),
        tailCommitmentsJson: JSON.stringify(runway.tailCommitments),
      },
    });
  });

  return result;
}
