"use client";

import type { LookId } from "@saroh/block-contract";

import type { ReactNode } from "react";

import { InitialsPlate } from "../blocks/no-photo";
import { LookIcon } from "../look-icons";
import { LOOK_CHOICE, lookLink } from "./look-styles";
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

/**
 * One choice, as the look's board draws it (`LOOK_CHOICE`): its mark (a
 * radio first or last, or Folio's arrow), what it is, and what it costs.
 */
function Choice({
    look,
    on,
    onPick,
    lead,
    children,
    end,
}: {
    look: LookId;
    on: boolean;
    onPick: () => void;
    /** Drawn before the words: a person's initials. */
    lead?: ReactNode;
    children: ReactNode;
    /** The price or a tag, before an end mark. */
    end?: ReactNode;
}) {
    const style = LOOK_CHOICE[look];
    const dot = <span aria-hidden="true" className={style.dot(on)} />;
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            onClick={onPick}
            className={style.row(on)}
        >
            {style.mark === "start" ? dot : null}
            {lead}
            <span className="min-w-0 flex-1">{children}</span>
            {end}
            {style.mark === "end" ? dot : null}
            {style.mark === "arrow" ? (
                <LookIcon name="arrow" look={look} size={16} />
            ) : null}
        </button>
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
    look,
    services,
    serviceId,
    onPick,
}: {
    look: LookId;
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
    const style = LOOK_CHOICE[look];
    return (
        <div
            role="radiogroup"
            aria-label="What would you like to book?"
            className="grid gap-5"
        >
            {groups.map((group) => (
                <div key={group.title} className={style.list}>
                    {titled ? (
                        <p className={style.label}>{group.title}</p>
                    ) : null}
                    {group.list.map((s) => {
                        const on = s.id === serviceId;
                        const price = servicePickPrice(s);
                        return (
                            <Choice
                                key={s.id}
                                look={look}
                                on={on}
                                onPick={() => onPick(s.id)}
                                end={
                                    price ? (
                                        <span className={style.price}>
                                            {price}
                                        </span>
                                    ) : null
                                }
                            >
                                <span className={style.name}>{s.name}</span>
                                <span className={style.meta}>
                                    {serviceShort(s)}
                                </span>
                                {on && s.description?.trim() ? (
                                    <span className="text-site-body mt-1.5 block whitespace-pre-line text-sm leading-normal [overflow-wrap:anywhere]">
                                        {s.description.trim()}
                                    </span>
                                ) : null}
                            </Choice>
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
    const style = LOOK_CHOICE[look];
    return (
        <div
            role="radiogroup"
            aria-label="Who would you like?"
            className={style.list}
        >
            <Choice
                look={look}
                on={person === null}
                onPick={() => onPick(null)}
            >
                <span className={style.name}>Anyone free</span>
                <span className={style.meta}>
                    {earliest ?? "The earliest time with whoever is free"}
                </span>
            </Choice>
            {people.map((p) => (
                <Choice
                    key={p.id}
                    look={look}
                    on={person === p.id}
                    onPick={() => onPick(p.id)}
                    lead={
                        <InitialsPlate
                            name={p.name}
                            look={look}
                            className="size-10 text-[15px]"
                        />
                    }
                >
                    <span className={style.name}>{p.name}</span>
                </Choice>
            ))}
        </div>
    );
}

// ── How to pay ──────────────────────────────────────────────────────────

export function LookPay({
    look,
    choices,
    pay,
    onPick,
    service,
    time,
    rules,
}: {
    look: LookId;
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
    const style = LOOK_CHOICE[look];
    return (
        <div>
            <div
                role="radiogroup"
                aria-label="How would you like to pay?"
                className={style.list}
            >
                {choices.map((choice) => (
                    <Choice
                        key={choice.pay}
                        look={look}
                        on={choice.pay === pay}
                        onPick={() => onPick(choice.pay)}
                        end={
                            choice.tag ? (
                                <span className="bg-site-accent text-site-accent-fg rounded-full px-2.5 py-0.5 text-xs font-semibold">
                                    {choice.tag}
                                </span>
                            ) : (
                                <span className={style.price}>
                                    {choice.amount}
                                </span>
                            )
                        }
                    >
                        <span className={style.name}>{choice.label}</span>
                        <span className={style.meta}>{choice.sub}</span>
                    </Choice>
                ))}
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
