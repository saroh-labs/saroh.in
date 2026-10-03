import { notFound } from "next/navigation";

import { PaymentsLocked } from "@/components/invoices/payments-locked";
import { PageContainer } from "@/components/shared/page-container";
import { SubscriptionDetail } from "@/components/subscriptions/subscription-detail/detail-screen";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { contactPickerOptions } from "@/lib/invoices/contacts";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";
import {
    getRenewals,
    getSubscriberCard,
    getSubscription,
    listCharges,
    listPlans,
    listSubscriptionEvents,
} from "@/lib/subscriptions/service";
import { ranLine } from "@/lib/subscriptions/view";

export const metadata = { title: "Subscription" };

const STEPS = ["pause", "switch", "cancel", "restart"] as const;

/**
 * Payments → Subscriptions → one subscription (plan 2026-09-23-003, U13),
 * after "Saroh Subscription Detail" layout 2a.
 *
 * The subscription and the plans are required; its charges, its Changes
 * log (D9), when renewals
 * last ran and the subscriber's phone and allergies are read on their own,
 * so a role without invoices, or one failed read, costs its own panel and
 * nothing else. `?do=pause|switch|cancel|restart` arrives from the list's
 * quick look and opens that step; `?do=autopay-link` from Home's "Send a
 * set-up link" (D14) opens that sheet.
 */
export default async function SubscriptionPage({
    params,
    searchParams,
}: {
    params: Promise<{ subscriptionId: string }>;
    searchParams: Promise<{ do?: string }>;
}) {
    const session = await requireSession();
    const [{ subscriptionId }, query, organization] = await Promise.all([
        params,
        searchParams,
        resolveActiveOrganization(),
    ]);
    const may = (action: string) =>
        organization?.actions
            ? organization.actions.includes(action)
            : organization?.role === "OWNER" || organization?.role === "ADMIN";

    // Told so, and who can change it — not a "not found" that reads like a
    // broken link. The design's locked card (D18).
    if (organization && !mayRead(organization, "subscription:read")) {
        return (
            <PaymentsLocked
                {...paymentsLockedCopy(organization, "subscriptions")}
            />
        );
    }

    const sub = await getSubscription(subscriptionId);
    if (!sub) notFound();

    const canWrite = may("subscription:write");
    const step = STEPS.find((s) => s === query.do) ?? null;
    const [plans, charges, changes, renewals, card, contacts] =
        await Promise.all([
            listPlans(),
            listCharges(sub.id),
            listSubscriptionEvents(sub.id),
            getRenewals().catch(() => null),
            getSubscriberCard(sub.contact.id),
            // Restarting picks the person again, so only then are they read.
            canWrite && sub.status === "CANCELLED"
                ? contactPickerOptions()
                : Promise.resolve([]),
        ]);
    const now = new Date();

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <SubscriptionDetail
                sub={sub}
                charges={charges}
                changes={changes}
                viewerId={session.user.id}
                plans={plans}
                card={card}
                ran={renewals ? ranLine(renewals, sub.timezone, now) : null}
                bizName={organization?.name ?? null}
                canWrite={canWrite}
                canPayLink={may("invoice:write")}
                initialStep={step}
                openSetUpLink={query.do === "autopay-link"}
                contacts={contacts}
                nowIso={now.toISOString()}
            />
        </PageContainer>
    );
}
