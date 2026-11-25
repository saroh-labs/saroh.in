import "server-only";

import { mayRead } from "@/lib/invoices/access";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { moduleAccess } from "@/lib/modules/guard";
import { permits } from "@/lib/organizations/permits";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import type {
    SubscriptionAsk,
    SubscriptionContact,
    SubscriptionsListView,
    SubscriptionView,
} from "./queries";
import {
    subscriptionContactsRead,
    subscriptionRead,
    subscriptionSettingsRead,
    subscriptionsListRead,
} from "./queries";
import type { SubscriptionSettings } from "./service";
import {
    getRenewals,
    getSubscriberCard,
    getSubscription,
    getSubscriptionSettings,
    listCharges,
    listChargesBySubscription,
    listPlans,
    listPlansOptional,
    listSubscriptionEvents,
    listSubscriptions,
} from "./service";
import {
    chargeWire,
    eventsWire,
    optionalWire,
    planWire,
    renewalsWire,
    subscriptionWire,
} from "./wire";

/**
 * Who reads Subscriptions (DEC-259), asked by `/api/subscriptions/*` as the
 * section asks it: Payments on (the layout's `ModuleGate`) and
 * `subscription:read` (the pages' locked card); anyone else a 403. What
 * each subscription shows is the API's: every read carries the session.
 */
async function may(action: "subscription:read" | "subscription:write") {
    const organization = await activeOrganizationOnce();
    if (!organization) return false;
    const allowed =
        action === "subscription:read"
            ? mayRead(organization, action)
            : permits(organization, action);
    if (!allowed) return false;
    const access = await moduleAccess("PAYMENTS");
    return access.state === "available" || access.state === "unknown";
}

export const mayReadSubscriptions = () => may("subscription:read");
/** Who Subscribe someone may pick: only someone who may subscribe them. */
export const maySubscribe = () => may("subscription:write");

/**
 * The list, with the Plans tab's plans, the quick look's charges and when
 * renewals last ran; the last three each fail on their own.
 */
export async function readSubscriptionsList(): Promise<SubscriptionsListView> {
    const [{ rows, truncated }, plans, charges, renewals] = await Promise.all([
        listSubscriptions(),
        listPlansOptional(),
        listChargesBySubscription(),
        getRenewals().catch(() => null),
    ]);
    return {
        renewals: renewalsWire(renewals),
        subscriptions: rows.map(subscriptionWire),
        truncated,
        plans: optionalWire(plans, (p) => p.map(planWire)),
        charges: optionalWire(charges, (by) =>
            Object.fromEntries(
                Object.entries(by).map(([id, c]) => [id, c.map(chargeWire)]),
            ),
        ),
    };
}

/** One subscription's page; null (a 404): missing, or another business's. */
export async function readSubscriptionView({
    subscriptionId,
}: SubscriptionAsk): Promise<SubscriptionView | null> {
    const sub = await getSubscription(subscriptionId);
    if (!sub) return null;
    const [plans, charges, changes, renewals, card] = await Promise.all([
        listPlans(),
        listCharges(sub.id),
        listSubscriptionEvents(sub.id),
        getRenewals().catch(() => null),
        getSubscriberCard(sub.contact.id),
    ]);
    return {
        sub: subscriptionWire(sub),
        plans: plans.map(planWire),
        charges: optionalWire(charges, (c) => c.map(chargeWire)),
        changes: optionalWire(changes, eventsWire),
        renewals: renewalsWire(renewals),
        card,
    };
}

export async function readSubscriptionSettings(): Promise<{
    settings: SubscriptionSettings | null;
}> {
    return { settings: await getSubscriptionSettings() };
}

export const subscriptionsListServer: ServerRead<
    Record<string, never>,
    SubscriptionsListView
> = { read: subscriptionsListRead, service: readSubscriptionsList };

export const subscriptionServer: ServerRead<SubscriptionAsk, SubscriptionView> =
    { read: subscriptionRead, service: readSubscriptionView };

export const subscriptionSettingsServer: ServerRead<
    Record<string, never>,
    { settings: SubscriptionSettings | null }
> = { read: subscriptionSettingsRead, service: readSubscriptionSettings };

export const subscriptionContactsServer: ServerRead<
    Record<string, never>,
    SubscriptionContact[]
> = { read: subscriptionContactsRead, service: contactPickerOptions };
