"use client";

import { notFound } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";

import { PageContainer } from "@/components/shared/page/page-container";
import { ReadFailed } from "@/lib/query/client";
import type { SubscriptionAsk } from "@/lib/subscriptions/queries";
import {
    useSubscription,
    useSubscriptionContacts,
} from "@/lib/subscriptions/use-subscriptions";
import { ranLine } from "@/lib/subscriptions/view";

import { SubscriptionDetail } from "./detail-screen";

type Detail = ComponentProps<typeof SubscriptionDetail>;

/**
 * One subscription on React Query (DEC-259): `SubscriptionDetail` drawn
 * from the subscription's query (it, the plans, its charges, its Changes,
 * when renewals last ran and the subscriber's card), so a pause, a skip or
 * a cancel reads it again (`useSubscriptionSave`), never the whole page.
 * What the person may do is the page's, decided on the server. Its title
 * and actions all come from the record, so the route's loader stands until
 * it lands (`skeleton`). Missing, or another business's, is the 404.
 */
export function SubscriptionDetailContainer({
    ask,
    skeleton,
    ...gate
}: {
    ask: SubscriptionAsk;
    /** The route's loader, until the subscription is read. */
    skeleton: ReactNode;
} & Pick<
    Detail,
    | "viewerId"
    | "bizName"
    | "canWrite"
    | "canPayLink"
    | "initialStep"
    | "openSetUpLink"
    | "nowIso"
>) {
    const read = useSubscription(ask);
    const { data } = read;
    // Restarting picks the person again, so only then are they read.
    const contacts = useSubscriptionContacts(
        gate.canWrite && data?.sub.status === "CANCELLED",
    );
    if (read.error instanceof ReadFailed && read.error.status === 404) {
        notFound();
    }
    // A first read that failed is the page failing (`error.tsx`); a read
    // again that fails keeps the last answer.
    if (read.isError && !data) throw read.error;
    if (!data) return skeleton;

    return (
        <PageContainer width="full" className="space-y-0 p-0 sm:p-0">
            <SubscriptionDetail
                {...gate}
                sub={data.sub}
                charges={data.charges}
                changes={data.changes}
                plans={data.plans}
                card={data.card}
                ran={
                    data.renewals
                        ? ranLine(
                              data.renewals,
                              data.sub.timezone,
                              new Date(gate.nowIso),
                          )
                        : null
                }
                contacts={contacts.data ?? []}
            />
        </PageContainer>
    );
}
