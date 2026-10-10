"use client";

import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/form-sheet";
import {
    formatClock,
    formatClockRange,
    formatDay,
} from "@/lib/format/datetime";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import {
    makePayLink,
    PayLinkPanel,
} from "@/components/bookings/pay-link-panel";
import { CustomerPicker } from "@/components/customers/customer-picker";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { formatMoney } from "@/lib/format/money";
import { bookByHand, listAvailability } from "@/lib/services/actions";
import type { BookingPeople, PayChoice } from "@/lib/services/booking-pay";
import {
    bookerFor,
    defaultPay,
    paidWithFor,
    payChoices,
    payNote,
} from "@/lib/services/booking-pay";
import type { LocalDate, Span } from "@/lib/services/diary";
import { dayBounds, firstStartIn, zonedInstant } from "@/lib/services/diary";
import type { Service } from "@/lib/services/service";
import { addExtraHours, removeExtraHours } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

import { runAction } from "@/lib/api/run-action";
import { TextLink } from "@saroh/ui/text-link";
import { Chip, Eyebrow } from "./parts";

export interface GapTarget {
    staff: StaffView;
    date: LocalDate;
    free: Span;
}

/**
 * "New booking" from a free gap (the design): the person and the time are
 * already chosen, so it asks only what, who and how it is paid. Only the
 * one-to-one services this person takes and that fit before their next
 * booking can be picked. Instead of booking, the gap can be blocked — or,
 * inside one-off extra hours, those hours closed again.
 *
 * The customer is found with the shared picker (E4): by name or phone, most
 * recent first, or added new, with their Needs attention once picked. A
 * priced booking can be sent a pay link: the booking is made, its invoice
 * issued, and the link shown to copy.
 */
export function NewBookingFromGap({
    target,
    services,
    people,
    timezone,
    money,
    onClose,
    onBlock,
}: {
    target: GapTarget | null;
    services: Service[];
    people: BookingPeople;
    timezone: string;
    money: boolean;
    onClose: () => void;
    onBlock: (target: GapTarget) => void;
}) {
    return (
        <FormSheet
            open={target !== null}
            title="New booking"
            description={
                target
                    ? `With ${target.staff.name} on ${formatDay(target.date, { weekday: "short", year: "never" })}. Pick the service, then who it is for.`
                    : ""
            }
            onClose={onClose}
        >
            {target ? (
                <Form
                    key={`${target.staff.id}${target.date}${target.free[0]}`}
                    target={target}
                    services={services}
                    people={people}
                    timezone={timezone}
                    money={money}
                    onClose={onClose}
                    onBlock={onBlock}
                />
            ) : null}
        </FormSheet>
    );
}

function Form({
    target,
    services,
    people,
    timezone,
    money,
    onClose,
    onBlock,
}: {
    target: GapTarget;
    services: Service[];
    people: BookingPeople;
    timezone: string;
    money: boolean;
    onClose: () => void;
    onBlock: (target: GapTarget) => void;
}) {
    const router = useRouter();
    const ids = { who: useId() };
    const { staff, date, free } = target;
    const start = free[0];
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [pick, setPick] = useState<CustomerPick | null>(null);
    const [pay, setPay] = useState<PayChoice>(defaultPay(people.payLink));
    const [saving, setSaving] = useState(false);
    const [tried, setTried] = useState(false);
    const [attempt] = useState(() => crypto.randomUUID());
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<{
        booked: string;
        bookingId: string;
        link: PayLinkResult;
    } | null>(null);

    const offered = services.filter(
        (s) =>
            s.status === "ACTIVE" &&
            s.capacity <= 1 &&
            staff.serviceIds.includes(s.id),
    );
    // Where each service can start in this gap with this person, as the API
    // works it out — the person's hours and the service's own rules both.
    const [starts, setStarts] = useState<Record<string, number | null> | null>(
        null,
    );
    const offeredKey = offered.map((s) => s.id).join(",");
    useEffect(() => {
        let live = true;
        const { from, to } = dayBounds(date, timezone);
        const ids = offeredKey ? offeredKey.split(",") : [];
        void Promise.all(
            ids.map(async (id) => {
                const minutes =
                    services.find((s) => s.id === id)?.durationMinutes ?? 0;
                const slots = await listAvailability(
                    id,
                    from.toISOString(),
                    to.toISOString(),
                    staff.id,
                );
                return [
                    id,
                    firstStartIn(slots, free, minutes, date, timezone),
                ] as const;
            }),
        ).then((pairs) => {
            if (live) setStarts(Object.fromEntries(pairs));
        });
        return () => {
            live = false;
        };
    }, [offeredKey, services, date, timezone, staff.id, free]);
    const startOf = (s: Service) => starts?.[s.id] ?? null;
    const fits = (s: Service) => startOf(s) !== null;
    const anyTooLong = starts !== null && offered.some((s) => !fits(s));
    const chosen = offered.find((s) => s.id === serviceId);
    const at = (chosen ? startOf(chosen) : null) ?? start;
    const extra = staff.extraHours.find(
        (x) =>
            x.date.slice(0, 10) === date &&
            start >= x.startMinute &&
            start < x.endMinute,
    );
    // A link is for something with a price: until a service is chosen,
    // offered; an unpriced one takes it away.
    const offerLink =
        people.payLink && (!chosen || (chosen.priceCents ?? 0) > 0);
    const payNow: PayChoice = pay === "LINK" && !offerLink ? "DESK" : pay;
    const booker = bookerFor(pick);
    const ready = Boolean(serviceId) && booker !== null;
    const when = `${staff.name} · ${formatDay(date, { weekday: "short", year: "never" })} at ${formatClock(at)}`;

    async function book() {
        setTried(true);
        if (!serviceId || !ready || saving) return;
        setSaving(true);
        setError(null);
        const paidWith = paidWithFor(payNow);
        const res = await runAction(
            () =>
                bookByHand(serviceId, {
                    startAt: zonedInstant(date, at, timezone).toISOString(),
                    idempotencyKey: attempt,
                    staffId: staff.id,
                    ...(paidWith ? { paidWith } : {}),
                    ...booker,
                }),
            // Said here, where the choice is.
            { quiet: true, onUnreached: setError },
        );
        if (!res) {
            setSaving(false);
            return;
        }
        if (!res.ok && res.plan) {
            // At the plan's bookings-a-month limit (U13): its notice.
            setSaving(false);
            showPlanRefusal(res.plan);
            return;
        }
        if (!res.ok) {
            setSaving(false);
            // Most often the gap filled while this was open: say so here,
            // where the choice is, and read the calendar again.
            setError(res.error);
            router.refresh();
            return;
        }
        const booked = `Booked ${pick ? pickName(pick) : "them"} with ${staff.name} at ${formatClock(at)}.`;
        if (payNow === "LINK") {
            // It is booked either way: a link that couldn't be made is
            // made again from the booking.
            const link = await runAction(() => makePayLink(res.data.id), {
                setBusy: setSaving,
            });
            router.refresh();
            if (link) setDone({ booked, bookingId: res.data.id, link });
            else onClose();
            return;
        }
        setSaving(false);
        showSuccess(booked);
        onClose();
        router.refresh();
    }

    async function closeExtra() {
        if (!extra) return;
        const res = await removeExtraHours(staff.id, extra.id);
        if (!res.ok) return showError(res.error);
        onClose();
        router.refresh();
        showUndo(
            `Closed the extra ${formatClockRange(extra.startMinute, extra.endMinute)}.`,
            async () => {
                const back = await addExtraHours(staff.id, {
                    date,
                    startMinute: extra.startMinute,
                    endMinute: extra.endMinute,
                });
                router.refresh();
                return back;
            },
        );
    }

    if (done) {
        return (
            <FormSheetBody className="block">
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                    {when}
                </p>
                <PayLinkPanel
                    booked={done.booked}
                    bookingId={done.bookingId}
                    first={done.link}
                    onDone={onClose}
                />
            </FormSheetBody>
        );
    }

    return (
        <>
            <FormSheetBody className="block">
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                    {when}
                </p>

                <Eyebrow id={`${ids.who}-svc`}>Service</Eyebrow>
                {offered.length ? (
                    <div
                        role="radiogroup"
                        aria-labelledby={`${ids.who}-svc`}
                        className="mb-3 flex flex-wrap gap-1.5"
                    >
                        {offered.map((s) => {
                            const price = money
                                ? formatMoney(s.priceCents, s.currency)
                                : null;
                            return (
                                <Chip
                                    key={s.id}
                                    on={serviceId === s.id}
                                    disabled={!fits(s)}
                                    onClick={() => setServiceId(s.id)}
                                >
                                    {s.name} · {s.durationMinutes} min
                                    {price ? ` · ${price}` : ""}
                                    {startOf(s) !== null && startOf(s) !== start
                                        ? ` · from ${formatClock(startOf(s) ?? start)}`
                                        : ""}
                                </Chip>
                            );
                        })}
                    </div>
                ) : (
                    <p className="mb-3 text-[12.5px] text-muted-foreground">
                        {staff.name} takes no one-to-one services yet. Choose
                        who takes each on Services.
                    </p>
                )}
                {starts === null && offered.length ? (
                    <p
                        role="status"
                        className="-mt-1.5 mb-3 text-[11.5px] text-muted-foreground"
                    >
                        Finding when each can start…
                    </p>
                ) : anyTooLong ? (
                    <p className="-mt-1.5 mb-3 text-[11.5px] text-muted-foreground">
                        Greyed out: it can&apos;t start in this free time. It is
                        longer than the time before {formatClock(free[1])}, or
                        outside the service&apos;s own hours.
                    </p>
                ) : null}

                <Eyebrow id={`${ids.who}-cust`}>Customer</Eyebrow>
                <CustomerPicker
                    value={pick}
                    onPick={setPick}
                    canSearch={people.canSearch}
                    labelledBy={`${ids.who}-cust`}
                />

                <Eyebrow id={`${ids.who}-pay`}>Payment</Eyebrow>
                <div
                    role="radiogroup"
                    aria-labelledby={`${ids.who}-pay`}
                    className="flex flex-wrap gap-1.5"
                >
                    {payChoices(offerLink).map((c) => (
                        <Chip
                            key={c.key}
                            on={payNow === c.key}
                            onClick={() => setPay(c.key)}
                        >
                            {c.label}
                        </Chip>
                    ))}
                </div>
                <p className="mt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
                    {payNote(payNow)}
                </p>
                {error ? (
                    <p
                        role="alert"
                        className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        {error}
                    </p>
                ) : null}

                {tried && !ready ? (
                    <p
                        role="alert"
                        className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                    >
                        Pick a service and who it is for.
                    </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
                    {extra ? (
                        <TextLink
                            onClick={() => void closeExtra()}
                            className="text-[12.5px] coarse:min-h-11"
                        >
                            Close these extra hours
                        </TextLink>
                    ) : null}
                    <TextLink
                        onClick={() => onBlock(target)}
                        className="text-[12.5px] coarse:min-h-11"
                    >
                        Block this time instead
                    </TextLink>
                </div>
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Create booking"
                savingLabel="Booking…"
                pending={saving}
                onSubmit={book}
            />
        </>
    );
}
