"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { createContext, createElement, useContext, useMemo } from "react";

import { homeKeys } from "@/lib/home/queries";
import { invoicesKeys } from "@/lib/invoices/queries";
import { afterSettingsSave } from "@/lib/query/invalidate";
import { useOrgId } from "@/lib/query/org";

import type { PlanAsk, SubscriptionAsk } from "./queries";
import {
    planKeys,
    planRead,
    subscriptionContactsRead,
    subscriptionKeys,
    subscriptionRead,
    subscriptionSettingsRead,
    subscriptionsListKeys,
    subscriptionsListRead,
} from "./queries";

/** The list, its Plans tab's plans, the quick look's charges (DEC-259). */
export function useSubscriptionsList() {
    return useQuery(subscriptionsListRead.options(useOrgId(), {}));
}

/** One subscription as its page draws it. */
export function useSubscription(ask: SubscriptionAsk) {
    return useQuery(subscriptionRead.options(useOrgId(), ask));
}

/** One plan's page: the plan, who is on it, its history. */
export function usePlan(ask: PlanAsk) {
    return useQuery(planRead.options(useOrgId(), ask));
}

/** Settings for every plan (the Plans tab's rows). */
export function useSubscriptionSettings() {
    return useQuery(subscriptionSettingsRead.options(useOrgId(), {}));
}

/** Who Subscribe someone can pick; read once the sheet opens. */
export function useSubscriptionContacts(enabled: boolean) {
    return useQuery({
        ...subscriptionContactsRead.options(useOrgId(), {}),
        enabled,
    });
}

/**
 * After a subscription or plan write landed: the list, the subscription
 * and the plan on screen are read again (resolving once they are back, so a busy state
 * lasts until the screen changed); Invoices (a renewal, a restart or a
 * cancel makes or voids one) and Home (Needs you shows failed renewals)
 * are marked stale for their next visit. Never throws: a read that fails
 * is the screen's failed state.
 */
export function subscriptionsSaved(
    qc: QueryClient,
    orgId: string,
): Promise<void> {
    const stale = { refetchType: "none" } as const;
    return Promise.all([
        qc.invalidateQueries({ queryKey: subscriptionsListKeys(orgId) }),
        qc.invalidateQueries({ queryKey: subscriptionKeys(orgId) }),
        qc.invalidateQueries({ queryKey: planKeys(orgId) }),
        qc.invalidateQueries({ queryKey: invoicesKeys(orgId), ...stale }),
        qc.invalidateQueries({ queryKey: homeKeys(orgId), ...stale }),
    ]).then(
        () => undefined,
        () => undefined,
    );
}

/**
 * How a Subscriptions part saves: `orgId` goes last to each write (the
 * action runs it through `writeAsOrg`, refusing a moved tab and
 * revalidating nothing), `saved()` once a subscription or plan write
 * landed, `settingsSaved()` once a setting for every plan did, and
 * `drafted()` once the Plan Editor autosaved. A refused write calls none.
 */
export interface SubscriptionSave {
    /** The tab's business on a React Query screen; undefined elsewhere. */
    orgId: string | undefined;
    saved: () => Promise<void>;
    settingsSaved: () => void;
    /**
     * A plan's draft changed (the Plans tab and its page show "Draft" and
     * "Unpublished changes"): marked stale for their next visit, nothing
     * read now under someone typing.
     */
    drafted: () => void;
}

const SubscriptionSaveContext = createContext<SubscriptionSave | null>(null);

/** Subscriptions' own screens (the section's layout). */
export function SubscriptionSaveProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const qc = useQueryClient();
    const orgId = useOrgId();
    const value = useMemo<SubscriptionSave>(
        () => ({
            orgId,
            saved: () => subscriptionsSaved(qc, orgId),
            // A settings-tier answer: read again here, and the other tabs told.
            settingsSaved: afterSettingsSave,
            drafted: () => {
                const stale = { refetchType: "none" } as const;
                void qc.invalidateQueries({
                    queryKey: subscriptionsListKeys(orgId),
                    ...stale,
                });
                void qc.invalidateQueries({
                    queryKey: planKeys(orgId),
                    ...stale,
                });
            },
        }),
        [qc, orgId],
    );
    return createElement(SubscriptionSaveContext.Provider, { value }, children);
}

/**
 * How a Subscriptions part saves: Subscriptions' own (inside
 * `SubscriptionSaveProvider`), or as before on a screen still
 * server-rendered (a person's page): no business named, the page read
 * again.
 */
export function useSubscriptionSave(): SubscriptionSave {
    const router = useRouter();
    const provided = useContext(SubscriptionSaveContext);
    return (
        provided ?? {
            orgId: undefined,
            saved: () => {
                // rq-refresh-ok: reached only outside the provider, on a server-rendered screen; Subscriptions' own screens provide theirs.
                router.refresh();
                return Promise.resolve();
            },
            settingsSaved: () => {
                // rq-refresh-ok: as above, outside the provider only.
                router.refresh();
            },
            drafted: () => undefined,
        }
    );
}
