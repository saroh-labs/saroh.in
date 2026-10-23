"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { showError, showUndo } from "@saroh/ui/toast";
import { ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ROW as CHOICE_ROW } from "@/components/bookings/availability/whose-hours";

import { SwitchRow } from "@/components/shared/fields/check-row";
import { RadioCards } from "@/components/shared/fields/choice-group";
import { FailedRead } from "@/components/shared/states/failed-read";
import { runAction } from "@/lib/api/run-action";
import type { RuleKey, RuleRow } from "@/lib/services/availability-rules";
import {
    payWayBlocked,
    payWayOf,
    ruleBefore,
    rulePatch,
    ruleRows,
} from "@/lib/services/availability-rules";
import { updateBookingRules } from "@/lib/staff/actions";
import type { PersonRuleKey, PersonRuleRow } from "@/lib/staff/person-rules";
import type { BookingRules, OnlineBlocker } from "@/lib/staff/types";

const NONE = "none";

const lowerFirst = (words: string) =>
    words.charAt(0).toLowerCase() + words.slice(1);

/** The toast once a rule is saved: "Cancelling: 2 hours before. Saved." */
export function ruleSaved(row: RuleRow, value: string): string {
    const label = row.options.find((o) => o.value === value)?.label ?? "";
    return `${row.label}: ${lowerFirst(label)}. Saved.`;
}

/**
 * The business's booking rules as Hours and time off keeps them (U17): what
 * the API last said, so a row reads a pick at once, and `pick`, which saves
 * one rule as soon as it is chosen, with a toast and Undo. A refused pick
 * says nothing has changed and the rule stays as it was.
 */
export function useBookingRules(rules: BookingRules | null) {
    const router = useRouter();
    const [shown, setShown] = useState(rules);
    const [seen, setSeen] = useState(rules);
    if (rules !== seen) {
        setSeen(rules);
        setShown(rules);
    }

    /**
     * Save `patch` at once, with a toast saying `done` and Undo sending
     * `back`; a refusal says `failed` and leaves the rules as they were.
     */
    async function change(
        patch: Partial<BookingRules>,
        back: Partial<BookingRules>,
        done: string,
        failed: string,
    ): Promise<boolean> {
        const res = await runAction(() => updateBookingRules(patch));
        if (!res) return false;
        if (!res.ok) {
            showError(failed, res.error);
            return false;
        }
        setShown(res.data);
        router.refresh();
        showUndo(done, async () => {
            const undone = await updateBookingRules(back);
            if (!undone.ok) return undone;
            setShown(undone.data);
            router.refresh();
            return { ok: true };
        });
        return true;
    }

    async function pick(row: RuleRow, value: string): Promise<boolean> {
        if (!shown || value === row.value) return true;
        return change(
            rulePatch(row.key, value),
            ruleBefore(row.key, shown),
            ruleSaved(row, value),
            "Couldn't save that rule. Nothing has changed.",
        );
    }

    /** "Members' rule changes need approval" (#1038), on or off. */
    async function needApproval(on: boolean): Promise<boolean> {
        if (!shown) return false;
        return change(
            { memberRuleChangesNeedApproval: on },
            { memberRuleChangesNeedApproval: !on },
            on
                ? "Members' rule changes now need approval. Saved."
                : "Members' rule changes now apply at once. Saved.",
            "Couldn't change that setting. Nothing has changed.",
        );
    }

    return { shown, pick, needApproval };
}

const ROW =
    "flex min-h-[60px] w-full items-center gap-3 border-b border-border bg-card py-2 pl-3.5 pr-3 text-left text-foreground last:border-b-0";

/**
 * Booking rules for the whole business (U17, BKMAvailability "booking
 * rules"): how far ahead and how late people can book, the gap between
 * bookings, cancelling, how they pay (DEC-088) and refunds (E30), each a
 * sentence under its few words. A row opens its choices, and each saves
 * as soon as it is picked. Without the right to change them they only
 * read, and say who can.
 */
export function RulesList({
    rules,
    canEdit,
    onlineBlocker,
    ownName = null,
    onOpen,
}: {
    /** The saved rules, or null when they couldn't be read. */
    rules: BookingRules | null;
    canEdit: boolean;
    onlineBlocker?: OnlineBlocker | null;
    /** A Member's own first name, when they take bookings: where theirs are. */
    ownName?: string | null;
    onOpen: (key: RuleKey) => void;
}) {
    if (!rules) {
        return (
            <FailedRead
                things="the booking rules"
                reassurance="They are as you left them."
            />
        );
    }
    const rows = ruleRows(rules, onlineBlocker);
    const blocked = payWayBlocked(payWayOf(rules), onlineBlocker);
    return (
        <>
            <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
                {rows.map((r) => {
                    const body = (
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] text-muted-foreground">
                                {r.label}
                            </span>
                            <span
                                data-rule={r.key}
                                className="block text-pretty text-[14.5px] font-medium"
                            >
                                {r.sentence}
                            </span>
                        </span>
                    );
                    return (
                        <li
                            key={r.key}
                            className="border-b border-border last:border-b-0"
                        >
                            {canEdit ? (
                                <button
                                    type="button"
                                    aria-label={`${r.label}: ${r.sentence}. Change`}
                                    onClick={() => onOpen(r.key)}
                                    className={cn(
                                        ROW,
                                        "cursor-pointer border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                    )}
                                >
                                    {body}
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                </button>
                            ) : (
                                <div className={cn(ROW, "border-b-0")}>
                                    {body}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {blocked ? (
                <p className="mt-2.5 text-pretty text-[12.5px] text-muted-foreground">
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
                </p>
            ) : null}
            {canEdit ? null : (
                <p className="mt-2.5 text-pretty text-[12.5px] text-muted-foreground">
                    Only owners and admins change the business&apos;s rules.
                    {ownName ? (
                        <>
                            {" "}
                            Your own rules are under{" "}
                            <span data-ph-mask="">
                                Booking rules for {ownName}
                            </span>
                            .
                        </>
                    ) : null}
                </p>
            )}
        </>
    );
}

/**
 * One rule's choices (BKMAvailability "a rule"): one to a row with its
 * help under it, the saved one marked. A pick saves at once and goes back
 * to the list.
 */
export function RuleChoices({
    row,
    onPick,
}: {
    row: RuleRow;
    onPick: (value: string) => void;
}) {
    return (
        <div className="grid gap-2">
            <RadioCards
                label={row.title}
                // "No limit" is the empty value, which a radio group reads
                // as nothing chosen: it travels as NONE here.
                value={row.value || NONE}
                onChange={(v) => onPick(v === NONE ? "" : v)}
                rowClassName={CHOICE_ROW}
                options={row.options.map((o) => ({
                    value: o.value || NONE,
                    label: (
                        <span className="text-[14.5px] font-semibold">
                            {o.label}
                        </span>
                    ),
                    note: o.note,
                }))}
            />
            {row.hint ? (
                <p className="text-pretty text-[12.5px] leading-normal text-muted-foreground">
                    {row.hint}
                </p>
            ) : null}
        </div>
    );
}

/**
 * One person's own booking rules (U20, BKMHoursRules, BKDHoursRules): the
 * four timing rules, each its few words over the rule their diary keeps,
 * with whose it is on the right ("Just for Meera", "Same as the
 * business"). A row opens its choices for whoever may change them; for
 * anyone else the rows only read.
 */
export function PersonRulesList({
    rows,
    name,
    canChange,
    onOpen,
}: {
    rows: PersonRuleRow[];
    /** Their first name. */
    name: string;
    canChange: boolean;
    onOpen: (key: PersonRuleKey) => void;
}) {
    return (
        <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
            {rows.map((r) => {
                const body = (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] text-muted-foreground">
                                {r.label}
                            </span>
                            <span
                                data-person-rule={r.key}
                                className="block text-pretty text-[14.5px] font-medium"
                            >
                                {r.sentence}
                            </span>
                        </span>
                        <Badge
                            size="sm"
                            variant={r.own ? "warning" : "neutral"}
                            data-ph-mask=""
                        >
                            {r.own
                                ? `Just for ${name}`
                                : "Same as the business"}
                        </Badge>
                    </>
                );
                return (
                    <li
                        key={r.key}
                        className="border-b border-border last:border-b-0"
                    >
                        {canChange ? (
                            <button
                                type="button"
                                aria-haspopup="dialog"
                                aria-label={`${r.label}: ${r.sentence}. Change`}
                                onClick={() => onOpen(r.key)}
                                className={cn(
                                    ROW,
                                    "cursor-pointer border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                )}
                            >
                                {body}
                            </button>
                        ) : (
                            <div className={cn(ROW, "border-b-0")}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * "Members' rule changes need approval" (U20, BKMHoursApproval,
 * BKDHoursApproval): the business's switch, under its booking rules, for
 * owners and admins only. It saves as it is flipped, with Undo.
 */
export function ApprovalSwitch({
    on,
    onChange,
}: {
    on: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <>
            <div className="mt-3 rounded-[12px] border border-border bg-card px-3.5 py-2">
                <SwitchRow
                    checked={on}
                    onChange={onChange}
                    size="default"
                    className="min-h-12 justify-between"
                >
                    <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] font-semibold">
                            Members&apos; rule changes need approval
                        </span>
                        <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                            {on
                                ? "On: a Member's change to their own rules waits until an owner or admin approves it."
                                : "Off: a Member's change to their own rules applies at once, with Undo."}
                        </span>
                    </span>
                </SwitchRow>
            </div>
            <p className="mt-2.5 text-pretty text-[12.5px] leading-normal text-muted-foreground">
                On for every new business. Each person can also have their own
                rules for notice, booking ahead, gaps and cancelling. Find them
                on Hours and time off, under the person.
            </p>
        </>
    );
}
