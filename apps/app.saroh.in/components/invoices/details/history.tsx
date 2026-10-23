"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import type { HistoryTone } from "@/lib/invoices/details-view";
import { historyLines, nextStep } from "@/lib/invoices/details-view";
import type { Invoice, InvoicePayment } from "@/lib/invoices/service";
import { billedTo } from "@/lib/invoices/status";
import { BOUNCED, REMOVE_THIS_PAYMENT } from "@/lib/invoices/words";
import { SidePanel } from "./connected-panel";

const DOT: Record<HistoryTone | "next", string> = {
    ok: "bg-success",
    bad: "bg-destructive",
    waiting: "bg-warning",
    plain: "bg-border-strong",
    next: "bg-primary",
};

/**
 * "What happened" (DEC-173, U9 #1121): today's history panel with the
 * ledger's lines in it — each payment, a cheque cleared or bounced, a
 * payment removed (struck through, with why), each share by hand — newest
 * first. A payment that still counts and was recorded by hand has "Remove
 * this payment" beside it, for whoever may write, and a cheque already in
 * the bank has "Bounced": banks return cheques days later (#7).
 */
export function DetailsHistory({
    invoice,
    canWrite,
    timeZone,
    onRemove,
    onBounce,
}: {
    invoice: Invoice;
    canWrite: boolean;
    timeZone?: string;
    onRemove: (payment: InvoicePayment) => void;
    /** A cheque in the bank came back: the Bounced dialog opens on it. */
    onBounce?: (payment: InvoicePayment) => void;
}) {
    const lines = historyLines(invoice);
    const next = nextStep(invoice, billedTo(invoice).name, canWrite);
    if (lines.length === 0 && !next) return null;
    return (
        <SidePanel label="What happened">
            <ol className="grid gap-0.5">
                {next ? (
                    <Item tone="next" what={next.what}>
                        <p className="text-[12px] text-muted-foreground">
                            {next.sub}
                        </p>
                    </Item>
                ) : null}
                {lines.map((l) => (
                    <Item
                        key={l.key}
                        tone={l.tone}
                        what={l.what}
                        struck={l.struck}
                    >
                        {l.when ? (
                            <p className="text-[12px] text-muted-foreground">
                                <ViewerDate
                                    iso={l.when}
                                    variant="datetime"
                                    timeZone={timeZone}
                                />
                            </p>
                        ) : null}
                        {l.removable && canWrite ? (
                            <Button
                                type="button"
                                variant="link"
                                size="xs"
                                className="h-auto px-0 text-[12px] text-destructive-subtle-foreground"
                                onClick={() =>
                                    l.removable && onRemove(l.removable)
                                }
                            >
                                {REMOVE_THIS_PAYMENT}
                            </Button>
                        ) : null}
                        {l.bounceable && canWrite && onBounce ? (
                            <Button
                                type="button"
                                variant="link"
                                size="xs"
                                className="ml-3 h-auto px-0 text-[12px] text-destructive-subtle-foreground"
                                onClick={() =>
                                    l.bounceable && onBounce(l.bounceable)
                                }
                            >
                                {BOUNCED}
                            </Button>
                        ) : null}
                    </Item>
                ))}
            </ol>
        </SidePanel>
    );
}

function Item({
    tone,
    what,
    struck,
    children,
}: {
    tone: HistoryTone | "next";
    what: string;
    struck?: boolean;
    children?: React.ReactNode;
}) {
    return (
        <li className="flex gap-2.5 py-[5px]" data-history-line>
            <span
                aria-hidden
                className={cn(
                    "mt-[7px] size-2 shrink-0 rounded-full",
                    DOT[tone],
                )}
            />
            <div className="min-w-0">
                <p
                    className={cn(
                        "text-[13px] font-semibold",
                        struck && "text-muted-foreground line-through",
                    )}
                >
                    {struck ? (
                        <span className="sr-only">No longer counts: </span>
                    ) : null}
                    {what}
                </p>
                {children}
            </div>
        </li>
    );
}
