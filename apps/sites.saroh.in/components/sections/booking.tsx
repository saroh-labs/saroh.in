"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { env } from "@/env";
import type { BookingContent } from "@/lib/publication";
import { cn } from "@/lib/utils";

import { ctaClasses } from "./cta";

/**
 * `booking` v1 — the PUBLIC booking widget (S4-003). Given `content.serviceId`
 * it fetches open slots from the guardless public availability endpoint and, on
 * submit, reserves one through the public book endpoint:
 *
 *   GET  ${NEXT_PUBLIC_API_URL}/public/services/${serviceId}/availability?from=&to=
 *   POST ${NEXT_PUBLIC_API_URL}/public/services/${serviceId}/book
 *   body: { startAt, bookerName?, bookerEmail, bookerPhone?, idempotencyKey }
 *
 * The book endpoint derives the owning organization from the Service (never from
 * this client), re-checks capacity inside a serializable transaction and creates
 * the CONFIRMED booking + CRM contact. A section with no `serviceId` (never
 * picked in the editor) renders nothing rather than hit a broken URL.
 *
 * TIMEZONE: the availability endpoint returns absolute-UTC instants only and the
 * section carries no service timezone, so slots are displayed in the VISITOR's
 * own resolved timezone (shown in the heading). Display is cosmetic — the exact
 * ISO `startAt` is what's POSTed, so the reserved instant is unambiguous on both
 * sides regardless of how it's labelled.
 *
 * `idempotencyKey` is stable per mount so a double-click / retry can't create
 * two bookings. On a 409 ("slot just taken") the slots refresh so the visitor
 * can pick another; a 429 asks them to slow down.
 */

const API_URL =
    env.NEXT_PUBLIC_API_URL ?? env.API_URL ?? "https://api.saroh.in";

/** How far ahead to offer slots. */
const WINDOW_DAYS = 14;

/** A bookable slot as returned by the public availability endpoint (UTC ISO). */
interface Slot {
    startAt: string;
    endAt: string;
}

type SubmitState =
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "error"; message: string };

type SlotsState =
    | { kind: "loading" }
    | { kind: "ready"; slots: Slot[] }
    | { kind: "error"; message: string };

/** The visitor's resolved IANA timezone, for the "times shown in …" note. */
function visitorTimezone(): string {
    try {
        return (
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            "your local time"
        );
    } catch {
        return "your local time";
    }
}

/** "YYYY-MM-DD" of an instant in the visitor's local timezone (for grouping). */
function localDateKey(iso: string): string {
    return new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(iso));
}

/** A day heading like "Mon, 21 Jul". */
function formatDayLabel(iso: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(new Date(iso));
}

/** A slot's start time like "9:00 AM". */
function formatSlotTime(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso));
}

interface DayGroup {
    key: string;
    label: string;
    slots: Slot[];
}

/** Group chronologically-sorted slots by their local calendar day. */
function groupByDay(slots: Slot[]): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const slot of slots) {
        const key = localDateKey(slot.startAt);
        const last = groups.at(-1);
        if (last?.key === key) {
            last.slots.push(slot);
        } else {
            groups.push({
                key,
                label: formatDayLabel(slot.startAt),
                slots: [slot],
            });
        }
    }
    return groups;
}

export default function BookingSection({
    content,
}: {
    content: BookingContent;
}) {
    const baseId = useId();
    // A stable idempotency key per mount so a double-click / retry can't create
    // two bookings. Lazy initializer runs exactly once.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
    );

    const [slotsState, setSlotsState] = useState<SlotsState>({
        kind: "loading",
    });
    const [selected, setSelected] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });

    const serviceId = content.serviceId;

    // Pure fetcher: resolves to the next slots state and never touches React
    // state itself, so it's safe to call from an effect (state is only ever set
    // in the resolving `.then`, never synchronously in the effect body).
    const fetchSlots = useCallback(async (): Promise<SlotsState> => {
        if (!serviceId) return { kind: "ready", slots: [] };
        const from = new Date();
        const to = new Date(from.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
        try {
            const res = await fetch(
                `${API_URL}/public/services/${encodeURIComponent(serviceId)}/availability` +
                    `?from=${encodeURIComponent(from.toISOString())}` +
                    `&to=${encodeURIComponent(to.toISOString())}`,
                { headers: { accept: "application/json" } },
            );
            if (!res.ok) {
                return {
                    kind: "error",
                    message:
                        "We couldn't load available times right now — please try again shortly.",
                };
            }
            const slots = (await res.json()) as Slot[];
            return { kind: "ready", slots };
        } catch {
            return {
                kind: "error",
                message:
                    "We couldn't reach the server — please check your connection and try again.",
            };
        }
    }, [serviceId]);

    // Apply a fetched result: set the slots state and drop a selection that's no
    // longer on offer.
    const applyResult = useCallback((next: SlotsState) => {
        setSlotsState(next);
        setSelected((prev) =>
            prev &&
            next.kind === "ready" &&
            next.slots.some((s) => s.startAt === prev)
                ? prev
                : null,
        );
    }, []);

    // Reload with a visible spinner — for the retry button and the 409 re-pick.
    // Only ever called from event handlers, so the synchronous "loading" set is
    // fine here (it is not inside an effect).
    const reload = useCallback(() => {
        setSlotsState({ kind: "loading" });
        void fetchSlots().then(applyResult);
    }, [fetchSlots, applyResult]);

    useEffect(() => {
        let active = true;
        void fetchSlots().then((next) => {
            if (active) applyResult(next);
        });
        return () => {
            active = false;
        };
    }, [fetchSlots, applyResult]);

    // No service picked → nothing to book against. Render nothing.
    if (!serviceId) return null;

    const submitting = submit.kind === "submitting";
    const timezone = visitorTimezone();

    async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!serviceId) return;
        if (!selected) {
            setSubmit({
                kind: "error",
                message: "Please choose a time first.",
            });
            return;
        }
        setSubmit({ kind: "submitting" });
        try {
            const res = await fetch(
                `${API_URL}/public/services/${encodeURIComponent(serviceId)}/book`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        startAt: selected,
                        bookerName: name.trim() || undefined,
                        bookerEmail: email.trim(),
                        bookerPhone: phone.trim() || undefined,
                        idempotencyKey,
                    }),
                },
            );

            if (res.ok) {
                setSubmit({ kind: "success" });
                return;
            }

            if (res.status === 409) {
                // Someone took this slot first — refresh and let them re-pick.
                setSelected(null);
                reload();
                setSubmit({
                    kind: "error",
                    message:
                        "That time was just taken — please choose another from the updated list.",
                });
                return;
            }

            if (res.status === 429) {
                setSubmit({
                    kind: "error",
                    message:
                        "You've tried a few times — please wait a moment and try again.",
                });
                return;
            }

            const body = (await res.json().catch(() => null)) as {
                message?: string;
            } | null;
            setSubmit({
                kind: "error",
                message:
                    body?.message ??
                    "Something went wrong — please check your details and try again.",
            });
        } catch {
            setSubmit({
                kind: "error",
                message:
                    "We couldn't reach the server — please check your connection and try again.",
            });
        }
    }

    if (submit.kind === "success") {
        return (
            <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-8 text-center dark:border-stone-700 dark:bg-stone-900">
                    <p className="text-lg font-medium text-stone-900 dark:text-white">
                        {content.successMessage ?? "You're booked!"}
                    </p>
                </div>
            </section>
        );
    }

    const groups =
        slotsState.kind === "ready" ? groupByDay(slotsState.slots) : [];

    return (
        <section className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
            {content.title ? (
                <h2 className="text-3xl font-bold tracking-tight text-stone-900 dark:text-white">
                    {content.title}
                </h2>
            ) : null}
            {content.description ? (
                <p className="mt-3 text-stone-600 dark:text-stone-300">
                    {content.description}
                </p>
            ) : null}

            {/* Slot picker */}
            <div className="mt-8">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
                        Choose a time
                    </h3>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                        Times shown in {timezone}
                    </p>
                </div>

                {slotsState.kind === "loading" ? (
                    <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
                        Loading available times…
                    </p>
                ) : slotsState.kind === "error" ? (
                    <div className="mt-4">
                        <p role="alert" className="text-sm text-red-600">
                            {slotsState.message}
                        </p>
                        <button
                            type="button"
                            onClick={reload}
                            className={cn(ctaClasses("secondary"), "mt-3")}
                        >
                            Try again
                        </button>
                    </div>
                ) : groups.length === 0 ? (
                    <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">
                        No open times in the next {WINDOW_DAYS} days — please
                        check back soon.
                    </p>
                ) : (
                    <div
                        role="radiogroup"
                        aria-label="Available times"
                        className="mt-4 grid gap-5"
                    >
                        {groups.map((group) => (
                            <div key={group.key}>
                                <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                                    {group.label}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {group.slots.map((slot) => {
                                        const active =
                                            selected === slot.startAt;
                                        return (
                                            <button
                                                key={slot.startAt}
                                                type="button"
                                                role="radio"
                                                aria-checked={active}
                                                disabled={submitting}
                                                onClick={() =>
                                                    setSelected(slot.startAt)
                                                }
                                                className={cn(
                                                    "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:opacity-60",
                                                    active
                                                        ? "border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900"
                                                        : "border-stone-300 text-stone-900 hover:bg-stone-100 dark:border-stone-700 dark:text-white dark:hover:bg-stone-800",
                                                )}
                                            >
                                                {formatSlotTime(slot.startAt)}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Booker details */}
            <form className="mt-8 grid gap-5" onSubmit={onSubmit} noValidate>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-name`}
                        className="text-sm font-medium text-stone-900 dark:text-white"
                    >
                        Name
                    </label>
                    <input
                        id={`${baseId}-name`}
                        name="name"
                        type="text"
                        value={name}
                        disabled={submitting}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
                    />
                </div>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-email`}
                        className="text-sm font-medium text-stone-900 dark:text-white"
                    >
                        Email
                        <span aria-hidden="true" className="text-red-600">
                            {" *"}
                        </span>
                    </label>
                    <input
                        id={`${baseId}-email`}
                        name="email"
                        type="email"
                        required
                        value={email}
                        disabled={submitting}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
                    />
                </div>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-phone`}
                        className="text-sm font-medium text-stone-900 dark:text-white"
                    >
                        Phone
                    </label>
                    <input
                        id={`${baseId}-phone`}
                        name="phone"
                        type="tel"
                        value={phone}
                        disabled={submitting}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full max-w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
                    />
                </div>

                {submit.kind === "error" ? (
                    <p role="alert" className="text-sm text-red-600">
                        {submit.message}
                    </p>
                ) : null}

                <button
                    type="submit"
                    disabled={submitting || !selected || !email.trim()}
                    className={cn(
                        ctaClasses("primary"),
                        "w-fit disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                >
                    {submitting
                        ? "Booking…"
                        : (content.submitLabel ?? "Confirm booking")}
                </button>
            </form>
        </section>
    );
}
