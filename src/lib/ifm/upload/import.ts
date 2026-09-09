import { prisma } from "@/lib/db";
import type { UploadDomainId } from "./domains";
import { getUploadDomain } from "./domains";
import {
  parseBoolean,
  parseConfidence,
  parseDate,
  parseNumber,
  type ParsedUploadRow,
} from "./parse";

export interface UploadMeta {
  sourceSystemName: string;
  sourceSystemType: string;
  sourceDocumentName: string;
  replaceExisting: boolean;
}

export interface ImportUploadResult {
  domain: UploadDomainId;
  imported: number;
  replaced: boolean;
  totalRows?: number;
  warnings: string[];
  sourceDocumentId?: string;
}

export type ConfirmedNoneFlags = {
  cash?: boolean;
  outflows?: boolean;
  ap?: boolean;
  ar?: boolean;
  openPo?: boolean;
  candidates?: boolean;
};

export function parseConfirmedNone(json: string | null | undefined): ConfirmedNoneFlags {
  if (!json) return {};
  try {
    return JSON.parse(json) as ConfirmedNoneFlags;
  } catch {
    return {};
  }
}

export interface UploadCountSnapshot {
  cash_positions?: number;
  required_outflows?: number;
  ap_items?: number;
  ar_items?: number;
  open_purchase_orders?: number;
}

/** Drop “confirmed none” flags when rows already exist for that domain. */
export function reconcileConfirmedNone(
  counts: UploadCountSnapshot,
  flags: ConfirmedNoneFlags,
): ConfirmedNoneFlags {
  const next: ConfirmedNoneFlags = { ...flags };
  if ((counts.cash_positions ?? 0) > 0) delete next.cash;
  if ((counts.required_outflows ?? 0) > 0) delete next.outflows;
  if ((counts.ap_items ?? 0) > 0) delete next.ap;
  if ((counts.ar_items ?? 0) > 0) delete next.ar;
  if ((counts.open_purchase_orders ?? 0) > 0) delete next.openPo;
  return next;
}

export async function persistReconciledConfirmedNone(
  runId: string,
  counts: UploadCountSnapshot,
): Promise<ConfirmedNoneFlags> {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    select: { confirmedNoneJson: true },
  });
  if (!run) throw new Error("Run not found.");

  const current = parseConfirmedNone(run.confirmedNoneJson);
  const reconciled = reconcileConfirmedNone(counts, current);
  if (JSON.stringify(reconciled) === JSON.stringify(current)) return reconciled;

  await prisma.ifmRun.update({
    where: { id: runId },
    data: { confirmedNoneJson: JSON.stringify(reconciled) },
  });
  return reconciled;
}

export async function setConfirmedNone(
  runId: string,
  key: keyof ConfirmedNoneFlags,
  confirmed: boolean,
): Promise<ConfirmedNoneFlags> {
  const run = await prisma.ifmRun.findUnique({ where: { id: runId }, select: { confirmedNoneJson: true } });
  if (!run) throw new Error("Run not found.");
  const flags = parseConfirmedNone(run.confirmedNoneJson);
  if (confirmed) flags[key] = true;
  else delete flags[key];
  await prisma.ifmRun.update({
    where: { id: runId },
    data: { confirmedNoneJson: JSON.stringify(flags) },
  });
  return flags;
}

async function recordSourceDocument(
  companyId: string,
  meta: UploadMeta,
  domain: UploadDomainId,
): Promise<string> {
  const system =
    (await prisma.sourceSystem.findFirst({
      where: { companyId, sourceSystemName: meta.sourceSystemName },
    })) ??
    (await prisma.sourceSystem.create({
      data: {
        companyId,
        sourceSystemName: meta.sourceSystemName,
        sourceSystemType: meta.sourceSystemType,
      },
    }));

  const doc = await prisma.sourceDocument.create({
    data: {
      sourceSystemId: system.id,
      sourceDocumentName: meta.sourceDocumentName,
      sourceDocumentType: "upload",
      sourceDate: new Date(),
      freshnessStatus: "Current",
      confidenceLevel: "Medium Confidence",
      fieldMappings: {
        create: [
          {
            sourceFieldName: "file_upload",
            ifmDomain: domain,
            ifmTable: domain,
            ifmFieldName: "bulk_import",
            mappingRequiredFlag: true,
            mappingConfidence: "Medium Confidence",
            validationStatus: "validated",
          },
        ],
      },
    },
  });

  return doc.id;
}

async function clearConfirmedNoneForDomain(runId: string, domain: UploadDomainId) {
  const domainConfig = getUploadDomain(domain);
  if (!domainConfig?.confirmNoneKey) return;
  const run = await prisma.ifmRun.findUnique({ where: { id: runId }, select: { confirmedNoneJson: true } });
  if (!run) return;
  const flags = parseConfirmedNone(run.confirmedNoneJson);
  delete flags[domainConfig.confirmNoneKey];
  await prisma.ifmRun.update({
    where: { id: runId },
    data: { confirmedNoneJson: JSON.stringify(flags) },
  });
}

export async function importUploadRows(
  runId: string,
  domainId: UploadDomainId,
  rows: ParsedUploadRow[],
  meta: UploadMeta,
  warnings: string[] = [],
): Promise<ImportUploadResult> {
  const domain = getUploadDomain(domainId);
  if (!domain) throw new Error(`Unknown upload domain: ${domainId}`);

  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    include: { company: true },
  });
  if (!run) throw new Error("Run not found.");

  const dataSource = `${meta.sourceSystemName} — ${meta.sourceDocumentName}`;
  let imported = 0;

  await prisma.$transaction(async (tx) => {
    if (meta.replaceExisting) {
      switch (domainId) {
        case "cash_positions":
          await tx.cashPosition.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "required_outflows":
          await tx.requiredOutflow.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "ap_items":
          await tx.apItem.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "ar_items":
          await tx.arItem.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "open_purchase_orders":
          await tx.openPurchaseOrder.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "inventory_snapshots":
          await tx.inventorySnapshot.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "reorder_sources":
          await tx.reorderSource.deleteMany({ where: { ifmRunId: runId } });
          break;
        case "vendor_terms":
          break;
      }
    }

    switch (domainId) {
      case "cash_positions": {
        for (const row of rows) {
          const v = row.values;
          await tx.cashPosition.create({
            data: {
              ifmRunId: runId,
              cashAsOfDate: parseDate(v.cash_as_of_date, "cash_as_of_date", row.rowNumber),
              cashOnHand: parseNumber(v.cash_on_hand, "cash_on_hand", row.rowNumber),
              availableOperatingCash: v.available_operating_cash
                ? parseNumber(v.available_operating_cash, "available_operating_cash", row.rowNumber, false)
                : null,
              restrictedCash: v.restricted_cash
                ? parseNumber(v.restricted_cash, "restricted_cash", row.rowNumber, false)
                : null,
              dataSource: v.data_source?.trim() || dataSource,
              dataConfidence: parseConfidence(v.data_confidence),
            },
          });
          imported++;
        }
        break;
      }
      case "required_outflows": {
        for (const row of rows) {
          const v = row.values;
          await tx.requiredOutflow.create({
            data: {
              ifmRunId: runId,
              outflowType: v.outflow_type.trim(),
              vendorOrPayee: v.vendor_or_payee?.trim() || null,
              amount: parseNumber(v.amount, "amount", row.rowNumber),
              dueDate: parseDate(v.due_date, "due_date", row.rowNumber),
              requiredStatus: v.required_status?.trim() || "must-pay",
              canDelay: v.can_delay ? parseBoolean(v.can_delay) : null,
              paymentPriority: v.payment_priority?.trim() || null,
              dataConfidence: parseConfidence(v.data_confidence),
            },
          });
          imported++;
        }
        break;
      }
      case "ap_items": {
        for (const row of rows) {
          const v = row.values;
          await tx.apItem.create({
            data: {
              ifmRunId: runId,
              vendorName: v.vendor_name.trim(),
              invoiceNumber: v.invoice_number?.trim() || null,
              amountDue: parseNumber(v.amount_due, "amount_due", row.rowNumber),
              dueDate: parseDate(v.due_date, "due_date", row.rowNumber),
              invoiceDate: v.invoice_date ? parseDate(v.invoice_date, "invoice_date", row.rowNumber) : null,
              agingBucket: v.aging_bucket?.trim() || null,
              paymentTerms: v.payment_terms?.trim() || null,
              criticalVendorFlag: parseBoolean(v.critical_vendor_flag ?? ""),
              dataConfidence: parseConfidence(v.data_confidence),
            },
          });
          imported++;
        }
        break;
      }
      case "ar_items": {
        for (const row of rows) {
          const v = row.values;
          await tx.arItem.create({
            data: {
              ifmRunId: runId,
              customerName: v.customer_name?.trim() || null,
              invoiceNumber: v.invoice_number?.trim() || null,
              expectedAmount: parseNumber(v.expected_amount, "expected_amount", row.rowNumber),
              expectedCollectionDate: parseDate(
                v.expected_collection_date,
                "expected_collection_date",
                row.rowNumber,
              ),
              collectionConfidence: parseConfidence(v.collection_confidence, "Medium Confidence"),
              includedInCoreFunding: parseBoolean(v.included_in_core_funding ?? "", true),
              factoredFlag: parseBoolean(v.factored_flag ?? ""),
              dataConfidence: parseConfidence(v.data_confidence),
            },
          });
          imported++;
        }
        break;
      }
      case "open_purchase_orders": {
        for (const row of rows) {
          const v = row.values;
          const remaining = parseNumber(v.remaining_open_amount, "remaining_open_amount", row.rowNumber);
          await tx.openPurchaseOrder.create({
            data: {
              ifmRunId: runId,
              poNumber: v.po_number.trim(),
              vendorName: v.vendor_name.trim(),
              poDate: parseDate(v.po_date, "po_date", row.rowNumber),
              expectedReceiptDate: v.expected_receipt_date
                ? parseDate(v.expected_receipt_date, "expected_receipt_date", row.rowNumber)
                : null,
              originalPoAmount: parseNumber(v.original_po_amount, "original_po_amount", row.rowNumber),
              remainingOpenAmount: remaining,
              commitmentStatus: v.commitment_status?.trim() || "Draft / Not Sent",
              changeableFlag: v.changeable_flag?.trim() || null,
              cashExposureAmount: v.cash_exposure_amount
                ? parseNumber(v.cash_exposure_amount, "cash_exposure_amount", row.rowNumber)
                : remaining,
            },
          });
          imported++;
        }
        break;
      }
      case "inventory_snapshots": {
        for (const row of rows) {
          const v = row.values;
          const qoh = parseNumber(v.quantity_on_hand, "quantity_on_hand", row.rowNumber);
          const value = v.inventory_value
            ? parseNumber(v.inventory_value, "inventory_value", row.rowNumber)
            : v.unit_cost
            ? qoh * parseNumber(v.unit_cost, "unit_cost", row.rowNumber)
            : 0;
          await tx.inventorySnapshot.create({
            data: {
              ifmRunId: runId,
              skuOrItemId: v.sku_or_item_id.trim(),
              vendorName: v.vendor_name?.trim() || null,
              location: v.location?.trim() || null,
              quantityOnHand: qoh,
              unitCost: v.unit_cost ? parseNumber(v.unit_cost, "unit_cost", row.rowNumber, false) : null,
              inventoryValue: value,
              minQty: v.min_qty ? parseNumber(v.min_qty, "min_qty", row.rowNumber, false) : null,
              maxQty: v.max_qty ? parseNumber(v.max_qty, "max_qty", row.rowNumber, false) : null,
              weeksOfSupply: v.weeks_of_supply
                ? parseNumber(v.weeks_of_supply, "weeks_of_supply", row.rowNumber, false)
                : null,
              stockoutRiskFlag: parseBoolean(v.stockout_risk_flag ?? ""),
              overstockFlag: parseBoolean(v.overstock_flag ?? ""),
              slowMovingFlag: parseBoolean(v.slow_moving_flag ?? ""),
            },
          });
          imported++;
        }
        break;
      }
      case "reorder_sources": {
        for (const row of rows) {
          const v = row.values;
          await tx.reorderSource.create({
            data: {
              ifmRunId: runId,
              exportDate: parseDate(v.export_date, "export_date", row.rowNumber),
              vendorCode: v.vendor_code?.trim() || null,
              itemCode: v.item_code?.trim() || null,
              quantityOnHand: v.quantity_on_hand
                ? parseNumber(v.quantity_on_hand, "quantity_on_hand", row.rowNumber, false)
                : null,
              minQty: v.min_qty ? parseNumber(v.min_qty, "min_qty", row.rowNumber, false) : null,
              maxQty: v.max_qty ? parseNumber(v.max_qty, "max_qty", row.rowNumber, false) : null,
              reorderQty: v.reorder_qty ? parseNumber(v.reorder_qty, "reorder_qty", row.rowNumber, false) : null,
              suggestedOrderAmount: v.suggested_order_amount
                ? parseNumber(v.suggested_order_amount, "suggested_order_amount", row.rowNumber, false)
                : null,
              dataConfidence: parseConfidence(v.data_confidence),
            },
          });
          imported++;
        }
        break;
      }
      case "vendor_terms": {
        for (const row of rows) {
          const v = row.values;
          const vendorName = v.vendor_name.trim();
          let vendor = await tx.vendor.findFirst({
            where: { companyId: run.companyId, vendorName },
          });
          if (!vendor) {
            vendor = await tx.vendor.create({
              data: {
                companyId: run.companyId,
                vendorName,
                vendorCode: v.vendor_code?.trim() || null,
                standardTerms: v.normal_terms.trim(),
              },
            });
          } else if (meta.replaceExisting) {
            await tx.vendor.update({
              where: { id: vendor.id },
              data: {
                vendorCode: v.vendor_code?.trim() || vendor.vendorCode,
                standardTerms: v.normal_terms.trim(),
              },
            });
            await tx.vendorTerm.deleteMany({ where: { vendorId: vendor.id } });
          }
          await tx.vendorTerm.create({
            data: {
              vendorId: vendor.id,
              normalTerms: v.normal_terms.trim(),
              paymentSchedule: v.payment_schedule?.trim() || null,
              earlyPayDiscount: v.early_pay_discount
                ? parseNumber(v.early_pay_discount, "early_pay_discount", row.rowNumber, false)
                : null,
              termsConfidence: parseConfidence(v.terms_confidence),
              termsSource: v.terms_source?.trim() || dataSource,
            },
          });
          imported++;
        }
        break;
      }
    }

    await tx.ifmRun.update({
      where: { id: runId },
      data: { runStatus: "Data Uploaded" },
    });
  });

  await clearConfirmedNoneForDomain(runId, domainId);

  const sourceDocumentId = await recordSourceDocument(run.companyId, meta, domainId);

  const countAfter = await countDomainRows(runId, domainId);
  const allCounts = await getRunDomainCounts(runId);
  await persistReconciledConfirmedNone(runId, allCounts);

  return {
    domain: domainId,
    imported,
    replaced: meta.replaceExisting,
    totalRows: countAfter,
    warnings,
    sourceDocumentId,
  };
}

async function getRunDomainCounts(runId: string): Promise<UploadCountSnapshot> {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    select: {
      _count: {
        select: {
          cashPositions: true,
          requiredOutflows: true,
          apItems: true,
          arItems: true,
          openPurchaseOrders: true,
        },
      },
    },
  });
  if (!run) throw new Error("Run not found.");
  return {
    cash_positions: run._count.cashPositions,
    required_outflows: run._count.requiredOutflows,
    ap_items: run._count.apItems,
    ar_items: run._count.arItems,
    open_purchase_orders: run._count.openPurchaseOrders,
  };
}

async function countDomainRows(runId: string, domainId: UploadDomainId): Promise<number> {
  switch (domainId) {
    case "cash_positions":
      return prisma.cashPosition.count({ where: { ifmRunId: runId } });
    case "required_outflows":
      return prisma.requiredOutflow.count({ where: { ifmRunId: runId } });
    case "ap_items":
      return prisma.apItem.count({ where: { ifmRunId: runId } });
    case "ar_items":
      return prisma.arItem.count({ where: { ifmRunId: runId } });
    case "open_purchase_orders":
      return prisma.openPurchaseOrder.count({ where: { ifmRunId: runId } });
    case "inventory_snapshots":
      return prisma.inventorySnapshot.count({ where: { ifmRunId: runId } });
    case "reorder_sources":
      return prisma.reorderSource.count({ where: { ifmRunId: runId } });
    default:
      return 0;
  }
}

export async function clearDomainUpload(runId: string, domainId: UploadDomainId): Promise<number> {
  const domain = getUploadDomain(domainId);
  if (!domain) throw new Error(`Unknown upload domain: ${domainId}`);

  let deleted = 0;
  await prisma.$transaction(async (tx) => {
    switch (domainId) {
      case "cash_positions":
        deleted = (await tx.cashPosition.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "required_outflows":
        deleted = (await tx.requiredOutflow.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "ap_items":
        deleted = (await tx.apItem.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "ar_items":
        deleted = (await tx.arItem.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "open_purchase_orders":
        deleted = (await tx.openPurchaseOrder.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "inventory_snapshots":
        deleted = (await tx.inventorySnapshot.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      case "reorder_sources":
        deleted = (await tx.reorderSource.deleteMany({ where: { ifmRunId: runId } })).count;
        break;
      default:
        throw new Error(`Clear is not supported for domain: ${domainId}`);
    }
  });

  return deleted;
}

export async function getUploadStatus(runId: string) {
  const run = await prisma.ifmRun.findUnique({
    where: { id: runId },
    select: {
      reviewDate: true,
      reviewCadence: true,
      confirmedNoneJson: true,
      companyId: true,
      _count: {
        select: {
          cashPositions: true,
          requiredOutflows: true,
          apItems: true,
          arItems: true,
          openPurchaseOrders: true,
          inventorySnapshots: true,
          reorderSources: true,
          purchaseCandidates: true,
        },
      },
    },
  });
  if (!run) throw new Error("Run not found.");

  const vendorTermsCount = await prisma.vendorTerm.count({
    where: { vendor: { companyId: run.companyId } },
  });

  const counts = {
    cash_positions: run._count.cashPositions,
    required_outflows: run._count.requiredOutflows,
    ap_items: run._count.apItems,
    ar_items: run._count.arItems,
    open_purchase_orders: run._count.openPurchaseOrders,
    inventory_snapshots: run._count.inventorySnapshots,
    reorder_sources: run._count.reorderSources,
    vendor_terms: vendorTermsCount,
    purchase_candidates: run._count.purchaseCandidates,
  };

  const confirmedNone = await persistReconciledConfirmedNone(runId, counts);

  return {
    reviewDate: run.reviewDate.toISOString().slice(0, 10),
    reviewCadence: run.reviewCadence,
    confirmedNone,
    counts: {
      cash_positions: run._count.cashPositions,
      required_outflows: run._count.requiredOutflows,
      ap_items: run._count.apItems,
      ar_items: run._count.arItems,
      open_purchase_orders: run._count.openPurchaseOrders,
      inventory_snapshots: run._count.inventorySnapshots,
      reorder_sources: run._count.reorderSources,
      vendor_terms: vendorTermsCount,
      purchase_candidates: run._count.purchaseCandidates,
    },
  };
}
