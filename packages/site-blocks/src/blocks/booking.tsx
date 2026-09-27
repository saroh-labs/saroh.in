"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedBooking } from "@saroh/block-contract";
import { cn } from "../lib/utils";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { ctaClasses } from "./cta";

/**
 * `booking` v1 — a service's next free times on a page (S4-003), and the way
 * to the site's booking page to book one. Given `content.serviceId` it reads
 * open slots from the guardless public availability endpoint:
 *
 *   GET  ${NEXT_PUBLIC_API_URL}/public/services/${serviceId}/availability?from=&to=
 *
 * It books nothing itself. Sign-in is always on (A9, ADR-011): a customer
 * books on the booking page (`/book?service=`), where they confirm their
 * email with a code at the last step. The details form this block used to
 * draw — name, email, phone, posted to the anonymous book route — is gone,
 * so no page on a merchant's site asks a guest for details. The section's
 * `submitLabel` and `successMessage` are no longer drawn.
 *
 * A section with no `serviceId` (never picked in the editor) renders nothing
 * rather than hit a broken URL.
 *
 * TIMEZONE: the availability endpoint returns absolute-UTC instants only and the
 * section carries no service timezone, so slots are displayed in the VISITOR's
 * own resolved timezone (shown in the heading).
 *
 * A 404 or 410 on availability means the service is gone, archived, or its
 * business switched Appointments off — retrying cannot help, so the section
 * says booking isn't open and offers no retry. Any other failure keeps the
 * error and its Try again.
 */

/** How far ahead to offer slots. */
const WINDOW_DAYS = 14;

/** A bookable slot as returned by the public availability endpoint (UTC ISO). */
export interface Slot {
    startAt: string;
    endAt: string;
}

/**
 * Narrow the availability response instead of casting it (#264). A 200 in the
 * wrong shape used to reach `groupByDay` and throw during render, taking the
 * merchant's page down with it; now it lands in the same error state as a
 * failed request. `null` means "not a list of slots".
 */
function parseSlots(value: unknown): Slot[] | null {
    if (!Array.isArray(value)) return null;
    const slots: Slot[] = [];
    for (const item of value) {
        if (typeof item !== "object" || item === null) return null;
        const { startAt, endAt } = item as Record<string, unknown>;
        if (typeof startAt !== "string" || typeof endAt !== "string") {
            return null;
        }
        // The formatters below throw a RangeError on an invalid date.
        if (Number.isNaN(Date.parse(startAt))) return null;
        slots.push({ startAt, endAt });
    }
    return slots;
}

type SlotsState =
    | { kind: "loading" }
    | { kind: "ready"; slots: Slot[] }
    /** 404/410: the service can't be booked online. Retrying won't change it. */
    | { kind: "closed" }
    | { kind: "error"; message: string };

/** The visitor's resolved IANA timezone, for the "times shown in …"note. */
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
    apiUrl = DEFAULT_API_URL,
    slots: givenSlots,
    bookHref,
}: {
    content: RenderedBooking;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /**
     * The site's booking page (U19), on a live site only — a preview has no
     * `/book`, so the link is drawn but goes nowhere there.
     */
    bookHref?: string;
    /**
     * Sample slots to draw instead of fetching (previews, #267). A fixture's
     * Service id belongs to no Service, and a picker thumbnail must not show a
     * healthy block as broken because a request it never needed failed.
     */
    slots?: Slot[];
}) {
    const [slotsState, setSlotsState] = useState<SlotsState>(
        givenSlots ? { kind: "ready", slots: givenSlots } : { kind: "loading" },
    );

    const serviceId = content.serviceId;

    // Pure fetcher: resolves to the next slots state and never touches React
    // state itself, so it's safe to call from an effect (state is only ever set
    // in the resolving `.then`, never synchronously in the effect body).
    const fetchSlots = useCallback(async (): Promise<SlotsState> => {
        if (!serviceId) return { kind: "ready", slots: [] };
        const from = new Date();
        const to = new Date(from.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const couldNotLoad: SlotsState = {
            kind: "error",
            message:
                "We couldn't load available times right now — please try again shortly.",
        };
        try {
            const res = await fetch(
                `${apiUrl}/public/services/${encodeURIComponent(serviceId)}/availability` +
                    `?from=${encodeURIComponent(from.toISOString())}` +
                    `&to=${encodeURIComponent(to.toISOString())}`,
                { headers: { accept: "application/json" } },
            );
            if (!res.ok) {
                // A 404 or 410 means booking is closed (the service is gone
                // or the business switched Appointments off); retrying cannot
                // help, so it is not an error state.
                if (res.status === 404 || res.status === 410) {
                    return { kind: "closed" };
                }
                return couldNotLoad;
            }
            // The server answered, so a body that isn't JSON or isn't a list
            // of slots is "couldn't load times", not "couldn't reach".
            const body: unknown = await res.json().catch(() => null);
            const slots = parseSlots(body);
            return slots ? { kind: "ready", slots } : couldNotLoad;
        } catch {
            return {
                kind: "error",
                message:
                    "We couldn't reach the server — please check your connection and try again.",
            };
        }
    }, [serviceId, apiUrl]);

    // Reload with a visible spinner, for Try again. Only ever called from an
    // event handler, so the synchronous "loading" set is fine here.
    const reload = useCallback(() => {
        setSlotsState({ kind: "loading" });
        void fetchSlots().then(setSlotsState);
    }, [fetchSlots]);

    useEffect(() => {
        if (givenSlots) return;
        let active = true;
        void fetchSlots().then((next) => {
            if (active) setSlotsState(next);
        });
        return () => {
            active = false;
        };
    }, [givenSlots, fetchSlots]);

    // No service picked → nothing to book against. Render nothing.
    if (!serviceId) return null;

    const timezone = visitorTimezone();
    const groups =
        slotsState.kind === "ready" ? groupByDay(slotsState.slots) : [];
    const bookUrl = bookHref
        ? `${bookHref}?service=${encodeURIComponent(serviceId)}`
        : undefined;

    return (
        <section className="mx-auto w-full max-w-2xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.title ? (
                <h2 className="text-site-fg text-3xl font-bold tracking-tight">
                    {content.title}
                </h2>
            ) : null}
            {content.description ? (
                <p className="text-site-body mt-3">{content.description}</p>
            ) : null}

            {/* The next free times, at a glance. */}
            <div className="mt-8">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-site-fg text-sm font-semibold">
                        Next free times
                    </h3>
                    <p className="text-site-muted text-xs">
                        Times shown in {timezone}
                    </p>
                </div>

                {slotsState.kind === "loading" ? (
                    <p className="text-site-muted mt-4 text-sm">
                        Loading available times…
                    </p>
                ) : slotsState.kind === "closed" ? (
                    <p className="text-site-muted mt-4 text-sm">
                        Online booking isn't open right now — please contact the
                        business directly.
                    </p>
                ) : slotsState.kind === "error" ? (
                    <div className="mt-4">
                        <p role="alert" className={destructiveAlertClasses}>
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
                    <p className="text-site-muted mt-4 text-sm">
                        No open times in the next {WINDOW_DAYS} days — please
                        check back soon.
                    </p>
                ) : (
                    <ul className="mt-4 grid gap-[var(--site-grid-gap)]">
                        {groups.map((group) => (
                            <li key={group.key}>
                                <p className="text-site-muted text-xs font-medium uppercase tracking-wide">
                                    {group.label}
                                </p>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {group.slots.map((slot) => (
                                        <li
                                            key={slot.startAt}
                                            className="border-site-border text-site-fg rounded-[var(--site-radius)] border px-3 py-1.5 text-sm"
                                        >
                                            {formatSlotTime(slot.startAt)}
                                        </li>
                                    ))}
                                </ul>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Booking happens on the booking page, signed in (A9): pick a
                time there, and confirm your email with a code. */}
            {slotsState.kind === "closed" ? null : (
                <div className="mt-8">
                    <a
                        href={bookUrl}
                        aria-disabled={bookUrl ? undefined : true}
                        className={cn(
                            ctaClasses("primary"),
                            "w-fit",
                            !bookUrl && "pointer-events-none",
                        )}
                    >
                        Book a time
                    </a>
                    <p className="text-site-muted mt-2 text-xs">
                        You&apos;ll pick your time and confirm your email with a
                        code.
                    </p>
                </div>
            )}
        </section>
    );
}
