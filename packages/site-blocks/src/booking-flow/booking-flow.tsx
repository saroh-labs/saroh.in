"use client";

import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { cn } from "../lib/utils";
import type { PaymentHandoff, Result } from "./api";
import { book, fetchDays, fetchHold, releaseHold, startPayment } from "./api";
import type {
    BookingDay,
    BookingDays,
    BookingPageData,
    BookingService,
    BookingStart,
    BookResult,
} from "./model";
import {
    buildIcs,
    changeText,
    dateIn,
    dateText,
    dayAria,
    dayCountLabel,
    dayHeading,
    dayParts,
    formatMoney,
    groupStarts,
    looksLikeEmail,
    phoneProblem,
    placesText,
    rulesText,
    serviceLine,
    timeIn,
} from "./model";

/**
 * The customer's booking page on a merchant's site (U19), `/<domain>/book`:
 * what → when (a day of the next two weeks and a start, or a class session
 * with its places left) → who they are → how they pay, with a summary of the
 * booking beside it (a bar pinned to the bottom on a phone), and a
 * confirmation with add-to-calendar and the cancel rule.
 *
 * Pay now holds the place for 15 minutes while the booker pays through the
 * business's own provider; the page watches the hold and confirms when the
 * provider's webhook does. Pay at the desk books it outright. There is no
 * customer recognition and no credits online (ADR-008): packs and
 * memberships are used at the desk or by the team in the calendar.
 *
 * Drawn from `--site-*` only (gate G2): the merchant's palette, never
 * Saroh's. Nothing here promises an email or a text — Saroh sends neither.
 */

// ── Shapes drawn from the site layer ─────────────────────────────────────

const card =
    "bg-site-surface border-site-border rounded-[calc(var(--site-radius)+14px)] border p-[22px] shadow-[0_1px_2px_hsl(var(--site-fg)/0.08)]";
const accentTint =
    "bg-[color-mix(in_srgb,hsl(var(--site-accent))_10%,hsl(var(--site-surface)))]";
const quietFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,hsl(var(--site-bg)))]";
const inputFill =
    "bg-[color-mix(in_srgb,hsl(var(--site-fg))_3%,hsl(var(--site-surface)))]";
const onDarkMuted =
    "text-[color-mix(in_srgb,hsl(var(--site-bg))_72%,hsl(var(--site-fg)))]";
const focusRing =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/** A choice row: a service, a session, a way to pay. */
function optionClasses(on: boolean): string {
    return cn(
        "text-site-fg flex min-h-[60px] w-full cursor-pointer items-center gap-3 rounded-[calc(var(--site-radius)+10px)] border px-[18px] py-[15px] text-left transition-colors duration-100 ease-out",
        focusRing,
        on
            ? cn(
                  "border-site-accent shadow-[inset_3px_0_0_hsl(var(--site-accent))]",
                  accentTint,
              )
            : "border-site-border bg-site-surface",
    );
}

/** The confirm button: the accent when it can go, quiet when it cannot. */
function confirmClasses(blocked: boolean): string {
    return cn(
        "h-[45px] rounded-[calc(var(--site-radius)+7px)] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent focus-visible:ring-offset-2 focus-visible:ring-offset-site-fg",
        blocked
            ? cn(
                  "cursor-not-allowed bg-[color-mix(in_srgb,hsl(var(--site-bg))_14%,hsl(var(--site-fg)))]",
                  onDarkMuted,
              )
            : "bg-site-accent text-site-accent-fg cursor-pointer hover:opacity-90",
    );
}

// ── The phone breakpoint, read without a render-time window ─────────────

const PHONE_QUERY = "(max-width: 699px)";

function subscribePhone(onChange: () => void): () => void {
    const mq = window.matchMedia(PHONE_QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
}

function usePhone(): boolean {
    return useSyncExternalStore(
        subscribePhone,
        () => window.matchMedia(PHONE_QUERY).matches,
        () => false,
    );
}

function newKey(): string {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
}

/** "India Standard Time", or the zone's own name when Intl has no word. */
function zoneName(zone: string): string {
    try {
        const part = new Intl.DateTimeFormat("en-GB", {
            timeZone: zone,
            timeZoneName: "long",
        })
            .formatToParts(new Date())
            .find((p) => p.type === "timeZoneName");
        return part?.value ?? zone;
    } catch {
        return zone;
    }
}

function kicker(services: BookingService[]): string {
    const classes = services.some((s) => s.kind === "class");
    const ones = services.some((s) => s.kind === "one");
    if (classes && ones) return "Classes and appointments";
    return classes ? "Classes" : "Appointments";
}

// ── State ────────────────────────────────────────────────────────────────

type DaysState =
    | { kind: "idle" }
    | { kind: "loading"; serviceId: string }
    | { kind: "ready"; serviceId: string; days: BookingDays }
    | { kind: "error"; serviceId: string; message: string; gone: boolean };

type Phase =
    | { kind: "choose" }
    | {
          kind: "paying";
          booking: BookResult;
          token: string;
          handoff: PaymentHandoff | null;
          payError: string | null;
          when: string;
          price: string;
      }
    | { kind: "expired"; when: string }
    | {
          kind: "done";
          booking: BookResult;
          paid: boolean;
          price: string | null;
          when: string;
          first: string;
      };

/** How often the page asks where a hold stands while its booker pays. */
const POLL_MS = 4_000;

/** A booking that came back not standing: a replayed hold that was let go. */
const TIME_GONE = "That time has gone. Pick another one.";

/** Class sessions shown before "Show more". */
const SESSIONS_SHOWN = 10;

export interface BookingFlowProps {
    page: BookingPageData;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** A service to open on (`?service=`), when it is one the page offers. */
    initialServiceId?: string | null;
}

export default function BookingFlow({
    page,
    apiUrl = DEFAULT_API_URL,
    initialServiceId = null,
}: BookingFlowProps) {
    const phone = usePhone();
    const ids = useId();
    const services = page.services;
    const first = services.find((s) => s.id === initialServiceId) ?? null;

    const [serviceId, setServiceId] = useState<string | null>(
        first?.id ?? null,
    );
    const [daysState, setDaysState] = useState<DaysState>(
        first ? { kind: "loading", serviceId: first.id } : { kind: "idle" },
    );
    const [date, setDate] = useState<string | null>(null);
    const [start, setStart] = useState<BookingStart | null>(null);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phoneNo, setPhoneNo] = useState("");
    const [touched, setTouched] = useState(false);
    const [payChoice, setPayChoice] = useState<"NOW" | "DESK" | null>(null);
    const [sessionsShown, setSessionsShown] = useState(SESSIONS_SHOWN);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [phase, setPhase] = useState<Phase>({ kind: "choose" });
    const [now, setNow] = useState<number | null>(null);

    // The service whose days are wanted now, so a late answer for another
    // one is dropped.
    const wanted = useRef<string | null>(first?.id ?? null);
    // One idempotency key per attempt: a double tap sends the same one.
    const attemptKey = useRef<string | null>(null);
    // Booking it at the desk after letting a hold go (#508): its own key per
    // attempt, and one request at a time — the ref, since a second tap can
    // land before the disabled buttons are drawn.
    const deskKey = useRef<string | null>(null);
    const leavingRef = useRef(false);
    const [leaving, setLeaving] = useState(false);
    const headingRef = useRef<HTMLHeadingElement>(null);

    const service = services.find((s) => s.id === serviceId) ?? null;
    const zone =
        daysState.kind === "ready" ? daysState.days.timezone : page.timezone;

    const loadDays = useCallback(
        (id: string) => {
            wanted.current = id;
            void fetchDays(apiUrl, id).then((result) => {
                if (wanted.current !== id) return;
                setDaysState(
                    result.ok
                        ? { kind: "ready", serviceId: id, days: result.value }
                        : {
                              kind: "error",
                              serviceId: id,
                              message: result.message,
                              gone:
                                  result.status === 404 ||
                                  result.status === 410,
                          },
                );
            });
        },
        [apiUrl],
    );

    // The service the page was opened on (`?service=`) loads once.
    const firstId = first?.id ?? null;
    useEffect(() => {
        if (firstId) loadDays(firstId);
    }, [firstId, loadDays]);

    const pickService = (id: string) => {
        if (id === serviceId) return;
        setServiceId(id);
        setDate(null);
        setStart(null);
        setSessionsShown(SESSIONS_SHOWN);
        setSubmitError(null);
        attemptKey.current = null;
        setDaysState({ kind: "loading", serviceId: id });
        loadDays(id);
    };

    // ── What is chosen ──────────────────────────────────────────────────

    const days =
        daysState.kind === "ready" && daysState.serviceId === serviceId
            ? daysState.days
            : null;
    const isClass = service?.kind === "class";
    const firstOpen = days?.days.find((d) => d.starts.length > 0) ?? null;
    const day: BookingDay | null =
        days && !isClass
            ? (days.days.find((d) => d.date === date && d.starts.length > 0) ??
              firstOpen)
            : null;
    const sessions = days && isClass ? days.days.flatMap((d) => d.starts) : [];
    // A chosen start still offered; one taken meanwhile falls away.
    const chosen =
        start &&
        (isClass ? sessions : (day?.starts ?? [])).find(
            (s) => s.startAt === start.startAt,
        );
    const chosenStart =
        chosen && (!isClass || (chosen.placesLeft ?? 0) > 0) ? chosen : null;

    const price = service
        ? formatMoney(service.priceCents, service.currency)
        : null;
    const canPayNow =
        page.payOnline && !!service?.priceCents && service.priceCents > 0;
    const pay: "NOW" | "DESK" =
        payChoice === "NOW" && canPayNow
            ? "NOW"
            : payChoice === "DESK"
              ? "DESK"
              : canPayNow
                ? "NOW"
                : "DESK";

    const emailOk = looksLikeEmail(email);
    const phoneError = phoneProblem(phoneNo);
    const whoOk = name.trim().length > 1 && emailOk && !phoneError;

    const block = !service
        ? "Pick what you'd like to book."
        : !chosenStart
          ? "Pick a time."
          : !whoOk
            ? "Add your name and email."
            : "";

    const whenText = chosenStart
        ? `${dateText(dateIn(chosenStart.startAt, zone), true)} at ${timeIn(chosenStart.startAt, zone)}${
              chosenStart.staffName ? ` with ${chosenStart.staffName}` : ""
          }`
        : "";

    const dueLabel =
        pay === "NOW" ? "To pay now" : price ? "Pay at the desk" : "To pay";
    const due = price ?? formatMoney(0, service?.currency ?? "INR") ?? "₹0";
    const confirmLabel =
        pay === "NOW"
            ? `Pay ${price ?? ""} and book`
            : price
              ? "Book — pay at the desk"
              : "Book";
    const barLabel = pay === "NOW" ? "Pay and book" : "Book";
    const rules = rulesText(page.rules);

    // ── Watching a hold ─────────────────────────────────────────────────

    const payingToken = phase.kind === "paying" ? phase.token : null;
    useEffect(() => {
        if (!payingToken) return;
        const tick = () => setNow(Date.now());
        tick();
        const clock = setInterval(tick, 15_000);
        const poll = setInterval(() => {
            void fetchHold(apiUrl, payingToken).then((result) => {
                // Letting the hold go answers for itself.
                if (leavingRef.current) return;
                if (!result.ok) {
                    // A cleared token: the hold was let go.
                    if (result.status === 404) {
                        setPhase((p) =>
                            p.kind === "paying" && p.token === payingToken
                                ? { kind: "expired", when: p.when }
                                : p,
                        );
                    }
                    return;
                }
                const state = result.value.state;
                setPhase((p) => {
                    if (p.kind !== "paying" || p.token !== payingToken) {
                        return p;
                    }
                    if (state === "CONFIRMED") {
                        return {
                            kind: "done",
                            booking: p.booking,
                            paid: true,
                            price: p.price,
                            when: p.when,
                            first: name.trim().split(/\s+/)[0] ?? "",
                        };
                    }
                    if (state === "RELEASED" || state === "CANCELLED") {
                        return { kind: "expired", when: p.when };
                    }
                    return p;
                });
            });
        }, POLL_MS);
        return () => {
            clearInterval(clock);
            clearInterval(poll);
        };
    }, [apiUrl, payingToken, name]);

    // Each new screen puts focus on its heading, so a screen reader hears it.
    useEffect(() => {
        if (phase.kind !== "choose") headingRef.current?.focus();
    }, [phase.kind]);

    /** The time chosen is gone: say so, and show what is left. */
    const timeGone = (id: string, message: string) => {
        setPhase({ kind: "choose" });
        setSubmitError(message);
        attemptKey.current = null;
        setStart(null);
        loadDays(id);
    };

    const confirm = async () => {
        setTouched(true);
        if (block || !service || !chosenStart || submitting) return;
        setSubmitting(true);
        setSubmitError(null);
        attemptKey.current ??= newKey();
        const result = await book(apiUrl, service.id, {
            startAt: chosenStart.startAt,
            bookerName: name.trim(),
            bookerEmail: email.trim(),
            bookerPhone: phoneNo.trim() || undefined,
            idempotencyKey: attemptKey.current,
            staffId: chosenStart.staffId ?? undefined,
            pay,
        });
        setSubmitting(false);
        if (!result.ok) {
            // Taken meanwhile: show what is left, and a fresh attempt.
            if (result.status === 409) timeGone(service.id, result.message);
            else setSubmitError(result.message);
            return;
        }
        attemptKey.current = null;
        const booking = result.value;
        const firstName = name.trim().split(/\s+/)[0] ?? "";
        if (booking.state === "HELD" && booking.payToken) {
            const token = booking.payToken;
            setPhase({
                kind: "paying",
                booking,
                token,
                handoff: null,
                payError: null,
                when: whenText,
                price: price ?? "",
            });
            const started = await startPayment(apiUrl, token, newKey());
            setPhase((p) =>
                p.kind === "paying" && p.token === token
                    ? started.ok
                        ? { ...p, handoff: started.value }
                        : { ...p, payError: started.message }
                    : p,
            );
            return;
        }
        // Only a booking that stands is a success. A replay of a hold that
        // was let go answers RELEASED or CANCELLED, and one still held but
        // with no token to pay it by cannot be paid from here (#508).
        if (booking.state !== "CONFIRMED") {
            timeGone(service.id, TIME_GONE);
            return;
        }
        setPhase({
            kind: "done",
            booking,
            paid: false,
            price,
            when: whenText,
            first: firstName,
        });
    };

    /** Let the hold go and go back to choosing — or book it at the desk. */
    const leaveHold = async (then: "choose" | "desk") => {
        if (phase.kind !== "paying" || leavingRef.current) return;
        leavingRef.current = true;
        setLeaving(true);
        const held = phase;
        try {
            await releaseHold(apiUrl, held.token);
            if (then !== "desk" || !service || !chosenStart) {
                backToChoosing();
                return;
            }
            setPayChoice("DESK");
            deskKey.current ??= newKey();
            const result: Result<BookResult> = await book(apiUrl, service.id, {
                startAt: chosenStart.startAt,
                bookerName: name.trim(),
                bookerEmail: email.trim(),
                bookerPhone: phoneNo.trim() || undefined,
                idempotencyKey: deskKey.current,
                staffId: chosenStart.staffId ?? undefined,
                pay: "DESK",
            });
            if (result.ok && result.value.state === "CONFIRMED") {
                deskKey.current = null;
                setPhase({
                    kind: "done",
                    booking: result.value,
                    paid: false,
                    price,
                    when: held.when,
                    first: name.trim().split(/\s+/)[0] ?? "",
                });
                return;
            }
            setPhase({ kind: "choose" });
            if (!result.ok && result.status !== 409) {
                // Not known to have booked: trying again from the form sends
                // the same key, so a first try that did book answers with it.
                setSubmitError(result.message);
                attemptKey.current = deskKey.current;
                deskKey.current = null;
                return;
            }
            deskKey.current = null;
            timeGone(service.id, result.ok ? TIME_GONE : result.message);
        } finally {
            leavingRef.current = false;
            setLeaving(false);
        }
    };

    const backToChoosing = () => {
        setPhase({ kind: "choose" });
        setStart(null);
        attemptKey.current = null;
        if (service) {
            setDaysState({ kind: "loading", serviceId: service.id });
            loadDays(service.id);
        }
    };

    const bookAnother = () => {
        setPhase({ kind: "choose" });
        setServiceId(null);
        setDaysState({ kind: "idle" });
        setDate(null);
        setStart(null);
        setPayChoice(null);
        setTouched(false);
        setSubmitError(null);
        wanted.current = null;
    };

    // ── Drawing ─────────────────────────────────────────────────────────

    const choosing = phase.kind === "choose";
    const showBar = phone && choosing && services.length > 0 && page.open;

    return (
        <div
            className={cn(
                "bg-site-bg text-site-fg min-h-screen",
                showBar ? "pb-[150px]" : "pb-10",
            )}
        >
            <section className="bg-site-hero-bg text-site-hero-fg">
                <div className="mx-auto max-w-[1060px] px-5 pb-[38px] pt-[34px]">
                    <p className="text-site-accent text-xs font-semibold uppercase tracking-[0.14em]">
                        {kicker(services)}
                    </p>
                    <h1 className="font-display mt-2.5 text-balance text-[clamp(34px,6vw,56px)] font-semibold leading-[1.02] tracking-[-0.035em]">
                        Book your next session
                    </h1>
                    <p className="mt-3 text-[14.5px] opacity-70">
                        {page.businessName} · Times are in{" "}
                        {zoneName(page.timezone)}
                    </p>
                </div>
            </section>

            <div className="mx-auto -mt-[18px] flex max-w-[1060px] flex-wrap items-start gap-5 px-5">
                <div className="grid min-w-0 flex-[999_1_460px] grid-cols-[minmax(0,1fr)] gap-3.5">
                    {!page.open || services.length === 0 ? (
                        <div className={card}>
                            <h2 className="font-display text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
                                Online booking isn&apos;t open right now
                            </h2>
                            <p className="text-site-body mt-2 text-sm">
                                Get in touch with {page.businessName} to book a
                                time.
                            </p>
                        </div>
                    ) : phase.kind === "done" ? (
                        <DoneCard
                            phase={phase}
                            headingRef={headingRef}
                            business={page.businessName}
                            rules={page.rules}
                            onAgain={bookAnother}
                        />
                    ) : phase.kind === "paying" ? (
                        <PayingCard
                            phase={phase}
                            now={now}
                            zone={zone}
                            headingRef={headingRef}
                            serviceName={service?.name ?? ""}
                            busy={leaving}
                            onDesk={() => void leaveHold("desk")}
                            onBack={() => void leaveHold("choose")}
                        />
                    ) : phase.kind === "expired" ? (
                        <div className={cn(card, "px-[26px] py-7")}>
                            <h2
                                ref={headingRef}
                                tabIndex={-1}
                                className="font-display text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
                            >
                                The time held for you ran out
                            </h2>
                            <p className="text-site-body mt-2 text-[15px] leading-relaxed">
                                {phase.when} wasn&apos;t paid for within 15
                                minutes, so it went back on the calendar.
                                Nothing was charged.
                            </p>
                            <button
                                type="button"
                                onClick={backToChoosing}
                                className={cn(
                                    "border-site-border bg-site-surface text-site-fg mt-4 h-11 rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold",
                                    focusRing,
                                )}
                            >
                                Pick a time again
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className={card}>
                                <StepHead n={1} title="What would you like?" />
                                <div
                                    role="radiogroup"
                                    aria-label="What would you like?"
                                    className="grid gap-2"
                                >
                                    {services.map((s) => {
                                        const on = s.id === serviceId;
                                        const p = formatMoney(
                                            s.priceCents,
                                            s.currency,
                                        );
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                onClick={() =>
                                                    pickService(s.id)
                                                }
                                                className={optionClasses(on)}
                                            >
                                                <span className="min-w-0 flex-1">
                                                    <span className="block text-[15px] font-semibold">
                                                        {s.name}
                                                    </span>
                                                    <span className="text-site-body mt-0.5 block text-[13px]">
                                                        {serviceLine(s)}
                                                    </span>
                                                </span>
                                                {p ? (
                                                    <span className="text-[15px] font-semibold tabular-nums">
                                                        {p}
                                                    </span>
                                                ) : null}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {service ? (
                                <div className={card}>
                                    <StepHead n={2} title="When?" />
                                    {daysState.kind === "loading" ? (
                                        <div
                                            role="status"
                                            aria-label="Loading times"
                                            className="grid gap-2.5"
                                        >
                                            <div
                                                className={cn(
                                                    "h-3.5 w-2/5 rounded-md",
                                                    quietFill,
                                                )}
                                            />
                                            <div
                                                className={cn(
                                                    "h-[66px] rounded-[calc(var(--site-radius)+12px)]",
                                                    quietFill,
                                                )}
                                            />
                                        </div>
                                    ) : daysState.kind === "error" ? (
                                        <div>
                                            <p
                                                role="alert"
                                                className={
                                                    destructiveAlertClasses
                                                }
                                            >
                                                {daysState.gone
                                                    ? "This isn't taking bookings online right now."
                                                    : "We couldn't load the times. Please try again."}
                                            </p>
                                            {daysState.gone ? null : (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setDaysState({
                                                            kind: "loading",
                                                            serviceId:
                                                                service.id,
                                                        });
                                                        loadDays(service.id);
                                                    }}
                                                    className={cn(
                                                        "text-site-fg mt-3 text-sm font-semibold underline",
                                                        focusRing,
                                                    )}
                                                >
                                                    Try again
                                                </button>
                                            )}
                                        </div>
                                    ) : days && !isClass ? (
                                        <OneToOne
                                            days={days}
                                            day={day}
                                            zone={zone}
                                            phone={phone}
                                            service={service}
                                            chosen={chosenStart}
                                            onDay={(d) => {
                                                setDate(d);
                                                setStart(null);
                                            }}
                                            onStart={setStart}
                                            business={page.businessName}
                                        />
                                    ) : days ? (
                                        <Sessions
                                            sessions={sessions.slice(
                                                0,
                                                sessionsShown,
                                            )}
                                            more={
                                                sessions.length > sessionsShown
                                            }
                                            onMore={() =>
                                                setSessionsShown(
                                                    (n) => n + SESSIONS_SHOWN,
                                                )
                                            }
                                            zone={zone}
                                            duration={service.durationMinutes}
                                            chosen={chosenStart}
                                            onPick={setStart}
                                        />
                                    ) : null}
                                </div>
                            ) : null}

                            {chosenStart ? (
                                <div className={card}>
                                    <StepHead n={3} title="Your details" />
                                    <p className="text-site-muted -mt-1.5 mb-3 ml-[38px] text-[13px]">
                                        Only used for this booking, so{" "}
                                        {page.businessName} can reach you about
                                        it.
                                    </p>
                                    <Field
                                        id={`${ids}-name`}
                                        label="Name"
                                        autoComplete="name"
                                        value={name}
                                        onChange={setName}
                                        error={
                                            touched && name.trim().length < 2
                                                ? "Add your name."
                                                : null
                                        }
                                    />
                                    <Field
                                        id={`${ids}-email`}
                                        label="Email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="you@example.in"
                                        value={email}
                                        onChange={setEmail}
                                        error={
                                            (touched || email.includes("@")) &&
                                            email.trim() !== "" &&
                                            !emailOk
                                                ? "That email doesn't look right."
                                                : touched && !email.trim()
                                                  ? "Add your email."
                                                  : null
                                        }
                                    />
                                    <Field
                                        id={`${ids}-phone`}
                                        label="Phone (optional)"
                                        type="tel"
                                        autoComplete="tel"
                                        placeholder="+91 98…"
                                        value={phoneNo}
                                        onChange={setPhoneNo}
                                        error={
                                            phoneNo.replace(/\D/g, "").length >
                                                3 || touched
                                                ? phoneError
                                                : null
                                        }
                                    />
                                </div>
                            ) : null}

                            {chosenStart && whoOk && price ? (
                                <div className={card}>
                                    <StepHead n={4} title="Paying" />
                                    <div
                                        role="radiogroup"
                                        aria-label="Paying"
                                        className="grid gap-2"
                                    >
                                        {canPayNow ? (
                                            <PayOption
                                                on={pay === "NOW"}
                                                label={`Pay ${price} for this ${isClass ? "class" : "session"}`}
                                                sub="UPI or card — your place is confirmed straight away"
                                                onPick={() =>
                                                    setPayChoice("NOW")
                                                }
                                            />
                                        ) : null}
                                        <PayOption
                                            on={pay === "DESK"}
                                            label="Pay at the desk"
                                            sub="Held for you; pay when you arrive"
                                            onPick={() => setPayChoice("DESK")}
                                        />
                                    </div>
                                </div>
                            ) : null}

                            {submitError && phone ? (
                                <p
                                    role="alert"
                                    className={destructiveAlertClasses}
                                >
                                    {submitError}
                                </p>
                            ) : null}
                        </>
                    )}
                </div>

                {choosing && !phone && services.length > 0 && page.open ? (
                    <aside
                        aria-label="Your booking"
                        className="bg-site-fg text-site-bg sticky top-4 min-w-0 flex-[1_1_300px] rounded-[calc(var(--site-radius)+14px)] p-[22px] shadow-[0_4px_12px_hsl(var(--site-fg)/0.10)]"
                    >
                        <p className="text-site-accent mb-3 text-[11px] font-semibold uppercase tracking-[0.1em]">
                            Your booking
                        </p>
                        <dl>
                            {(
                                [
                                    ["What", service?.name ?? "—"],
                                    ["When", whenText || "—"],
                                    ["Who", name.trim() || "—"],
                                ] as const
                            ).map(([k, v]) => (
                                <div
                                    key={k}
                                    className="flex gap-2.5 border-b border-[color-mix(in_srgb,hsl(var(--site-bg))_12%,transparent)] py-1.5 text-sm"
                                >
                                    <dt
                                        className={cn(
                                            "flex-[0_0_64px]",
                                            onDarkMuted,
                                        )}
                                    >
                                        {k}
                                    </dt>
                                    <dd className="min-w-0 flex-1 font-medium">
                                        {v}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <div className="mt-3 flex items-baseline">
                            <span className={cn("flex-1 text-sm", onDarkMuted)}>
                                {dueLabel}
                            </span>
                            <span className="font-display text-[30px] font-semibold tabular-nums tracking-[-0.02em]">
                                {due}
                            </span>
                        </div>
                        {(block && service) || submitError ? (
                            <p
                                role="status"
                                className="text-site-accent mt-2.5 text-[13px]"
                            >
                                {submitError ?? block}
                            </p>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => void confirm()}
                            aria-disabled={!!block || submitting}
                            className={cn(
                                confirmClasses(!!block || submitting),
                                "mt-4 w-full text-base",
                            )}
                        >
                            {submitting ? "Booking…" : confirmLabel}
                        </button>
                        {rules ? (
                            <p
                                className={cn(
                                    "mt-2.5 text-xs leading-normal",
                                    onDarkMuted,
                                    "opacity-80",
                                )}
                            >
                                {rules}
                            </p>
                        ) : null}
                    </aside>
                ) : null}
            </div>

            {showBar && rules ? (
                <p className="text-site-muted mx-auto mt-[18px] max-w-[1060px] px-5 text-[12.5px] leading-normal">
                    {rules}
                </p>
            ) : null}

            {showBar ? (
                <div className="bg-site-fg text-site-bg fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_hsl(var(--site-fg)/0.22)]">
                    {service ? (
                        <p
                            role="status"
                            className={cn(
                                "mb-2 truncate text-[12.5px]",
                                block || submitError
                                    ? "text-site-accent"
                                    : "text-site-bg",
                            )}
                        >
                            {submitError ?? (block || whenText)}
                        </p>
                    ) : null}
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className={cn("truncate text-xs", onDarkMuted)}>
                                {dueLabel}
                            </p>
                            <p className="font-display text-2xl font-semibold tabular-nums leading-[1.1] tracking-[-0.02em]">
                                {due}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void confirm()}
                            aria-disabled={!!block || submitting}
                            className={cn(
                                confirmClasses(!!block || submitting),
                                "flex-none px-[22px] text-[15px]",
                            )}
                        >
                            {submitting ? "Booking…" : barLabel}
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function StepHead({ n, title }: { n: number; title: string }) {
    return (
        <div className="mb-3.5 flex items-center gap-2.5">
            <span
                aria-hidden="true"
                className="bg-site-fg text-site-bg flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold"
            >
                {n}
            </span>
            <h2 className="font-display text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
                {title}
            </h2>
        </div>
    );
}

function OneToOne({
    days,
    day,
    zone,
    phone,
    service,
    chosen,
    onDay,
    onStart,
    business,
}: {
    days: BookingDays;
    day: BookingDay | null;
    zone: string;
    phone: boolean;
    service: BookingService;
    chosen: BookingStart | null;
    onDay: (date: string) => void;
    onStart: (start: BookingStart) => void;
    business: string;
}) {
    const list = days.days;
    const firstDay = list.at(0);
    const lastDay = list.at(-1);
    const count = day?.starts.length ?? 0;
    const onlyOne = service.staff.length === 1 ? service.staff[0] : null;
    return (
        <>
            <div className="mb-2 flex items-baseline gap-2">
                <span className="text-site-fg text-[13px] font-semibold">
                    Next two weeks
                </span>
                {firstDay && lastDay ? (
                    <span className="text-site-muted text-[12.5px]">
                        {dateText(firstDay.date)} – {dateText(lastDay.date)}
                    </span>
                ) : null}
            </div>
            <div
                role="radiogroup"
                aria-label="Day"
                className="grid grid-cols-7 gap-1.5"
            >
                {list.map((d) => {
                    const on = d.date === day?.date;
                    const free = d.starts.length > 0;
                    const { dow, n } = dayParts(d.date);
                    return (
                        <button
                            key={d.date}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={dayAria(d)}
                            disabled={!free}
                            onClick={() => onDay(d.date)}
                            className={cn(
                                "min-w-0 border text-center transition-colors duration-100 ease-out",
                                focusRing,
                                phone
                                    ? "rounded-[calc(var(--site-radius)+10px)] py-2"
                                    : "rounded-[calc(var(--site-radius)+12px)] px-0.5 py-[9px]",
                                on
                                    ? "border-site-fg bg-site-fg text-site-bg cursor-pointer"
                                    : free
                                      ? "border-site-border bg-site-surface text-site-fg cursor-pointer"
                                      : cn(
                                            "border-site-border text-site-muted cursor-not-allowed",
                                            quietFill,
                                        ),
                            )}
                        >
                            <span className="block text-xs">{dow}</span>
                            <span className="mt-0.5 block text-[17px] font-bold">
                                {n}
                            </span>
                            <span className="mt-0.5 block text-[11px]">
                                {dayCountLabel(d, phone)}
                            </span>
                        </button>
                    );
                })}
            </div>
            {!day ? (
                <p className="text-site-body mt-3 text-sm">
                    Nothing free in the next two weeks. Get in touch with{" "}
                    {business} and they&apos;ll fit you in.
                </p>
            ) : (
                <div className="border-site-border mt-[18px] border-t pt-4">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="font-display text-site-fg text-base font-semibold tracking-[-0.01em]">
                            {dayHeading(day.date)}
                        </h3>
                        <span className="text-site-muted text-[12.5px]">
                            {count} {count === 1 ? "time" : "times"} free
                            {onlyOne ? ` with ${onlyOne}` : ""}
                        </span>
                    </div>
                    <div className="mt-3 grid gap-3.5">
                        {groupStarts(day.starts, zone).map((g) => (
                            <div
                                key={g.label}
                                role="radiogroup"
                                aria-label={g.label}
                                className="flex flex-wrap items-baseline gap-x-2.5 gap-y-2"
                            >
                                <span className="text-site-muted flex-[0_0_84px] text-[12.5px] font-semibold">
                                    {g.label}
                                </span>
                                <div className="grid min-w-0 flex-[1_1_240px] grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2">
                                    {g.starts.map((s) => {
                                        const on =
                                            chosen?.startAt === s.startAt;
                                        const t = timeIn(s.startAt, zone);
                                        return (
                                            <button
                                                key={s.startAt}
                                                type="button"
                                                role="radio"
                                                aria-checked={on}
                                                aria-label={
                                                    s.staffName
                                                        ? `${t} with ${s.staffName}`
                                                        : t
                                                }
                                                onClick={() => onStart(s)}
                                                className={cn(
                                                    "h-[45px] cursor-pointer rounded-[calc(var(--site-radius)+7px)] border text-[15px] font-semibold tabular-nums transition-colors duration-100 ease-out",
                                                    focusRing,
                                                    on
                                                        ? "border-site-fg bg-site-fg text-site-bg"
                                                        : "border-site-border bg-site-surface text-site-fg",
                                                )}
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {service.staff.length > 1 ? (
                <p className="text-site-muted mt-2.5 text-[12.5px]">
                    Times are with whoever is free — you&apos;ll see who before
                    you confirm.
                </p>
            ) : null}
        </>
    );
}

function Sessions({
    sessions,
    more,
    onMore,
    zone,
    duration,
    chosen,
    onPick,
}: {
    sessions: BookingStart[];
    more: boolean;
    onMore: () => void;
    zone: string;
    duration: number;
    chosen: BookingStart | null;
    onPick: (start: BookingStart) => void;
}) {
    if (sessions.length === 0) {
        return (
            <p className="text-site-body text-sm">
                No classes in the next two weeks.
            </p>
        );
    }
    return (
        <div role="radiogroup" aria-label="Class" className="grid gap-2">
            {sessions.map((s) => {
                const on = chosen?.startAt === s.startAt;
                const left = s.placesLeft ?? 0;
                const date = dateIn(s.startAt, zone);
                const { dow, n } = dayParts(date);
                const end = timeIn(
                    new Date(
                        new Date(s.startAt).getTime() + duration * 60_000,
                    ).toISOString(),
                    zone,
                );
                return (
                    <button
                        key={s.startAt}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={left <= 0}
                        onClick={() => onPick(s)}
                        className={cn(
                            optionClasses(on),
                            left <= 0 && "cursor-not-allowed opacity-70",
                        )}
                    >
                        <span
                            className={cn(
                                "w-[50px] flex-none rounded-[calc(var(--site-radius)+10px)] py-1.5 text-center",
                                quietFill,
                            )}
                        >
                            <span className="text-site-muted block text-[11.5px] font-semibold uppercase tracking-[0.06em]">
                                {dow}
                            </span>
                            <span className="font-display block text-xl font-semibold leading-[1.1]">
                                {n}
                            </span>
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-semibold">
                                {timeIn(s.startAt, zone)} – {end} ·{" "}
                                {dateText(date)}
                            </span>
                            {s.staffName ? (
                                <span className="text-site-body mt-0.5 block text-[13px]">
                                    With {s.staffName}
                                </span>
                            ) : null}
                        </span>
                        <span
                            className={cn(
                                "whitespace-nowrap text-[13px] font-semibold",
                                left <= 0
                                    ? "text-site-muted"
                                    : left <= 3
                                      ? "text-site-fg"
                                      : "text-site-body",
                            )}
                        >
                            {placesText(left)}
                        </span>
                    </button>
                );
            })}
            {more ? (
                <button
                    type="button"
                    onClick={onMore}
                    className={cn(
                        "text-site-fg justify-self-start text-sm font-semibold underline",
                        focusRing,
                    )}
                >
                    Show more classes
                </button>
            ) : null}
        </div>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    error,
    type = "text",
    autoComplete,
    placeholder,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error: string | null;
    type?: string;
    autoComplete?: string;
    placeholder?: string;
}) {
    return (
        <div className="mt-3 first-of-type:mt-0">
            <label
                htmlFor={id}
                className="text-site-fg block text-[13.5px] font-medium"
            >
                {label}
            </label>
            <input
                id={id}
                type={type}
                autoComplete={autoComplete}
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className={cn(
                    "border-site-border text-site-fg placeholder:text-site-muted mt-1.5 block h-[45px] w-full rounded-[calc(var(--site-radius)+7px)] border px-3.5 text-[15px]",
                    inputFill,
                    focusRing,
                )}
            />
            {error ? (
                <p
                    id={`${id}-error`}
                    className="text-site-fg mt-1.5 text-[12.5px] font-medium"
                >
                    {error}
                </p>
            ) : null}
        </div>
    );
}

function PayOption({
    on,
    label,
    sub,
    onPick,
}: {
    on: boolean;
    label: string;
    sub: string;
    onPick: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            onClick={onPick}
            className={optionClasses(on)}
        >
            <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{label}</span>
                <span className="text-site-body mt-0.5 block text-[13px]">
                    {sub}
                </span>
            </span>
        </button>
    );
}

function DoneCard({
    phase,
    headingRef,
    business,
    rules,
    onAgain,
}: {
    phase: Extract<Phase, { kind: "done" }>;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    business: string;
    rules: BookingPageData["rules"];
    onAgain: () => void;
}) {
    const { booking } = phase;
    const addToCalendar = () => {
        const ics = buildIcs({
            reference: booking.reference,
            title: `${booking.serviceName} · ${business}`,
            startAt: booking.startAt,
            endAt: booking.endAt,
            description: changeText(business, rules),
        });
        const url = URL.createObjectURL(
            new Blob([ics], { type: "text/calendar;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "booking.ics";
        a.click();
        URL.revokeObjectURL(url);
    };
    const payText = phase.paid
        ? `Paid ${phase.price ?? ""} online.`
        : phase.price
          ? `Pay ${phase.price} at the front desk when you arrive.`
          : "Nothing to pay in advance.";
    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <div
                aria-hidden="true"
                className="bg-site-accent text-site-accent-fg flex size-11 items-center justify-center rounded-full text-[22px] font-bold"
            >
                ✓
            </div>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-site-fg mb-1.5 mt-4 text-[32px] font-semibold tracking-[-0.03em] outline-none"
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg text-[15px] leading-[1.55] opacity-90">
                {booking.serviceName} · {phase.when}
            </p>
            <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                {payText}
            </p>
            {booking.meetingUrl ? (
                <p className="text-site-body mt-2 text-[13.5px]">
                    Join online:{" "}
                    <a
                        href={booking.meetingUrl}
                        className="text-site-fg font-semibold underline"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {booking.meetingUrl}
                    </a>
                </p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={addToCalendar}
                    className={cn(
                        "border-site-border bg-site-surface text-site-fg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold",
                        focusRing,
                    )}
                >
                    Add to calendar
                </button>
                <button
                    type="button"
                    onClick={onAgain}
                    className={cn(
                        "text-site-fg h-11 cursor-pointer px-4 text-sm font-semibold underline",
                        focusRing,
                    )}
                >
                    Book another
                </button>
            </div>
            <p className="text-site-muted border-site-border mt-4 border-t pt-3.5 text-[12.5px] leading-[1.55]">
                {changeText(business, rules)}
            </p>
        </div>
    );
}

function PayingCard({
    phase,
    now,
    zone,
    headingRef,
    serviceName,
    busy,
    onDesk,
    onBack,
}: {
    phase: Extract<Phase, { kind: "paying" }>;
    now: number | null;
    zone: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    serviceName: string;
    /** Letting the hold go, or booking it at the desk, is under way. */
    busy: boolean;
    onDesk: () => void;
    onBack: () => void;
}) {
    const until = phase.booking.holdExpiresAt;
    const minutesLeft =
        until && now !== null
            ? Math.max(0, Math.ceil((Date.parse(until) - now) / 60_000))
            : null;
    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
            >
                Pay {phase.price} to confirm your place
            </h2>
            <p className="text-site-fg mt-1.5 text-[15px] leading-[1.55] opacity-90">
                {serviceName} · {phase.when}
            </p>
            {until ? (
                <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                    It&apos;s held for you until {timeIn(until, zone)}
                    {minutesLeft !== null
                        ? ` — ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} left`
                        : ""}
                    . If it isn&apos;t paid by then, the time goes back on the
                    calendar and nothing is charged.
                </p>
            ) : null}

            {phase.payError ? (
                <div className="mt-4">
                    <p role="alert" className={destructiveAlertClasses}>
                        {phase.payError}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onDesk}
                            aria-disabled={busy}
                            className={cn(
                                "bg-site-fg text-site-bg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] px-4 text-sm font-semibold",
                                busy && "cursor-default opacity-60",
                                focusRing,
                            )}
                        >
                            {busy ? "Booking…" : "Book it to pay at the desk"}
                        </button>
                        <button
                            type="button"
                            onClick={onBack}
                            aria-disabled={busy}
                            className={cn(
                                "text-site-fg h-11 cursor-pointer px-4 text-sm font-semibold underline",
                                busy && "cursor-default opacity-60",
                                focusRing,
                            )}
                        >
                            Pick another time
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    role="status"
                    className={cn(
                        "border-site-border mt-4 rounded-[calc(var(--site-radius)+10px)] border border-dashed p-4",
                        quietFill,
                    )}
                >
                    <p className="text-site-fg text-sm font-semibold">
                        {phase.handoff
                            ? `${phase.handoff.provider.charAt(0)}${phase.handoff.provider.slice(1).toLowerCase()} checkout opens here`
                            : "Starting the payment…"}
                    </p>
                    <p className="text-site-muted mt-1 text-[12.5px]">
                        This page moves on by itself once the payment has gone
                        through.
                    </p>
                </div>
            )}

            {phase.payError ? null : (
                <button
                    type="button"
                    onClick={onBack}
                    aria-disabled={busy}
                    className={cn(
                        "text-site-fg mt-4 cursor-pointer text-sm font-semibold underline",
                        busy && "cursor-default opacity-60",
                        focusRing,
                    )}
                >
                    Cancel and pick another time
                </button>
            )}
        </div>
    );
}

/**
 * The booking page when its business could not be read: said plainly, in the
 * site's palette, with nothing to click that cannot work.
 */
export function BookingUnavailable({ business }: { business: string }) {
    return (
        <div className="bg-site-bg mx-auto max-w-[1060px] px-5 py-16">
            <div className={cn(card, "max-w-xl")}>
                <h1 className="font-display text-site-fg text-[26px] font-semibold tracking-[-0.03em]">
                    We couldn&apos;t open the booking page
                </h1>
                <p className="text-site-body mt-2 text-sm">
                    Something went wrong on our side. Try again in a moment, or
                    get in touch with {business} to book.
                </p>
            </div>
        </div>
    );
}
