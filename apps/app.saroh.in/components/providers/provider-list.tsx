"use client";

import { Button } from "@saroh/ui/button";
import { PartialNotice } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
    disconnectCommsProvider,
    disconnectPaymentProvider,
} from "@/lib/providers/actions";
import type {
    DomainsRow,
    ProviderEntry,
    ProviderRef,
    ProviderRowState,
    ProvidersView,
} from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
} from "@/lib/providers/service";

import { ProviderSetupDialog } from "./provider-setup-dialog";

/**
 * What each state is called, and its pill. Connected is the one green; a
 * domain that needs a person is the accent; disconnected is quiet — nothing
 * is broken about a provider someone chose to disconnect.
 */
const PILL: Record<ProviderRowState, { label: string; tone: string }> = {
    CONNECTED: {
        label: "Connected",
        tone: "bg-success-subtle text-success-subtle-foreground",
    },
    PENDING: {
        label: "Waiting for DNS",
        tone: "bg-highlight-subtle text-highlight-subtle-foreground",
    },
    FAILED: {
        label: "Action needed",
        tone: "bg-highlight-subtle text-highlight-subtle-foreground",
    },
    DISCONNECTED: {
        label: "Disconnected",
        tone: "bg-muted text-foreground/80",
    },
    NOT_CONNECTED: {
        label: "Not connected",
        tone: "bg-muted text-foreground/80",
    },
};

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

/** The provider's first letter on a quiet tile — no third-party logos. */
function Monogram({ name }: { name: string }) {
    return (
        <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted font-display text-[14px] font-semibold text-foreground"
        >
            {name.charAt(0).toUpperCase()}
        </span>
    );
}

function ProviderRowView({
    entry,
    payments,
    messaging,
}: {
    entry: ProviderEntry;
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const detailsId = useId();
    const connected = entry.state === "CONNECTED";
    const available = entry.state === "NOT_CONNECTED";
    // Details has something to show: a reference, or the way to change keys.
    const hasDetails = entry.refs.length > 0 || connected;

    const setupDialog = (trigger: string, urgent: boolean) =>
        entry.setup.kind === "payments" ? (
            <ProviderSetupDialog
                kind="payments"
                label={entry.name}
                trigger={trigger}
                urgent={urgent}
                provider={entry.setup.provider}
                connected={payments}
            />
        ) : (
            <ProviderSetupDialog
                kind="messaging"
                label={entry.name}
                trigger={trigger}
                urgent={urgent}
                channel={entry.setup.channel}
                provider={entry.setup.provider}
                connected={messaging}
            />
        );

    async function disconnect() {
        const target = entry.target;
        if (!target) return;
        const res =
            target.kind === "payments"
                ? await disconnectPaymentProvider(target.provider)
                : await disconnectCommsProvider(target.channel);
        if (!res.ok) return showError(res.error);
        showSuccess(`${entry.name} disconnected`);
        router.refresh();
    }

    return (
        <div className="px-4 py-[13px] min-[760px]:px-[18px]">
            <div className="flex flex-col gap-2.5 min-[760px]:flex-row min-[760px]:items-center min-[760px]:gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Monogram name={entry.name} />
                    <div className="min-w-0 flex-1">
                        <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13.5px] font-semibold">
                                {entry.name}
                            </span>
                            <span className="text-[12.5px] text-muted-foreground min-[760px]:hidden">
                                {entry.type}
                            </span>
                            {!available ? (
                                <span
                                    className={cn(
                                        "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                                        PILL[entry.state].tone,
                                    )}
                                >
                                    {PILL[entry.state].label}
                                </span>
                            ) : null}
                        </div>
                        {entry.note ? (
                            <p className="text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                                {entry.note}
                            </p>
                        ) : null}
                    </div>
                    <span className="hidden w-20 shrink-0 pt-2 text-[12.5px] text-muted-foreground min-[760px]:block">
                        {entry.type}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pl-11 min-[760px]:ml-auto min-[760px]:justify-end min-[760px]:pl-0">
                    {/* Connect for one never set up, and again for one
                        someone disconnected. Outline, all of them: a row
                        per provider would otherwise put several solid
                        buttons on one screen. */}
                    {!connected ? setupDialog("Connect", false) : null}
                    {entry.manageHref ? (
                        <Button asChild variant="outline" size="sm">
                            <a
                                href={entry.manageHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`Manage ${entry.name} — opens ${entry.name}'s dashboard`}
                            >
                                Manage
                                <ArrowUpRight aria-hidden className="size-4" />
                            </a>
                        </Button>
                    ) : null}
                    {entry.target ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                            aria-label={`Disconnect ${entry.name}`}
                            onClick={() => setConfirming(true)}
                        >
                            Disconnect
                        </Button>
                    ) : null}
                    {hasDetails ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2.5 text-foreground/80"
                            aria-expanded={open}
                            aria-controls={open ? detailsId : undefined}
                            onClick={() => setOpen((o) => !o)}
                        >
                            {open ? "Hide details" : "Details"}
                            <span className="sr-only"> for {entry.name}</span>
                        </Button>
                    ) : null}
                </div>
            </div>

            {open ? (
                <div
                    id={detailsId}
                    className="mt-2.5 space-y-2 border-t border-dashed border-border pt-2.5"
                >
                    {entry.refs.map((ref) => (
                        <RefLine key={ref.code} {...ref} />
                    ))}
                    {connected ? (
                        <div>{setupDialog("Change keys", false)}</div>
                    ) : null}
                </div>
            ) : null}

            {confirming ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setConfirming(false);
                    }}
                    title={`Disconnect ${entry.name}?`}
                    description={entry.consequence}
                    confirmLabel="Disconnect"
                    onConfirm={() => void disconnect()}
                />
            ) : null}
        </div>
    );
}

/** Domains: added, checked and removed under Sites; listed here by hostname. */
function DomainsRowView({ row }: { row: DomainsRow }) {
    const [open, setOpen] = useState(false);
    const detailsId = useId();
    const pill = PILL[row.state];
    const connected = row.state === "CONNECTED";

    return (
        <div className="px-4 py-[13px] min-[760px]:px-[18px]">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-[1_1_200px]">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-semibold">
                            {row.label}
                        </span>
                        <span
                            className={cn(
                                "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                                pill.tone,
                            )}
                        >
                            {pill.label}
                        </span>
                    </div>
                    <p className="mt-[3px] text-pretty text-[12px] leading-[1.45] text-muted-foreground">
                        {row.note}
                    </p>
                </div>

                <div className="flex flex-[0_1_auto] flex-wrap items-center gap-1.5 min-[760px]:ml-auto min-[760px]:justify-end">
                    {!connected ? (
                        <Button asChild size="sm">
                            <Link href={row.setup.href}>{row.setup.label}</Link>
                        </Button>
                    ) : null}
                    {row.refs.length > 0 ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2.5 text-foreground/80"
                            aria-expanded={open}
                            aria-controls={open ? detailsId : undefined}
                            onClick={() => setOpen((o) => !o)}
                        >
                            {open ? "Hide details" : "Details"}
                            <span className="sr-only"> for {row.label}</span>
                        </Button>
                    ) : null}
                </div>
            </div>

            {open ? (
                <div
                    id={detailsId}
                    className="mt-2.5 space-y-2 border-t border-dashed border-border pt-2.5"
                >
                    {row.refs.map((ref) => (
                        <RefLine key={ref.code} {...ref} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** "Public key  rzp_live_…  Copy" — a code the provider's own screens show. */
function RefLine({ label, code }: ProviderRef) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <code className="break-all rounded-md bg-muted px-[7px] py-0.5 font-mono text-[12px] text-foreground">
                {code}
            </code>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-[12px]"
                aria-label={`Copy ${label.toLowerCase()}`}
                onClick={() => {
                    navigator.clipboard.writeText(code).then(
                        () => showSuccess(`Copied ${code}`),
                        () => showError("Could not copy — select it instead."),
                    );
                }}
            >
                Copy
            </Button>
        </div>
    );
}
