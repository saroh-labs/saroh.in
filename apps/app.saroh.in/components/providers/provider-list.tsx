"use client";

import { PartialRead } from "@/components/shared/failed-read";
import { EmptyState, ProviderDisconnectedState } from "@saroh/ui/data-state";
import { useId } from "react";

import type { ProvidersView } from "@/lib/providers/rows";
import { CONNECT_EMAIL_ANCHOR } from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
    PaymentWebhookSetup,
} from "@/lib/providers/service";

import { DomainsRowView, ProviderRowView } from "./provider-row";

const UNREAD = {
    payments: "payment providers",
    messaging: "email and WhatsApp providers",
} as const;

/**
 * Settings → Providers: a row per provider. Connected first — with its
 * state, what it does for the business, and Manage, Disconnect and Details —
 * then the ones the business could connect next, each with Connect. Domains
 * are not a provider and keep their own row below.
 *
 * Never renders a credential — the rows carry only what the API sends as
 * public (see `lib/providers/rows.ts`).
 */
export function ProviderList({
    view,
    payments,
    messaging,
    webhooks,
}: {
    view: ProvidersView;
    /** What is connected, for the setup dialogs. */
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
    /** Each payment provider's webhook (DEC-063); `null` when unread. */
    webhooks: PaymentWebhookSetup[] | null;
}) {
    const dialogs = { payments, messaging, webhooks };
    const offersPayments = view.available.some((e) => e.type === "Payments");
    // With a list unread, "nothing connected" might not be true.
    const showConnected = view.connected.length > 0 || view.unread.length === 0;

    return (
        <div className="space-y-5">
            {view.unread.length > 0 ? (
                <PartialRead
                    things={`your ${view.unread.map((k) => UNREAD[k]).join(" and ")}`}
                    so="They are not listed here."
                />
            ) : null}

            {showConnected ? (
                <Group title="Connected">
                    {view.connected.length > 0 ? (
                        view.connected.map((entry) => (
                            <ProviderRowView
                                key={entry.key}
                                entry={entry}
                                {...dialogs}
                            />
                        ))
                    ) : offersPayments && !view.paymentsLocked ? (
                        <ProviderDisconnectedState
                            size="inline"
                            provider="payment"
                            className="px-4 py-[13px] min-[760px]:px-[18px]"
                            href={null}
                        />
                    ) : (
                        <EmptyState
                            size="inline"
                            className="px-4 py-[13px] min-[760px]:px-[18px]"
                            title="Nothing connected yet."
                        />
                    )}
                </Group>
            ) : null}

            {view.available.length > 0 ? (
                <Group title="Available">
                    {view.available.map((entry) => (
                        <ProviderRowView
                            key={entry.key}
                            entry={entry}
                            anchorId={
                                entry.key === view.connectEmailKey
                                    ? CONNECT_EMAIL_ANCHOR
                                    : undefined
                            }
                            {...dialogs}
                        />
                    ))}
                </Group>
            ) : null}

            {view.domains ? (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <DomainsRowView row={view.domains} />
                </div>
            ) : null}

            <p className="text-pretty text-[11.5px] leading-normal text-muted-foreground">
                These belong to the whole business. Each location can pick its
                own payment provider under Sell.
            </p>
        </div>
    );
}

function Group({
    title,
    children,
}: {
    title: string;
    children: React.ReactNode;
}) {
    const id = useId();
    return (
        <section aria-labelledby={id}>
            <h3 id={id} className="label mb-2">
                {title}
            </h3>
            <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                {children}
            </div>
        </section>
    );
}
