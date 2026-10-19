"use client";

import { Button } from "@saroh/ui/button";
import { chipClass } from "@saroh/ui/chip";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import { TextLink } from "@saroh/ui/text-link";
import {
    ArrowRightLeft,
    CalendarDays,
    CalendarPlus,
    CircleCheck,
    IndianRupee,
    Layers,
    Mail,
    Phone,
    Plus,
} from "lucide-react";
import type { ReactNode } from "react";

import { FailedRead } from "@/components/shared/failed-read";
import { personHref } from "@/lib/contacts/person-href";
import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import { bookingChangeText } from "@/lib/messages/notice-reach";
import { firstName } from "@/lib/names";
import type {
    DiaryBooking,
    TreatmentView,
} from "@/lib/services/booking-calendar";
import { canCheckIn, canMarkNoShow } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import type { DiaryState } from "@/lib/services/diary";
import { paidText, whoFor } from "@/lib/services/diary";
import type { PeekPerson } from "@/lib/services/peek";
import { attentionText, phoneText } from "@/lib/services/peek";
import {
    orderHref,
    orderLabel,
    visitLabel,
    visitsDoneText,
} from "@/lib/services/treatment";

import type { MoreRow } from "./quick-look-more";
import { QuickLookMore } from "./quick-look-more";
import { canBookNext } from "./quick-look-next-visit";
import { Fact, Help, QL_BTN, StepBody, StepFoot } from "./quick-look-parts";
import type {
    MoreAction,
    NextDayChoice,
    QuickLookFacts,
    QuickLookStep,
} from "./quick-look-state";
import { moreItems, primaryAction } from "./quick-look-state";
import type { QuickLookActions, QuickLookContext } from "./quick-look-types";

/** The person's read for the quick look: their phone and Needs attention. */
export type PersonRead =
    | { state: "none" }
    | { state: "loading" }
    | { state: "failed"; retry: () => void }
    | { state: "ready"; person: PeekPerson | null };

/** Said to someone who can book but not take payments (DEC-170, Q13). */
export const FRONT_DESK_LINE =
    "You're at the front desk: you can mark arrivals, move and cancel. Taking payments stays with owners and admins.";

/** Said to a role that sees the calendar only. */
export const CALENDAR_ONLY_LINE =
    "Your role sees the calendar only, so you can't change bookings. An owner can change this in Settings › Team.";

/** "Pays at the visit · ₹500", how it was paid, or its treatment's order. */
export function paidWords(
    b: DiaryBooking,
    ctx: QuickLookContext,
    state: DiaryState,
): string {
    const price = ctx.money
        ? formatMoney(b.service.priceCents ?? null, b.service.currency ?? null)
        : null;
    if (b.paidAtDesk) return paidText(b);
    if (b.paidWith === "PAID")
        return price ? `${price} paid online` : "Paid online";
    if (b.paidWith === "DESK") {
        if (state === "in" && b.take) {
            const due = formatMoney(b.take.cents, b.service.currency ?? null);
            return `${BOOKING_WORDS.paysAtVisit} · ${due} to take now`;
        }
        return price
            ? `${BOOKING_WORDS.paysAtVisit} · ${price}`
            : BOOKING_WORDS.paysAtVisit;
    }
    return paidText(b);
}

/** The rules the sheet runs on, for this booking and this viewer. */
export function oneFacts(
    b: DiaryBooking,
    state: DiaryState,
    ctx: QuickLookContext,
    held: boolean,
): QuickLookFacts {
    return {
        state,
        canBook: ctx.canBook,
        canArrive: canCheckIn(b, ctx.now),
        canNoShow: canMarkNoShow(b, ctx.now),
        canTakeNow: Boolean(
            ctx.desk?.canTake && b.take && state !== "cancelled",
        ),
        canNext: ctx.canBook && canBookNext(b),
        held,
        hasPerson: b.contact !== null,
    };
}

const MORE_ICON: Record<MoreAction, MoreRow["icon"]> = {
    take: "take",
    noshow: "noshow",
    came: "came",
    undo: "undo",
    person: "person",
    full: "full",
    next: "next",
    move: "move",
    cancel: "cancel",
};

/**
 * A one-to-one booking at a glance (BKMQuickLook, BKDQuickLook): how it
 * is paid, their phone and email, Needs attention, one main action, Move
 * or cancel, and More. After they came, "Book their next visit?" offers
 * Tomorrow, Next week or a date (Q16).
 */
export function OneLook({
    booking: b,
    state,
    ctx,
    act,
    person,
    undo,
    onStep,
    onTake,
}: {
    booking: DiaryBooking;
    /** Where it stands, with a held cancel shown as done. */
    state: DiaryState;
    ctx: QuickLookContext;
    act: QuickLookActions;
    person: PersonRead;
    /** Undo for a change still held, or null. */
    undo: (() => void) | null;
    onStep: (step: QuickLookStep, choice?: NextDayChoice) => void;
    onTake: () => void;
}) {
    const who = whoFor(b);
    const first = firstName(who);
    const read = person.state === "ready" ? person.person : null;
    const facts = oneFacts(b, state, ctx, undo !== null);
    const primary = primaryAction(facts);
    const amount = b.take
        ? formatMoney(b.take.cents, b.service.currency ?? null)
        : null;
    const open = state === "booked" || state === "pending";
    const attention = attentionText(read?.attention ?? null);
    // The number the booking was made with, then the contact's.
    const rawPhone =
        [b.bookerPhone, read?.phone].map((p) => p?.trim()).find(Boolean) ??
        null;
    const rule = ctx.rules?.freeCancelHours;
    const help =
        state === "cancelled"
            ? `Cancelled${b.cancelledLate ? " late" : ""}.`
            : open
              ? `${rule !== null && rule !== undefined ? `Free to cancel until ${count(rule, "hour")} before. ` : ""}${bookingChangeText(read?.reach, first || "they")}`
              : null;

    const rows: MoreRow[] = moreItems(facts, { first, amount }).map((item) => ({
        key: item.action,
        label: item.label,
        icon: MORE_ICON[item.action],
        danger: item.danger,
        ...(item.action === "person" && b.contact
            ? { href: personHref(b.contact.id) }
            : item.action === "full"
              ? { href: `/bookings/${b.id}` }
              : {
                    onSelect: () => {
                        switch (item.action) {
                            case "take":
                                return onTake();
                            case "noshow":
                                return act.noShow(b);
                            case "came":
                                return act.checkIn(b);
                            case "undo":
                                return undo?.();
                            case "next":
                                return onStep("next");
                            case "move":
                                return onStep("move");
                            case "cancel":
                                return onStep("cancel");
                        }
                    },
                }),
    }));

    const primaryButton: Record<
        NonNullable<typeof primary>,
        { label: string; icon: ReactNode; run: () => void }
    > = {
        arrive: {
            label: first ? `Mark ${first} arrived` : BOOKING_WORDS.markArrived,
            icon: <CircleCheck aria-hidden className="size-5" />,
            run: () => act.checkIn(b),
        },
        take: {
            label: amount ? `Take ${amount}` : "Take payment",
            icon: <IndianRupee aria-hidden className="size-5" />,
            run: onTake,
        },
        next: {
            label: "Book their next visit",
            icon: <CalendarPlus aria-hidden className="size-5" />,
            run: () => onStep("next"),
        },
        again: {
            label: first ? `Book ${first} again` : "Book them again",
            icon: <Plus aria-hidden className="size-5" />,
            run: () => onStep("next"),
        },
        rebook: {
            label: "Book a new time",
            icon: <Plus aria-hidden className="size-5" />,
            run: () => onStep("next"),
        },
    };
    const main = primary ? primaryButton[primary] : null;
    const frontDesk =
        ctx.canBook && ctx.desk !== undefined && !ctx.desk.canTake;

    return (
        <>
            <StepBody className="min-[760px]:grid min-[760px]:content-start min-[760px]:gap-3.5">
                {attention ? (
                    // Read by whoever is about to see them (DEC-040): a
                    // warning, not an error the merchant made.
                    <Notice tone="warning" role="note">
                        <b>Needs attention.</b> {attention}
                    </Notice>
                ) : null}
                <div className="mt-1.5 min-[760px]:mt-0">
                    <Fact
                        icon={
                            <IndianRupee aria-hidden className="size-[18px]" />
                        }
                        label="Payment"
                    >
                        {b.treatment ? (
                            <OrderText
                                treatment={b.treatment}
                                canRead={!!ctx.canReadOrder}
                            />
                        ) : (
                            paidWords(b, ctx, state)
                        )}
                    </Fact>
                    {b.treatment ? (
                        <Fact
                            icon={
                                <Layers aria-hidden className="size-[18px]" />
                            }
                            label="Visit"
                        >
                            {visitWords(b.treatment)}
                        </Fact>
                    ) : null}
                    <Fact
                        icon={<Phone aria-hidden className="size-[18px]" />}
                        label="Phone"
                        aside={
                            rawPhone ? (
                                <a
                                    href={`tel:${rawPhone.replace(/\s+/g, "")}`}
                                    className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] text-muted-foreground underline-offset-4 hover:underline min-[760px]:text-[13.5px] min-[760px]:font-semibold min-[760px]:text-foreground"
                                >
                                    <Phone
                                        aria-hidden
                                        className="hidden size-4 min-[760px]:block"
                                    />
                                    Call
                                    <span className="sr-only"> {who}</span>
                                </a>
                            ) : null
                        }
                    >
                        {phoneText({
                            bookerPhone: b.bookerPhone,
                            hasContact: b.contact !== null,
                            person: read ?? undefined,
                        })}
                    </Fact>
                    <Fact
                        icon={<Mail aria-hidden className="size-[18px]" />}
                        label="Email"
                    >
                        {b.contact?.email ?? b.bookerEmail ?? (
                            <span className="text-muted-foreground">
                                Not set
                            </span>
                        )}
                    </Fact>
                </div>
                {person.state === "failed" ? (
                    <FailedRead
                        things="their phone and notes"
                        reassurance="Nothing has changed."
                        onRetry={person.retry}
                    />
                ) : null}
                {help ? <Help className="min-[760px]:mt-0">{help}</Help> : null}
                {state === "in" && facts.canNext ? (
                    <NextVisitOffer
                        with={b.staff ? firstName(b.staff.name) : null}
                        onPick={(choice) => onStep("next", choice)}
                    />
                ) : null}
                {frontDesk ? <Help>{FRONT_DESK_LINE}</Help> : null}
                {!ctx.canBook ? <Help>{CALENDAR_ONLY_LINE}</Help> : null}
            </StepBody>
            <StepFoot>
                {main ? (
                    <Button
                        type="button"
                        className={cn(
                            QL_BTN,
                            "w-full gap-2 min-[760px]:w-auto",
                        )}
                        onClick={main.run}
                    >
                        <span className="min-[760px]:hidden">{main.icon}</span>
                        {main.label}
                    </Button>
                ) : null}
                <div className="flex gap-2 min-[760px]:contents">
                    {ctx.canBook && open ? (
                        <Button
                            type="button"
                            variant="outline"
                            className={cn(
                                QL_BTN,
                                "flex-1 gap-2 min-[760px]:flex-none",
                            )}
                            onClick={() => onStep("choose")}
                        >
                            <ArrowRightLeft
                                aria-hidden
                                className="size-[18px] min-[760px]:hidden"
                            />
                            Move or cancel
                        </Button>
                    ) : null}
                    <span
                        aria-hidden
                        className="hidden flex-1 min-[760px]:block"
                    />
                    <QuickLookMore
                        title={first ? `${first}'s booking` : "This booking"}
                        rows={rows}
                        className="flex-1 min-[760px]:flex-none"
                    />
                </div>
            </StepFoot>
        </>
    );
}

/** "Book their next visit?" with Tomorrow, Next week and Pick a date (Q16). */
function NextVisitOffer({
    with: person,
    onPick,
}: {
    with: string | null;
    onPick: (choice: NextDayChoice) => void;
}) {
    const chip = chipClass(false, "h-11 px-3.5 text-[13.5px]");
    return (
        <div className="mt-3 grid gap-2 rounded-[12px] border border-border bg-background px-3.5 py-3 min-[760px]:mt-0 min-[760px]:px-4 min-[760px]:py-3.5">
            <span className="text-[13.5px] leading-[1.4]">
                <b className="block">Book their next visit?</b>
                <span className="text-muted-foreground">
                    Same service{person ? ` with ${person}` : ""}. You pick the
                    day.
                </span>
            </span>
            <span className="flex flex-wrap gap-1.5">
                <Button
                    type="button"
                    variant="outline"
                    className={chip}
                    onClick={() => onPick("tomorrow")}
                >
                    Tomorrow
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={chip}
                    onClick={() => onPick("next-week")}
                >
                    Next week
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    className={chip}
                    onClick={() => onPick("pick")}
                >
                    <CalendarDays aria-hidden className="size-4" />
                    Pick a date
                </Button>
            </span>
        </div>
    );
}

/** "Visit 2 of 3 · 1 done" for a visit of a treatment (E10). */
function visitWords(t: TreatmentView): string {
    const done = visitsDoneText(t);
    return done ? `${visitLabel(t)} · ${done}` : visitLabel(t);
}

/** "With order #…": a link for someone who may read orders, else words. */
function OrderText({
    treatment,
    canRead,
}: {
    treatment: TreatmentView;
    canRead: boolean;
}) {
    if (!canRead) return <>{orderLabel(treatment)}</>;
    return (
        <TextLink href={orderHref(treatment)}>{orderLabel(treatment)}</TextLink>
    );
}
