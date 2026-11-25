"use client";

import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useContext } from "react";

import { isCustomerEmails } from "@/lib/communications/customer-emails";
import { useOrgId, useOrgIdOrNull } from "@/lib/query/org";
import { useSettingsSave } from "@/lib/settings/use-settings";

import type { ProvidersScreen } from "./queries";
import { providersRead } from "./queries";

/** Settings › Integrations, held for the visit (`settings` tier). */
export function useProvidersScreen() {
    return useQuery(providersRead.options(useOrgId(), {}));
}

/**
 * A customer email saved: its answer goes into Integrations' cache, so the
 * sheet's switches (`useOptimistic`) settle on what was saved with no read
 * of the tab again. An answer in a shape we don't know reads it again.
 */
export function usePutCustomerEmails(): (next: unknown) => void {
    // Outside a query provider (a test) the sheet saves as before.
    const qc = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    const save = useSettingsSave();
    return (next) => {
        if (!qc || !orgId) return;
        if (!isCustomerEmails(next)) return save.saved();
        qc.setQueryData(
            providersRead.key(orgId, {}),
            (d: ProvidersScreen | undefined) =>
                d ? { ...d, customerEmails: next } : d,
        );
    };
}

/**
 * The side list's Integrations line as Integrations last read it, or
 * undefined until it has been read here: the layout's line is drawn by the
 * server, and a connect on this tab doesn't draw it again. Never reads.
 */
export function useHeldIntegrationsNote(): string | null | undefined {
    const orgId = useOrgIdOrNull();
    const held = useQuery({
        ...providersRead.options(orgId ?? "-", {}),
        enabled: false,
    });
    return orgId ? held.data?.tabNote : undefined;
}
