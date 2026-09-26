"use client";

import { PartialNotice } from "@saroh/ui/data-state";
import { useId } from "react";

import type { ProvidersView } from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
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
}: {
    view: ProvidersView;
    /** What is connected, for the setup dialogs. */
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
}) {
    const dialogs = { payments, messaging };
    const offersPayments = view.available.some((e) => e.type === "Payments");
    // With a list unread, "nothing connected" might not be true.
    const showConnected = view.connected.length > 0 || view.unread.length === 0;

    return (
        <div className="max-w-[720px] space-y-5">
            {view.unread.length > 0 ? (
                <PartialNotice>
                    Your {view.unread.map((k) => UNREAD[k]).join(" and ")} could
                    not be read, so they are not listed here. Reload the page to
                    try again.
                </PartialNotice>
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
                    ) : (
                        <p className="text-pretty px-4 py-[13px] text-[13px] leading-[1.45] text-muted-foreground min-[760px]:px-[18px]">
                            {offersPayments
                                ? "Nothing connected yet — connect a payment provider to take payments online."
                                : "Nothing connected yet."}
                        </p>
                    )}
                </Group>
            ) : null}

            {view.available.length > 0 ? (
                <Group title="Available">
                    {view.available.map((entry) => (
                        <ProviderRowView
                            key={entry.key}
                            entry={entry}
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
                These belong to the whole business. Each storefront can pick its
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
            <h3
                id={id}
                className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                {title}
            </h3>
            <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                {children}
            </div>
        </section>
    );
}
