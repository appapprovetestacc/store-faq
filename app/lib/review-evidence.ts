export interface ReviewEvidenceItem {
  label: string;
  detail: string;
}

export interface ReviewEvidencePack {
  reviewerSetup: ReviewEvidenceItem[];
  screencastShots: ReviewEvidenceItem[];
  testCredentials: ReviewEvidenceItem[];
  dataRetention: ReviewEvidenceItem[];
}

export function buildReviewEvidencePack(): ReviewEvidencePack {
  return {
    reviewerSetup: [
      { label: "Install", detail: "Install the app on a clean development store through the Shopify OAuth flow." },
      { label: "Embedded load", detail: "Open the app from Shopify admin and confirm it loads inside the embedded frame." },
      { label: "Billing", detail: "Select the free or test billing plan before exercising paid features." },
      { label: "Uninstall", detail: "Uninstall and reinstall the app to verify cleanup and webhook behavior." },
    ],
    screencastShots: [
      { label: "OAuth", detail: "Capture install, permission screen, and first embedded load." },
      { label: "Primary workflow", detail: "Capture the merchant-facing workflow this app promises in the listing." },
      { label: "Support", detail: "Capture support, privacy, status, and billing pages." },
    ],
    testCredentials: [
      { label: "Development store", detail: "Add a reviewer staff account and document the store URL in Partner Dashboard notes." },
      { label: "Seed data", detail: "List any required products, customers, discounts, or orders." },
    ],
    dataRetention: [
      { label: "GDPR webhooks", detail: "Mandatory customer data request, customer redact, and shop redact handlers are wired." },
      { label: "Deletion", detail: "Shop data is removed or anonymized when the shop/redact webhook is received." },
    ],
  };
}
