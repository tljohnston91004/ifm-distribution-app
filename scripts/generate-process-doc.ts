/**
 * Generates the IFM Complete Process Word document (.docx).
 * Run: npx tsx scripts/generate-process-doc.ts
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  TableOfContents,
  BorderStyle,
} from "docx";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ── helpers ──────────────────────────────────────────────────────────────────
const H1 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 } });
const H2 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 100 } });
const H3 = (t: string) => new Paragraph({ text: t, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } });

function P(text: string, opts: { bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text, bold: opts.bold, italics: opts.italics })],
  });
}

// Paragraph that mixes bold lead-in + normal text.
function PLead(lead: string, rest: string) {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [new TextRun({ text: lead, bold: true }), new TextRun({ text: rest })],
  });
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60, line: 264 },
    children: [new TextRun({ text })],
  });
}

function numbered(text: string, ref: string) {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { after: 60, line: 264 },
    children: [new TextRun({ text })],
  });
}

function code(lines: string[]) {
  return lines.map(
    (ln) =>
      new Paragraph({
        spacing: { after: 0, before: 0 },
        shading: { fill: "F4F4F4" },
        children: [new TextRun({ text: ln.length ? ln : " ", font: "Consolas", size: 18 })],
      })
  );
}

function codeBlock(lines: string[]) {
  // wrap a code block with a little space around it
  return [new Paragraph({ spacing: { after: 40 }, children: [] }), ...code(lines), new Paragraph({ spacing: { after: 120 }, children: [] })];
}

function table(headers: string[], rows: string[][], widths?: number[]) {
  const cell = (text: string, header = false, w?: number) =>
    new TableCell({
      width: w ? { size: w, type: WidthType.PERCENTAGE } : undefined,
      shading: header ? { fill: "305496" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: String(text)
        .split("\n")
        .map(
          (line) =>
            new Paragraph({
              spacing: { after: 0 },
              children: [new TextRun({ text: line, bold: header, color: header ? "FFFFFF" : undefined, size: 18 })],
            })
        ),
    });
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => cell(h, true, widths?.[i])),
  });
  const bodyRows = rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths?.[i])) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "BBBBBB" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
    rows: [headerRow, ...bodyRows],
  });
}

const spacer = () => new Paragraph({ spacing: { after: 80 }, children: [] });

// ── document body ────────────────────────────────────────────────────────────
const children: (Paragraph | Table)[] = [];

// Title page
children.push(
  new Paragraph({ spacing: { before: 1800, after: 0 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Inventory Funding Manager (IFM)", bold: true, size: 56 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "Complete Process Specification", size: 36, color: "305496" })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 0 }, children: [new TextRun({ text: "From Keystroke Inventory to Funded Purchase Orders", italics: true, size: 26 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 800, after: 0 }, children: [new TextRun({ text: "Round trip: RSE  →  Keystroke  →  IFM (reorder + funding)  →  Keystroke (PO)", size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 0 }, children: [new TextRun({ text: `Generated ${new Date().toLocaleDateString()}  ·  IFM Distribution V1.5`, size: 20, color: "777777" })] }),
  new Paragraph({ pageBreakBefore: true, children: [] })
);

// TOC
children.push(H1("Table of Contents"));
children.push(new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-2" }));
children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "(In Word: right-click the table above and choose \u201CUpdate Field\u201D if entries are blank.)", italics: true, size: 18, color: "777777" })] }));
children.push(new Paragraph({ pageBreakBefore: true, children: [] }));

// 1. Executive summary
children.push(H1("1. Purpose & Executive Summary"));
children.push(P("The Inventory Funding Manager (IFM) decides which inventory purchases a distribution business can afford to make right now, in what priority, and from which funding source \u2014 then prepares those approved purchases for the point-of-sale (POS) system to turn into purchase orders."));
children.push(P("This document describes the complete, end-to-end process for the planned configuration in which IFM reads inventory directly from the Keystroke POS database, generates its own reorder suggestions using an order-up-to-Max policy (excluding items classified \u201CF\u201D), runs those suggestions through the IFM funding/decision engine, and exports the approved purchases back into Keystroke so the buyer can create real purchase orders."));
children.push(PLead("Core principle (hard rule): ", "IFM never automatically buys anything. It analyzes, funds, prioritizes, and prepares files. A human always confirms inside Keystroke before any purchase order is created or sent to a vendor."));
children.push(PLead("Source-agnostic note: ", "Keystroke is the example POS used here. IFM is designed to work with any source system; the same process applies with different connection/export details."));

// 2. Ecosystem
children.push(H1("2. The Software Ecosystem & Division of Labor"));
children.push(P("IFM is one of several cooperating systems. Each answers a different question. Keeping these roles separate is essential to the design."));
children.push(
  table(
    ["System", "Question it answers", "Role in this process"],
    [
      ["RSE", "How fast does each item sell / how much should we stock?", "Assigns Min/Max levels and item classifications based on sales rate and weeks-on-hand demand. Writes Min/Max into Keystroke."],
      ["Keystroke (POS)", "What do we currently have and what is on order?", "System of record for inventory, on-hand, on-order, backorders, costs, vendors. The only system that creates the actual purchase orders."],
      ["IAM", "What should we do about unwanted inventory?", "Recommends actions to reduce overstock / unwanted inventory (outside IFM)."],
      ["IPM", "What is profitable vs. not profitable?", "Identifies profitable / non-profitable inventory (outside IFM)."],
      ["IFM", "What can we afford to buy now, and in what order?", "Generates order-up-to-Max suggestions, then funds and prioritizes them against available cash and financing. Prepares the PO file for Keystroke."],
    ],
    [16, 40, 44]
  )
);
children.push(spacer());
children.push(PLead("One-sentence summary: ", "RSE decides what should be stocked, Keystroke holds the inventory and creates POs, and IFM decides what can actually be funded right now and prepares it for purchase."));

// 3. Process overview
children.push(H1("3. End-to-End Process Overview (the round trip)"));
children.push(P("The complete cycle is a loop. Data flows out of Keystroke into IFM, and approved purchases flow back into Keystroke as open purchase orders, which then appear as \u201Con order\u201D the next time IFM runs."));
children.push(...codeBlock([
  "  RSE  ──sets Min/Max + classifications in──▶  KEYSTROKE (inventory)",
  "                                                   │",
  "                                  (1) read inventory (live ODBC, or KSEXPORT file)",
  "                                                   ▼",
  "                                   IFM REORDER GENERATOR  (new)",
  "                                   • exclude items classified \u201CF\u201D",
  "                                   • suggest order-up-to-Max",
  "                                                   │ purchase candidates",
  "                                                   ▼",
  "                                   IFM FUNDING / DECISION ENGINE  (exists)",
  "                                   • core + supplemental funding",
  "                                   • priority, partial funding, holdback",
  "                                                   │ Decision Board",
  "                                                   ▼",
  "                                   IFM PO EXPORT  → Keystroke import file (.txt)",
  "                                                   │ hand off to buyer",
  "                                                   ▼",
  "                                   KEYSTROKE IMPORTER (ImpPor) → open POs",
  "                                                   │ buyer reviews + sends",
  "                                                   ▼",
  "                                   POs become \u201Con order\u201D ──▶ back into IFM next run",
]));
children.push(P("Stages 1\u20135 below describe each step in detail, including the commands, formulas, and file layouts required."));

// 4. Prerequisites
children.push(H1("4. Prerequisites \u2014 What Is Needed to Function"));

children.push(H2("4.1 IFM application runtime"));
children.push(
  table(
    ["Component", "Requirement", "Notes"],
    [
      ["Operating system", "Windows 10/11", "Same machine or server with network access to Keystroke."],
      ["Node.js", "v18.18+ (v20 LTS recommended)", "Runs the Next.js application."],
      ["Framework", "Next.js 15, React 19, TypeScript", "Already built."],
      ["Database", "Prisma 6 + SQLite (file-based)", "Stores IFM runs, calculations, decisions, exports."],
      ["Doc/Export libs", "xlsx, docx", "For CSV/Excel/Word generation."],
      ["Launchers", "Start IFM.bat / Fix and Start IFM.bat", "Desktop double-click launch; opens http://127.0.0.1:3000."],
    ],
    [22, 34, 44]
  )
);

children.push(H2("4.2 Keystroke environment (for live ODBC read + PO write-back)"));
children.push(P("Keystroke stores its data in a Btrieve / Actian Zen engine (proprietary binary files), not a standard SQL database. Two integration channels are used: a read channel (to pull inventory) and a write channel (to create POs)."));
children.push(
  table(
    ["Need", "Purpose", "Required for"],
    [
      ["Actian Zen / Pervasive PSQL engine (v10+; v13\u2013v15 ideal)", "Database engine running on the Keystroke server.", "Live ODBC read"],
      ["Actian Zen ODBC client driver", "Lets IFM's host query Keystroke over ODBC.", "Live ODBC read"],
      ["DDF files (FILE.DDF, FIELD.DDF, INDEX.DDF)", "Describe Keystroke's table/field layout to ODBC. Often must be generated (DDF Builder / BtSearch32) if absent.", "Live ODBC read"],
      ["Named database + ODBC DSN", "Defines the connection IFM uses.", "Live ODBC read"],
      ["Read-only credentials / off-hours window", "Protect the live POS from load; IFM only reads.", "Live ODBC read"],
      ["KSEXPORT.EXE (Keystroke Advanced POS)", "Exports the Inventory database to CSV/tab-delimited text. Fallback / build-first source.", "File-based read"],
      ["Keystroke Importer (ImpPor / IMPPOR.POR)", "Reads a text file and creates Purchase Orders inside Keystroke.", "PO write-back"],
      ["Keystroke Vendor Numbers & Stock Numbers", "Identifiers IFM must output so imported POs match the right vendors/items.", "PO write-back"],
    ],
    [34, 44, 22]
  )
);

children.push(H2("4.3 Required data domains (and the \u201Cconfirm none\u201D rule)"));
children.push(P("IFM never treats blank data as zero. For each domain you must either provide data or explicitly confirm that none exists. Minimum to run a calculation:"));
children.push(bullet("Cash on hand \u2014 present, or confirmed as none (cannot be assumed)."));
children.push(bullet("A valid funding window \u2014 end date not before start date."));
children.push(bullet("Something to review \u2014 at least one purchase candidate or one open PO (or confirm candidates = none)."));
children.push(P("Treated as a limitation (not a blocker) if missing-and-not-confirmed: required outflows, AP aging, AR aging, open PO exposure."));

children.push(H2("4.4 Access & security principles"));
children.push(bullet("Read path (inventory) is strictly read-only \u2014 IFM must never write to Keystroke tables directly."));
children.push(bullet("Write path (POs) goes only through Keystroke's own Importer, so Keystroke's numbering, vendor logic, and validation apply."));
children.push(bullet("No-auto-execution: a human confirms every PO in Keystroke before it is sent to a vendor."));

// 5. Stage 1
children.push(H1("5. Stage 1 \u2014 Reading Inventory from Keystroke"));
children.push(P("IFM needs a current inventory picture per item: on-hand, on-order, backordered, Min, Max, unit cost, vendor, and RSE classification. There are two ways to obtain it."));

children.push(H3("5.1 Option A \u2014 KSEXPORT file (recommended starting point)"));
children.push(P("KSEXPORT.EXE is Keystroke's built-in export utility. It writes the Inventory database to a delimited text file that IFM imports. This needs no ODBC/DDF setup and is the fastest way to start; the data is a point-in-time snapshot (only as fresh as the last export)."));
children.push(P("Example command (run on the Keystroke machine; switches vary by install \u2014 confirm against your KSEXPORT setup):"));
children.push(...codeBlock([
  "REM Export the Inventory database to a tab-delimited text file",
  "KSEXPORT.EXE Type=DI File=C:\\IFM\\exports\\inventory.txt Delimiter=Tab",
  "",
  "REM Type=DI  -> Databases / Inventory (HotKey-based two-char code)",
  "REM See the .HDR record-layout files in the Keystroke DOC\\ subfolder",
]));
children.push(P("Expected columns IFM consumes (mapped during import):"));
children.push(
  table(
    ["IFM field", "Typical Keystroke source", "Used for"],
    [
      ["skuOrItemId", "Stock Number / Product Code", "Item identity + PO write-back match"],
      ["vendorName / vendorCode", "Primary Vendor / Vendor Number", "Grouping into vendor POs"],
      ["quantityOnHand", "Qty On Hand", "Position calculation"],
      ["onOrderQty", "Qty On Order", "Position calculation"],
      ["backorderedQty", "Qty Backordered / Committed", "Position calculation"],
      ["minQty", "Min (set by RSE)", "Reference only (Min is ignored as a trigger)"],
      ["maxQty", "Max (set by RSE)", "Order-up-to target"],
      ["unitCost", "Last Cost / Average Cost", "Estimated order cost"],
      ["rseClassification", "Class / category field used by RSE (A,B,C,D,N,S,F\u2026)", "Eligibility (exclude F) + funding priority"],
    ],
    [26, 40, 34]
  )
);

children.push(H3("5.2 Option B \u2014 Live ODBC connection (real-time)"));
children.push(P("Once DDFs and a DSN exist, IFM can query Keystroke directly for an always-current picture. One-time setup:"));
children.push(numbered("Install the Actian Zen ODBC client on the machine running IFM.", "setup"));
children.push(numbered("Ensure DDF files exist for the inventory tables (generate with DDF Builder / BtSearch32 if missing).", "setup"));
children.push(numbered("Create a Named Database in the Zen Control Center pointing to Keystroke's data dir + DDFs.", "setup"));
children.push(numbered("Create an ODBC DSN (read-only) that references that named database.", "setup"));
children.push(P("Example connection string and query (table/field names are placeholders \u2014 confirm from your DDFs):"));
children.push(...codeBlock([
  "// ODBC connection string (read-only)",
  "DSN=KeystrokeData;ServerName=KSSERVER;UID=ifm_read;PWD=********;ReadOnly=1;",
  "",
  "-- Pull the current inventory picture",
  "SELECT  i.StockNumber      AS sku_or_item_id,",
  "        i.VendorNumber     AS vendor_code,",
  "        v.VendorName       AS vendor_name,",
  "        i.QtyOnHand        AS quantity_on_hand,",
  "        i.QtyOnOrder       AS on_order_qty,",
  "        i.QtyBackordered   AS backordered_qty,",
  "        i.MinQty           AS min_qty,",
  "        i.MaxQty           AS max_qty,",
  "        i.LastCost         AS unit_cost,",
  "        i.ClassCode        AS rse_classification",
  "FROM    Inventory i",
  "LEFT JOIN Vendor v ON v.VendorNumber = i.VendorNumber",
  "WHERE   i.ClassCode <> 'F';   -- never reorder F-class items",
]));

children.push(H3("5.3 Build-first-with-file strategy"));
children.push(P("Because the KSEXPORT file and the ODBC query produce the same columns, the recommended path is to build and validate the entire reorder + funding feature against the export file first, then switch the data source to live ODBC once the DDF/DSN setup is complete. The reorder logic does not change \u2014 only where the data comes from."));

// 6. Stage 2 reorder generation
children.push(H1("6. Stage 2 \u2014 Reorder Generation (order-up-to-Max, exclude F)"));
children.push(P("For each item in the inventory snapshot, IFM applies one exclusion rule and one quantity formula."));

children.push(H2("6.1 Eligibility rule"));
children.push(PLead("Exclude only F: ", "Any item whose RSE classification is \u201CF\u201D is never suggested, regardless of stock level. Every other classification (A, B, C, D, N, S, and any future codes) is eligible. This is implemented as a single exclusion, not an allow-list, so new classification codes default to eligible."));

children.push(H2("6.2 Quantity formula (order up to Max, ignore Min)"));
children.push(...codeBlock([
  "position       = quantity_on_hand + on_order_qty − backordered_qty",
  "suggested_qty  = max(0, max_qty − position)        // Min is NOT a trigger",
  "suggested_cost = suggested_qty × unit_cost",
  "",
  "// An item is suggested whenever position < Max (we do not wait for it to",
  "// fall below Min). Items with position >= Max produce suggested_qty = 0.",
]));
children.push(P("Including on-order in the position prevents re-ordering quantities already on an open PO; netting out backorders accounts for stock already committed to customers."));

children.push(H2("6.3 Generation pseudocode"));
children.push(...codeBlock([
  "for each item in keystroke_inventory_snapshot:",
  "    if item.rse_classification == 'F':",
  "        continue                       # excluded entirely",
  "    position = item.on_hand + item.on_order - item.backordered",
  "    qty = max(0, item.max_qty - position)",
  "    if qty <= 0:",
  "        continue                       # already at/above Max",
  "    qty = apply_pack_rounding(qty, item)     # optional (off by default)",
  "    candidate = {",
  "        sku: item.sku, vendor: item.vendor,",
  "        proposed_quantity: qty,",
  "        estimated_unit_cost: item.unit_cost,",
  "        estimated_total_cost: qty * item.unit_cost,",
  "        source_of_request: 'reorder',",
  "        need_reason: 'replenishment',",
  "        rse_classification: item.rse_classification,",
  "        below_min: position < item.min_qty,",
  "    }",
  "    add candidate to run, grouped by vendor",
]));

children.push(H2("6.4 Configurable options (defaults shown)"));
children.push(
  table(
    ["Option", "Default", "Effect"],
    [
      ["Position inputs", "on-hand + on-order − backorders", "How the gap-to-Max is measured."],
      ["Classification exclusion", "Exclude F only", "Items never reordered."],
      ["Pack / case rounding", "Off (exact gap)", "Round suggested qty up to case/pack; respect vendor MOQ."],
      ["Unit cost source", "Last cost", "Cost used for the estimate (last vs. average)."],
    ],
    [28, 30, 42]
  )
);

// 7. Stage 3 funding engine
children.push(H1("7. Stage 3 \u2014 Funding & Decision Engine (the IFM core)"));
children.push(P("The generated candidates flow into the existing, tested IFM engine. Funding is computed in three layers, then each candidate is ranked, allocated, and labeled. All formulas below are taken directly from the implemented engine."));

children.push(H2("7.1 Layer 1 \u2014 Core Operating Cash Funding"));
children.push(...codeBlock([
  "core_available_inventory_funding =",
  "      cash_on_hand",
  "    + confident_expected_inflows        (AR, confidence-weighted; see 7.2)",
  "    − protected_cash_reserve",
  "    − required_outflows                 (due within funding window)",
  "    − ap_pressure                       (AP due in window + past-due/critical-vendor)",
  "    − open_po_exposure                  (committed POs; see 7.3)",
  "    − manual_cash_reductions",
  "    + manual_cash_additions",
]));
children.push(P("Notes: cash on hand uses available operating cash when provided. Required outflows that are flexible and can be delayed are not subtracted. AP pressure includes anything due within the window plus any past-due or critical-vendor balances. A negative result raises a warning."));

children.push(H2("7.2 AR inclusion by collection confidence"));
children.push(P("Expected AR collections are only counted toward core funding if flagged for core funding, not factored, and expected within the window \u2014 each scaled by a confidence factor:"));
children.push(
  table(
    ["Collection confidence", "Inclusion factor (default)", "Meaning"],
    [
      ["High Confidence", "100% (1.0)", "Counted in full."],
      ["Medium Confidence", "60% (0.6)", "Counted at 60%."],
      ["Low Confidence", "20% (0.2)", "Counted at 20%."],
      ["Insufficient Data", "0%", "Not counted toward core funding."],
    ],
    [34, 30, 36]
  )
);

children.push(H2("7.3 Open PO exposure treatment"));
children.push(P("Each open PO's committed cash is subtracted from core funding based on its commitment status:"));
children.push(
  table(
    ["Open PO commitment status", "Counts as exposure?"],
    [
      ["Purchase Candidate Only", "No (0)"],
      ["Draft / Not Sent", "No (0)"],
      ["Billed / AP Created", "No (already in AP)"],
      ["Closed", "No (0)"],
      ["Sent but Changeable", "Yes \u2014 full amount (flagged for review)"],
      ["Vendor Confirmed", "Yes \u2014 full amount"],
      ["Partially Shipped", "Yes \u2014 full amount"],
      ["Fully Shipped", "Yes \u2014 full amount"],
      ["Received but Not Billed", "Yes \u2014 full amount"],
    ],
    [60, 40]
  )
);

children.push(H2("7.4 Layer 2 \u2014 Supplemental Funding Capacity"));
children.push(...codeBlock([
  "approved_loc_capacity   = Σ  max(0, min(remaining_availability, borrowing_base_limit, draw_limit))",
  "approved_net_factoring  = Σ  max(0, eligible_AR × advance_rate − factoring_fee − reserve_holdback)",
  "other_approved_funding  = Σ  max(0, approved_for_inventory_amount)",
  "",
  "supplemental_funding_capacity =",
  "      approved_loc_capacity + approved_net_factoring + other_approved_funding",
]));

children.push(H2("7.5 Layer 3 \u2014 Total Potential Inventory Funding"));
children.push(...codeBlock([
  "total_potential_inventory_funding =",
  "      max(0, core_available_inventory_funding) + supplemental_funding_capacity",
]));

children.push(H2("7.6 Evidence hierarchy (rank 1 strongest \u2026 10 weakest)"));
children.push(
  table(
    ["Rank", "Evidence basis"],
    [
      ["1", "Confirmed customer order / backorder"],
      ["2", "RSE-supported fast-moving replenishment"],
      ["3", "Below-Min with strong demand"],
      ["4", "Reorder report supported by Min/Max + recent demand"],
      ["5", "Buyer request with documented demand"],
      ["6", "Vendor offer supported by strong demand + sell-through"],
      ["7", "Strategic item exception (requires approval)"],
      ["8", "Vendor offer based mainly on discount/terms/pressure"],
      ["9", "Manual request with limited support"],
      ["10", "Unsupported request"],
    ],
    [14, 86]
  )
);

children.push(H2("7.7 RSE classification \u2192 funding priority"));
children.push(
  table(
    ["RSE class family", "Funding priority"],
    [
      ["fast", "high"],
      ["moderate", "medium"],
      ["seasonal", "caution"],
      ["slow / overstock", "low"],
      ["none / unknown", "review"],
    ],
    [50, 50]
  )
);

children.push(H2("7.8 Cash conversion timing"));
children.push(P("Compares expected sell-through/collection date against the vendor payment due date (default caution window 7 days):"));
children.push(bullet("Good Match \u2014 converts to cash more than 7 days before payment is due."));
children.push(bullet("Caution \u2014 converts within \u00B17 days of the due date."));
children.push(bullet("Mismatch \u2014 converts after the payment is due."));
children.push(bullet("Unknown \u2014 missing sell-through or due date."));

children.push(H2("7.9 Funding allocation, partial funding & holdback"));
children.push(P("Candidates are sorted by a funding-priority score (emergencies first, then high-velocity below-Min replenishment, then backorders, then supported reorders, then vendor offers, then the rest by evidence rank; ties broken by larger dollar amount). Funding is then drawn in order:"));
children.push(...codeBlock([
  "holdback = emergency_holdback_amount  (if set)",
  "           else  total_potential_funding × holdback_percent",
  "",
  "core_allocatable = max(0, core_available_funding − holdback)",
  "",
  "for each candidate (in priority order):",
  "    need     = fundable_target            // see vendor-offer split, 7.10",
  "    from_core = min(need, core_allocatable);  core_allocatable −= from_core",
  "    need     −= from_core",
  "    from_supp = min(need, supplemental_pool); supplemental_pool −= from_supp",
  "    need     −= from_supp",
  "    if need > 0 AND bucket == 'Must-Fund / Service Protection':",
  "        from_holdback = min(need, holdback_pool);  holdback_pool −= from_holdback",
  "    allocated = from_core + from_supp + from_holdback",
]));
children.push(P("If a candidate receives some but not all of its requested amount, it becomes Partially Recommended. Reliance on supplemental funding downgrades a positive recommendation to \u201Cwith caution.\u201D"));

children.push(H2("7.10 Vendor offer / promo-buy split"));
children.push(...codeBlock([
  "fundable_target = min(requested, vendor_offer.normal_needed_amount)",
  "offer_excluded  = requested − fundable_target",
  "",
  "// Only the normal-need portion is fundable from operating cash; the",
  "// incremental promo quantity is excluded unless separately supported.",
]));

children.push(H2("7.11 Decision labels (final output)"));
children.push(
  table(
    ["Decision label", "When it is assigned"],
    [
      ["Approve", "Positive recommendation, fully funded, recommendation = Recommended."],
      ["Approve with Caution", "Fully funded but relies on supplemental funding or weaker timing/evidence."],
      ["Reduce Order", "Partially funded; cash conversion is not a timing problem."],
      ["Split Purchase", "Partially funded with a Caution timing match."],
      ["Delay Purchase", "Not recommended (non-offer) or nothing could be allocated."],
      ["Hold Until More Data", "Evidence rank 9, or review-priority with weak evidence."],
      ["Owner Approval Required", "At/above owner approval threshold, or a strategic exception (rank 7)."],
      ["Emergency Review Required", "Urgency level = emergency."],
      ["Take Full Vendor Offer", "Vendor offer fully funded with no excluded portion."],
      ["Take Partial Vendor Offer", "Vendor offer where only the normal-need portion is funded."],
      ["Decline Vendor Offer", "Vendor offer that is not recommended."],
    ],
    [34, 66]
  )
);

children.push(H2("7.12 Approval controls"));
children.push(bullet("Owner approval required when the requested amount is at/above the owner approval threshold, or the item is a strategic exception (evidence rank 7)."));
children.push(bullet("Financing approval required when any supplemental funding is used and that source is marked approval-required."));

children.push(H2("7.13 Vendor concentration check"));
children.push(P("After allocation, each vendor's funded share of core available funding is compared to the concentration limit. Exceeding it adds a risk note and raises a warning banner; it does not by itself force owner approval (the dollar/financing/strategic gates handle that)."));

// 8. Stage 4 export back
children.push(H1("8. Stage 4 \u2014 Exporting Approved Purchases Back to Keystroke"));
children.push(P("Approved (and partially-approved) candidates are grouped by vendor and written to a text file in the layout Keystroke's importer expects. IFM does not create or send the PO itself \u2014 it prepares the file for Keystroke."));

children.push(H2("8.1 The Keystroke importer (ImpPor)"));
children.push(P("Keystroke's transaction importer reads a field-tagged text file (each value preceded by its field title and an equals sign) and creates Purchase Order transactions. Key behaviors from Keystroke's documentation:"));
children.push(bullet("If the RESERVED/ORDER field is omitted, the transaction is created as a Purchase Order."));
children.push(bullet("If Quantity Received is not specified (or 0), the PO is created as an open order \u2014 exactly what we want."));
children.push(bullet("Vendors are matched by Vendor Number; items by Stock Number."));
children.push(bullet("CONFIRM=ON makes Keystroke display each PO and let the buyer accept or skip it before saving (human-in-the-loop)."));
children.push(bullet("The supported field list is defined by the form file IMPPOR.POR (see also ORDERS.POR for a stripped-down example)."));

children.push(H2("8.2 Example import command"));
children.push(...codeBlock([
  "REM Create open Purchase Orders in Keystroke from the IFM file,",
  "REM confirming each one on screen before it is saved.",
  "IMPPOR.EXE FILENAME=C:\\IFM\\exports\\approved_pos.txt ^",
  "           SETUP=KSIMPORT.KSI ^",
  "           METHOD=Append ^",
  "           CONFIRM=ON ^",
  "           ADDNEWVENDOR=OFF",
  "",
  "REM No RESERVED/ORDER field + no Quantity Received => open Purchase Orders.",
]));

children.push(H2("8.3 Example import file (field-tagged, per IMPPOR.POR)"));
children.push(...codeBlock([
  "Vendor Number=KS1042",
  "PO Date=06/06/2026",
  "Stock Number=KS-BALL-100",
  "Quantity=48",
  "Unit Cost=18.50",
  "Stock Number=KS-BALL-220",
  "Quantity=24",
  "Unit Cost=22.00",
  "*** end of vendor KS1042 order ***",
  "Vendor Number=KS2071",
  "PO Date=06/06/2026",
  "Stock Number=KS-CLEAN-210",
  "Quantity=12",
  "Unit Cost=9.75",
]));
children.push(P("The exact field titles must match your Keystroke form (IMPPOR.POR). IFM maps its candidate fields to those titles during export and validates the file before hand-off."));

children.push(H2("8.4 File format rule"));
children.push(P("Any file intended for Keystroke import/re-import must be tab-delimited and end in .txt. CSV/XLSX are allowed for review, QA, and customer summaries, but are rejected as Keystroke import-ready files. IFM enforces this on export."));

// 9. Stage 5 loop closure
children.push(H1("9. Stage 5 \u2014 PO Creation in Keystroke & Loop Closure"));
children.push(numbered("The buyer runs the Keystroke importer (optionally with CONFIRM=ON) and reviews each PO.", "loop"));
children.push(numbered("Keystroke creates the open Purchase Orders using its own numbering and vendor logic.", "loop"));
children.push(numbered("The buyer sends the POs to vendors from within Keystroke, as they do today.", "loop"));
children.push(numbered("Those quantities now show as on-order in Keystroke.", "loop"));
children.push(numbered("On the next IFM run, the on-order quantities reduce the gap-to-Max (so items are not re-suggested) and the open POs count as open-PO cash exposure in the funding math.", "loop"));
children.push(P("This closes the loop: nothing is double-ordered, and committed cash is always reflected in the next funding decision."));

// 10. Data model
children.push(H1("10. Key Data Model & Field Mapping"));
children.push(P("IFM already includes the tables required for this process. The most relevant are:"));
children.push(
  table(
    ["Table", "Purpose", "Key fields"],
    [
      ["InventorySnapshot", "Current inventory pulled from Keystroke", "skuOrItemId, quantityOnHand, minQty, maxQty, unitCost, weeksOfSupply, flags"],
      ["ReorderSource", "Reorder/suggested-order data", "itemCode, quantityOnHand, minQty, maxQty, reorderQty, suggestedOrderAmount"],
      ["PurchaseCandidate", "A fundable purchase line", "sourceOfRequest, vendorName, skuOrItemId, proposedQuantity, estimatedTotalCost, needReason, urgencyLevel"],
      ["RseSignal", "RSE classification per item", "skuOrItemId, rseClassification"],
      ["OpenPurchaseOrder", "Committed POs / exposure", "poNumber, vendorName, commitmentStatus, cashExposureAmount"],
      ["FundingCalculation", "Layer 1\u20133 results", "core/supplemental/total funding, AR inflows, AP pressure, open PO exposure"],
      ["PurchaseDecision", "Final decision per candidate", "systemDecisionLabel, allocatedAmount, fundingSource, approval flags"],
      ["ExportLog", "Record of generated files", "export type, format, Keystroke-readiness"],
    ],
    [22, 30, 48]
  )
);

// 11. Configuration
children.push(H1("11. Configuration / Review Settings (defaults)"));
children.push(
  table(
    ["Setting", "Default", "Purpose"],
    [
      ["protectedCashReserve", "(per company)", "Cash never spent on inventory."],
      ["emergencyHoldbackAmount", "$10,000 (sample)", "Fixed reserve held back before allocation."],
      ["holdbackPercent", "10%", "Used only if no fixed holdback amount is set."],
      ["ownerApprovalThreshold", "$25,000\u2013$40,000", "At/above this, owner approval is required."],
      ["materialPurchaseAmount", "$5,000", "Threshold for material-purchase treatment."],
      ["arHighConfidenceFactor", "1.0", "AR inclusion at high confidence."],
      ["arMediumConfidenceFactor", "0.6", "AR inclusion at medium confidence."],
      ["arLowConfidenceFactor", "0.2", "AR inclusion at low confidence."],
      ["vendorConcentrationLimit", "0.35\u20130.40", "Max funded share per vendor before a flag."],
      ["approvalExpirationDays", "7", "Cash-conversion caution window / approval validity."],
    ],
    [34, 22, 44]
  )
);

// 12. Commands reference
children.push(H1("12. Commands & Code Reference (consolidated)"));
children.push(H2("12.1 Run the IFM application"));
children.push(...codeBlock([
  "REM Desktop launch (recommended)",
  "Double-click  \"Start IFM.bat\"      → opens http://127.0.0.1:3000",
  "Double-click  \"Fix and Start IFM.bat\"  → resets cache, then starts",
  "",
  "REM Manual (PowerShell, from the project folder)",
  "npm install                 # first-time dependency install",
  "npm run db:push             # create/update the database",
  "npm run dev -- -H 127.0.0.1 -p 3000   # development server",
  "npm run build && npm run start         # production server",
  "npm run test:acceptance     # validate engine vs documented results",
]));
children.push(H2("12.2 Read inventory from Keystroke"));
children.push(...codeBlock([
  "REM File export",
  "KSEXPORT.EXE Type=DI File=C:\\IFM\\exports\\inventory.txt Delimiter=Tab",
  "",
  "// Live ODBC (read-only)",
  "DSN=KeystrokeData;ServerName=KSSERVER;UID=ifm_read;PWD=****;ReadOnly=1;",
]));
children.push(H2("12.3 Write Purchase Orders back to Keystroke"));
children.push(...codeBlock([
  "IMPPOR.EXE FILENAME=C:\\IFM\\exports\\approved_pos.txt CONFIRM=ON METHOD=Append",
]));

// 13. Worked example
children.push(H1("13. Worked Example \u2014 Sample Funding Run"));
children.push(P("The figures below are from the validated sample data set (Steve\u2019s Bowling Supply) and are confirmed by the automated acceptance test."));
children.push(
  table(
    ["Funding figure", "Amount"],
    [
      ["Core available inventory funding", "$47,000"],
      ["Emergency holdback", "$10,000"],
      ["Core allocatable (after holdback)", "$37,000"],
      ["Supplemental funding capacity", "$141,000"],
      ["Total potential inventory funding", "$188,000"],
      ["Included AR inflows (100/60/20%)", "$167,000"],
      ["Required outflows", "$195,000"],
      ["AP pressure", "$190,000"],
      ["Committed open PO exposure", "$85,000"],
      ["Purchase candidate total requested", "$208,000"],
    ],
    [60, 40]
  )
);
children.push(spacer());
children.push(P("Resulting decisions:"));
children.push(
  table(
    ["Candidate", "Decision"],
    [
      ["KS-BALL-100 (fast replenishment)", "Approve"],
      ["KS-CLEAN-210 (backorder)", "Approve with Caution"],
      ["KS-ACC-330 (reorder)", "Approve with Caution"],
      ["LM-PROMO (vendor offer $60k)", "Take Partial Vendor Offer ($28k funded, $32k excluded)"],
      ["KS-PIN-500 (large order)", "Owner Approval Required"],
      ["KS-NOV-700 (vendor offer, weak)", "Decline Vendor Offer"],
      ["Existing Draft PO (low data)", "Hold Until More Data"],
    ],
    [44, 56]
  )
);

// 14. Hard rules
children.push(H1("14. Hard Rules & Validation"));
children.push(bullet("No auto-execution \u2014 IFM never places or sends orders; a human confirms in Keystroke."));
children.push(bullet("Blank \u2260 zero \u2014 missing data must be provided or explicitly confirmed as none."));
children.push(bullet("Exclude F \u2014 items classified F are never reordered."));
children.push(bullet("Order up to Max, ignore Min \u2014 suggestions top up to Max for all eligible items."));
children.push(bullet("Keystroke import-ready files must be tab-delimited .txt; CSV/XLSX are review-only."));
children.push(bullet("Live ODBC is read-only; PO creation goes only through Keystroke's importer."));
children.push(bullet("All funding math is validated by the automated acceptance test (must pass before release)."));

// 15. Operating workflow
children.push(H1("15. Recommended Operating Workflow (per review cycle)"));
children.push(numbered("Pull current inventory from Keystroke (ODBC query or KSEXPORT file).", "wf"));
children.push(numbered("Generate suggested orders (order-up-to-Max, F excluded) and review/trim the list.", "wf"));
children.push(numbered("Import/confirm cash, AP, AR, financing, and open PO data (or confirm none).", "wf"));
children.push(numbered("Run the calculation; review the Decision Board and warning banners.", "wf"));
children.push(numbered("Handle approvals (owner/financing) where flagged.", "wf"));
children.push(numbered("Export the approved POs to a Keystroke import file.", "wf"));
children.push(numbered("Import into Keystroke (CONFIRM=ON), review, and send POs to vendors.", "wf"));
children.push(numbered("Next cycle: on-order POs flow back into IFM automatically.", "wf"));

// 16. Glossary
children.push(H1("16. Glossary"));
children.push(
  table(
    ["Term", "Meaning"],
    [
      ["RSE", "The system that sets Min/Max and item classifications from sales rate / weeks-on-hand demand."],
      ["Order-up-to-Max", "Reorder policy that tops each item up to its Max level (ignoring Min as a trigger)."],
      ["Core funding", "Cash available for inventory after reserves, outflows, AP, and committed POs."],
      ["Supplemental funding", "Additional capacity from LOC, factoring, or other approved sources."],
      ["Holdback", "Reserve withheld before allocation for emergencies."],
      ["Evidence rank", "1\u201310 score of how well-supported a purchase is (1 strongest)."],
      ["Cash conversion", "Whether inventory sells/collects before the vendor must be paid."],
      ["ODBC / DDF", "Standard DB access method / data-dictionary files that describe Keystroke's tables to ODBC."],
      ["KSEXPORT / ImpPor", "Keystroke's inventory export utility / purchase-order import utility."],
      ["Open PO exposure", "Committed cash tied up in purchase orders already placed."],
    ],
    [22, 78]
  )
);

// ── build & write ────────────────────────────────────────────────────────────
const doc = new Document({
  creator: "IFM",
  title: "IFM Complete Process Specification",
  description: "From Keystroke Inventory to Funded Purchase Orders",
  features: { updateFields: true },
  numbering: {
    config: ["setup", "loop", "wf"].map((ref) => ({
      reference: ref,
      levels: [
        {
          level: 0,
          format: "decimal" as const,
          text: "%1.",
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 480, hanging: 260 } } },
        },
      ],
    })),
  },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 22 } },
    },
  },
  sections: [
    {
      properties: { page: { margin: { top: 1100, bottom: 1100, left: 1100, right: 1100 } } },
      children,
    },
  ],
});

const outDir = path.join(os.homedir(), "Desktop");
const outPath = path.join(outDir, "IFM_Complete_Process.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log("WROTE:", outPath, `(${buf.length} bytes)`);
});
