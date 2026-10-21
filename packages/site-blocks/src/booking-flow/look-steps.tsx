"use client";

import type { LookId } from "@saroh/block-contract";

import { InitialsPlate } from "../blocks/no-photo";
import { lookDot, lookLink, lookRow } from "./look-styles";
import { holdBeforeText, lookGstText } from "./look-words";
import type {
    BookingPerson,
    BookingService,
    BookPay,
    PayChoice,
} from "./model";
import { servicePickPrice } from "./model";
import type { Times } from "./use-times";

/**
 * The steps' contents in a look's frames (DEC-172, U10): what, who, your
 * details (with the code inside) and how to pay. When is the shared
 * `WhenBody`. Each is a real control — radios in a radiogroup, labelled
 * fields — 44px or more under a finger, drawn from `--site-*` only. The
 * frame around them is `frames/*`; the words they share are
 * `look-words.ts`.
 */

/** A row's dot: a ring, filled when chosen. */
function Dot({ on }: { on: boolean }) {
    return (
        <span aria-hidden="true" className={lookDot(on)}>
            {on ? <span className="bg-site-fg size-2.5 rounded-full" /> : null}
        </span>
    );
}

/** "60 min · with Meera", short: the line under a service's name. */
export function serviceShort(service: BookingService): string {
    const parts = [`${service.durationMinutes} min`];
    if (service.staff.length === 1) parts.push(`with ${service.staff[0]}`);
    else if (service.staff.length > 1) parts.push("any teacher");
    return parts.join(" · ");
}

// ── What ────────────────────────────────────────────────────────────────

export function LookWhat({
    services,
    serviceId,
    onPick,
}: {
    services: BookingService[];
    serviceId: string | null;
    onPick: (id: string) => void;
}) {
    const groups: { title: string; list: BookingService[] }[] = [
        {
            title: "Classes",
            list: services.filter((s) => s.kind === "class"),
        },
        {
            title: "One to one",
            list: services.filter((s) => s.kind === "one"),
        },
    ].filter((g) => g.list.length > 0);
    const titled = groups.length > 1;
    return (
        <div
            role="radiogroup"
            aria-label="What would you like to book?"
            className="grid gap-5"
        >
            {groups.map((group) => (
                <div key={group.title} className="grid gap-2">
                    {titled ? (
                        <p className="text-site-muted text-[12.5px] font-semibold uppercase tracking-[0.1em]">
                            {group.title}
                        </p>
                    ) : null}
                    {group.list.map((s) => {
                        const on = s.id === serviceId;
                        const price = servicePickPrice(s);
                        return (
                            <button
                                key={s.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                onClick={() => onPick(s.id)}
                                className={lookRow(on)}
                            >
                                <Dot on={on} />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15.5px] font-semibold">
                                        {s.name}
                                    </span>
                                    <span className="text-site-body mt-0.5 block text-[13.5px]">
                                        {serviceShort(s)}
                                    </span>
                                    {on && s.description?.trim() ? (
                                        <span className="text-site-body mt-1.5 block whitespace-pre-line text-sm leading-normal [overflow-wrap:anywhere]">
                                            {s.description.trim()}
                                        </span>
                                    ) : null}
                                </span>
                                {price ? (
                                    <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
                                        {price}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

// ── Who ─────────────────────────────────────────────────────────────────

/**
 * Anyone free, first and chosen until a person is picked, then each person
 * who takes it: initials, a name (what the team record holds; a photo and
 * each person's next free time are Phase 2).
 */
export function LookWho({
    look,
    times,
    person,
    earliest,
    onPick,
    onRetry,
}: {
    look: LookId;
    times: Times;
    person: string | null;
    /** "Earliest: Wed 21 Oct, 7 am" for Anyone free, once times are read. */
    earliest: string | null;
    onPick: (id: string | null) => void;
    onRetry: () => void;
}) {
    const { daysState } = times;
    const people: BookingPerson[] = times.days?.staff ?? [];
    if (daysState.kind === "loading" && people.length === 0) {
        return (
            <div
                role="status"
                aria-label="Loading who takes it"
                className="grid gap-2"
            >
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="rounded-site-s h-14 bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-bg)))]"
                    />
                ))}
            </div>
        );
    }
    if (daysState.kind === "error") {
        return (
            <div>
                <p role="alert" className="text-site-fg text-[15px]">
                    We couldn&apos;t load who&apos;s free. Please try again.
                </p>
                <button type="button" onClick={onRetry} className={lookLink}>
                    Try again
                </button>
            </div>
        );
    }
    return (
        <div
            role="radiogroup"
            aria-label="Who would you like?"
            className="grid gap-2"
        >
            <button
                type="button"
                role="radio"
                aria-checked={person === null}
                onClick={() => onPick(null)}
                className={lookRow(person === null)}
            >
                <Dot on={person === null} />
                <span className="min-w-0 flex-1">
                    <span className="block text-[15.5px] font-semibold">
                        Anyone free
                    </span>
                    <span className="text-site-body mt-0.5 block text-[13.5px]">
                        {earliest ?? "The earliest time with whoever is free"}
                    </span>
                </span>
            </button>
            {people.map((p) => {
                const on = person === p.id;
                return (
                    <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onPick(p.id)}
                        className={lookRow(on)}
                    >
                        <Dot on={on} />
                        <InitialsPlate
                            name={p.name}
                            look={look}
                            className="size-10 text-[15px]"
                        />
                        <span className="min-w-0 flex-1 text-[15.5px] font-semibold">
                            {p.name}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ── How to pay ──────────────────────────────────────────────────────────

export function LookPay({
    choices,
    pay,
    onPick,
    service,
    time,
    rules,
}: {
    choices: PayChoice[];
    pay: BookPay;
    onPick: (pay: BookPay) => void;
    service: BookingService | null;
    /** "8 am", for the hold's sentence. */
    time: string;
    /** The business's rules, as the summary says them. */
    rules: string;
}) {
    const gst = choices.some((c) => c.pay !== "CREDIT")
        ? lookGstText(service)
        : null;
    const holds = choices.some((c) => c.pay === "NOW" || c.pay === "DEPOSIT");
    return (
        <div>
            <div
                role="radiogroup"
                aria-label="How would you like to pay?"
                className="grid gap-2"
            >
                {choices.map((choice) => {
                    const on = choice.pay === pay;
                    return (
                        <button
                            key={choice.pay}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => onPick(choice.pay)}
                            className={lookRow(on)}
                        >
                            <Dot on={on} />
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15.5px] font-semibold">
                                    {choice.label}
                                </span>
                                <span className="text-site-body mt-0.5 block text-[13.5px]">
                                    {choice.sub}
                                </span>
                            </span>
                            {choice.tag ? (
                                <span className="bg-site-accent text-site-accent-fg rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                    {choice.tag}
                                </span>
                            ) : (
                                <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
                                    {choice.amount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            {gst ? (
                <p
                    data-booking-gst=""
                    className="text-site-body mt-3 text-[13.5px]"
                >
                    {gst}
                </p>
            ) : null}
            {holds && time ? (
                <p className="text-site-body mt-3 text-[13.5px] leading-normal">
                    {holdBeforeText(time)}
                </p>
            ) : null}
            {rules ? (
                <p className="text-site-body mt-3 text-[13.5px] leading-normal">
                    {rules}
                </p>
            ) : null}
        </div>
    );
}
