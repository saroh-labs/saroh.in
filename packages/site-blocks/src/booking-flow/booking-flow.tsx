"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { cn } from "../lib/utils";
import type { Result } from "./api";
import { book, fetchDays, fetchHold, releaseHold, startPayment } from "./api";
import { kicker, newKey, usePhone, zoneName } from "./flow-helpers";
import type { DaysState, Phase } from "./flow-state";
import type {
    BookingDay,
    BookingPageData,
    BookingStart,
    BookResult,
} from "./model";
import {
    dateIn,
    dateText,
    formatMoney,
    looksLikeEmail,
    phoneProblem,
    rulesText,
    timeIn,
} from "./model";
import { DetailsStep } from "./steps/details-step";
import { DoneCard } from "./steps/done-card";
import { ExpiredCard } from "./steps/expired-card";
import { PayStep } from "./steps/pay-step";
import { PayingCard } from "./steps/paying-card";
import { ServiceStep } from "./steps/service-step";
import { WhenStep } from "./steps/when-step";
import { card } from "./styles";
import { PhoneBar, SummaryAside } from "./summary";

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

    // Another time, person or way of paying is another request: its own key,
    // so a retry never answers with what the first try booked (#508). The
    // same choice again keeps it.
    const pickStart = (next: BookingStart | null) => {
        if (
            next?.startAt !== start?.startAt ||
            next?.staffId !== start?.staffId
        ) {
            attemptKey.current = null;
        }
        setStart(next);
    };
    const pickPay = (next: "NOW" | "DESK") => {
        if (next !== pay) attemptKey.current = null;
        setPayChoice(next);
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

    const summary = {
        dueLabel,
        due,
        block,
        submitError,
        submitting,
        onConfirm: () => void confirm(),
    };
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
                        <ExpiredCard
                            when={phase.when}
                            headingRef={headingRef}
                            onAgain={backToChoosing}
                        />
                    ) : (
                        <>
                            <ServiceStep
                                services={services}
                                serviceId={serviceId}
                                onPick={pickService}
                            />

                            {service ? (
                                <WhenStep
                                    daysState={daysState}
                                    days={days}
                                    isClass={isClass}
                                    day={day}
                                    sessions={sessions.slice(0, sessionsShown)}
                                    more={sessions.length > sessionsShown}
                                    zone={zone}
                                    phone={phone}
                                    service={service}
                                    chosen={chosenStart}
                                    business={page.businessName}
                                    onRetry={() => {
                                        setDaysState({
                                            kind: "loading",
                                            serviceId: service.id,
                                        });
                                        loadDays(service.id);
                                    }}
                                    onDay={(d) => {
                                        setDate(d);
                                        pickStart(null);
                                    }}
                                    onStart={pickStart}
                                    onMore={() =>
                                        setSessionsShown(
                                            (n) => n + SESSIONS_SHOWN,
                                        )
                                    }
                                />
                            ) : null}

                            {chosenStart ? (
                                <DetailsStep
                                    ids={ids}
                                    business={page.businessName}
                                    name={name}
                                    email={email}
                                    phoneNo={phoneNo}
                                    touched={touched}
                                    emailOk={emailOk}
                                    phoneError={phoneError}
                                    onName={setName}
                                    onEmail={setEmail}
                                    onPhone={setPhoneNo}
                                />
                            ) : null}

                            {chosenStart && whoOk && price ? (
                                <PayStep
                                    canPayNow={canPayNow}
                                    pay={pay}
                                    price={price}
                                    isClass={isClass}
                                    onPick={pickPay}
                                />
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
                    <SummaryAside
                        serviceName={service?.name ?? null}
                        whenText={whenText}
                        name={name}
                        hasService={!!service}
                        confirmLabel={confirmLabel}
                        rules={rules}
                        {...summary}
                    />
                ) : null}
            </div>

            {showBar && rules ? (
                <p className="text-site-muted mx-auto mt-[18px] max-w-[1060px] px-5 text-[12.5px] leading-normal">
                    {rules}
                </p>
            ) : null}

            {showBar ? (
                <PhoneBar
                    hasService={!!service}
                    whenText={whenText}
                    barLabel={barLabel}
                    {...summary}
                />
            ) : null}
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
