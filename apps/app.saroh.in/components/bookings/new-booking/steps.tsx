"use client";

import { Button } from "@saroh/ui/button";
import { Calendar } from "@saroh/ui/calendar";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";

import { ChipGroup, RadioCards } from "@/components/shared/fields/choice-group";
import { initialsOf } from "@/lib/customers/picker";
import type { LocalDate } from "@/lib/services/diary";
import type { FlowPerson, FlowService } from "@/lib/services/new-booking";
import { isClass } from "@/lib/services/new-booking";

/** "Anyone free" on With: no one person. */
export const ANYONE = "__anyone";

/** "45 min · one person", "60 min · group class, 8 places". */
export function serviceSub(s: FlowService): string {
    return isClass(s)
        ? `${s.minutes} min · group class, ${s.capacity} places`
        : `${s.minutes} min · one person`;
}

/**
 * Step 2, "What are they booking?" (BKMNewBookingStep2): the services the
 * team can book, each with how long and for how many, and its price for
 * someone who sees money. None at all is "Add a service first" with the
 * way to add one, never a greyed button (BA-18); services that only
 * customers book (Q5) are left off, and when that is all of them it says
 * so with the way to change it.
 */
export function ServiceStep({
    services,
    hidden,
    value,
    onChange,
    price,
    invalid,
}: {
    services: readonly FlowService[];
    /** Services the team can't book: only customers do, online. */
    hidden: number;
    value: string | null;
    onChange: (id: string) => void;
    /** The price in words, or null to leave it off. */
    price: (s: FlowService) => string | null;
    invalid: boolean;
}) {
    if (services.length === 0) {
        const none = hidden === 0;
        return (
            <div className="grid justify-items-center gap-2 rounded-[12px] border border-border bg-card px-5 py-6 text-center">
                <h4 className="font-display text-[18px] font-semibold">
                    {none
                        ? "Add a service first"
                        : "No service your team can book"}
                </h4>
                <p className="max-w-[44ch] text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                    {none
                        ? "A booking is always for a service, like a 45-minute assessment. Add one and come back."
                        : "Your services are booked by customers, on your booking page. Tick Your team under Who can book it on a service to book it here."}
                </p>
                <Button asChild className="mt-1.5">
                    <Link href={none ? "/services/new" : "/services"}>
                        {none ? "Add a service" : "Open Services"}
                    </Link>
                </Button>
            </div>
        );
    }
    return (
        <RadioCards
            label="Service"
            value={value}
            onChange={onChange}
            invalid={invalid && !value}
            className="min-[760px]:grid-cols-2"
            rowClassName="min-h-16 gap-3 rounded-[12px] px-3.5 py-2.5 has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
            options={services.map((s) => {
                const amount = price(s);
                return {
                    value: s.id,
                    label: (
                        <span className="text-[14.5px] font-semibold">
                            {s.name}
                        </span>
                    ),
                    note: serviceSub(s),
                    aside: amount ? (
                        <span className="font-display font-semibold text-foreground">
                            {amount}
                        </span>
                    ) : undefined,
                };
            })}
        />
    );
}

/**
 * Step 3, "Who will they see?" (BKMNewBookingStep3): Anyone free first,
 * then only the people who do the service, each with their title and when
 * they are next free.
 */
export function WithStep({
    service,
    people,
    value,
    onChange,
    nextFree,
}: {
    service: FlowService;
    people: readonly FlowPerson[];
    /** The person, or null for Anyone free. */
    value: string | null;
    onChange: (id: string | null) => void;
    /** "next free today, 12:15 pm", by person id; null for Anyone. */
    nextFree: (id: string | null) => string | null;
}) {
    const row = (
        initials: string,
        name: string,
        sub: string | null,
        ink = false,
    ) => (
        <span className="flex min-w-0 items-center gap-3">
            <span
                aria-hidden
                className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold",
                    ink
                        ? "bg-foreground text-background"
                        : "bg-muted text-foreground",
                )}
            >
                {initials}
            </span>
            <span className="grid min-w-0">
                <span className="truncate text-[14.5px] font-semibold">
                    {name}
                </span>
                {sub ? (
                    <span className="text-[12.5px] font-normal text-muted-foreground">
                        {sub}
                    </span>
                ) : null}
            </span>
        </span>
    );
    return (
        <div className="grid min-w-0 gap-2">
            <RadioCards
                label="Who they'll see"
                value={value ?? ANYONE}
                onChange={(v) => onChange(v === ANYONE ? null : v)}
                rowClassName="min-h-16 rounded-[12px] px-3.5 py-2.5 has-[[data-state=checked]]:shadow-[inset_0_0_0_1px_hsl(var(--foreground))]"
                options={[
                    {
                        value: ANYONE,
                        label: row(
                            "AF",
                            "Anyone free",
                            "Whoever is free at the time you pick",
                            true,
                        ),
                    },
                    ...people.map((p) => {
                        const free = nextFree(p.id);
                        return {
                            value: p.id,
                            label: row(
                                initialsOf(p.name),
                                p.name,
                                [p.title, free].filter(Boolean).join(" · ") ||
                                    null,
                            ),
                        };
                    }),
                ]}
            />
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                Only people who do {service.name} are shown.
            </p>
        </div>
    );
}

/** One row of the check card: Who, What, With, When, and Change. */
export interface CheckRow {
    key: string;
    value: string;
    sub: string | null;
    /** Missing: the value is said in the error's colour. */
    missing?: boolean;
    onChange: () => void;
}

/**
 * Step 5's check card (BKMNewBookingStep5): what will be booked, each line
 * with Change, which jumps back to its step.
 */
export function CheckCard({ rows }: { rows: readonly CheckRow[] }) {
    return (
        <dl className="grid min-w-0 overflow-hidden rounded-[12px] border border-border bg-card px-3.5">
            {rows.map((r) => (
                <div
                    key={r.key}
                    className="flex min-h-14 min-w-0 items-center gap-3 border-b border-border py-2 last:border-b-0"
                >
                    <dt className="w-11 shrink-0 text-[12.5px] text-muted-foreground min-[760px]:w-[60px]">
                        {r.key}
                    </dt>
                    <dd className="grid min-w-0 flex-1">
                        <span
                            data-ph-mask=""
                            className={cn(
                                "truncate text-[14.5px] font-semibold",
                                r.missing &&
                                    "text-destructive-subtle-foreground",
                            )}
                        >
                            {r.value}
                        </span>
                        {r.sub ? (
                            <span
                                data-ph-mask=""
                                className="truncate text-[12.5px] text-muted-foreground"
                            >
                                {r.sub}
                            </span>
                        ) : null}
                    </dd>
                    <Button
                        type="button"
                        variant="link"
                        size="inline"
                        aria-label={`Change ${r.key.toLowerCase()}`}
                        className="min-h-11 shrink-0 font-semibold text-foreground underline decoration-border-strong underline-offset-4"
                        onClick={r.onChange}
                    >
                        Change
                    </Button>
                </div>
            ))}
        </dl>
    );
}

/**
 * Book their next visit's day (BKMNextVisit, Q16): the service and person
 * are kept and no day is chosen; Tomorrow, Next week, or Pick a date with
 * the month. The day's times follow, from the one time picker.
 */
export function NextVisitDay({
    quick,
    picked,
    choice,
    onChoice,
    onPickDate,
    today,
    children,
}: {
    quick: readonly {
        key: "tomorrow" | "week";
        date: LocalDate;
        label: string;
    }[];
    /** The day chosen, or null for none yet. */
    picked: LocalDate | null;
    choice: "tomorrow" | "week" | "pick" | null;
    onChoice: (choice: "tomorrow" | "week" | "pick") => void;
    onPickDate: (date: LocalDate) => void;
    today: LocalDate;
    /** The chosen day's times. */
    children: ReactNode;
}) {
    const id = useId();
    return (
        <div className="grid min-w-0 gap-3">
            <span id={id} className="sr-only">
                Which day
            </span>
            <ChipGroup
                labelledBy={id}
                value={choice}
                onChange={onChoice}
                choices={[
                    ...quick.map((q) => ({ value: q.key, label: q.label })),
                    { value: "pick", label: "Pick a date" },
                ]}
            />
            {choice === null ? (
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    Same service and person as today. Pick a day, as soon as
                    tomorrow. You can change the service or person above.
                </p>
            ) : null}
            {choice === "pick" ? (
                <div className="w-fit rounded-[12px] border border-border bg-card p-1">
                    <Calendar
                        mode="single"
                        selected={
                            picked ? new Date(`${picked}T12:00:00Z`) : undefined
                        }
                        disabled={{ before: new Date(`${today}T12:00:00Z`) }}
                        onSelect={(day) => {
                            if (!day) return;
                            const y = day.getFullYear();
                            const m = String(day.getMonth() + 1).padStart(
                                2,
                                "0",
                            );
                            const d = String(day.getDate()).padStart(2, "0");
                            onPickDate(`${y}-${m}-${d}`);
                        }}
                    />
                </div>
            ) : null}
            {picked ? children : null}
        </div>
    );
}
