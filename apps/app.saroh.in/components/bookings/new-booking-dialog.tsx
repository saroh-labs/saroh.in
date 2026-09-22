"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Info, Plus } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { listAvailability } from "@/lib/services/actions";
import type { Slot } from "@/lib/services/service";

const WINDOW_DAYS = 14;

/**
 * "New booking" — after the CRUD Flows design: who, what, when, as one
 * dialog. Choosing the service fixes the length, so there are really two
 * things to decide.
 *
 * The times offered are REAL: the same open-slot read the reschedule dialog
 * and the public booking page use, so nothing here can offer a time the
 * service is closed or already full.
 *
 * Saving is held back, and the dialog says so. The API takes bookings only
 * from the public booking page today; a booking made by the merchant needs its
 * own endpoint (#384), and a button that pretended would be worse than one
 * that waits.
 */
export function NewBookingDialog({
    services,
    contacts,
}: {
    services: { id: string; name: string; timezone: string; minutes: number }[];
    contacts: { id: string; name: string; email: string }[];
}) {
    const [open, setOpen] = useState(false);
    const [serviceId, setServiceId] = useState(services.at(0)?.id ?? "");
    const [who, setWho] = useState<"known" | "new">(
        contacts.length > 0 ? "known" : "new",
    );
    const [contactId, setContactId] = useState(contacts.at(0)?.id ?? "");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [picked, setPicked] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<{
        serviceId: string;
        slots: Slot[];
    } | null>(null);
    const ids = {
        service: useId(),
        contact: useId(),
        name: useId(),
        email: useId(),
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
    }, [open, serviceId]);

    const byDay = service ? groupByDay(slots ?? [], service.timezone) : [];

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) setPicked(null);
            }}
        >
            <DialogTrigger asChild>
                <Button disabled={services.length === 0}>
                    <Plus className="mr-1.5 size-4" />
                    New booking
                </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                        New booking
                    </DialogTitle>
                    <DialogDescription>
                        Choosing the service sets how long it takes, so there
                        are really two things to decide: who, and when.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4">
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

                    <fieldset className="grid gap-2">
                        <legend className="mb-2 text-[12.5px] font-medium">
                            Who is it for?
                        </legend>
                        {contacts.length > 0 ? (
                            <div
                                role="radiogroup"
                                aria-label="Who is it for?"
                                className="grid grid-cols-2 gap-[5px]"
                            >
                                {(
                                    [
                                        ["known", "Someone you know"],
                                        ["new", "Someone new"],
                                    ] as const
                                ).map(([key, text]) => (
                                    <label
                                        key={key}
                                        className={cn(
                                            "flex cursor-pointer items-center justify-center rounded-[9px] border px-3 py-2 text-[13px] transition-colors duration-fast has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                                            who === key
                                                ? "border-border-strong bg-foreground/[0.03] font-semibold"
                                                : "border-muted font-medium hover:border-border-strong",
                                        )}
                                    >
                                        <input
                                            type="radio"
                                            name="booking-who"
                                            className="sr-only"
                                            checked={who === key}
                                            onChange={() => setWho(key)}
                                        />
                                        {text}
                                    </label>
                                ))}
                            </div>
                        ) : null}
                        {who === "known" ? (
                            <OptionSelect
                                id={ids.contact}
                                aria-label="Contact"
                                value={contactId}
                                onValueChange={setContactId}
                                options={contacts.map((c) => ({
                                    value: c.id,
                                    label:
                                        c.name === c.email
                                            ? c.email
                                            : `${c.name} · ${c.email}`,
                                }))}
                            />
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="grid gap-1.5">
                                    <Label htmlFor={ids.name}>Name</Label>
                                    <Input
                                        id={ids.name}
                                        value={name}
                                        placeholder="Priya Raman"
                                        onChange={(e) =>
                                            setName(e.target.value)
                                        }
                                    />
                                </div>
                                <div className="grid gap-1.5">
                                    <Label htmlFor={ids.email}>Email</Label>
                                    <Input
                                        id={ids.email}
                                        type="email"
                                        value={email}
                                        onChange={(e) =>
                                            setEmail(e.target.value)
                                        }
                                    />
                                </div>
                            </div>
                        )}
                    </fieldset>

                    <div className="grid gap-2">
                        <div className="text-[12.5px] font-medium">When?</div>
                        {slots === null ? (
                            <p className="text-[12.5px] text-muted-foreground">
                                Finding open times…
                            </p>
                        ) : byDay.length === 0 ? (
                            <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                                No open times in the next {WINDOW_DAYS} days.
                                Opening more hours on this service, under
                                Services, adds times here.
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
                                                        picked === slot.startAt
                                                    }
                                                    onClick={() =>
                                                        setPicked(slot.startAt)
                                                    }
                                                    className={cn(
                                                        "rounded-md border px-2.5 py-1 text-[12.5px] tabular-nums transition-colors duration-fast",
                                                        picked === slot.startAt
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
                                Times in {service.timezone}, the service&apos;s
                                own timezone. Only open times nobody has taken
                                are shown.
                            </p>
                        ) : null}
                    </div>

                    <p className="flex items-start gap-2 text-pretty rounded-[9px] bg-info-subtle px-3 py-2.5 text-[12px] leading-[1.5] text-info-subtle-foreground">
                        <Info
                            aria-hidden
                            className="mt-0.5 size-3.5 shrink-0"
                        />
                        Booking someone in from here is coming. Until then,
                        bookings arrive from your booking page — share its link,
                        and they appear in this list.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Close
                    </Button>
                    <Button
                        type="button"
                        disabled
                        title="Booking by hand is not available yet"
                    >
                        Book it
                    </Button>
                </DialogFooter>
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

function clockTime(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}
