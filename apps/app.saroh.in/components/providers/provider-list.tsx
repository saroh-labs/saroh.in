"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
    disconnectCommsProvider,
    disconnectPaymentProvider,
} from "@/lib/providers/actions";
import type {
    ProviderConnection,
    ProviderRow,
    ProviderRowState,
} from "@/lib/providers/rows";
import type {
    ConnectedCommsProvider,
    ConnectedPaymentProvider,
} from "@/lib/providers/service";

import { ProviderSetupDialog } from "./provider-setup-dialog";

/**
 * What each state is called, and its pill. Connected is the one green; a
 * domain that needs a person is the accent; disconnected and never set up
 * are quiet — nothing is broken about a provider nobody has connected, and
 * telling a merchant on day one that something needs fixing is the product
 * accusing itself.
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

/**
 * Settings → Providers ("Saroh Settings" design): one bordered list, a row
 * per service, its state on the right where the eye can run down it, and
 * Details to see what it is called at the provider's end.
 *
 * Never renders a credential — the rows carry only what the API sends as
 * public (see `lib/providers/rows.ts`).
 */
export function ProviderList({
    rows,
    payments,
    messaging,
}: {
    rows: ProviderRow[];
    /** What is connected, for the setup dialogs. */
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
}) {
    return (
        <div className="max-w-[720px]">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                {rows.map((row, i) => (
                    <ProviderRowView
                        key={row.key}
                        row={row}
                        first={i === 0}
                        payments={payments}
                        messaging={messaging}
                    />
                ))}
            </div>
            <p className="mt-2.5 text-pretty text-[11.5px] leading-normal text-muted-foreground">
                Providers are per business. A storefront can point its checkout
                at a different payment provider, and that choice lives under
                Sell rather than here.
            </p>
        </div>
    );
}

function ProviderRowView({
    row,
    first,
    payments,
    messaging,
}: {
    row: ProviderRow;
    first: boolean;
    payments: ConnectedPaymentProvider[];
    messaging: ConnectedCommsProvider[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [confirming, setConfirming] = useState<ProviderConnection | null>(
        null,
    );
    const detailsId = useId();
    const pill = PILL[row.state];
    const connected = row.state === "CONNECTED";
    const several = row.connections.length > 1;
    // Details has something to show: a reference, or the way to change keys.
    const hasDetails =
        row.refs.length > 0 || (connected && row.setup.kind !== "link");

    const setupDialog = (trigger: string, urgent: boolean) =>
        row.setup.kind === "payments" ? (
            <ProviderSetupDialog
                kind="payments"
                label={row.label}
                trigger={trigger}
                urgent={urgent}
                connected={payments}
            />
        ) : row.setup.kind === "messaging" ? (
            <ProviderSetupDialog
                kind="messaging"
                label={row.label}
                trigger={trigger}
                urgent={urgent}
                channel={row.setup.channel}
                connected={messaging}
            />
        ) : null;

    async function disconnect(c: ProviderConnection) {
        const res =
            c.target.kind === "payments"
                ? await disconnectPaymentProvider(c.target.provider)
                : await disconnectCommsProvider(c.target.channel);
        if (!res.ok) return showError(res.error);
        showSuccess(`${c.name} disconnected`);
        router.refresh();
    }

    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-3 px-[18px] py-[13px]",
                !first && "border-t border-border/70",
            )}
        >
            <div className="min-w-0 flex-[1_1_260px]">
                <div className="text-[13.5px] font-medium">{row.label}</div>
                <p className="mt-[3px] text-pretty text-[11.5px] leading-[1.45] text-muted-foreground">
                    {row.note}
                </p>
                {open ? (
                    <div id={detailsId} className="mt-2 space-y-2">
                        {row.refs.map((ref) => (
                            <RefLine key={ref.code} {...ref} />
                        ))}
                        {connected && row.setup.kind !== "link" ? (
                            <div>{setupDialog("Change keys", false)}</div>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {row.usedBy ? (
                <p className="order-last -mt-1 flex-[1_1_100%] text-[12px] text-muted-foreground">
                    {row.usedBy}
                </p>
            ) : null}

            {row.connections.map((c) =>
                c.manageHref ? (
                    <Button
                        key={`m-${c.name}`}
                        asChild
                        variant="outline"
                        size="sm"
                    >
                        <a
                            href={c.manageHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Manage ${c.name} (opens in a new tab)`}
                        >
                            {several ? `Manage ${c.name}` : "Manage"}
                        </a>
                    </Button>
                ) : null,
            )}
            {row.connections.map((c) => (
                <Button
                    key={`d-${c.name}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                    aria-label={`Disconnect ${c.name}`}
                    onClick={() => setConfirming(c)}
                >
                    {several ? `Disconnect ${c.name}` : "Disconnect"}
                </Button>
            ))}
            {!connected && row.setup.kind !== "link"
                ? setupDialog("Connect", true)
                : null}
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
                    <span className="sr-only"> for {row.label}</span>
                </Button>
            ) : null}
            <span
                className={cn(
                    "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                    pill.tone,
                )}
            >
                {pill.label}
            </span>
            {row.setup.kind === "link" && !connected ? (
                <Button asChild variant="outline" size="sm">
                    <Link href={row.setup.href}>{row.setup.label}</Link>
                </Button>
            ) : null}

            {confirming ? (
                <ConfirmDialog
                    open
                    onOpenChange={(o) => {
                        if (!o) setConfirming(null);
                    }}
                    title={`Disconnect ${confirming.name}?`}
                    description={row.consequence}
                    confirmLabel="Disconnect"
                    onConfirm={() => void disconnect(confirming)}
                />
            ) : null}
        </div>
    );
}

/** "Public key  rzp_live_…  Copy" — a code the provider's own screens show. */
function RefLine({ label, code }: { label: string; code: string }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-muted-foreground">{label}</span>
            <code className="rounded-md bg-muted px-[7px] py-0.5 font-mono text-[12px] text-foreground">
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
