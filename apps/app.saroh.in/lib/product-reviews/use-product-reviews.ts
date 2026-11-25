"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { customersKeys } from "@/lib/customers/queries";
import { homeKeys } from "@/lib/home/queries";
import { ordersKeys } from "@/lib/orders/queries";
import { productPagesKeys } from "@/lib/products/queries";
import { useOrgId } from "@/lib/query/org";
import { shellLiveRead } from "@/lib/shell/queries";

import { productReviewsRead, reviewInvitesRead } from "./queries";

/** Every review with the ratings; `enabled` false reads nothing. */
export function useProductReviews(enabled = true) {
    return useQuery({ ...productReviewsRead.options(useOrgId(), {}), enabled });
}

/** What Invite reviews offers; only for a role that may invite. */
export function useReviewInvites(enabled: boolean) {
    return useQuery({ ...reviewInvitesRead.options(useOrgId(), {}), enabled });
}

/**
 * After a reply, hide, show or invite landed: the reviews read again where
 * shown, and the reads that draw a review (a product's page, a customer's
 * Reviews tab) and the bell (a reply clears its notification), each only
 * if on screen; Invite reviews' list (read again after an invite, which
 * takes orders off it), Orders (an order's invitation) and Home's news are
 * marked stale. Resolves once they are back; never throws.
 */
export function reviewsSaved(
    qc: QueryClient,
    orgId: string,
    { invited = false }: { invited?: boolean } = {},
): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({
            queryKey: productReviewsRead.key(orgId, {}),
        }),
        qc.invalidateQueries({
            queryKey: reviewInvitesRead.key(orgId, {}),
            ...(invited ? {} : stale),
        }),
        // A product's page, never the list's pages: their stars come from here.
        qc.invalidateQueries({ queryKey: productPagesKeys(orgId) }),
        qc.invalidateQueries({ queryKey: customersKeys(orgId) }),
        qc.invalidateQueries({ queryKey: shellLiveRead.key(orgId, {}) }),
        qc.invalidateQueries({ queryKey: ordersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/** How a review is replied to, hidden or invited: `orgId` last, `saved()` after. */
export interface ReviewSave {
    orgId: string;
    saved: (after?: { invited?: boolean }) => Promise<void>;
}

export function useReviewSave(): ReviewSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({
            orgId,
            saved: (after?: { invited?: boolean }) =>
                reviewsSaved(qc, orgId, after),
        }),
        [qc, orgId],
    );
}
