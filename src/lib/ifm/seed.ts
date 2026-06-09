import { prisma } from "@/lib/db";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Steve's Bowling Supply sample test case — Document 7. Creates a complete, calculable run.
// Idempotent: removes any prior sample company first.
export async function seedSampleRun(): Promise<string> {
  await prisma.company.deleteMany({ where: { companyName: "Steve's Bowling Supply Company" } });

  const company = await prisma.company.create({
    data: {
      companyName: "Steve's Bowling Supply Company",
      businessType: "Distributor",
      posSystem: "Keystroke (test only)",
      accountingSystem: "QuickBooks (test only)",
      defaultCurrency: "USD",
      reviewSettings: {
        create: {
          protectedCashReserve: 250000,
          ownerApprovalThreshold: 40000,
          materialPurchaseAmount: 5000,
          arHighConfidenceFactor: 1.0,
          arMediumConfidenceFactor: 0.6,
          arLowConfidenceFactor: 0.2,
          vendorConcentrationLimit: 0.4,
          emergencyHoldbackAmount: 10000,
          approvalExpirationDays: 7,
        },
      },
    },
  });

  const run = await prisma.ifmRun.create({
    data: {
      companyId: company.id,
      runName: "Weekly Funding Review — 2026-06-06",
      reviewDate: d("2026-06-06"),
      fundingWindowStart: d("2026-06-06"),
      fundingWindowEnd: d("2026-07-06"),
      reviewCadence: "weekly",
      runStatus: "Data Uploaded",
      cashPositions: {
        create: [
          {
            cashAsOfDate: d("2026-06-06"),
            cashOnHand: 600000,
            availableOperatingCash: 600000,
            restrictedCash: 0,
            dataSource: "QuickBooks / bank report",
            dataConfidence: "High Confidence",
          },
        ],
      },
      requiredOutflows: {
        create: [
          { outflowType: "Payroll", amount: 120000, dueDate: d("2026-06-14"), requiredStatus: "must-pay", canDelay: false, paymentPriority: "critical", dataConfidence: "High Confidence" },
          { outflowType: "Rent / Facility", amount: 28000, dueDate: d("2026-06-15"), requiredStatus: "must-pay", canDelay: false, paymentPriority: "high", dataConfidence: "High Confidence" },
          { outflowType: "Insurance", amount: 12000, dueDate: d("2026-06-20"), requiredStatus: "must-pay", canDelay: false, paymentPriority: "high", dataConfidence: "High Confidence" },
          { outflowType: "Debt Payment", amount: 20000, dueDate: d("2026-06-25"), requiredStatus: "must-pay", canDelay: false, paymentPriority: "high", dataConfidence: "High Confidence" },
          { outflowType: "Utilities / Operating", amount: 15000, dueDate: d("2026-06-28"), requiredStatus: "must-pay", canDelay: false, paymentPriority: "normal", dataConfidence: "High Confidence" },
        ],
      },
      apItems: {
        create: [
          { vendorName: "LaneMaster Supplies", amountDue: 55000, dueDate: d("2026-06-12"), agingBucket: "Current", criticalVendorFlag: true, dataConfidence: "High Confidence" },
          { vendorName: "ProShop Accessories", amountDue: 40000, dueDate: d("2026-06-18"), agingBucket: "Current", criticalVendorFlag: false, dataConfidence: "High Confidence" },
          { vendorName: "StrikeLine Products", amountDue: 65000, dueDate: d("2026-06-24"), agingBucket: "1-30", criticalVendorFlag: true, dataConfidence: "High Confidence" },
          { vendorName: "PinDeck Parts", amountDue: 30000, dueDate: d("2026-07-02"), agingBucket: "Current", criticalVendorFlag: false, dataConfidence: "Medium Confidence" },
        ],
      },
      arItems: {
        create: [
          { customerName: "Metro Bowling Group", expectedAmount: 80000, expectedCollectionDate: d("2026-06-13"), collectionConfidence: "High Confidence", includedInCoreFunding: true, factoredFlag: false, dataConfidence: "High Confidence" },
          { customerName: "Regional Pro Shops", expectedAmount: 70000, expectedCollectionDate: d("2026-06-21"), collectionConfidence: "Medium Confidence", includedInCoreFunding: true, factoredFlag: false, dataConfidence: "Medium Confidence" },
          { customerName: "East Coast Lanes", expectedAmount: 50000, expectedCollectionDate: d("2026-06-29"), collectionConfidence: "Low Confidence", includedInCoreFunding: true, factoredFlag: false, dataConfidence: "Low Confidence" },
          { customerName: "Family Fun Centers", expectedAmount: 35000, expectedCollectionDate: d("2026-07-03"), collectionConfidence: "High Confidence", includedInCoreFunding: true, factoredFlag: false, dataConfidence: "High Confidence" },
        ],
      },
      openPurchaseOrders: {
        create: [
          { poNumber: "PO-6001", vendorName: "LaneMaster Supplies", poDate: d("2026-05-28"), expectedReceiptDate: d("2026-06-19"), originalPoAmount: 40000, remainingOpenAmount: 40000, commitmentStatus: "Vendor Confirmed", changeableFlag: "no", cashExposureAmount: 40000 },
          { poNumber: "PO-6002", vendorName: "ProShop Accessories", poDate: d("2026-05-30"), expectedReceiptDate: d("2026-06-28"), originalPoAmount: 25000, remainingOpenAmount: 25000, commitmentStatus: "Sent but Changeable", changeableFlag: "yes", cashExposureAmount: 25000 },
          { poNumber: "PO-6003", vendorName: "PinDeck Parts", poDate: d("2026-05-20"), expectedReceiptDate: d("2026-06-10"), originalPoAmount: 20000, remainingOpenAmount: 20000, commitmentStatus: "Received but Not Billed", changeableFlag: "no", cashExposureAmount: 20000 },
          { poNumber: "PO-6004", vendorName: "StrikeLine Products", poDate: d("2026-06-04"), expectedReceiptDate: d("2026-07-05"), originalPoAmount: 18000, remainingOpenAmount: 18000, commitmentStatus: "Draft / Not Sent", changeableFlag: "yes", cashExposureAmount: 18000 },
        ],
      },
      financingSources: {
        create: [
          {
            fundingSourceType: "LOC",
            sourceName: "First Commercial Bank LOC",
            availableAmount: 75000,
            approvedForInventoryAmount: 75000,
            estimatedCost: 0,
            approvalRequired: true,
            approvalOwner: "Owner",
            riskNote: "LOC is supplemental funding and requires approval before use.",
            locCapacity: {
              create: {
                locLimit: 150000,
                currentBalanceDrawn: 0,
                remainingAvailability: 75000,
                managementDrawLimit: 75000,
                interestRate: 0.085,
                locStatus: "available",
              },
            },
          },
          {
            fundingSourceType: "factoring",
            sourceName: "Receivables Factoring Co.",
            availableAmount: 66000,
            approvedForInventoryAmount: 66000,
            estimatedCost: 2000,
            approvalRequired: true,
            approvalOwner: "Owner",
            riskNote: "Factored AR cannot also be counted as expected collection.",
            factoringOption: {
              create: {
                eligibleArAmount: 80000,
                advanceRate: 0.85,
                factoringFee: 2000,
                reserveHoldback: 0,
                expectedNetProceeds: 66000,
                factoringStatus: "available",
              },
            },
          },
        ],
      },
      inventorySnapshots: {
        create: [
          { skuOrItemId: "KS-BALL-100", vendorName: "LaneMaster Supplies", quantityOnHand: 10, minQty: 25, maxQty: 60, inventoryValue: 10000, stockoutRiskFlag: true },
          { skuOrItemId: "KS-CLEAN-210", vendorName: "StrikeLine Products", quantityOnHand: 2, minQty: 15, maxQty: 40, inventoryValue: 2000, stockoutRiskFlag: true },
          { skuOrItemId: "KS-ACC-330", vendorName: "ProShop Accessories", quantityOnHand: 40, minQty: 50, maxQty: 90, inventoryValue: 18000 },
          { skuOrItemId: "KS-NOV-700", vendorName: "SlowLane Novelties", quantityOnHand: 200, minQty: 50, maxQty: 100, inventoryValue: 40000, overstockFlag: true, slowMovingFlag: true },
        ],
      },
      rseSignals: {
        create: [
          { skuOrItemId: "KS-BALL-100", vendorName: "LaneMaster Supplies", rseClassification: "Fast-Moving / High Confidence", classificationConfidence: "High Confidence", rseReplenishmentSignal: "increase", belowMinFlag: true, demandSupportLevel: "strong" },
          { skuOrItemId: "KS-CLEAN-210", vendorName: "StrikeLine Products", rseClassification: "Fast-Moving / High Confidence", classificationConfidence: "High Confidence", rseReplenishmentSignal: "protect", belowMinFlag: true, demandSupportLevel: "strong" },
          { skuOrItemId: "KS-ACC-330", vendorName: "ProShop Accessories", rseClassification: "Moderate-Moving", classificationConfidence: "Medium Confidence", rseReplenishmentSignal: "hold", belowMinFlag: true, demandSupportLevel: "moderate" },
          { skuOrItemId: "LM-PROMO", vendorName: "LaneMaster Supplies", rseClassification: "Fast-Moving", classificationConfidence: "Medium Confidence", rseReplenishmentSignal: "increase", demandSupportLevel: "moderate" },
          { skuOrItemId: "KS-PIN-500", vendorName: "PinDeck Parts", rseClassification: "Moderate / Strategic", classificationConfidence: "Low Confidence", rseReplenishmentSignal: "hold", demandSupportLevel: "weak" },
          { skuOrItemId: "KS-NOV-700", vendorName: "SlowLane Novelties", rseClassification: "Slow-Moving / Weak Demand", classificationConfidence: "Low Confidence", rseReplenishmentSignal: "reduce", demandSupportLevel: "weak" },
        ],
      },
      reorderSources: {
        create: [
          { exportDate: d("2026-06-06"), vendorCode: "LANE", itemCode: "KS-BALL-100", quantityOnHand: 10, minQty: 25, maxQty: 60, reorderQty: 30, suggestedOrderAmount: 30000, dataConfidence: "High Confidence" },
          { exportDate: d("2026-06-06"), vendorCode: "STRK", itemCode: "KS-CLEAN-210", quantityOnHand: 2, minQty: 15, maxQty: 40, reorderQty: 25, suggestedOrderAmount: 25000, dataConfidence: "High Confidence" },
          { exportDate: d("2026-06-06"), vendorCode: "PROS", itemCode: "KS-ACC-330", quantityOnHand: 40, minQty: 50, maxQty: 90, reorderQty: 35, suggestedOrderAmount: 35000, dataConfidence: "Medium Confidence" },
          { exportDate: d("2026-06-06"), vendorCode: "NOVL", itemCode: "KS-NOV-700", quantityOnHand: 200, minQty: 50, maxQty: 100, reorderQty: 0, suggestedOrderAmount: 0, dataConfidence: "Medium Confidence" },
        ],
      },
    },
  });

  // Purchase candidates (Document 7 §5) with evidence sources and (where applicable) vendor offers.
  const candidates = [
    { sku: "KS-BALL-100", source: "RSE Recommendation", vendor: "LaneMaster Supplies", cost: 30000, reason: "Fast movers below Min replenishment", urgency: "high", evidence: "strong", note: "Strong RSE support", offer: null },
    { sku: "KS-CLEAN-210", source: "Customer Backorder", vendor: "StrikeLine Products", cost: 25000, reason: "Key customer order backorder", urgency: "high", evidence: "strong", note: "Confirmed backorder", offer: null },
    { sku: "KS-ACC-330", source: "Keystroke Reorder (Suggested Order)", vendor: "ProShop Accessories", cost: 35000, reason: "Normal replenishment reorder", urgency: "medium", evidence: "moderate", note: "Keystroke + moderate demand", offer: null },
    {
      sku: "LM-PROMO", source: "Vendor Offer / Promo Buy", vendor: "LaneMaster Supplies", cost: 60000, reason: "Extended terms and discount promo buy", urgency: "medium", evidence: "moderate", note: "Mixed RSE support (fast + slow)",
      offer: { offerType: "discount + extended terms", required: 60000, normal: 28000, incremental: 32000, benefit: "8% discount; Net 30 becomes 30/60/90; fast items 45-day sell-through, slow items 180+ days", sellThrough: "Fast 45 days / Slow 180+ days", mix: "Fast-moving $28k + Slow-moving $32k" },
    },
    { sku: "KS-PIN-500", source: "Buyer Request", vendor: "PinDeck Parts", cost: 18000, reason: "Strategic product line support", urgency: "medium", evidence: "weak", note: "Buyer note only", offer: null },
    {
      sku: "KS-NOV-700", source: "Vendor Offer / Promo Buy", vendor: "SlowLane Novelties", cost: 22000, reason: "Discount offer promo buy", urgency: "low", evidence: "unsupported", note: "Weak demand support",
      offer: { offerType: "discount", required: 22000, normal: 0, incremental: 22000, benefit: "15% discount; Net 30; 240+ day sell-through", sellThrough: "240+ days", mix: "Slow-moving / overstock" },
    },
    { sku: undefined, source: "Existing Draft PO", vendor: "StrikeLine Products", cost: 18000, reason: "Draft PO not sent", urgency: "medium", evidence: "weak", note: "Draft PO-6004", offer: null },
  ] as const;

  for (const c of candidates) {
    const candidate = await prisma.purchaseCandidate.create({
      data: {
        ifmRunId: run.id,
        sourceOfRequest: c.source,
        vendorName: c.vendor,
        skuOrItemId: c.sku,
        estimatedTotalCost: c.cost,
        needReason: c.reason,
        urgencyLevel: c.urgency,
        dataConfidence: c.evidence === "unsupported" ? "Low Confidence" : "Medium Confidence",
        supportingEvidence: c.note,
        sources: {
          create: [
            {
              sourceType: c.source,
              evidenceStrength: c.evidence,
              sourceConfidence: "Medium Confidence",
              sourceNote: c.note,
            },
          ],
        },
      },
    });

    if (c.offer) {
      await prisma.vendorOffer.create({
        data: {
          ifmRunId: run.id,
          purchaseCandidateId: candidate.id,
          vendorName: c.vendor,
          offerName: `${c.vendor} promo`,
          offerType: c.offer.offerType,
          offerExpirationDate: d("2026-06-30"),
          requiredOrderAmount: c.offer.required,
          normalNeededPurchaseAmount: c.offer.normal,
          incrementalPurchaseAmount: c.offer.incremental,
          discountTermsFreightBenefit: c.offer.benefit,
          expectedSellThroughPeriod: c.offer.sellThrough,
          rseClassificationMix: c.offer.mix,
          offerStatus: "review",
          dataConfidence: "Medium Confidence",
        },
      });
    }
  }

  return run.id;
}
