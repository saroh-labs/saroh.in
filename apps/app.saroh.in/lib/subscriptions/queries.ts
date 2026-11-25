import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { CappedList } from "@/lib/lists/capped";

import type {
    Optional,
    Plan,
    PlanEventsPage,
    Renewals,
    SubscriberCard,
    Subscription,
    SubscriptionCharge,
    SubscriptionEventsPage,
    SubscriptionSettings,
} from "./service";

/**
 * Subscriptions' reads (DEC-259): the list (with its Plans tab), one
 * subscription, the settings every plan shares, and who can be subscribed.
 * Client-safe: the keys and the routes; the services are paired in
 * `access-server.ts`.
 */

/** Every Subscriptions read of a business. */
export const subscriptionsKeys = (orgId: string): DomainKey =>
    domainKey("subscriptions", orgId);

/** The list and the subscriptions' own pages: what a subscription's save changes. */
export const subscriptionsListKeys = (orgId: string): DomainKey =>
    domainKey("subscriptions", orgId, "list");
export const subscriptionKeys = (orgId: string): DomainKey =>
    domainKey("subscriptions", orgId, "one");

/** The list as its page draws it. */
export interface SubscriptionsListView {
    subscriptions: Subscription[];
    /** The newest read hit its cap: older cancelled ones are not here. */
    truncated: boolean;
    /** The Plans tab's plans, drafts too; a failed read is the tab's own. */
    plans: Optional<Plan[]>;
    /** Each subscription's invoices, for the quick look's last charges. */
    charges: Optional<Record<string, SubscriptionCharge[]>>;
    /** When renewals last ran; null when it couldn't be read. */
    renewals: Renewals | null;
}

export const subscriptionsListRead = defineRead<SubscriptionsListView>()({
    key: (orgId) => domainKey("subscriptions", orgId, "list"),
    route: { path: "/api/subscriptions", params: {} },
    tier: "records",
});

const ID = z.string().regex(/^[\w-]{1,64}$/);

/** Every plan's own page: what a plan's save reads again. */
export const planKeys = (orgId: string): DomainKey =>
    domainKey("subscriptions", orgId, "plan");

/** One plan's page (D4): the plan, who is on it and its history's first page. */
export interface PlanView {
    plan: Plan;
    /** Its newest and every live subscription; a failed read is its tab's. */
    subscriptions: Optional<CappedList<Subscription>>;
    events: Optional<PlanEventsPage>;
    /** The business sells classes (Appointments on, default 31). */
    withClasses: boolean;
}

/**
 * Records, not settings: who is on a plan changes from outside (a customer
 * subscribes on the site), so it can't wait for the plan's own saves.
 */
export const planRead = defineRead<PlanView>()({
    key: (orgId, { planId }) =>
        domainKey("subscriptions", orgId, "plan", planId),
    route: { path: "/api/plans/[planId]", params: { planId: ID } },
    tier: "records",
});

export type PlanAsk = Parameters<typeof planRead.options>[1];

/** One subscription as its page draws it. */
export interface SubscriptionView {
    sub: Subscription;
    plans: Plan[];
    charges: Optional<SubscriptionCharge[]>;
    /** Its Changes log's first page (D9). */
    changes: Optional<SubscriptionEventsPage>;
    renewals: Renewals | null;
    /** The subscriber's phone and allergens; null when unread. */
    card: SubscriberCard | null;
}

export const subscriptionRead = defineRead<SubscriptionView>()({
    key: (orgId, { subscriptionId }) =>
        domainKey("subscriptions", orgId, "one", subscriptionId),
    route: {
        path: "/api/subscriptions/[subscriptionId]",
        params: { subscriptionId: ID },
    },
    tier: "records",
});

export type SubscriptionAsk = Parameters<typeof subscriptionRead.options>[1];

/**
 * "Settings for every plan" (A8, D13B): set in a sheet, rarely. Null when
 * unread or not this role's: the Plans tab goes without the rows.
 */
export const subscriptionSettingsRead = defineRead<{
    settings: SubscriptionSettings | null;
}>()({
    key: (orgId) => domainKey("subscriptions", orgId, "settings"),
    route: { path: "/api/subscriptions/settings", params: {} },
    tier: "settings",
});

/** Who Subscribe someone can pick: read when the sheet opens. */
export interface SubscriptionContact {
    id: string;
    name: string;
    email: string;
}

export const subscriptionContactsRead = defineRead<SubscriptionContact[]>()({
    key: (orgId) => domainKey("subscriptions", orgId, "contacts"),
    route: { path: "/api/subscriptions/contacts", params: {} },
    tier: "records",
});
