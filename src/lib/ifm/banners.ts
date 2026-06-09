// Warning banners — Document 5 §8. Pure function over already-computed run figures.
export interface BannerInput {
  coreAvailableInventoryFunding: number | null | undefined;
  anyFinancingApproval: boolean;
  vendorConcentrationFlagged: boolean;
  hasDraftPo: boolean;
  lowConfidenceData: boolean;
  vendorOfferPresent: boolean;
}

export interface Banner {
  level: "warn" | "info" | "bad";
  text: string;
}

export function buildBanners(input: BannerInput): Banner[] {
  const banners: Banner[] = [];
  if ((input.coreAvailableInventoryFunding ?? 0) < 0) {
    banners.push({
      level: "bad",
      text: "Core operating cash does not support new inventory purchases without supplemental funding or management override.",
    });
  }
  if (input.anyFinancingApproval) {
    banners.push({
      level: "warn",
      text: "One or more purchases depend on supplemental funding (LOC/factoring) and require approval.",
    });
  }
  if (input.vendorConcentrationFlagged) {
    banners.push({
      level: "warn",
      text: "A vendor consumes a high percentage of available inventory funding (concentration risk).",
    });
  }
  if (input.vendorOfferPresent) {
    banners.push({
      level: "info",
      text: "Vendor deals, discounts, free freight, and extended terms are not automatically good — evaluated on demand and cash conversion.",
    });
  }
  if (input.hasDraftPo) {
    banners.push({
      level: "info",
      text: "Draft POs are treated as purchase candidates, not committed exposure.",
    });
  }
  if (input.lowConfidenceData) {
    banners.push({
      level: "warn",
      text: "One or more key sources are low confidence and may affect funding confidence.",
    });
  }
  banners.push({
    level: "info",
    text: "Buyer action occurs outside IFM after approval. IFM does not create, send, or pay POs in V1.5.",
  });
  return banners;
}
