export type UploadDomainId =
  | "cash_positions"
  | "required_outflows"
  | "ap_items"
  | "ar_items"
  | "open_purchase_orders"
  | "inventory_snapshots"
  | "reorder_sources"
  | "vendor_terms";

export type UploadSection = "financial" | "pos";

export interface UploadDomainConfig {
  id: UploadDomainId;
  label: string;
  section: UploadSection;
  cadence: "weekly" | "per_run";
  description: string;
  templateHeaders: string[];
  requiredColumns: string[];
  /** canonical column name → accepted header aliases (normalized) */
  aliases: Record<string, string[]>;
  confirmNoneKey?: "cash" | "outflows" | "ap" | "ar" | "openPo";
  /** Allow multiple uploads that append rows (e.g. payroll + tax + debt files). */
  allowMultiUpload?: boolean;
}

function col(...names: string[]) {
  return names;
}

export const UPLOAD_DOMAINS: UploadDomainConfig[] = [
  {
    id: "cash_positions",
    label: "Cash position",
    section: "financial",
    cadence: "weekly",
    description:
      "Operating cash only — upload QuickBooks Balance Sheet .xlsx here (e.g. Syds_*_QB_Balance_Sheet_May_2026.xlsx). Do not upload AP, P&L, or AR on this card.",
    templateHeaders: [
      "cash_as_of_date",
      "cash_on_hand",
      "available_operating_cash",
      "restricted_cash",
      "data_source",
      "data_confidence",
    ],
    requiredColumns: ["cash_as_of_date", "cash_on_hand", "data_source"],
    aliases: {
      cash_as_of_date: col("cash_as_of_date", "as_of_date", "date", "snapshot_date"),
      cash_on_hand: col("cash_on_hand", "cash", "total_cash", "balance"),
      available_operating_cash: col("available_operating_cash", "available_cash", "operating_cash"),
      restricted_cash: col("restricted_cash", "restricted"),
      data_source: col("data_source", "source", "source_system"),
      data_confidence: col("data_confidence", "confidence"),
    },
    confirmNoneKey: "cash",
  },
  {
    id: "ap_items",
    label: "AP / bills due",
    section: "financial",
    cadence: "weekly",
    description:
      "Open vendor bills — upload QuickBooks A/P Aging Detail .xlsx (e.g. Syds_*_QB_AP_Detail_May_2026.xlsx).",
    templateHeaders: [
      "vendor_name",
      "invoice_number",
      "amount_due",
      "due_date",
      "invoice_date",
      "aging_bucket",
      "payment_terms",
      "critical_vendor_flag",
      "data_confidence",
    ],
    requiredColumns: ["vendor_name", "amount_due", "due_date"],
    aliases: {
      vendor_name: col("vendor_name", "vendor", "payee", "name", "vendor_display_name"),
      invoice_number: col("invoice_number", "invoice", "bill_number", "ref", "num"),
      amount_due: col("amount_due", "open_balance", "balance", "amount"),
      due_date: col("due_date", "payment_due_date"),
      invoice_date: col("invoice_date", "bill_date", "date"),
      aging_bucket: col("aging_bucket", "aging", "bucket"),
      payment_terms: col("payment_terms", "terms"),
      critical_vendor_flag: col("critical_vendor_flag", "critical_vendor", "critical"),
      data_confidence: col("data_confidence", "confidence"),
    },
    confirmNoneKey: "ap",
  },
  {
    id: "ar_items",
    label: "AR / expected collections",
    section: "financial",
    cadence: "weekly",
    description:
      "Expected customer receipts — upload Keystroke AR.xls or QuickBooks A/R Aging Detail .xlsx.",
    templateHeaders: [
      "customer_name",
      "invoice_number",
      "expected_amount",
      "expected_collection_date",
      "collection_confidence",
      "included_in_core_funding",
      "factored_flag",
      "data_confidence",
    ],
    requiredColumns: ["expected_amount", "expected_collection_date"],
    aliases: {
      customer_name: col("customer_name", "customer", "name", "customer_full_name"),
      invoice_number: col("invoice_number", "invoice", "ref", "num"),
      expected_amount: col("expected_amount", "amount", "open_balance", "balance"),
      expected_collection_date: col("expected_collection_date", "collection_date", "due_date", "expected_date"),
      collection_confidence: col("collection_confidence", "confidence"),
      included_in_core_funding: col("included_in_core_funding", "include_in_funding", "core_funding"),
      factored_flag: col("factored_flag", "factored"),
      data_confidence: col("data_confidence"),
    },
    confirmNoneKey: "ar",
  },
  {
    id: "required_outflows",
    label: "Required outflows",
    section: "financial",
    cadence: "weekly",
    description:
      "Operating expense forecast — upload QuickBooks Profit & Loss .xlsx (e.g. Syds_*_QB_Profit_and_Loss_May_2026.xlsx).",
    allowMultiUpload: true,
    templateHeaders: [
      "outflow_type",
      "vendor_or_payee",
      "amount",
      "due_date",
      "required_status",
      "can_delay",
      "payment_priority",
      "data_confidence",
    ],
    requiredColumns: ["outflow_type", "amount", "due_date"],
    aliases: {
      outflow_type: col("outflow_type", "type", "category", "outflow", "expense_type"),
      vendor_or_payee: col("vendor_or_payee", "payee", "vendor", "name", "description", "memo"),
      amount: col("amount", "payment_amount", "total"),
      due_date: col("due_date", "payment_date", "pay_date", "date"),
      required_status: col("required_status", "status"),
      can_delay: col("can_delay", "delayable"),
      payment_priority: col("payment_priority", "priority"),
      data_confidence: col("data_confidence", "confidence"),
    },
    confirmNoneKey: "outflows",
  },
  {
    id: "open_purchase_orders",
    label: "Open purchase orders",
    section: "financial",
    cadence: "weekly",
    description: "Committed PO exposure not yet in AP (Keystroke or ERP open PO report).",
    templateHeaders: [
      "po_number",
      "vendor_name",
      "po_date",
      "expected_receipt_date",
      "original_po_amount",
      "remaining_open_amount",
      "commitment_status",
      "changeable_flag",
      "cash_exposure_amount",
    ],
    requiredColumns: ["po_number", "vendor_name", "po_date", "original_po_amount", "remaining_open_amount", "cash_exposure_amount"],
    aliases: {
      po_number: col("po_number", "po", "purchase_order"),
      vendor_name: col("vendor_name", "vendor"),
      po_date: col("po_date", "order_date", "date"),
      expected_receipt_date: col("expected_receipt_date", "receipt_date", "expected_date"),
      original_po_amount: col("original_po_amount", "original_amount", "po_amount"),
      remaining_open_amount: col("remaining_open_amount", "open_amount", "remaining"),
      commitment_status: col("commitment_status", "status", "po_status"),
      changeable_flag: col("changeable_flag", "changeable", "cancelable"),
      cash_exposure_amount: col("cash_exposure_amount", "cash_exposure", "exposure"),
    },
    confirmNoneKey: "openPo",
  },
  {
    id: "inventory_snapshots",
    label: "Inventory snapshot",
    section: "pos",
    cadence: "per_run",
    description: "SKU-level inventory from Keystroke or POS (when not loaded via RSE).",
    templateHeaders: [
      "sku_or_item_id",
      "vendor_name",
      "location",
      "quantity_on_hand",
      "unit_cost",
      "inventory_value",
      "min_qty",
      "max_qty",
      "weeks_of_supply",
      "stockout_risk_flag",
      "overstock_flag",
      "slow_moving_flag",
    ],
    requiredColumns: ["sku_or_item_id", "quantity_on_hand", "inventory_value"],
    aliases: {
      sku_or_item_id: col("sku_or_item_id", "sku", "item", "item_code", "item_number"),
      vendor_name: col("vendor_name", "vendor"),
      location: col("location", "store", "warehouse"),
      quantity_on_hand: col("quantity_on_hand", "qoh", "on_hand", "qty_on_hand"),
      unit_cost: col("unit_cost", "last_cost", "cost"),
      inventory_value: col("inventory_value", "extended_value", "value"),
      min_qty: col("min_qty", "min", "minimum"),
      max_qty: col("max_qty", "max", "maximum"),
      weeks_of_supply: col("weeks_of_supply", "wos"),
      stockout_risk_flag: col("stockout_risk_flag", "stockout_risk", "below_min"),
      overstock_flag: col("overstock_flag", "overstock"),
      slow_moving_flag: col("slow_moving_flag", "slow_moving"),
    },
  },
  {
    id: "reorder_sources",
    label: "Keystroke reorder report",
    section: "pos",
    cadence: "per_run",
    description: "Reorder quantities from Keystroke or ERP (not via RSE).",
    templateHeaders: [
      "export_date",
      "vendor_code",
      "item_code",
      "quantity_on_hand",
      "min_qty",
      "max_qty",
      "reorder_qty",
      "suggested_order_amount",
      "data_confidence",
    ],
    requiredColumns: ["export_date", "item_code"],
    aliases: {
      export_date: col("export_date", "date", "report_date"),
      vendor_code: col("vendor_code", "vendor"),
      item_code: col("item_code", "sku", "item", "item_number"),
      quantity_on_hand: col("quantity_on_hand", "qoh", "on_hand"),
      min_qty: col("min_qty", "min"),
      max_qty: col("max_qty", "max"),
      reorder_qty: col("reorder_qty", "reorder_quantity", "suggested_qty"),
      suggested_order_amount: col("suggested_order_amount", "order_amount", "amount"),
      data_confidence: col("data_confidence", "confidence"),
    },
  },
  {
    id: "vendor_terms",
    label: "Vendor terms (POS master)",
    section: "pos",
    cadence: "per_run",
    description: "Standard payment terms per vendor from Keystroke vendor master.",
    templateHeaders: [
      "vendor_name",
      "vendor_code",
      "normal_terms",
      "payment_schedule",
      "early_pay_discount",
      "terms_confidence",
      "terms_source",
    ],
    requiredColumns: ["vendor_name", "normal_terms", "terms_source"],
    aliases: {
      vendor_name: col("vendor_name", "vendor"),
      vendor_code: col("vendor_code", "code"),
      normal_terms: col("normal_terms", "terms", "payment_terms"),
      payment_schedule: col("payment_schedule", "schedule"),
      early_pay_discount: col("early_pay_discount", "discount"),
      terms_confidence: col("terms_confidence", "confidence"),
      terms_source: col("terms_source", "source"),
    },
  },
];

export const UPLOAD_DOMAIN_MAP = new Map(UPLOAD_DOMAINS.map((d) => [d.id, d]));

export function getUploadDomain(id: string): UploadDomainConfig | undefined {
  return UPLOAD_DOMAIN_MAP.get(id as UploadDomainId);
}

export function templateCsvForDomain(domain: UploadDomainConfig): string {
  return `${domain.templateHeaders.join(",")}\n`;
}
