"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { inviteReviews } from "@/lib/product-reviews/actions";
import type {
    InvitableOrder,
    InviteResult,
} from "@/lib/product-reviews/service";

/** The API takes at most this many orders at a time. */
const BATCH = 50;

/**
 * "Invite reviews": paid, shipped orders from the last 90 days nobody has been
 * asked about — the newest 50 ticked, since that is what one send takes. What
 * was skipped, and why, is listed after sending rather than folded into a
 * count.
 */
export function InviteReviewsSheet({
    open,
    onOpenChange,
    orders,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orders: InvitableOrder[];
}) {
    const router = useRouter();
    const [picked, setPicked] = useState<Set<string>>(
        () => new Set(orders.slice(0, BATCH).map((o) => o.id)),
    );
    const [results, setResults] = useState<InviteResult[] | null>(null);
    const [pending, startTransition] = useTransition();
    const full = picked.size >= BATCH;

    const toggle = (id: string, on: boolean) => {
        setPicked((p) => {
            const next = new Set(p);
            if (on) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const send = () => {
        startTransition(async () => {
            const res = await inviteReviews(Array.from(picked));
            if (!res.ok) {
                showError(res.error);
                return;
            }
            const sent = res.data.filter((r) => r.status === "sent").length;
            const skipped = res.data.length - sent;
            if (sent > 0) {
                showSuccess(
                    sent === 1
                        ? "Review invitation sent"
                        : `${sent} review invitations sent`,
                );
            } else {
                showWarning("No invitations were sent");
            }
            if (skipped > 0) setResults(res.data);
            else onOpenChange(false);
            router.refresh();
        });
    };

    const nameOf = (id: string) => {
        const o = orders.find((x) => x.id === id);
        return o
            ? `Order ${o.orderNumber} · ${o.customerName ?? o.customerEmail}`
            : id;
    };

    return (
        <Sheet
            open={open}
            onOpenChange={(o) => {
                if (!o) setResults(null);
                onOpenChange(o);
            }}
        >
            <SheetContent className="flex w-full flex-col sm:max-w-md">
                <SheetHeader>
                    <SheetTitle>Invite reviews</SheetTitle>
                    <SheetDescription>
                        Each customer gets one email with a link to review what
                        they bought. The link works for 30 days.
                    </SheetDescription>
                </SheetHeader>

                {results ? (
                    <div className="mt-5 flex-1 space-y-3 overflow-y-auto">
                        <p className="text-[13px] font-medium">Not sent</p>
                        <ul className="space-y-2">
                            {results
                                .filter(
                                    (
                                        r,
                                    ): r is Extract<
                                        InviteResult,
                                        { status: "skipped" }
                                    > => r.status === "skipped",
                                )
                                .map((r) => (
                                    <li
                                        key={r.orderId}
                                        className="rounded-lg border border-border px-3 py-2"
                                    >
                                        <p className="text-[13px]">
                                            {nameOf(r.orderId)}
                                        </p>
                                        <p className="text-[12px] text-muted-foreground">
                                            {r.message}
                                        </p>
                                    </li>
                                ))}
                        </ul>
                    </div>
                ) : (
                    <div className="mt-5 flex-1 overflow-y-auto">
                        {orders.length > BATCH ? (
                            <p className="mb-2 text-[12px] text-muted-foreground">
                                Showing the newest {BATCH} of {orders.length}.
                                Send these, and the rest will be here next time.
                            </p>
                        ) : null}
                        <ul className="divide-y divide-border rounded-lg border border-border">
                            {orders.slice(0, BATCH).map((o) => {
                                const on = picked.has(o.id);
                                return (
                                    <li key={o.id}>
                                        <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2">
                                            <Checkbox
                                                checked={on}
                                                disabled={!on && full}
                                                onCheckedChange={(v) =>
                                                    toggle(o.id, v === true)
                                                }
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[13px] font-medium">
                                                    {o.customerName ??
                                                        o.customerEmail}
                                                </span>
                                                <span className="block truncate text-[11.5px] text-muted-foreground">
                                                    Order {o.orderNumber} ·{" "}
                                                    {o.itemCount === 1
                                                        ? "1 item"
                                                        : `${o.itemCount} items`}{" "}
                                                    ·{" "}
                                                    <ViewerDate
                                                        iso={o.placedAt}
                                                    />
                                                </span>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                <SheetFooter className="mt-4">
                    {results ? (
                        <Button onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    ) : (
                        <Button
                            onClick={send}
                            disabled={pending || picked.size === 0}
                        >
                            {pending
                                ? "Sending…"
                                : picked.size === 1
                                  ? "Send 1 invitation"
                                  : `Send ${picked.size} invitations`}
                        </Button>
                    )}
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}
