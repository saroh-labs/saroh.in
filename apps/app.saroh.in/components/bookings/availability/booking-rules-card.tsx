"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";
import { showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { Row, Section } from "@/components/sites/settings-rows";
import type { RuleKey } from "@/lib/services/availability-rules";
import {
    payWayBlocked,
    payWayOf,
    ruleBefore,
    ruleRows,
} from "@/lib/services/availability-rules";
import { updateBookingRules } from "@/lib/staff/actions";
import type { BookingRules, OnlineBlocker } from "@/lib/staff/types";

import { BookingRuleSheet } from "./booking-rule-sheet";

const cardTitle = "font-display text-[15px] font-semibold tracking-[-0.02em]";

/** The toast once a rule is saved: never "Hours saved" for a rule (UX-022). */
export const RULE_SAVED = "Booking rule saved. New bookings follow it now.";

const editId = (key: RuleKey) => `booking-rule-${key}`;

/**
 * Booking rules for the whole business (Availability), read first: how far
 * ahead and how late people can book, free cancellation, how they pay
 * (DEC-088) and the refund policy (E30), each a plain sentence in a row
 * with Edit. Edit opens that rule's sheet, which saves itself with a toast
 * and Undo, so a rule is never part of the page's draft or its unsaved bar.
 * Shown whether or not anyone is on the diary (UX-022).
 */
export function BookingRulesCard({
    rules,
    canEdit,
    onlineBlocker,
}: {
    /** The saved rules, or null when they couldn't be read. */
    rules: BookingRules | null;
    canEdit: boolean;
    onlineBlocker?: OnlineBlocker | null;
}) {
    const router = useRouter();
    // What the API last said, so a row reads a save at once; the page's
    // own read takes over when it arrives.
    const [shown, setShown] = useState(rules);
    const [seen, setSeen] = useState(rules);
    if (rules !== seen) {
        setSeen(rules);
        setShown(rules);
    }
    // One sheet at a time; `opened` makes each opening a fresh draft, and
    // the sheet is kept while it slides shut.
    const [editing, setEditing] = useState<{
        key: RuleKey;
        open: boolean;
        opened: number;
    } | null>(null);

    const head = (
        <div className="grid gap-0.5">
            <h2 id="booking-rules" className={cardTitle}>
                Booking rules
            </h2>
            <p className="text-[12.5px] text-muted-foreground">
                For the whole business. Each rule saves on its own.
            </p>
        </div>
    );

    if (!shown) {
        return (
            <section
                aria-labelledby="booking-rules"
                className="grid min-w-0 gap-2"
            >
                {head}
                <FailedRead
                    things="the booking rules"
                    reassurance="They are as you left them."
                />
            </section>
        );
    }

    const rows = ruleRows(shown, onlineBlocker);
    const way = payWayOf(shown);
    const blocked = payWayBlocked(way, onlineBlocker);
    const open = editing ? rows.find((r) => r.key === editing.key) : undefined;

    function saved(key: RuleKey, before: BookingRules, next: BookingRules) {
        setShown(next);
        router.refresh();
        showUndo(RULE_SAVED, async () => {
            const res = await updateBookingRules(ruleBefore(key, before));
            if (!res.ok) return res;
            setShown(res.data);
            router.refresh();
            return { ok: true };
        });
    }

    return (
        <section aria-labelledby="booking-rules" className="grid min-w-0 gap-2">
            {head}
            <Section>
                {rows.map((r) => (
                    <Row
                        key={r.key}
                        label={r.label}
                        action={
                            canEdit ? (
                                <Button
                                    id={editId(r.key)}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    aria-haspopup="dialog"
                                    aria-label={`Edit: ${r.title}`}
                                    onClick={() =>
                                        setEditing((e) => ({
                                            key: r.key,
                                            open: true,
                                            opened: (e?.opened ?? 0) + 1,
                                        }))
                                    }
                                >
                                    Edit
                                </Button>
                            ) : null
                        }
                    >
                        <span data-rule={r.key} className="block text-pretty">
                            {r.sentence}
                        </span>
                        {r.key === "bookingPayment" && blocked ? (
                            <span className="mt-0.5 block text-pretty text-[12.5px] text-muted-foreground">
                                {blocked}{" "}
                                <TextLink
                                    href={
                                        onlineBlocker === "PAYMENTS_OFF"
                                            ? "/settings/modules"
                                            : "/settings/providers"
                                    }
                                >
                                    {onlineBlocker === "PAYMENTS_OFF"
                                        ? "Turn on Payments"
                                        : "Connect a provider"}
                                </TextLink>
                            </span>
                        ) : null}
                    </Row>
                ))}
            </Section>
            {editing && open && canEdit ? (
                <BookingRuleSheet
                    key={editing.opened}
                    row={open}
                    open={editing.open}
                    returnTo={editId(editing.key)}
                    onClose={() =>
                        setEditing((e) => (e ? { ...e, open: false } : e))
                    }
                    onSaved={(next) => saved(editing.key, shown, next)}
                />
            ) : null}
        </section>
    );
}
