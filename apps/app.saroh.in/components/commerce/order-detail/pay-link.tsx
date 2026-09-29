"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, Link2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ViewerDate } from "@/components/shared/viewer-date";
import { makeOrderPayLink } from "@/lib/orders/actions";

import { actionClass } from "./parts";

async function copy(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * An order's pay link (B11), as the invoice's: the address is shown once,
 * to whoever makes it — only its hash is kept — and "New pay link" replaces
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

    const make = () => {
        setConfirming(false);
        startTransition(async () => {
            const res = await makeOrderPayLink(orderId);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setUrl(res.data.url);
            showSuccess(
                (await copy(res.data.url))
                    ? `Pay link copied. Send it to ${first}.`
                    : `Pay link ready. Copy it from ${shownIn}.`,
                "Nothing is sent by Saroh — the order shows paid once they pay.",
            );
            router.refresh();
        });
    };

    /** Make one, or — with one already out — ask before replacing it. */
    const ask = () => {
        if (madeAt && !url) setConfirming(true);
        else if (!url) make();
        else
            void copy(url).then((ok) =>
                ok
                    ? showSuccess("Pay link copied.")
                    : showError("Couldn't copy. Select the link and copy it."),
            );
    };

    const dialog = (
        <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            icon={Link2}
            title="Make a new pay link?"
            description={`The link you sent before stops working straight away. Send ${first} the new one.`}
            confirmLabel="Make a new link"
            cancelLabel="Keep the old one"
            onConfirm={make}
        />
    );

    return { url, busy, ask, replace: () => setConfirming(true), dialog };
}

/**
 * The pay link's part of the Money panel, for an order still owed money:
 * "Make a pay link"; the address, once, to copy; then "Pay link made ‹when›"
 * with "New pay link". Without a provider that can take the payment, it says
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
            <p className="mt-2 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                Connect a payment provider to send a pay link.{" "}
                {canManage ? (
                    <Link
                        href="/settings/providers"
                        className="font-medium text-foreground underline underline-offset-4 hover:decoration-2 active:text-muted-foreground"
                    >
                        Connect one
                    </Link>
                ) : null}
            </p>
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
                        aria-label="Copy the pay link"
                    >
                        <Copy aria-hidden className="size-4" />
                    </Button>
                </div>
                <p className="mt-1.5 text-pretty text-[12px] leading-[1.5] text-muted-foreground">
                    Shown this once — copy it now. Saroh doesn&apos;t send it;
                    the order shows paid once they pay.
                </p>
            </div>
        );
    }
    if (madeAt) {
        return (
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
                    Pay link made <ViewerDate iso={madeAt} variant="moment" />
                </p>
                <Button
                    type="button"
                    variant="outline"
                    className={actionClass("ghost")}
                    disabled={link.busy}
                    onClick={link.replace}
                >
                    New pay link
                </Button>
            </div>
        );
    }
    return (
        <Button
            type="button"
            variant="outline"
            className={cn(actionClass("ghost"), "mt-2")}
            disabled={link.busy}
            onClick={link.ask}
        >
            {link.busy ? "Making a link…" : "Make a pay link"}
        </Button>
    );
}
