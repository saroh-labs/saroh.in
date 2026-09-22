"use client";

import { useCallback, useEffect, useId, useState } from "react";

import type { RenderedBooking } from "@saroh/block-contract";
import { cn } from "../lib/utils";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
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
 *
 * A 404 or 410 on availability means the service is gone, archived, or its
 * business switched Appointments off — retrying cannot help, so the section
 * says booking isn't open and offers no retry. Any other failure keeps the
 * error and its Try again. A failed booking shows the API's own message only
 * for a 4xx, where the API words it for visitors; a 5xx body never reaches
 * the page.
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

type SubmitState =
    | { kind: "idle" }
    | { kind: "submitting" }
    /** `meetingUrl` is the booker's link to join, when the service is online. */
    | { kind: "success"; meetingUrl: string | null }
    | { kind: "error"; message: string };

/**
 * The join link from a booking response, if it is one we would open. The API
 * only stores https links; this re-checks so a block never renders a
 * `javascript:` href whatever the response said.
 */
function meetingUrlFrom(body: unknown): string | null {
    if (typeof body !== "object" || body === null) return null;
    const url = (body as { meetingUrl?: unknown }).meetingUrl;
    return typeof url === "string" && url.startsWith("https://") ? url : null;
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
}: {
    content: RenderedBooking;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /**
     * Sample slots to draw instead of fetching (previews, #267). A fixture's
     * Service id belongs to no Service, and a picker thumbnail must not show a
     * healthy block as broken because a request it never needed failed.
     */
    slots?: Slot[];
}) {
    const baseId = useId();
    // A stable idempotency key per mount so a double-click / retry can't create
    // two bookings. Lazy initializer runs exactly once.
    const [idempotencyKey] = useState(() =>
        typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2),
    );

    const [slotsState, setSlotsState] = useState<SlotsState>(
        givenSlots ? { kind: "ready", slots: givenSlots } : { kind: "loading" },
    );
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
        if (givenSlots) return;
        let active = true;
        void fetchSlots().then((next) => {
            if (active) applyResult(next);
        });
        return () => {
            active = false;
        };
    }, [givenSlots, fetchSlots, applyResult]);

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
                `${apiUrl}/public/services/${encodeURIComponent(serviceId)}/book`,
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
                const body: unknown = await res.json().catch(() => null);
                setSubmit({
                    kind: "success",
                    meetingUrl: meetingUrlFrom(body),
                });
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

            if (res.status === 404 || res.status === 410) {
                // Booking closed while the visitor was filling the form (the
                // service went, or Appointments was switched off). Show the
                // same notice a fresh page would, instead of a form that can
                // only keep failing.
                setSelected(null);
                setSlotsState({ kind: "closed" });
                setSubmit({ kind: "idle" });
                return;
            }

            if (res.status === 400) {
                // The booking API's 400s are written for developers
                // ("Validation failed", "startAt is not a valid instant"), so
                // none is shown. A rejected time is the likely cause after
                // the email, so the times are refreshed too.
                reload();
                setSubmit({
                    kind: "error",
                    message:
                        "We couldn't book that — please check your email address and choose a time again.",
                });
                return;
            }

            setSubmit({
                kind: "error",
                message:
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
            <section className="mx-auto w-full max-w-2xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]">
                <div className="border-site-border bg-site-surface rounded-[var(--site-radius)] border p-8 text-center">
                    <p className="text-site-fg text-lg font-medium">
                        {content.successMessage ?? "You're booked!"}
                    </p>
                    {submit.meetingUrl ? (
                        <>
                            <p className="text-site-body mt-3">
                                This one is online. Keep this link to join at
                                the time you booked.
                            </p>
                            <a
                                href={submit.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(ctaClasses("primary"), "mt-5")}
                            >
                                Join online
                            </a>
                        </>
                    ) : null}
                </div>
            </section>
        );
    }

    const groups =
        slotsState.kind === "ready" ? groupByDay(slotsState.slots) : [];

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

            {/* Slot picker */}
            <div className="mt-8">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-site-fg text-sm font-semibold">
                        Choose a time
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
                    <div
                        role="radiogroup"
                        aria-label="Available times"
                        className="mt-4 grid gap-[var(--site-grid-gap)]"
                    >
                        {groups.map((group) => (
                            <div key={group.key}>
                                <p className="text-site-muted text-xs font-medium uppercase tracking-wide">
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
                                                    "focus-visible:ring-site-accent rounded-[var(--site-radius)] border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60",
                                                    active
                                                        ? "border-site-accent bg-site-accent text-site-accent-fg"
                                                        : "border-site-border text-site-fg hover:bg-site-surface",
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

            {/* Booker details — hidden once booking is closed. */}
            <form
                hidden={slotsState.kind === "closed"}
                className="mt-8 grid gap-[var(--site-grid-gap)]"
                onSubmit={onSubmit}
                noValidate
            >
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-name`}
                        className="text-site-fg text-sm font-medium"
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
                        className="border-site-border bg-site-surface text-site-fg focus:border-site-border focus:ring-site-border w-full max-w-full rounded-[var(--site-radius)] border px-3 py-2 outline-none focus:ring-2"
                    />
                </div>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-email`}
                        className="text-site-fg text-sm font-medium"
                    >
                        Email
                        {/* The label's own colour, not a red (#263); see
                            the enquiry block. */}
                        <span aria-hidden="true">{" *"}</span>
                    </label>
                    <input
                        id={`${baseId}-email`}
                        name="email"
                        type="email"
                        required
                        value={email}
                        disabled={submitting}
                        onChange={(e) => setEmail(e.target.value)}
                        className="border-site-border bg-site-surface text-site-fg focus:border-site-border focus:ring-site-border w-full max-w-full rounded-[var(--site-radius)] border px-3 py-2 outline-none focus:ring-2"
                    />
                </div>
                <div className="grid gap-1.5">
                    <label
                        htmlFor={`${baseId}-phone`}
                        className="text-site-fg text-sm font-medium"
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
                        className="border-site-border bg-site-surface text-site-fg focus:border-site-border focus:ring-site-border w-full max-w-full rounded-[var(--site-radius)] border px-3 py-2 outline-none focus:ring-2"
                    />
                </div>

                {submit.kind === "error" ? (
                    <p role="alert" className={destructiveAlertClasses}>
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
