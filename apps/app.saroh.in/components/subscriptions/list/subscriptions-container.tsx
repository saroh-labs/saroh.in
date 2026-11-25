"use client";

import type { ComponentProps } from "react";

import { PageContainer } from "@/components/shared/page/page-container";
import { DEFAULT_BUSINESS_ZONE } from "@/lib/format/business-zone";
import { plansShowClasses } from "@/lib/subscriptions/plan-cards";
import {
    useSubscriptionContacts,
    useSubscriptionSettings,
    useSubscriptionsList,
} from "@/lib/subscriptions/use-subscriptions";
import { ranLine } from "@/lib/subscriptions/view";

import { SubscriptionsScreen } from "./subscriptions-screen";

type Screen = ComponentProps<typeof SubscriptionsScreen>;

/**
 * Payments → Subscriptions on React Query (DEC-259): the same
 * `SubscriptionsScreen`, its rows, plans, the quick look's charges and when
 * renewals last ran one query (`/api/subscriptions`), which a save reads
 * again (`useSubscriptionSave`). The settings every plan shares are a
 * settings-tier read, kept for the visit; who Subscribe
 * someone can pick is read for someone who may subscribe. The frame is
 * drawn at once from the page's gate; the rows are skeletons until read.
 */
export function SubscriptionsContainer({
    appointments,
    ...gate
}: Omit<
    Screen,
    | "subscriptions"
    | "truncated"
    | "plans"
    | "showClasses"
    | "contacts"
    | "charges"
    | "renewalsLate"
    | "settings"
> & {
    /** Appointments on (classes said on plan rows); null when unknown. */
    appointments: boolean | null;
}) {
    const list = useSubscriptionsList();
    const data = list.data;
    const canSubscribe = gate.canWrite && !gate.newLocked;
    const contacts = useSubscriptionContacts(canSubscribe);
    // The Plans tab's rows; kept for the visit once read.
    const settings = useSubscriptionSettings();

    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (list.isError && !data) throw list.error;

    const plans = data?.plans.state === "ok" ? data.plans.data : null;
    const subscriptions = data?.subscriptions ?? null;
    // Renewals run on each subscription's own zone; the line reads in the
    // zone most of them share.
    const zone = subscriptions?.[0]?.timezone ?? DEFAULT_BUSINESS_ZONE;
    const ran = data?.renewals
        ? ranLine(data.renewals, zone, new Date(gate.nowIso))
        : null;

    return (
        <PageContainer width="full">
            <SubscriptionsScreen
                {...gate}
                subscriptions={subscriptions}
                truncated={data?.truncated}
                plans={plans}
                showClasses={plansShowClasses(appointments, plans ?? [])}
                contacts={contacts.data ?? []}
                charges={data?.charges ?? { state: "failed" }}
                // Said only when renewals are late, as the warning it is.
                renewalsLate={ran?.late ? ran.text : null}
                settings={settings.data?.settings ?? null}
            />
        </PageContainer>
    );
}
