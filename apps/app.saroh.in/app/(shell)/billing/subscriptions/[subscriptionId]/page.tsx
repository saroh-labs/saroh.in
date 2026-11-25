import { PaymentsLocked } from "@/components/invoices/locked/payments-locked";
import { SubscriptionDetailContainer } from "@/components/subscriptions/subscription-detail/subscription-detail-container";
import { mayRead, paymentsLockedCopy } from "@/lib/invoices/access";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { requireSession } from "@/lib/session";

import Loading from "./loading";

// "Subscription", never their name: a tab's title shows in a screen share, in
// history and in bookmarks (`lib/page-title.ts`).
export const metadata = { title: "Subscription" };

const STEPS = ["pause", "switch", "cancel", "restart"] as const;

/**
 * Payments → Subscriptions → one subscription (plan 2026-09-23-003, U13),
 * after "Saroh Subscription Detail" layout 2a.
 *
 * On React Query (DEC-259), loaded in the browser: the gate (the locked
 * card for a role without `subscription:read`, D18) and what this person
 * may do are decided here; the subscription with its plans, charges,
 * Changes (D9), when renewals last ran and the subscriber's card
 * (`/api/subscriptions/[subscriptionId]`, each optional part failing on
 * its own) is `SubscriptionDetailContainer`'s query, read behind the
 * route's loader. Missing, or another business's, is its 404.
 * `?do=pause|switch|cancel|restart` arrives from the list's quick look and
 * opens that step; `?do=autopay-link` from Home's "Send a set-up link"
 * (D14) opens that sheet.
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
    const may = permitsFor(organization);

    // Told so, and who can change it — not a "not found" that reads like a
    // broken link. The design's locked card (D18).
    if (organization && !mayRead(organization, "subscription:read")) {
        return (
            <PaymentsLocked
                {...paymentsLockedCopy(organization, "subscriptions")}
            />
        );
    }

    return (
        <SubscriptionDetailContainer
            ask={{ subscriptionId }}
            skeleton={<Loading />}
            viewerId={session.user.id}
            bizName={organization?.name ?? null}
            canWrite={may("subscription:write")}
            canPayLink={may("invoice:write")}
            initialStep={STEPS.find((s) => s === query.do) ?? null}
            openSetUpLink={query.do === "autopay-link"}
            nowIso={new Date().toISOString()}
        />
    );
}
