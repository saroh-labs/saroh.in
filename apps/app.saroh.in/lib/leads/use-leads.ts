"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { contactsKeys } from "@/lib/contacts/queries";
import { customersKeys } from "@/lib/customers/queries";
import { homeKeys } from "@/lib/home/queries";
import { useOrgId } from "@/lib/query/org";
import { shellLiveRead } from "@/lib/shell/queries";

import type { LeadAsk } from "./queries";
import { leadRead, leadsKeys, leadsListRead, pipelineRead } from "./queries";

/** `/leads`: the leads, their follow-ups and Add a lead (DEC-259). */
export function useLeadsList() {
    return useQuery(leadsListRead.options(useOrgId(), {}));
}

/** `/pipeline`: the board. */
export function usePipeline() {
    return useQuery(pipelineRead.options(useOrgId(), {}));
}

/** One lead's page. */
export function useLead(ask: LeadAsk) {
    return useQuery(leadRead.options(useOrgId(), ask));
}

/**
 * After a lead, its stage, its timeline, a message or consent changed:
 * what Leads and Contacts have on screen (the list, the board, the lead,
 * a person's Leads tab) is read again, resolving once it is back, and so
 * is the shell's live read, whose rail badge counts the leads waiting;
 * Customers and Home, which count and name leads, are marked stale.
 * `refetch: false` marks Leads and Contacts stale and reads nothing of
 * them: a deleted lead's page is being left. Never throws.
 */
export function leadsSaved(
    qc: QueryClient,
    orgId: string,
    refetch = true,
): Promise<void> {
    const stale = { refetchType: "none" } as const;
    const now = refetch ? {} : stale;
    return Promise.all([
        qc.invalidateQueries({ queryKey: leadsKeys(orgId), ...now }),
        qc.invalidateQueries({ queryKey: contactsKeys(orgId), ...now }),
        qc.invalidateQueries({ queryKey: shellLiveRead.key(orgId, {}) }),
        qc.invalidateQueries({ queryKey: customersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Leads part saves: `orgId` goes last to each write (the action runs
 * it through `writeAsOrg`, refusing a moved tab and revalidating nothing),
 * then `saved()` once it landed, or `left()` when the screen is being left.
 * A refused write calls neither.
 */
export interface LeadsSave {
    orgId: string;
    saved: () => Promise<void>;
    left: () => Promise<void>;
}

export function useLeadsSave(): LeadsSave {
    const qc = useQueryClient();
    const orgId = useOrgId();
    return useMemo(
        () => ({
            orgId,
            saved: () => leadsSaved(qc, orgId),
            left: () => leadsSaved(qc, orgId, false),
        }),
        [qc, orgId],
    );
}
