export type OnboardingSubmitRequest = {
  form: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    trn: string;
    nis: string;
    licenceNumber: string;
    licenceExpiry: string;
    badgeNumber: string;
    plateNumber: string;
    vehicleType: string;
    vehicleMake: string;
    vehicleModel: string;
    vehicleYear: string;
    vehicleColor: string;
    franchiseNumber: string;
    franchiseExpiry: string;
    // Payout method — captured during onboarding so a driver's first
    // payout can land the very next Monday after approval instead of
    // stalling on a post-approval "wait, how do I get paid?" step.
    // The onboarding endpoint upserts these fields into payout_methods
    // (same table + validation as PUT /api/driver/payout-method).
    payoutBankName: string;
    payoutBranch: string;
    payoutAccountNumber: string;
    payoutAccountHolderName: string;
    payoutAccountType: "savings" | "chequing";
    payoutRoutingNumber: string;
  };
  uploadedDocs: Array<{
    id: string;
    fileName: string;
    filePath?: string;
  }>;
};

export type AdminDecisionRequest = {
  driverId: string;
  adminNote: string;
  docs: Array<{
    id: string;
    status: "approved" | "pending" | "rejected" | "resubmit";
    note: string;
    /** Optional ISO date (YYYY-MM-DD) the admin wants to stamp on the
     *  doc — the canonical source of truth for renewal countdowns. When
     *  omitted, the existing value on the row is preserved. Required by
     *  the server when the doc has a renewal_period_days > 0 and the
     *  admin is approving it. */
    expiresOn?: string | null;
  }>;
  activateDriver: boolean;
};
