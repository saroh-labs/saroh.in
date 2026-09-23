"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { ContactOption } from "@/components/shared/contact-picker";
import { ContactPicker } from "@/components/shared/contact-picker";
import { formatMoney } from "@/lib/format/money";
import { bookByHand, listAvailability } from "@/lib/services/actions";
import type { LocalDate, Span } from "@/lib/services/diary";
import {
    clock,
    dayBounds,
    dayLabel,
    firstStartIn,
    zonedInstant,
} from "@/lib/services/diary";
import type { Service } from "@/lib/services/service";
import { addExtraHours, removeExtraHours } from "@/lib/staff/actions";
import type { StaffView } from "@/lib/staff/types";

import { Chip, Eyebrow } from "./parts";
import { btn } from "./quick-look-types";

export interface GapTarget {
    staff: StaffView;
    date: LocalDate;
    free: Span;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "New booking" from a free gap (the design): the person and the time are
 * already chosen, so it asks only what, who and how it is paid. Only the
 * one-to-one services this person takes and that fit before their next
 * booking can be picked. Instead of booking, the gap can be blocked — or,
 * inside one-off extra hours, those hours closed again.
 */
export function NewBookingFromGap({
    target,
    services,
    contacts,
    timezone,
    money,
    onClose,
    onBlock,
}: {
    target: GapTarget | null;
    services: Service[];
    contacts: ContactOption[];
    timezone: string;
    money: boolean;
    onClose: () => void;
    onBlock: (target: GapTarget) => void;
}) {
    return (
        <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-h-[calc(100vh-40px)] max-w-[460px] gap-0 overflow-y-auto rounded-[14px] px-5 py-[18px]">
                {target ? (
                    <Form
                        key={`${target.staff.id}${target.date}${target.free[0]}`}
                        target={target}
                        services={services}
                        contacts={contacts}
                        timezone={timezone}
                        money={money}
                        onClose={onClose}
                        onBlock={onBlock}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    );
}

function Form({
    target,
    services,
    contacts,
    timezone,
    money,
    onClose,
    onBlock,
}: {
    target: GapTarget;
    services: Service[];
    contacts: ContactOption[];
    timezone: string;
    money: boolean;
    onClose: () => void;
    onBlock: (target: GapTarget) => void;
}) {
    const router = useRouter();
    const ids = { name: useId(), email: useId(), who: useId() };
    const { staff, date, free } = target;
    const start = free[0];
    const [serviceId, setServiceId] = useState<string | null>(null);
    const [who, setWho] = useState<"known" | "new">(
        contacts.length ? "known" : "new",
    );
    const [contactId, setContactId] = useState("");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [pay, setPay] = useState<"DESK" | "PAID">("DESK");
    const [saving, setSaving] = useState(false);
    const [attempt] = useState(() => crypto.randomUUID());
    const [error, setError] = useState<string | null>(null);

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
    const whoOk =
        who === "known" ? Boolean(contactId) : EMAIL.test(email.trim());
    const ready = Boolean(serviceId) && whoOk && !saving;
    const when = `${staff.name} · ${dayLabel(date)} at ${clock(at)}`;

    async function book() {
        if (!serviceId || !ready) return;
        setSaving(true);
        setError(null);
        const res = await bookByHand(serviceId, {
            startAt: zonedInstant(date, at, timezone).toISOString(),
            idempotencyKey: attempt,
            staffId: staff.id,
            paidWith: pay,
            ...(who === "known"
                ? { contactId }
                : {
                      bookerEmail: email.trim(),
                      bookerName: name.trim() || undefined,
                  }),
        });
        setSaving(false);
        if (!res.ok) {
            // Most often the gap filled while this was open: say so here,
            // where the choice is, and read the calendar again.
            setError(res.error);
            router.refresh();
            return;
        }
        const person =
            who === "known"
                ? (contacts.find((c) => c.id === contactId)?.name ?? "them")
                : name.trim() || email.trim();
        showSuccess(`Booked ${person} with ${staff.name} at ${clock(at)}.`);
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
            `Closed the extra ${clock(extra.startMinute)}–${clock(extra.endMinute)}.`,
            () => {
                void addExtraHours(staff.id, {
                    date,
                    startMinute: extra.startMinute,
                    endMinute: extra.endMinute,
                }).then((back) => {
                    if (!back.ok) showError(back.error);
                    router.refresh();
                });
            },
        );
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                void book();
            }}
        >
            <DialogTitle className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                New booking
            </DialogTitle>
            <DialogDescription className="mb-3 mt-[3px] text-[12.5px] text-muted-foreground">
                {when}
            </DialogDescription>

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
                                    ? ` · from ${clock(startOf(s) ?? start)}`
                                    : ""}
                            </Chip>
                        );
                    })}
                </div>
            ) : (
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                    {staff.name} takes no one-to-one services yet. Choose who
                    takes each on Services.
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
                    Greyed out: it can&apos;t start in this free time — longer
                    than the time before {clock(free[1])}, or outside the
                    service&apos;s own hours.
                </p>
            ) : null}

            <Eyebrow id={`${ids.who}-cust`}>Customer</Eyebrow>
            {contacts.length ? (
                <div
                    role="radiogroup"
                    aria-labelledby={`${ids.who}-cust`}
                    className="mb-2 flex flex-wrap gap-1.5"
                >
                    <Chip on={who === "known"} onClick={() => setWho("known")}>
                        From your contacts
                    </Chip>
                    <Chip on={who === "new"} onClick={() => setWho("new")}>
                        Someone new
                    </Chip>
                </div>
            ) : null}
            {who === "known" ? (
                <div className="mb-3">
                    <ContactPicker
                        contacts={contacts}
                        value={contactId}
                        onValueChange={setContactId}
                        aria-label="Customer"
                        placeholder="Find someone by name or email…"
                    />
                </div>
            ) : (
                <div className="mb-3 grid gap-2 sm:grid-cols-2">
                    <div>
                        <Label htmlFor={ids.name} className="text-[12.5px]">
                            Name
                        </Label>
                        <Input
                            id={ids.name}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="mt-1 h-9"
                            autoComplete="off"
                        />
                    </div>
                    <div>
                        <Label htmlFor={ids.email} className="text-[12.5px]">
                            Email
                        </Label>
                        <Input
                            id={ids.email}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 h-9"
                            autoComplete="off"
                        />
                    </div>
                </div>
            )}

            <Eyebrow id={`${ids.who}-pay`}>Payment</Eyebrow>
            <div
                role="radiogroup"
                aria-labelledby={`${ids.who}-pay`}
                className="flex flex-wrap gap-1.5"
            >
                <Chip on={pay === "DESK"} onClick={() => setPay("DESK")}>
                    Pays at the session
                </Chip>
                <Chip on={pay === "PAID"} onClick={() => setPay("PAID")}>
                    Paid now
                </Chip>
            </div>
            <p className="mt-3 text-[12.5px] leading-[1.5] text-muted-foreground">
                {pay === "DESK"
                    ? "Booked now; the calendar shows they pay at the desk."
                    : "Recorded as paid. Saroh takes no payment and makes no receipt for it."}
            </p>
            {error ? (
                <p
                    role="alert"
                    className="mt-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    {error}
                </p>
            ) : null}

            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2">
                {extra ? (
                    <button
                        type="button"
                        onClick={() => void closeExtra()}
                        className="text-[12.5px] font-semibold text-foreground underline underline-offset-2"
                    >
                        Close these extra hours
                    </button>
                ) : null}
                <button
                    type="button"
                    onClick={() => onBlock(target)}
                    className="mr-auto text-[12.5px] font-semibold text-foreground underline underline-offset-2"
                >
                    Block this time instead
                </button>
                <Button
                    type="button"
                    variant="outline"
                    className={btn.ghost}
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button type="submit" className={btn.primary} disabled={!ready}>
                    {saving ? "Booking…" : "Book it"}
                </Button>
            </div>
        </form>
    );
}
