# IFM — Inventory Funding Manager (Distribution) · V1.5

IFM helps a distributor decide **how much inventory can be responsibly funded now**, which
purchase candidates deserve that funding first, and which should be reduced, split, delayed,
held, or declined — and which decisions require reviewer or owner approval.

This app is a **sibling** to the RSE distribution app and intentionally mirrors its stack and
conventions. RSE identifies replenishment need and inventory classification; **IFM allocates
funding priority.**

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript (strict), `@/*` path alias → `src/*`
- Prisma 6 + SQLite (`data/ifm.db`)
- `xlsx` for spreadsheet review files, `docx` for document output

## Locked hard rules (V1.5)

- Source-agnostic: QuickBooks/Keystroke are example sources, not required systems.
- Map source data into standard IFM domains before any calculation runs.
- IFM never creates, sends, modifies, cancels, pays, borrows, or factors automatically.
- Funding approval ≠ purchase approval ≠ official PO action.
- LOC and factoring are supplemental funding, not operating cash.
- Blank/missing data is not treated as zero unless confirmed none exist.
- Keystroke upload/re-import files must be tab-delimited `.txt`; CSV/XLSX are review-only.

## Build stages (per `docs/specs`)

| Stage | Name | Source docs | Status |
| ----- | ---- | ----------- | ------ |
| 1 | Foundation (intent, rules, boundaries) | 01, 02 | ✅ scaffolded |
| 2 | Data model + calculation/decision logic | 03, 04 | ⏳ next |
| 3 | Screens, workflow, outputs, exports | 05, 06 | ⬜ |
| 4 | Sample test data + acceptance checklist | 07, 08 | ⬜ |

The authoritative build specifications live in [`docs/specs`](./docs/specs), extracted to text
from the IFM-Dist `.docx` package.

## Getting started

```bash
npm install
cp .env.example .env
npm run db:push      # create the SQLite schema
npm run dev          # http://localhost:3000
```
