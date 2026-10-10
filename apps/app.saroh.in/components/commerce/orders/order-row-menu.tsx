"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@saroh/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { showError, showSuccess } from "@saroh/ui/toast";
import {
    ArrowUpRight,
    Ban,
    Check,
    Link2,
    MoreHorizontal,
    Printer,
    Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { usePayLink } from "@/components/commerce/order-detail/pay-link";
import { QrButton } from "@/components/qr/qr-button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cancelOrder } from "@/lib/orders/actions";
import type { OrderRow } from "@/lib/orders/business-service";
import type { OrderAbilities, RowMenuItem } from "@/lib/orders/row-menu";
import { orderPageHref, payLinkAction, rowMenu } from "@/lib/orders/row-menu";

import { useOrderStep } from "./use-order-step";

/** Pointer, hover, focus and pressed on every item (the standing rule). */
const ITEM =
    "cursor-pointer items-start active:bg-secondary-hover data-[disabled]:cursor-default";

const firstName = (row: OrderRow) =>
    (row.customer?.name ?? row.walkIn?.name ?? "").trim().split(/\s+/)[0] ||
    "the customer";

/**
 * A row's "More actions" menu on the Orders list (plan B, B5), after the
 * design's row menu: the next step, Print ticket, the pay link (B11), Open
 * full page, and — apart — Refund, or Cancel for an order nothing was paid
 * on. What the caller can't use isn't drawn; what the order doesn't allow is
 * drawn off, with the reason under it (`row-menu.ts`).
 *
 * Steps that ask for more (a hand-over's courier) and refunds (lines, a
 * reason and the ten-second hold) open Order Detail with that panel up, so
 * there is one place each is done. A new pay link is shown once, here, and
 * replacing one says the old one stops working first.
 */
export function OrderRowMenu({
    row,
    can,
}: {
    row: OrderRow;
    can: OrderAbilities;
}) {
    const router = useRouter();
    const items = rowMenu(row, can);
    const step = useOrderStep();
    const ref = `#${row.orderId}`;
    const payLink = usePayLink({
        orderId: row.id,
        first: firstName(row),
        madeAt: row.payLinkCreatedAt ?? null,
        shownIn: "the window that opened",
    });
    // The address is shown once: after it is closed it is gone.
    const [seen, setSeen] = useState<string | null>(null);
    const [cancelling, setCancelling] = useState(false);
    const [busy, startTransition] = useTransition();

    const cancel = () =>
        startTransition(async () => {
            // The one cancel (B9): nothing was paid, so nothing goes back;
            // a treatment's visits are cancelled with it.
            const res = await cancelOrder(row.id, {
                reason: null,
                idempotencyKey: crypto.randomUUID(),
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            showSuccess(`${ref} cancelled — its stock is back on the shelves.`);
            router.refresh();
        });

    const top = items.filter((i) => i.kind !== "refund" && i.kind !== "cancel");
    const apart = items.filter(
        (i) => i.kind === "refund" || i.kind === "cancel",
    );

    const draw = (item: RowMenuItem) => {
        switch (item.kind) {
            case "next":
                return item.step?.via === "page" && !item.disabled ? (
                    <DropdownMenuItem key="next" asChild className={ITEM}>
                        <Link
                            href={orderPageHref(
                                row.store.id,
                                row.id,
                                "courier",
                            )}
                        >
                            <Check aria-hidden />
                            {item.label}…
                        </Link>
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem
                        key="next"
                        className={ITEM}
                        disabled={item.disabled !== null || step.busy}
                        onSelect={() => {
                            if (item.step)
                                step.take({
                                    id: row.id,
                                    orderId: row.orderId,
                                    stage: row.stage,
                                    to: item.step.to,
                                });
                        }}
                    >
                        <Check aria-hidden />
                        <Label text={item.label} reason={item.disabled} />
                    </DropdownMenuItem>
                );
            case "print":
                return (
                    <DropdownMenuItem key="print" asChild className={ITEM}>
                        <Link href={item.href}>
                            <Printer aria-hidden />
                            {item.label}
                        </Link>
                    </DropdownMenuItem>
                );
            case "pay-link":
                return (
                    <DropdownMenuItem
                        key="pay-link"
                        className={ITEM}
                        disabled={item.disabled !== null || payLink.busy}
                        onSelect={
                            payLinkAction(item) === "replace"
                                ? payLink.replace
                                : payLink.ask
                        }
                    >
                        <Link2 aria-hidden />
                        <Label text={item.label} reason={item.disabled} />
                    </DropdownMenuItem>
                );
            case "open":
                return (
                    <DropdownMenuItem key="open" asChild className={ITEM}>
                        <Link href={item.href}>
                            <ArrowUpRight aria-hidden />
                            {item.label}
                        </Link>
                    </DropdownMenuItem>
                );
            case "refund":
                return item.disabled ? (
                    <DropdownMenuItem key="refund" className={ITEM} disabled>
                        <Undo2 aria-hidden />
                        <Label text={item.label} reason={item.disabled} />
                    </DropdownMenuItem>
                ) : (
                    <DropdownMenuItem
                        key="refund"
                        asChild
                        variant="destructive"
                        className={ITEM}
                    >
                        <Link href={item.href}>
                            <Undo2 aria-hidden />
                            {item.label}
                        </Link>
                    </DropdownMenuItem>
                );
            case "cancel":
                return (
                    <DropdownMenuItem
                        key="cancel"
                        variant="destructive"
                        className={ITEM}
                        disabled={item.disabled !== null || busy}
                        onSelect={() => setCancelling(true)}
                    >
                        <Ban aria-hidden />
                        <Label text={item.label} reason={item.disabled} />
                    </DropdownMenuItem>
                );
        }
    };

    const shown = payLink.url !== null && payLink.url !== seen;

    return (
        <>
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`More actions for order ${ref}`}
                        className="relative z-[1] size-7 rounded-[7px] text-muted-foreground hover:bg-muted active:bg-secondary-hover data-[state=open]:bg-muted coarse:size-11"
                    >
                        <MoreHorizontal aria-hidden className="size-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[208px] p-1.5">
                    {top.map(draw)}
                    {apart.length > 0 ? (
                        <>
                            <DropdownMenuSeparator className="-mx-1.5 my-2" />
                            {apart.map(draw)}
                        </>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>

            {payLink.dialog}
            <ConfirmDialog
                open={cancelling}
                onOpenChange={setCancelling}
                icon={Ban}
                title={`Cancel order ${ref}?`}
                description="Nothing was paid on it. Its reserved stock goes back on the shelves, and a cancelled order stays in the list. It can't be reopened."
                confirmLabel="Cancel order"
                cancelLabel="Keep it"
                onConfirm={() => {
                    setCancelling(false);
                    cancel();
                }}
            />
            <Dialog
                open={shown}
                onOpenChange={(open) => {
                    if (!open) setSeen(payLink.url);
                }}
            >
                <DialogContent className="max-w-[420px]">
                    <DialogHeader>
                        <DialogTitle>Pay link for {ref}</DialogTitle>
                        <DialogDescription>
                            Shown this once — copy it now and send it to{" "}
                            {firstName(row)}. Saroh doesn&apos;t send it. Any
                            link made before this one has stopped working.
                        </DialogDescription>
                    </DialogHeader>
                    <code className="block break-all rounded-[7px] bg-muted px-[9px] py-[7px] font-mono text-[12px]">
                        {payLink.url}
                    </code>
                    <DialogFooter className="gap-2">
                        {payLink.url ? (
                            <QrButton
                                className="h-[38px] coarse:h-11 sm:mr-auto"
                                link={{
                                    mode: "instant",
                                    url: payLink.url,
                                    what: "this order's pay link",
                                    opens: "pay",
                                    fileName: "pay-link-qr",
                                }}
                            />
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSeen(payLink.url)}
                        >
                            Done
                        </Button>
                        <Button type="button" onClick={payLink.ask}>
                            Copy link
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/** An item's words, with why it's off under them (never only on hover). */
function Label({ text, reason }: { text: string; reason: string | null }) {
    return (
        <span className="min-w-0">
            <span className="block">{text}</span>
            {reason ? (
                <span className="block text-[11.5px] text-muted-foreground">
                    {reason}
                </span>
            ) : null}
        </span>
    );
}
