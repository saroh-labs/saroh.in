"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { billingRead } from "./queries";

/** Settings › Plan and billing, held for the visit (`settings` tier). */
export function useBillingScreen() {
    return useQuery(billingRead.options(useOrgId(), {}));
}
