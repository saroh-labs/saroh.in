"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import {
    makePayLink,
    PayLinkPanel,
} from "@/components/bookings/pay-link-panel";
import { CustomerPicker } from "@/components/customers/customer-picker";
import { Chip } from "@/components/shared/chip";
import { OptionSelect } from "@/components/shared/option-select";
import { packsFor } from "@/lib/class-packs/actions";
import { classesLeft, packOffer, usablePacks } from "@/lib/class-packs/balance";
import type { PackPurchase } from "@/lib/class-packs/service";
import type { CustomerPick } from "@/lib/customers/picker";
import { pickName } from "@/lib/customers/picker";
import { withoutArrival } from "@/lib/customers/prefill";
import {
    bookByHand,
    bookVisit,
    listAvailability,
} from "@/lib/services/actions";
import type { BookingPeople, PayChoice } from "@/lib/services/booking-pay";
import {
    bookerFor,
    defaultPay,
    paidWithFor,
    payChoices,
    payNote,
} from "@/lib/services/booking-pay";
import type { Slot } from "@/lib/services/service";
import type { VisitToBook } from "@/lib/services/treatment";

const WINDOW_DAYS = 14;

/**
 * "New booking" — after the CRUD Flows design: who, what, when, as one
 * dialog. Choosing the service fixes the length, so there are really two
 * things to decide.
 *
 * The times offered are REAL: the same open-slot read the reschedule dialog
 * and the public booking page use, so nothing here can offer a time the
 * service is closed or already full. Saving goes through the same reservation
 * as the booking page (#384): if someone takes the time while this is open,
 * the API says so, and the times are read again.
 *
 * A dialog commits on Save, so nothing is written until "Book it".
 *
 * When the person holds a class pack that covers the service and is still
 * valid at the chosen time (ADR-007), it is offered by name and ticked; the
 * booking then spends a class from it. A pack that does not cover the
 * service, is used up, or runs out before the session is not offered.
 *
 * The customer is found with the shared picker (E4): by name or phone, most
 * recent first, or added new, with their Needs attention once picked. A
 * priced booking can be sent a pay link: the booking is made, its invoice
 * issued, and the link shown to copy.
 *
 * With `visit` (E10) it books the next visit of a treatment: the service,
 * the customer and the order are set, and only the time is chosen. The
 * visit is paid for on its order, so no pack or payment is asked.
 */
export function NewBookingDialog({
    services,
    people,
    canUsePacks = false,
    triggerClassName,
    plainTrigger = false,
    visit,
    primaryTrigger = false,
    initialWho = null,
    openOnArrival = false,
}: {
    services: {
        id: string;
        name: string;
        timezone: string;
        minutes: number;
        priceCents: number | null;
    }[];
    /** Customer search and pay links, as far as the viewer may (E4). */
    people: BookingPeople;
    /** May read and spend class packs (`pack:read`, `pack:sell` and `booking:write`). */
    canUsePacks?: boolean;
    triggerClassName?: string;
    /** The calendar's button: words only, as the Bookings design draws it. */
    plainTrigger?: boolean;
    /** Book this treatment's next visit (E10), on its order. */
    visit?: VisitToBook;
    /**
     * "Book visit N" as the page's primary action (B14, Order Detail's
     * header) rather than the booking page's outline button.
     */
    primaryTrigger?: boolean;
    /**
     * Who it is for, already chosen (#247): the person page's New booking
     * arrives with `?new=1&contactId=`. The picker's Change still picks
     * anyone else; once booked, the next one starts empty.
     */
    initialWho?: CustomerPick | null;
    /**
     * Open on arrival (`?new=1`); closing it then leaves the page's own
     * address, so a reload doesn't open it again.
     */
    openOnArrival?: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(
        openOnArrival && services.length > 0 && !visit,
    );
    const [saving, setSaving] = useState(false);
    // One per attempt, so a double-click books once (the API replays it).
    const [attempt, setAttempt] = useState(() => crypto.randomUUID());
    const [reload, setReload] = useState(0);
    const [serviceId, setServiceId] = useState(services.at(0)?.id ?? "");
    const [who, setWho] = useState<CustomerPick | null>(initialWho);
    const [arrived, setArrived] = useState(openOnArrival);
    const [pay, setPay] = useState<PayChoice>(defaultPay(people.payLink));
    const [done, setDone] = useState<{
        booked: string;
        bookingId: string;
        link: PayLinkResult;
    } | null>(null);
    const [picked, setPicked] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<{
        serviceId: string;
        slots: Slot[];
    } | null>(null);
    // The chosen person's packs for the chosen service, keyed so a stale
    // read for someone else is never shown.
    const [held, setHeld] = useState<{
        key: string;
        packs: PackPurchase[];
    } | null>(null);
    const [usePack, setUsePack] = useState(true);
    const [packId, setPackId] = useState("");
    const [packRefusal, setPackRefusal] = useState<string | null>(null);
    const ids = {
        service: useId(),
        contact: useId(),
        pay: useId(),
        pack: useId(),
    };

    const service = services.find((s) => s.id === serviceId);
    const slots = loaded?.serviceId === serviceId ? loaded.slots : null;

    useEffect(() => {
        if (!open || !serviceId) return;
        let live = true;
        const from = new Date().toISOString();
        const to = new Date(
            Date.now() + WINDOW_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();
        void listAvailability(serviceId, from, to).then((found) => {
            if (live) setLoaded({ serviceId, slots: found });
        });
        return () => {
            live = false;
        };
    }, [open, serviceId, reload]);

    const contactId = who?.kind === "contact" ? who.id : null;
    const packKey =
        canUsePacks && contactId && serviceId
            ? `${contactId}:${serviceId}`
            : null;
    useEffect(() => {
        if (!open || !packKey) return;
        let live = true;
        const [forContact = "", forService = ""] = packKey.split(":");
        void packsFor(forContact, forService).then((found) => {
            if (live) setHeld({ key: packKey, packs: found ?? [] });
        });
        return () => {
            live = false;
        };
    }, [open, packKey, reload]);

    /** Opened by `?new=1` (#247): once closed, the page's own address. */
    function leaveArrival() {
        if (!arrived) return;
        setArrived(false);
        router.replace(
            withoutArrival(window.location.pathname, window.location.search),
            { scroll: false },
        );
    }

    /** Closed by the dialog's own buttons, as by Esc or the ×. */
    function close() {
        setOpen(false);
        leaveArrival();
    }

    const heldNow = held?.key === packKey ? held.packs : [];
    const usable = picked ? usablePacks(heldNow, picked) : [];
    const pack = usable.find((p) => p.id === packId) ?? usable.at(0);
    const paying = usePack && pack !== undefined;

    const byDay = service ? groupByDay(slots ?? [], service.timezone) : [];
    const booker = bookerFor(who);
    const offerLink = people.payLink && (service?.priceCents ?? 0) > 0;
    const payNow: PayChoice = pay === "LINK" && !offerLink ? "DESK" : pay;
    const ready =
        Boolean(service && picked && (visit !== undefined || booker)) &&
        !saving;

    /** The treatment's next visit (E10): on its order, nothing to pay. */
    async function saveVisit(v: VisitToBook) {
        if (!service || !picked) return;
        setSaving(true);
        const res = await bookVisit(v.orderId, {
            visitNumber: v.visitNumber,
            startAt: picked,
        });
        setSaving(false);
        if (!res.ok && res.plan) {
            // At the plan's bookings-a-month limit (U13): its notice, and
            // the time stays picked for when there's room.
            showPlanRefusal(res.plan);
            setAttempt(crypto.randomUUID());
            return;
        }
        if (!res.ok) {
            showError(res.error);
            // Most likely the time went while this was open: read again.
            setPicked(null);
            setLoaded(null);
            setReload((n) => n + 1);
            return;
        }
        showSuccess(
            `Visit ${v.visitNumber} of ${v.visits} booked for ${v.who}, ${dayTime(picked, service.timezone)}`,
        );
        setOpen(false);
        setPicked(null);
        router.refresh();
    }

    async function save() {
        if (visit) return saveVisit(visit);
        if (!service || !picked || !booker || !who) return;
        setSaving(true);
        setPackRefusal(null);
        const paidWith = paying ? undefined : paidWithFor(payNow);
        const res = await bookByHand(service.id, {
            startAt: picked,
            idempotencyKey: attempt,
            ...(paying ? { packPurchaseId: pack.id } : {}),
            ...(paidWith ? { paidWith } : {}),
            ...booker,
        });
        if (!res.ok) setSaving(false);
        if (!res.ok && res.field === "packPurchaseId") {
            // The pack changed while this was open — its last class went on
            // another booking, say. Nothing was booked; read its packs again
            // and say so here, where the choice is.
            setPackRefusal(
                `${res.error} Nothing has been booked and no class was spent. Book it paid another way, or sell them another pack.`,
            );
            setHeld(null);
            setReload((n) => n + 1);
            setAttempt(crypto.randomUUID());
            return;
        }
        if (!res.ok) {
            showError(res.error);
            // Most likely the time went while this was open: read again.
            setPicked(null);
            setLoaded(null);
            setReload((n) => n + 1);
            setAttempt(crypto.randomUUID());
            return;
        }
        const whom = pickName(who);
        if (!paying && payNow === "LINK") {
            const link = await makePayLink(res.data.id);
            setSaving(false);
            setDone({
                booked: `${whom} booked for ${service.name}, ${dayTime(picked, service.timezone)}.`,
                bookingId: res.data.id,
                link,
            });
            router.refresh();
            return;
        }
        setSaving(false);
        showSuccess(
            paying
                ? `${whom} booked for ${service.name}, ${dayTime(picked, service.timezone)} — paid with ${pack.pack.name}`
                : `${whom} booked for ${service.name}, ${dayTime(picked, service.timezone)}`,
        );
        close();
        setPicked(null);
        setWho(null);
        setAttempt(crypto.randomUUID());
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) leaveArrival();
                if (!o) {
                    setPicked(null);
                    setPackRefusal(null);
                    setUsePack(true);
                    if (done) {
                        setDone(null);
                        setWho(null);
                        setAttempt(crypto.randomUUID());
                    }
                }
            }}
        >
            <DialogTrigger asChild>
                {visit ? (
                    <Button
                        data-ph-unmask=""
                        variant={primaryTrigger ? "default" : "outline"}
                        size={primaryTrigger ? "default" : "sm"}
                        disabled={services.length === 0}
                        className={triggerClassName}
                    >
                        Book visit {visit.visitNumber}
                    </Button>
                ) : (
                    <Button
                        disabled={services.length === 0}
                        className={triggerClassName}
                    >
                        {plainTrigger ? null : (
                            <Plus className="mr-1.5 size-4" />
                        )}
                        New booking
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                        {visit
                            ? `Book visit ${visit.visitNumber} of ${visit.visits}`
                            : "New booking"}
                    </DialogTitle>
                    <DialogDescription>
                        {visit
                            ? `${service?.name ?? "The treatment"} for ${visit.who}. It's paid for on order #${visit.orderNumber}, so there's only the time to choose.`
                            : "Pick the service, then who and when."}
                    </DialogDescription>
                </DialogHeader>

                {done ? (
                    <PayLinkPanel
                        booked={done.booked}
                        bookingId={done.bookingId}
                        first={done.link}
                        onDone={close}
                    />
                ) : (
                    <>
                        <div className="grid gap-4">
                            {visit ? null : (
                                <>
                                    <div className="grid gap-1.5">
                                        <Label htmlFor={ids.service}>
                                            What are they booked for?
                                        </Label>
                                        <OptionSelect
                                            id={ids.service}
                                            value={serviceId}
                                            onValueChange={(v) => {
                                                setServiceId(v);
                                                setPicked(null);
                                            }}
                                            options={services.map((s) => ({
                                                value: s.id,
                                                label: `${s.name} · ${s.minutes} min`,
                                            }))}
                                        />
                                    </div>

                                    <div className="grid gap-1.5">
                                        <div
                                            id={ids.contact}
                                            className="text-[12.5px] font-medium"
                                        >
                                            Who is it for?
                                        </div>
                                        <CustomerPicker
                                            value={who}
                                            onPick={setWho}
                                            canSearch={people.canSearch}
                                            labelledBy={ids.contact}
                                        />
                                    </div>
                                </>
                            )}

                            <div className="grid gap-2">
                                <div className="text-[12.5px] font-medium">
                                    When?
                                </div>
                                {slots === null ? (
                                    <p className="text-[12.5px] text-muted-foreground">
                                        Finding open times…
                                    </p>
                                ) : byDay.length === 0 ? (
                                    <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                                        No open times in the next {WINDOW_DAYS}{" "}
                                        days. Opening more hours on this
                                        service, under Services, adds times
                                        here.
                                    </p>
                                ) : (
                                    <div
                                        role="radiogroup"
                                        aria-label="Time"
                                        className="grid max-h-[220px] gap-3 overflow-y-auto pr-1"
                                    >
                                        {byDay.map(([day, daySlots]) => (
                                            <div key={day}>
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                                    {day}
                                                </div>
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {daySlots.map((slot) => (
                                                        <button
                                                            key={slot.startAt}
                                                            type="button"
                                                            role="radio"
                                                            aria-checked={
                                                                picked ===
                                                                slot.startAt
                                                            }
                                                            onClick={() =>
                                                                setPicked(
                                                                    slot.startAt,
                                                                )
                                                            }
                                                            className={cn(
                                                                "rounded-md border px-2.5 py-1 text-[12.5px] tabular-nums transition-colors duration-fast",
                                                                picked ===
                                                                    slot.startAt
                                                                    ? "border-foreground bg-foreground text-background"
                                                                    : "border-border hover:border-border-strong hover:bg-accent",
                                                            )}
                                                        >
                                                            {clockTime(
                                                                slot.startAt,
                                                                service?.timezone ??
                                                                    "UTC",
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {service ? (
                                    <p className="text-[11.5px] text-muted-foreground">
                                        Times in {service.timezone}, the
                                        service&apos;s own timezone. Only open
                                        times nobody has taken are shown.
                                    </p>
                                ) : null}
                            </div>

                            {pack && service && !visit ? (
                                <div
                                    className={cn(
                                        "grid gap-2.5 rounded-[10px] border px-3.5 py-3 transition-colors duration-fast",
                                        usePack
                                            ? "border-border-strong bg-foreground/[0.03]"
                                            : "border-border",
                                    )}
                                >
                                    <label className="flex cursor-pointer items-start gap-2.5">
                                        <Checkbox
                                            checked={usePack}
                                            onCheckedChange={(c) =>
                                                setUsePack(c === true)
                                            }
                                            className="mt-0.5"
                                        />
                                        <span className="grid gap-0.5">
                                            <span className="text-[13.5px] font-medium">
                                                Use their class pack
                                            </span>
                                            <span className="text-[12px] text-muted-foreground">
                                                {usePack
                                                    ? `${packOffer(pack, service.timezone)}. ${classesLeft(pack) - 1} after this booking; cancelling gives it back.`
                                                    : `${packOffer(pack, service.timezone)}. They pay another way and keep every class.`}
                                            </span>
                                        </span>
                                    </label>
                                    {usePack && usable.length > 1 ? (
                                        <OptionSelect
                                            id={ids.pack}
                                            aria-label="Which pack"
                                            value={pack.id}
                                            onValueChange={setPackId}
                                            options={usable.map((p) => ({
                                                value: p.id,
                                                label: packOffer(
                                                    p,
                                                    service.timezone,
                                                ),
                                            }))}
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                            {visit ? (
                                <p className="text-[12px] leading-[1.5] text-muted-foreground">
                                    A visit is never billed on its own: the
                                    treatment was sold once, on order #
                                    {visit.orderNumber}.
                                </p>
                            ) : paying ? null : (
                                <div className="grid gap-1.5">
                                    <div
                                        id={ids.pay}
                                        className="text-[12.5px] font-medium"
                                    >
                                        Payment
                                    </div>
                                    <div
                                        role="radiogroup"
                                        aria-labelledby={ids.pay}
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
                                    <p className="text-[12px] leading-[1.5] text-muted-foreground">
                                        {payNote(payNow)}
                                    </p>
                                </div>
                            )}
                            {packRefusal ? (
                                <p
                                    role="alert"
                                    className="rounded-[10px] border border-destructive/50 bg-destructive/10 px-3.5 py-3 text-[12.5px] leading-[1.55] text-destructive-subtle-foreground"
                                >
                                    {packRefusal}
                                </p>
                            ) : null}
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={close}
                            >
                                Close
                            </Button>
                            <Button
                                type="button"
                                disabled={!ready}
                                onClick={() => void save()}
                            >
                                {saving ? "Booking…" : "Book it"}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}

/** Slots grouped under the day they fall on in the service's own zone. */
function groupByDay(slots: Slot[], timeZone: string): [string, Slot[]][] {
    const days = new Map<string, Slot[]>();
    const label = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
    });
    for (const slot of slots) {
        const key = label.format(new Date(slot.startAt));
        const list = days.get(key);
        if (list) list.push(slot);
        else days.set(key, [slot]);
    }
    return Array.from(days.entries());
}

/** "Tue 23 Sept, 10:00", in the service's own zone. */
function dayTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}

function clockTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}
