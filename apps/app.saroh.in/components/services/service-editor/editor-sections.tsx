"use client";

import { FailedRead } from "@/components/shared/failed-read";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { TextLink } from "@saroh/ui/text-link";
import { Textarea } from "@saroh/ui/textarea";
import { useId } from "react";

import { Chip, Eyebrow } from "@/components/bookings/calendar/parts";
import type { PlanLock } from "@/lib/billing/access";
import { onlineBookingProblem } from "@/lib/services/online-booking";
import type { DepositMode } from "@/lib/services/service";
import { AVAILABILITY_HREF } from "@/lib/services/service-cards";
import {
    bookingPageNote,
    draftVisits,
    staffNote,
    timeNote,
    toMinor,
    TREATMENT_NEEDS_STOREFRONT,
    wholeNumber,
} from "@/lib/services/service-editor";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";

import { CheckRow } from "@/components/shared/check-row";
import { ChipGroup } from "@/components/shared/choice-group";
import { Field, FieldError } from "@saroh/ui/field";
import { DepositField } from "./deposit-field";
import type { Edit } from "./fields";
import { HELP, NumberField, Section } from "./fields";
import { GstFields } from "./gst-fields";
import { LengthField } from "./length-field";
import { VisitsField, VisitsStorefrontNote } from "./visits-field";
import { WhereField } from "./where-field";

/*
 * The Service Editor's sections (E2), in the design's order: What it is,
 * Time (with Where), Price and Who takes it in the main column, and the
 * booking page in the side one. Each edits the draft through `set`.
 */

const CHIP = "";

/**
 * Name, what to tell customers, and Kind — one-to-one or a class — up
 * front, since it decides how everything below works (UX-056).
 */
export function WhatItIs({ draft, set, problem, leave }: Edit) {
    const ids = { kind: useId() };
    return (
        <Section title="What it is">
            <Field
                label="Name"
                error={problem("name")}
                onBlur={() => leave("name")}
            >
                <Input
                    value={draft.name}
                    maxLength={128}
                    autoComplete="off"
                    placeholder="e.g. Personal training"
                    onChange={(e) => set({ name: e.target.value })}
                />
            </Field>
            <Field
                label="What to tell customers"
                className="mt-3"
                hint="Shown on the booking page under the name."
            >
                <Textarea
                    rows={3}
                    maxLength={2000}
                    value={draft.description}
                    placeholder="e.g. One-to-one session built around your goals."
                    onChange={(e) => set({ description: e.target.value })}
                />
            </Field>
            <Eyebrow id={ids.kind} className="mt-3">
                Kind
            </Eyebrow>
            <ChipGroup
                labelledBy={ids.kind}
                value={draft.kind}
                onChange={(kind) => set({ kind })}
                choices={[
                    { value: "one", label: "One-to-one" },
                    { value: "class", label: "Class" },
                ]}
            />
            <p className={HELP}>
                A class runs at set times with a number of places.
            </p>
        </Section>
    );
}

export function TimeSection({
    draft,
    set,
    problem,
    leave,
    hasStaff,
    noStorefront,
}: Edit & {
    hasStaff: boolean;
    /** A treatment can't be sold: no storefront to sell it from (E10). */
    noStorefront: boolean;
}) {
    return (
        <Section title="Time">
            {/* The usual lengths as chips, and Custom for any other. */}
            <LengthField
                value={draft.minutes}
                onChange={(minutes) => set({ minutes })}
                error={problem("minutes")}
                onLeave={() => leave("minutes")}
            />
            <div className="mt-3 flex flex-wrap gap-3">
                <NumberField
                    label="Gap after (min)"
                    value={draft.gap}
                    onChange={(gap) => set({ gap })}
                    width="w-[120px]"
                    error={problem("gap")}
                    onLeave={() => leave("gap")}
                />
                {draft.kind === "one" ? (
                    <VisitsField
                        value={draft.visits}
                        onChange={(visits) => set({ visits })}
                        // No storefront is said under the row, with its way out.
                        error={
                            problem("visits") === TREATMENT_NEEDS_STOREFRONT
                                ? null
                                : problem("visits")
                        }
                        onLeave={() => leave("visits")}
                    />
                ) : null}
                {draft.kind === "class" ? (
                    <NumberField
                        label="Places"
                        value={draft.places}
                        onChange={(places) => set({ places })}
                        width="w-[90px]"
                        error={problem("places")}
                        onLeave={() => leave("places")}
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
                error={problem("meetingUrl")}
                onLeave={() => leave("meetingUrl")}
            />
        </Section>
    );
}

export function PriceSection({
    draft,
    set,
    problem: fieldProblem,
    leave,
    currency,
    savedDeposit,
    paymentsLock = null,
    payment,
    withGst = false,
    canEdit = true,
}: Edit & {
    currency: string;
    /** A GST-registered business: the GST rate and SAC code sit here. */
    withGst?: boolean;
    canEdit?: boolean;
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
            {/* A GST-registered business answers the rate where the price
                is (12 Oct 2026): the price includes it, and a priced
                service can't be saved without one. */}
            <div className="flex flex-wrap items-start gap-3">
                <Field
                    label="Price"
                    className="w-[160px] max-w-full"
                    error={fieldProblem("price")}
                    onBlur={() => leave("price")}
                >
                    <MoneyInput
                        id={id}
                        currency={currency}
                        value={draft.price}
                        onValueChange={(price) => set({ price })}
                    />
                </Field>
                {withGst ? (
                    <GstFields
                        draft={draft}
                        set={set}
                        problem={fieldProblem}
                        leave={leave}
                        asked
                        canEdit={canEdit}
                    />
                ) : null}
            </div>
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
    problem,
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
                <FailedRead
                    things="who takes it"
                    reassurance="Saving leaves it as it is."
                />
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
                    {problem("staffIds") ? (
                        <FieldError className="mt-1.5">
                            {problem("staffIds")}
                        </FieldError>
                    ) : (
                        <p className={HELP}>
                            {staffNote(draft.staffIds, people)}
                        </p>
                    )}
                </>
            ) : (
                <p className={cn(HELP, "mt-0")}>
                    Nobody is on the diary yet.{" "}
                    <TextLink href={AVAILABILITY_HREF}>
                        Add yourself or your team in Availability
                    </TextLink>
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
}: Pick<Edit, "draft" | "set"> & {
    hasPage: boolean | null;
    /** It has times to offer (UX-024); true when unknown. */
    hasHours?: boolean;
}) {
    return (
        <Section title="Booking page">
            <CheckRow
                checked={draft.showOnBookingPage}
                onChange={(showOnBookingPage) => set({ showOnBookingPage })}
                className="items-start gap-[9px]"
                boxClassName="mt-0.5"
            >
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
            </CheckRow>
        </Section>
    );
}
