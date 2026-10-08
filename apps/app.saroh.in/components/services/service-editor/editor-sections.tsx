"use client";

import { Checkbox } from "@saroh/ui/checkbox";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { PlanLock } from "@/lib/billing/access";
import { currencySymbol } from "@/lib/format/money";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import type { ServiceDraft } from "@/lib/services/service-editor";
import {
    bookingPageNote,
    draftVisits,
    staffNote,
    timeNote,
    toMinor,
    wholeNumber,
} from "@/lib/services/service-editor";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";

import { DepositField } from "./deposit-field";
import { FIELD, HELP, LABEL, NumberField, Section } from "./fields";
import { VisitsField, VisitsStorefrontNote } from "./visits-field";
import { WhereField } from "./where-field";

/*
 * The Service Editor's sections (E2), in the design's order: What it is,
 * Time (with Where), Price and Who takes it in the main column, and the
 * booking page in the side one. Each edits the draft through `set`.
 */

interface Edit {
    draft: ServiceDraft;
    set: (patch: Partial<ServiceDraft>) => void;
}

const CHIP = "h-[34px] text-[13px]";

/**
 * Name, what to tell customers, and Kind — one-to-one or a class — up
 * front, since it decides how everything below works (UX-056).
 */
export function WhatItIs({ draft, set }: Edit) {
    const ids = { name: useId(), desc: useId(), kind: useId() };
    return (
        <Section title="What it is">
            <label htmlFor={ids.name} className={LABEL}>
                Name
            </label>
            <Input
                id={ids.name}
                value={draft.name}
                maxLength={128}
                autoComplete="off"
                placeholder="e.g. Personal training"
                onChange={(e) => set({ name: e.target.value })}
                className={FIELD}
            />
            <label htmlFor={ids.desc} className={cn(LABEL, "mt-3")}>
                What to tell customers
            </label>
            <Textarea
                id={ids.desc}
                rows={3}
                maxLength={2000}
                value={draft.description}
                placeholder="e.g. One-to-one session built around your goals."
                onChange={(e) => set({ description: e.target.value })}
                className="mt-[5px] rounded-[8px] text-[14px]"
            />
            <p className={HELP}>Shown on the booking page under the name.</p>
            <Eyebrow id={ids.kind} className="mt-3">
                Kind
            </Eyebrow>
            <div
                role="radiogroup"
                aria-labelledby={ids.kind}
                className="flex flex-wrap gap-1.5"
            >
                <Chip
                    on={draft.kind === "one"}
                    className={CHIP}
                    onClick={() => set({ kind: "one" })}
                >
                    One-to-one
                </Chip>
                <Chip
                    on={draft.kind === "class"}
                    className={CHIP}
                    onClick={() => set({ kind: "class" })}
                >
                    Class
                </Chip>
            </div>
            <p className={HELP}>
                A class runs at set times with a number of places.
            </p>
        </Section>
    );
}

export function TimeSection({
    draft,
    set,
    hasStaff,
    noStorefront,
}: Edit & {
    hasStaff: boolean;
    /** A treatment can't be sold: no storefront to sell it from (E10). */
    noStorefront: boolean;
}) {
    return (
        <Section title="Time">
            <div className="flex flex-wrap gap-3">
                <NumberField
                    label="Each visit (min)"
                    value={draft.minutes}
                    onChange={(minutes) => set({ minutes })}
                    width="w-[120px]"
                />
                <NumberField
                    label="Gap after (min)"
                    value={draft.gap}
                    onChange={(gap) => set({ gap })}
                    width="w-[120px]"
                />
                {draft.kind === "one" ? (
                    <VisitsField
                        value={draft.visits}
                        onChange={(visits) => set({ visits })}
                    />
                ) : null}
                {draft.kind === "class" ? (
                    <NumberField
                        label="Places"
                        value={draft.places}
                        onChange={(places) => set({ places })}
                        width="w-[90px]"
                    />
                ) : null}
            </div>
            <p className={HELP}>
                {timeNote(
                    draft.kind,
                    hasStaff,
                    draftVisits(draft),
                    wholeNumber(draft.minutes),
                )}
            </p>
            {noStorefront && draftVisits(draft) > 1 ? (
                <VisitsStorefrontNote />
            ) : null}
            <WhereField
                where={draft.where}
                meetingUrl={draft.meetingUrl}
                onChange={set}
            />
        </Section>
    );
}

export function PriceSection({
    draft,
    set,
    currency,
    savedDeposit,
    paymentsLock = null,
    payment,
}: Edit & {
    currency: string;
    /** The deposit the service has saved. */
    savedDeposit?: DepositMode;
    /** The plan's lock on online payments (deposits are taken online). */
    paymentsLock?: PlanLock | null;
    /** How people pay when they book (DEC-088); null when unknown. */
    payment: BookingPaymentView | null;
}) {
    const id = useId();
    // Only a service on the booking page is booked online at all.
    const problem = draft.showOnBookingPage
        ? onlineBookingProblem(
              {
                  priceCents: toMinor(draft.price),
                  depositMode: draft.deposit,
              },
              payment,
          )
        : null;
    return (
        <Section title="Price">
            <label htmlFor={id} className={LABEL}>
                Price ({currencySymbol(currency)})
            </label>
            <Input
                id={id}
                inputMode="decimal"
                value={draft.price}
                onChange={(e) => set({ price: e.target.value })}
                className={cn(FIELD, "w-[160px] max-w-full")}
            />
            <DepositField
                deposit={draft.deposit}
                price={draft.price}
                currency={currency}
                visits={draftVisits(draft)}
                saved={savedDeposit}
                paymentsLock={paymentsLock}
                way={payment?.bookingPayment}
                problem={problem}
                onChange={(deposit) => set({ deposit })}
            />
        </Section>
    );
}

export function WhoTakesIt({
    draft,
    set,
    staff,
    people,
}: Edit & {
    /** Null when the people on the diary couldn't be read. */
    staff: StaffView[] | null;
    /** The active ones, who can take it. */
    people: StaffView[];
}) {
    const id = useId();
    const flip = (personId: string) =>
        set({
            staffIds: draft.staffIds.includes(personId)
                ? draft.staffIds.filter((x) => x !== personId)
                : [...draft.staffIds, personId],
        });
    return (
        <Section title="Who takes it">
            {staff === null ? (
                <p role="alert" className={cn(HELP, "mt-0")}>
                    Who takes it couldn&apos;t be loaded. Saving leaves it as it
                    is.
                </p>
            ) : people.length ? (
                <>
                    <span id={id} className="sr-only">
                        Who takes it
                    </span>
                    <div
                        role="group"
                        aria-labelledby={id}
                        className="flex flex-wrap gap-1.5"
                    >
                        {people.map((p) => (
                            <Chip
                                key={p.id}
                                on={draft.staffIds.includes(p.id)}
                                role="checkbox"
                                className={CHIP}
                                onClick={() => flip(p.id)}
                            >
                                {p.name}
                                {p.title ? ` · ${p.title}` : ""}
                            </Chip>
                        ))}
                    </div>
                    <p className={HELP}>{staffNote(draft.staffIds, people)}</p>
                </>
            ) : (
                <p className={cn(HELP, "mt-0")}>
                    Nobody is on the diary yet, so it books in its own weekly
                    hours, under More settings.
                </p>
            )}
        </Section>
    );
}

export function BookingPageCard({
    draft,
    set,
    hasPage,
    hasHours = true,
}: Edit & {
    hasPage: boolean | null;
    /** It has times to offer (UX-024); true when unknown. */
    hasHours?: boolean;
}) {
    return (
        <Section title="Booking page">
            <label className="flex cursor-pointer items-start gap-[9px] text-[13px]">
                <Checkbox
                    checked={draft.showOnBookingPage}
                    onCheckedChange={(on) =>
                        set({ showOnBookingPage: on === true })
                    }
                    className="mt-0.5"
                />
                <span>
                    Show on the booking page
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                        {bookingPageNote(
                            hasPage,
                            draft.showOnBookingPage,
                            hasHours,
                        )}
                    </span>
                </span>
            </label>
        </Section>
    );
}
