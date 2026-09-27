"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import type {
    SignedInCustomer,
    SignInApi,
    SignInOptions,
} from "../account/api";
import { SignInSheet } from "../account/sign-in-sheet";
import { destructiveAlertClasses } from "../alert";
import { DEFAULT_API_URL } from "../api-url";
import { cn } from "../lib/utils";
import type { BookSignedIn, Result } from "./api";
import {
    fetchDays,
    fetchHold,
    OFFLINE_RESULT,
    releaseHold,
    startPayment,
} from "./api";
import {
    kicker,
    newKey,
    nextChosenText,
    nextFreeStart,
    usePhone,
    zoneName,
} from "./flow-helpers";
import type { DaysState, Phase } from "./flow-state";
import { findInitialStart, INITIAL_TIME_GONE } from "./initial-start";
import type {
    BookingDay,
    BookingPageData,
    BookingStart,
    BookingWhere,
    BookResult,
} from "./model";
import {
    asksWhere,
    dateIn,
    dateText,
    formatMoney,
    rulesText,
    timeIn,
    whereText,
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
 * Sign-in is always on (A9, ADR-011): the last step is "Continue to sign
 * in", which opens the sign-in sheet, and the booking is made the moment
 * the code checks — the time and everything chosen stay as they were. A
 * customer already signed in reads "Booking as ‹name› · Not you?" and books
 * with no code. There is no guest form and no guest fallback: when a code
 * can't be sent, the sheet says so with the business's phone and nothing is
 * booked. The booking goes through the site's server (`account.book`), with
 * the session; the same person twice in one session is refused.
 *
 * Pay now holds the place for 15 minutes while the booker pays through the
 * business's own provider; the page watches the hold and confirms when the
 * provider's webhook does. Pay at the desk books it outright. No credits
 * online yet (A10): packs and memberships are used at the desk or by the
 * team in the calendar.
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

/** The session ended between drawing the page and booking. */
const SIGNED_OUT = "Your sign-in has ended. Sign in again to book.";

/**
 * Signing in on the business's site (A9): always on, never a guest path.
 * The app that draws the page passes its server actions in, since the
 * session lives in a host-only cookie only the site's server can read.
 */
export interface BookingAccount {
    /** Who is signed in on this site as the page was drawn, or null. */
    customer: SignedInCustomer | null;
    /** What the sheet needs: the business, its phone, the challenge. */
    options: SignInOptions;
    /** Ask for a code, and check it. */
    signIn: SignInApi;
    /** Book, with the session. */
    book: BookSignedIn;
    /** "Not you?": sign out of this site. */
    signOut: () => Promise<{ ok: boolean }>;
}

export interface BookingFlowProps {
    page: BookingPageData;
    /** Sign-in and booking with it, through the site's server (A9). */
    account: BookingAccount;
    /** Base URL of the public API. See {@link DEFAULT_API_URL}. */
    apiUrl?: string;
    /** A service to open on (`?service=`), when it is one the page offers. */
    initialServiceId?: string | null;
    /** With it, a day and time to choose (`?date=&start=`, On today, G18). */
    initialDate?: string | null;
    initialStart?: string | null;
}

export default function BookingFlow({
    page,
    account,
    apiUrl = DEFAULT_API_URL,
    initialServiceId = null,
    initialDate = null,
    initialStart = null,
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
    const [date, setDate] = useState<string | null>(first ? initialDate : null);
    const [start, setStart] = useState<BookingStart | null>(null);
    // Who is signed in (A9), and a name for an account that has none.
    const [customer, setCustomer] = useState<SignedInCustomer | null>(
        account.customer,
    );
    const [name, setName] = useState("");
    const [sheetOpen, setSheetOpen] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    // Where, for a service offered either way, and the note (E7).
    const [where, setWhere] = useState<BookingWhere>("IN_PERSON");
    const [note, setNote] = useState("");
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
    // The start that went while they signed in: the next free one after it
    // is chosen once the times are read again (A9).
    const offerAfter = useRef<string | null>(null);

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

    // A time linked to from On today (G18): chosen once its days arrive, if
    // still free; gone, the page opens on the day and says so.
    const linked = useRef(
        first && initialDate && initialStart
            ? { date: initialDate, time: initialStart }
            : null,
    );
    const firstIsClass = first?.kind === "class";
    useEffect(() => {
        const want = linked.current;
        if (!want || daysState.kind !== "ready") return;
        linked.current = null;
        if (daysState.serviceId !== firstId) return;
        const found = findInitialStart(
            daysState.days,
            want.date,
            want.time,
            firstIsClass,
        );
        if (found) setStart(found);
        else setSubmitError(INITIAL_TIME_GONE);
    }, [daysState, firstId, firstIsClass]);

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
    const pickWhere = (next: BookingWhere) => {
        if (next !== where) attemptKey.current = null;
        setWhere(next);
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

    const asks = asksWhere(service);
    /** What the booking page asks beyond the time, as the API takes it. */
    const extras = {
        ...(asks ? { locationType: where } : {}),
        ...(note.trim() ? { intakeNote: note.trim() } : {}),
    };

    // A name is asked for only while the account has none (A9).
    const asksName = !customer?.name;
    const whoOk = !asksName || name.trim().length > 1;
    const bookerName = (customer?.name ?? name).trim();
    const bookerFirst = bookerName.split(/\s+/)[0] ?? "";

    const block = !service
        ? "Pick what you'd like to book."
        : !chosenStart
          ? "Pick a time."
          : !whoOk
            ? "Add your name."
            : "";

    const whenText = chosenStart
        ? `${dateText(dateIn(chosenStart.startAt, zone), true)} at ${timeIn(chosenStart.startAt, zone)}${
              chosenStart.staffName ? ` with ${chosenStart.staffName}` : ""
          }`
        : "";

    const dueLabel =
        pay === "NOW" ? "To pay now" : price ? "Pay at the desk" : "To pay";
    const due = price ?? formatMoney(0, service?.currency ?? "INR") ?? "₹0";
    // Not signed in yet, the last step is signing in (A9, the Customer Site
    // design's "Continue to sign in"); the booking follows the code.
    const confirmLabel = !customer
        ? "Continue to sign in"
        : pay === "NOW"
          ? `Pay ${price ?? ""} and book`
          : price
            ? "Book — pay at the desk"
            : "Book";
    const barLabel = !customer
        ? "Continue to sign in"
        : pay === "NOW"
          ? "Pay and book"
          : "Book";
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
                                ? {
                                      kind: "expired",
                                      when: p.when,
                                      checkoutPaid: p.checkoutPaid,
                                  }
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
                        // Confirmed, the booking carries its link to join
                        // when it is online (E7).
                        const standing = result.value.booking;
                        return {
                            kind: "done",
                            booking: standing
                                ? {
                                      ...p.booking,
                                      online: standing.online,
                                      meetingUrl: standing.meetingUrl,
                                  }
                                : p.booking,
                            paid: true,
                            price: p.price,
                            when: p.when,
                            first: bookerFirst,
                        };
                    }
                    if (state === "RELEASED" || state === "CANCELLED") {
                        return {
                            kind: "expired",
                            when: p.when,
                            checkoutPaid: p.checkoutPaid,
                        };
                    }
                    return p;
                });
            });
        }, POLL_MS);
        return () => {
            clearInterval(clock);
            clearInterval(poll);
        };
    }, [apiUrl, payingToken, bookerFirst]);

    // Each new screen puts focus on its heading, so a screen reader hears it.
    useEffect(() => {
        if (phase.kind !== "choose") headingRef.current?.focus();
    }, [phase.kind]);

    /**
     * The time chosen is gone: say so, and show what is left — and, when it
     * went while they signed in, choose the next free one (`offerNext`).
     */
    const timeGone = (id: string, message: string, offerNext?: string) => {
        setPhase({ kind: "choose" });
        setSubmitError(message);
        attemptKey.current = null;
        setStart(null);
        offerAfter.current = offerNext ?? null;
        loadDays(id);
    };

    // After a time went while signing in: the next free one, chosen.
    useEffect(() => {
        const after = offerAfter.current;
        if (!after || daysState.kind !== "ready") return;
        if (daysState.serviceId !== serviceId) return;
        offerAfter.current = null;
        const next = nextFreeStart(daysState.days, after, isClass);
        if (!next) return;
        setDate(dateIn(next.startAt, daysState.days.timezone));
        setStart(next);
        setSubmitError(nextChosenText(next, daysState.days.timezone));
    }, [daysState, serviceId, isClass]);

    /** The name to send: only for an account that has none yet. */
    const nameFor = (who: SignedInCustomer) =>
        !who.name && name.trim() ? { bookerName: name.trim() } : {};

    const confirm = async () => {
        setTouched(true);
        if (block || !service || !chosenStart || submitting) return;
        // Not signed in: the sheet, and the booking once the code checks.
        if (!customer) {
            setSubmitError(null);
            setSheetOpen(true);
            return;
        }
        await submit(customer, false);
    };

    /** Signed in from the sheet: book straight away, on what was chosen. */
    const signedIn = (who: SignedInCustomer) => {
        setCustomer(who);
        void submit(who, true);
    };

    /** "Not you?": sign out, and ask again at the last step. */
    const notYou = async () => {
        if (signingOut) return;
        setSigningOut(true);
        const out = await account
            .signOut()
            .catch(() => ({ ok: false }) as const);
        setSigningOut(false);
        if (!out.ok) {
            setSubmitError("We couldn't sign you out. Try again.");
            return;
        }
        setCustomer(null);
        setName("");
        setSubmitError(null);
        attemptKey.current = null;
    };

    const submit = async (who: SignedInCustomer, justSignedIn: boolean) => {
        if (!service || !chosenStart) return;
        setSubmitting(true);
        setSubmitError(null);
        attemptKey.current ??= newKey();
        const result = await account
            .book({
                serviceId: service.id,
                startAt: chosenStart.startAt,
                ...nameFor(who),
                idempotencyKey: attemptKey.current,
                staffId: chosenStart.staffId ?? undefined,
                pay,
                ...extras,
            })
            .catch((): Result<BookResult> => OFFLINE_RESULT);
        setSubmitting(false);
        if (!result.ok) {
            if (result.reason === "already-booked") {
                // Theirs already: nothing to pick again, nothing to retry.
                attemptKey.current = null;
                setSubmitError(result.message);
                return;
            }
            if (result.status === 401) {
                attemptKey.current = null;
                setCustomer(null);
                setSubmitError(SIGNED_OUT);
                return;
            }
            // Taken meanwhile: show what is left, and a fresh attempt.
            if (result.status === 409) {
                timeGone(
                    service.id,
                    result.message,
                    justSignedIn ? chosenStart.startAt : undefined,
                );
            } else setSubmitError(result.message);
            return;
        }
        attemptKey.current = null;
        const booking = result.value;
        const firstName = (who.name ?? name).trim().split(/\s+/)[0] ?? "";
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
            const result: Result<BookResult> = customer
                ? await account
                      .book({
                          serviceId: service.id,
                          startAt: chosenStart.startAt,
                          ...nameFor(customer),
                          idempotencyKey: deskKey.current,
                          staffId: chosenStart.staffId ?? undefined,
                          pay: "DESK",
                          ...extras,
                      })
                      .catch((): Result<BookResult> => OFFLINE_RESULT)
                : { ok: false, status: 401, message: SIGNED_OUT };
            if (result.ok && result.value.state === "CONFIRMED") {
                deskKey.current = null;
                setPhase({
                    kind: "done",
                    booking: result.value,
                    paid: false,
                    price,
                    when: held.when,
                    first: bookerFirst,
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
        setWhere("IN_PERSON");
        setNote("");
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
                    <h1 className="font-site-heading mt-2.5 text-balance text-[clamp(34px,6vw,56px)] font-semibold leading-[1.02] tracking-[-0.035em]">
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
                            <h2 className="font-site-heading text-site-fg text-[19px] font-semibold tracking-[-0.02em]">
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
                            where={
                                service
                                    ? whereText(
                                          service,
                                          phase.booking,
                                          services,
                                          page.businessName,
                                      )
                                    : null
                            }
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
                            business={page.businessName}
                            booker={{
                                name: bookerName,
                                email: customer?.email ?? "",
                            }}
                            busy={leaving}
                            onDesk={() => void leaveHold("desk")}
                            onBack={() => void leaveHold("choose")}
                            onPaid={() =>
                                setPhase((p) =>
                                    p.kind === "paying"
                                        ? { ...p, checkoutPaid: true }
                                        : p,
                                )
                            }
                        />
                    ) : phase.kind === "expired" ? (
                        <ExpiredCard
                            when={phase.when}
                            business={page.businessName}
                            checkoutPaid={phase.checkoutPaid}
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
                                    customer={customer}
                                    name={name}
                                    touched={touched}
                                    signingOut={signingOut}
                                    onName={setName}
                                    onNotYou={() => void notYou()}
                                    asksWhere={asks}
                                    where={where}
                                    note={note}
                                    onWhere={pickWhere}
                                    onNote={setNote}
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
                        name={
                            bookerName !== ""
                                ? bookerName
                                : (customer?.email ?? "")
                        }
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

            <SignInSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                options={account.options}
                api={account.signIn}
                purpose="book"
                onSignedIn={signedIn}
            />
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
                <h1 className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em]">
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
