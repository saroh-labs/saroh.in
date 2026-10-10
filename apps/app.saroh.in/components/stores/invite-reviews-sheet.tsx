"use client";

import { showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { EmailNoteText } from "@/components/communications/email-note";
import { CheckRow } from "@/components/shared/check-row";
import { FormSheet } from "@/components/shared/form-sheet";
import { useHold } from "@/components/shared/use-hold";
import { ViewerDate } from "@/components/shared/viewer-date";
import { inviteReviews } from "@/lib/product-reviews/actions";
import type { ReviewEmailNote } from "@/lib/product-reviews/describe";
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
 * count. With no email provider of the business's own (D11) nothing can be
 * sent, so it leads with that and the way to fix it, and lists no orders.
 *
 * An invitation tells a customer, so the send waits ten seconds with Undo
 * (`useHold`): the sheet closes, keeping what is ticked, and a refusal, a
 * skipped order or an Undo opens it again.
 */
export function InviteReviewsSheet({
    open,
    onOpenChange,
    orders,
    emailNote,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orders: InvitableOrder[];
    /** Why invitations can't go; null when they can. */
    emailNote: ReviewEmailNote | null;
}) {
    const router = useRouter();
    const [picked, setPicked] = useState<Set<string>>(
        () => new Set(orders.slice(0, BATCH).map((o) => o.id)),
    );
    const [results, setResults] = useState<InviteResult[] | null>(null);
    const [tried, setTried] = useState(false);
    const { send: hold } = useHold();
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
        setTried(true);
        if (picked.size === 0) return;
        const ids = Array.from(picked);
        let sent = 0;
        // Closed with what is ticked kept, for a refusal or an Undo.
        onOpenChange(false);
        hold("review-invitations", {
            description:
                ids.length === 1
                    ? "1 customer is asked for a review."
                    : `${ids.length} customers are asked for a review.`,
            run: async () => {
                const res = await inviteReviews(ids);
                if (!res.ok) return res;
                sent = res.data.filter((r) => r.status === "queued").length;
                router.refresh();
                if (res.data.length - sent > 0) {
                    // What was skipped, and why, is listed in the sheet.
                    setResults(res.data);
                    onOpenChange(true);
                }
                if (sent === 0) {
                    showWarning("No invitations were sent.");
                    return { ok: false, error: "", said: true };
                }
                return { ok: true };
            },
            sent: () =>
                sent === 1
                    ? "Sent to 1 customer."
                    : `Sent to ${sent} customers.`,
            onBack: () => onOpenChange(true),
        });
    };

    const nameOf = (id: string) => {
        const o = orders.find((x) => x.id === id);
        return o
            ? `Order ${o.orderNumber} · ${o.customerName ?? o.customerEmail}`
            : id;
    };

    return (
        <FormSheet
            open={open}
            title="Invite reviews"
            description="Each customer gets one email with a link to review what they bought. The link works for 30 days."
            doneOnly={Boolean(results ?? emailNote)}
            saveLabel={
                picked.size === 1
                    ? "Send 1 invitation"
                    : `Send ${picked.size} invitations`
            }
            savingLabel="Sending…"
            fieldsClassName="block"
            footNote={
                tried && picked.size === 0 && !results && !emailNote ? (
                    <p
                        role="alert"
                        className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        Tick at least one order.
                    </p>
                ) : null
            }
            onClose={() => {
                setResults(null);
                setTried(false);
                onOpenChange(false);
            }}
            onSubmit={send}
        >
            {emailNote ? (
                <div>
                    <p className="text-[13px] leading-[1.5] text-muted-foreground">
                        <EmailNoteText note={emailNote} />
                    </p>
                </div>
            ) : results ? (
                <div className="space-y-3">
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
                <div>
                    {orders.length > BATCH ? (
                        <p className="mb-2 text-[12px] text-muted-foreground">
                            Showing the newest {BATCH} of {orders.length}. Send
                            these, and the rest will be here next time.
                        </p>
                    ) : null}
                    <ul className="divide-y divide-border rounded-lg border border-border">
                        {orders.slice(0, BATCH).map((o) => {
                            const on = picked.has(o.id);
                            return (
                                <li key={o.id}>
                                    <CheckRow
                                        checked={on}
                                        disabled={!on && full}
                                        onChange={(v) => toggle(o.id, v)}
                                        className="min-h-12 gap-3 px-3 py-2"
                                    >
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
                                                <ViewerDate iso={o.placedAt} />
                                            </span>
                                        </span>
                                    </CheckRow>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </FormSheet>
    );
}
