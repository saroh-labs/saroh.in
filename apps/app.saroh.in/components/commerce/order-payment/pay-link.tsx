"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
    refusedResult,
    reportFailure,
} from "@/components/billing/plan-refusal";
import { QrButton } from "@/components/qr/link-qr/qr-button";
import type { ConfirmResult } from "@/components/shared/confirm/confirm-dialog";
import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { BusinessDate } from "@/components/shared/dates/business-zone";
import { makeOrderPayLink } from "@/lib/orders/actions";
import { ProviderDisconnectedState } from "@saroh/ui/data-state";

import { runAction } from "@/lib/api/run-action";
import { copyFailedMessage, copyText } from "@saroh/ui/copy-button";

/**
 * An order's payment link (B11), as the invoice's: the address is shown once,
 * to whoever makes it — only its hash is kept — and "New payment link" replaces
 * it, after saying the old one stops working. Saroh sends nothing itself yet
 * (A14): the address is copied and sent by hand.
 */
export function usePayLink({
    orderId,
    first,
    madeAt,
    shownIn = "the Money panel",
}: {
    orderId: string;
    first: string;
    /** When the link out now was made; null when there is none. */
    madeAt: string | null;
    /**
     * Where the new address is on screen to copy by hand when the clipboard
     * refuses: the Money panel on Order Detail, a window on the Orders list
     * (B5).
     */
    shownIn?: string;
}) {
    const router = useRouter();
    const [url, setUrl] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [busy, startTransition] = useTransition();

    const made = async (address: string) => {
        setUrl(address);
        showSuccess(
            (await copyText(address))
                ? `Payment link copied. Send it to ${first}.`
                : `Payment link ready. Copy it from ${shownIn}.`,
            "Nothing is sent by Saroh. The order shows paid once they pay.",
        );
        router.refresh();
    };
    const make = () => {
        startTransition(async () => {
            const res = await runAction(() => makeOrderPayLink(orderId));
            if (!res) return;
            if (!res.ok) {
                reportFailure(res);
                return;
            }
            await made(res.data.url);
        });
    };
    /** From the confirm, which waits and stays open on a refusal. */
    const replaceNow = async (): Promise<ConfirmResult> => {
        const res = await makeOrderPayLink(orderId);
        if (!res.ok) return refusedResult(res);
        await made(res.data.url);
    };

    /** Make one, or — with one already out — ask before replacing it. */
    const ask = () => {
        if (madeAt && !url) setConfirming(true);
        else if (!url) make();
        else
            void copyText(url).then((ok) =>
                ok
                    ? showSuccess("Payment link copied.")
                    : showError(copyFailedMessage()),
            );
    };

    const dialog = (
        <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            icon={Link2}
            tone="neutral"
            title="Make a new payment link?"
            description={`The link you sent before stops working straight away. Send ${first} the new one. This cannot be undone.`}
            confirmLabel="Make a new link"
            keepLabel="Keep the old link"
            onConfirm={replaceNow}
        />
    );

    return { url, busy, ask, replace: () => setConfirming(true), dialog };
}

/**
 * The payment link's part of the Money panel, for an order still owed money:
 * "Make a payment link"; the address, once, to copy; then "Payment link made ‹when›"
 * with "New payment link". Without a provider that can take the payment, it says
 * to connect one.
 */
export function PayLinkBlock({
    link,
    madeAt,
    ready,
    canManage,
}: {
    link: ReturnType<typeof usePayLink>;
    madeAt: string | null;
    /** A provider can open the checkout window (DEC-054). */
    ready: boolean;
    /** May connect a provider (Settings). */
    canManage: boolean;
}) {
    if (!ready) {
        return (
            <ProviderDisconnectedState
                size="inline"
                provider="payment"
                canConnect={canManage}
                className="mt-2"
            />
        );
    }
    if (link.url) {
        return (
            <div className="mt-2">
                <div className="flex min-w-0 items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                        {link.url}
                    </code>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={link.ask}
                        aria-label="Copy the payment link"
                    >
                        <Copy aria-hidden className="size-4" />
                    </Button>
                    <QrButton
                        compact="always"
                        link={{
                            mode: "instant",
                            url: link.url,
                            what: "this order's payment link",
                            opens: "pay",
                            fileName: "pay-link-qr",
                        }}
                    />
                </div>
                <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                    Shown this once, so copy it now. Saroh doesn&apos;t send it.
                    The order shows paid once they pay.
                </p>
            </div>
        );
    }
    if (madeAt) {
        return (
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
                    Payment link made{" "}
                    <BusinessDate iso={madeAt} variant="moment" />
                </p>
                <Button
                    type="button"
                    variant="outline"
                    disabled={link.busy}
                    onClick={link.replace}
                >
                    New payment link
                </Button>
            </div>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            className="mt-2"
            onClick={link.ask}
            busy={link.busy}
            busyLabel="Making…"
        >
            Make a payment link
        </Button>
    );
}
