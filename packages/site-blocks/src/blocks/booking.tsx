"use client";

import { useCallback, useEffect, useState } from "react";

import type { RenderedBooking } from "@saroh/block-contract";
import { cn } from "../lib/utils";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { daysUrl } from "../booking-flow/api";
import { zoneName } from "../booking-flow/flow-helpers";
import {
    dateIn,
    dateText,
    DAYS_WINDOW,
    isBookingDays,
    timeIn,
} from "../booking-flow/model";
import { useQrSource, withQrSource } from "../qr-source";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import { ctaClasses } from "./cta";

/**
 * `booking` v1 — a service's next free times on a page (S4-003), each one a
 * link straight into the site's booking page with that service, day and
 * time chosen. Given `content.serviceId` it reads the very days the booking
 * page draws its times from, so a time shown here is one that page offers:
 *
 *   GET  ${NEXT_PUBLIC_API_URL}/public/services/${serviceId}/days
 *
 * It books nothing itself. Sign-in is always on (A9, ADR-011): a customer
 * books on the booking page (`/book?service=&date=&start=`), where they
 * confirm their email with a code at the last step. The details form this
 * block used to draw — name, email, phone, posted to the anonymous book
 * route — is gone, so no page on a merchant's site asks a guest for
 * details. The section's `submitLabel` and `successMessage` are no longer
 * drawn.
 *
 * A section with no `serviceId` (never picked in the editor) renders nothing
 * rather than hit a broken URL.
 *
 * TIMEZONE: times are the business's own, as the booking page's are, and
 * the heading says which. A link names the day and the time on the wall
 * there, which is what the booking page opens on. (Sample slots, in a
 * preview, are drawn in the visitor's zone and link nowhere.)
 *
 * A 404 or 410 means the service is gone, archived, or its business
 * switched Appointments off — retrying cannot help, so the section says
 * booking isn't open and offers no retry. Any other failure keeps the error
 * and its Try again. With nothing free, or booking closed, it offers a
 * call and a WhatsApp message where the business has them (`reach`).
 */

/** A free time (UTC ISO): a sample for a preview, or one of the days read's. */
export interface Slot {
    startAt: string;
    endAt: string;
}

type SlotsState =
    | { kind: "loading" }
    /** `zone` is the business's; null for sample slots (the visitor's). */
    | { kind: "ready"; slots: Slot[]; zone: string | null }
    /** 404/410: the service can't be booked online. Retrying won't change it. */
    | { kind: "closed" }
    | { kind: "error"; message: string };

/** The visitor's resolved IANA timezone, for sample slots. */
function visitorTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
}

interface DayGroup {
    key: string;
    label: string;
    slots: Slot[];
}

/** Group chronologically-sorted slots by their calendar day in `zone`. */
function groupByDay(slots: Slot[], zone: string): DayGroup[] {
    const groups: DayGroup[] = [];
    for (const slot of slots) {
        const key = dateIn(slot.startAt, zone);
        const last = groups.at(-1);
        if (last?.key === key) {
            last.slots.push(slot);
        } else {
            groups.push({ key, label: dateText(key, true), slots: [slot] });
        }
    }
    return groups;
}

const NOT_LOADED =
    "We couldn't load available times right now. Please try again shortly.";

export default function BookingSection({
    content,
    apiUrl = DEFAULT_API_URL,
    slots: givenSlots,
    bookHref,
    reach = null,
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
    /**
     * How to reach the business (the public contact read), for when no
     * time is free or booking is closed. Null draws no link.
     */
    reach?: BusinessReach | null;
}) {
    // On a page a QR code's scan opened, the link to the booking page
    // carries the scan's tag on (`qr-source.ts`).
    const source = useQrSource();
    const [slotsState, setSlotsState] = useState<SlotsState>(
        givenSlots
            ? { kind: "ready", slots: givenSlots, zone: null }
            : { kind: "loading" },
    );

    const serviceId = content.serviceId;

    // Pure fetcher: resolves to the next slots state and never touches React
    // state itself, so it's safe to call from an effect (state is only ever set
    // in the resolving `.then`, never synchronously in the effect body).
    const fetchSlots = useCallback(async (): Promise<SlotsState> => {
        if (!serviceId) return { kind: "ready", slots: [], zone: null };
        const couldNotLoad: SlotsState = {
            kind: "error",
            message: NOT_LOADED,
        };
        try {
            const res = await fetch(daysUrl(apiUrl, serviceId), {
                headers: { accept: "application/json" },
            });
            if (!res.ok) {
                // A 404 or 410 means booking is closed (the service is gone
                // or the business switched Appointments off); retrying cannot
                // help, so it is not an error state.
                if (res.status === 404 || res.status === 410) {
                    return { kind: "closed" };
                }
                return couldNotLoad;
            }
            // The server answered, so a body that isn't JSON or isn't the
            // days read is "couldn't load times", not "couldn't reach".
            // Narrowed, never cast (#264): a 200 in the wrong shape lands
            // in the error state rather than throwing during render.
            const body: unknown = await res.json().catch(() => null);
            if (!isBookingDays(body)) return couldNotLoad;
            return {
                kind: "ready",
                zone: body.timezone,
                // A class lists its full sessions too; only one with a
                // place left is a time to offer here.
                slots: body.days
                    .flatMap((day) => day.starts)
                    .filter(
                        (start) =>
                            start.placesLeft === null || start.placesLeft > 0,
                    )
                    .map(({ startAt, endAt }) => ({ startAt, endAt })),
            };
        } catch {
            return {
                kind: "error",
                message:
                    "We couldn't reach the server. Please check your connection and try again.",
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

    const zone =
        slotsState.kind === "ready"
            ? (slotsState.zone ?? visitorTimezone())
            : null;
    const groups =
        slotsState.kind === "ready" && zone
            ? groupByDay(slotsState.slots, zone)
            : [];
    const bookUrl = bookHref
        ? withQrSource(
              `${bookHref}?service=${encodeURIComponent(serviceId)}`,
              source,
          )
        : undefined;
    // One time's own address on the booking page: its day and its time on
    // the wall in the business's zone, which is what that page opens on.
    // Only for the business's own times, and only where there is a page.
    const timeUrl = (slot: Slot): string | undefined =>
        bookHref && slotsState.kind === "ready" && slotsState.zone
            ? withQrSource(
                  `${bookHref}?service=${encodeURIComponent(serviceId)}` +
                      `&date=${dateIn(slot.startAt, slotsState.zone)}` +
                      `&start=${encodeURIComponent(timeIn(slot.startAt, slotsState.zone))}`,
                  source,
              )
            : undefined;
    const chip =
        "border-site-border text-site-fg coarse:min-h-11 inline-flex min-h-9 items-center rounded-[var(--site-radius)] border px-3 text-sm tabular-nums";

    return (
        <section className="mx-auto w-full max-w-2xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
            {content.title ? (
                <h2
                    data-site-title=""
                    className="font-site-heading text-site-fg text-3xl font-bold tracking-tight"
                >
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
                    {zone ? (
                        <p className="text-site-muted text-xs">
                            Times are in {zoneName(zone)}
                        </p>
                    ) : null}
                </div>

                {slotsState.kind === "loading" ? (
                    <p className="text-site-muted mt-4 text-sm">
                        Loading available times…
                    </p>
                ) : slotsState.kind === "closed" ? (
                    <div className="mt-4">
                        <p className="text-site-body text-sm">
                            Online booking isn&apos;t open right now. Please get
                            in touch to book.
                        </p>
                        <ReachLinks reach={reach} className="mt-1" />
                    </div>
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
                    <div className="mt-4">
                        <p className="text-site-body text-sm">
                            Nothing free in the next {DAYS_WINDOW} days. Get in
                            touch and we&apos;ll find you a time.
                        </p>
                        <ReachLinks reach={reach} className="mt-1" />
                    </div>
                ) : (
                    <ul className="mt-4 grid gap-[var(--site-grid-gap)]">
                        {groups.map((group) => (
                            <li key={group.key}>
                                <p className="text-site-muted text-xs font-medium uppercase tracking-wide">
                                    {group.label}
                                </p>
                                <ul className="mt-2 flex flex-wrap gap-2">
                                    {group.slots.map((slot) => {
                                        const time = timeIn(
                                            slot.startAt,
                                            zone ?? "UTC",
                                        );
                                        const href = timeUrl(slot);
                                        return (
                                            <li key={slot.startAt}>
                                                {href ? (
                                                    <a
                                                        href={href}
                                                        aria-label={`Book ${group.label} at ${time}`}
                                                        className={cn(
                                                            chip,
                                                            "hover:border-site-fg focus-visible:ring-site-fg focus-visible:ring-offset-site-bg active:bg-site-surface cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                                                        )}
                                                    >
                                                        {time}
                                                    </a>
                                                ) : (
                                                    <span className={chip}>
                                                        {time}
                                                    </span>
                                                )}
                                            </li>
                                        );
                                    })}
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
                    <p className="text-site-body mt-2 text-sm">
                        You&apos;ll pick your time and confirm your email with a
                        code.
                    </p>
                </div>
            )}
        </section>
    );
}
