"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useCallback, useContext } from "react";

import { customersKeys } from "@/lib/customers/queries";
import { homeKeys } from "@/lib/home/queries";
import { useOrgId, useOrgIdOrNull } from "@/lib/query/org";

import type { PersonCrmAsk } from "./queries";
import { contactsKeys, contactsListRead, personCrmRead } from "./queries";

/** The business's contacts (DEC-259). */
export function useContacts() {
    return useQuery(contactsListRead.options(useOrgId(), {}));
}

/** A person's leads and enquiries; `enabled` false reads nothing. */
export function usePersonCrm(ask: PersonCrmAsk, enabled = true) {
    return useQuery({ ...personCrmRead.options(useOrgId(), ask), enabled });
}

/**
 * After a contact was added: what Contacts has on screen is read again;
 * Customers and Home, which name them, are marked stale for their next
 * visit. Never throws: a read that fails is the screen's failed state.
 */
export function contactsSaved(qc: QueryClient, orgId: string): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: contactsKeys(orgId) }),
        qc.invalidateQueries({ queryKey: customersKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * `contactsSaved` for the open business, and its id for the write's last
 * argument. Add contact also opens outside a query cache (a test's render
 * of the invoice editor): then it has nothing to mark.
 */
export function useContactsSave(): {
    orgId: string | undefined;
    saved: () => Promise<void>;
} {
    const qc = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull() ?? undefined;
    const saved = useCallback(
        () => (qc && orgId ? contactsSaved(qc, orgId) : Promise.resolve()),
        [qc, orgId],
    );
    return { orgId, saved };
}
