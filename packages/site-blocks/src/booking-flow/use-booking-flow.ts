"use client";

import { phoneNumberProblem } from "@saroh/block-contract";
import { useCallback, useEffect, useRef } from "react";

import { timeWords } from "../lib/clock";
import { useQrSource } from "../qr-source";
import { useTestRelease } from "../test-release/context";
import type { BookingFlowProps } from "./booking-account";
import type { WaitMode } from "./flow-words";
import { blockOf, payWords } from "./flow-words";
import type { BookingStart, BookingWhere, BookPay } from "./model";
import { asksWhere, dateIn, dateText, timeIn } from "./model";
import type { BookingStep, StepUrl } from "./step-url";
import { asksWho, EMPTY_STEP_URL, resolveStep } from "./step-url";
import type { ChooseStep } from "./traverse";
import { traverseTo } from "./traverse";
import { useBookingActions } from "./use-booking-actions";
import { useCredit } from "./use-credit";
import { useAttemptKeys, useFlowState } from "./use-flow-state";
import { useHoldWatch } from "./use-hold-watch";
import { useKeepDraft, useKeptChoice } from "./use-kept-choice";
import { useStepHistory } from "./use-step-history";
import { useTimes } from "./use-times";
import { useWaitlist } from "./use-waitlist";

/** The step heading a choosing step's focus goes to (`StepHead`'s `n`). */
const STEP_HEAD: Record<ChooseStep, number> = {
    what: 1,
    who: 2,
    when: 2,
    details: 3,
};

/**
 * The booking page's engine (U9): what is chosen, the step it is on and
 * the address that says so, the hold being paid, and what the page does.
 * The same for every look; `booking-flow.tsx` only draws it.
 */
export function useBookingFlow(
    props: BookingFlowProps,
    /** The flow's root and the open screen's heading, for focus. */
    refs: {
        root: React.RefObject<HTMLDivElement | null>;
        heading: React.RefObject<HTMLHeadingElement | null>;
    },
) {
    const { page, account, apiUrl = "" } = props;
    const services = page.services;
    const first =
        services.find((s) => s.id === (props.initialServiceId ?? null)) ?? null;
    const initialDate = props.initialDate ?? null;
    const initialStart = props.initialStart ?? null;
    const initialStaff = props.initialStaff ?? null;
    const initialRef = props.initialRef ?? null;

    const s = useFlowState({
        customer: account.customer,
        opened: {
            step: openedStep(),
            ref: props.initialStep === "done" ? initialRef : null,
            booked: props.booked ?? null,
        },
    });
    const keys = useAttemptKeys();
    const times = useTimes({
        apiUrl,
        services,
        first,
        initialDate,
        initialStaff,
        initialStart,
        onChange: keys.resetAttempt,
        fallbackZone: page.timezone,
    });
    const { service, isClass, zone } = times;
    // The QR code whose scan opened this page (`qr-source.ts`): the flow
    // keeps the address's other parameters, so it is there on every step.
    const source = useQrSource();
    const testRelease = useTestRelease() !== null;
    const { root: rootRef, heading: headingRef } = refs;

    // ── What is chosen ──────────────────────────────────────────────────

    const waitlistOn = !!account.waitlist && isClass;
    const chosen = times.chosen;
    // A full class stays choosable while it has a waitlist to join (A12).
    const chosenStart: BookingStart | null =
        chosen && (!isClass || (chosen.placesLeft ?? 0) > 0 || waitlistOn)
            ? chosen
            : null;
    const waitlist = useWaitlist(
        account.waitlist,
        s.customer?.email ?? null,
        waitlistOn && service ? service.id : null,
    );
    const full = !!chosenStart && isClass && (chosenStart.placesLeft ?? 0) <= 0;
    const place = full ? waitlist.placeOf(chosenStart.startAt) : undefined;
    const waitMode: WaitMode = !full
        ? null
        : place?.status === "OFFERED"
          ? "held"
          : place
            ? "waiting"
            : "join";
    const credit = useCredit(
        account.credit,
        s.customer?.email ?? null,
        service?.id ?? null,
        chosenStart?.startAt ?? null,
    );
    const words = payWords({
        page,
        service,
        credit: credit.credit,
        payChoice: s.payChoice,
        signedIn: s.customer !== null,
        waitMode,
    });

    const asks = asksWhere(service);
    // A time only one way can have (DEC-087) settles Where.
    const onlyWhere = asks ? (chosenStart?.only ?? null) : null;
    const whereNow: BookingWhere = onlyWhere ?? s.where;
    const extras: Record<string, string> = {
        ...(asks ? { locationType: whereNow } : {}),
        ...(s.note.trim() ? { intakeNote: s.note.trim() } : {}),
        ...(s.phoneNo.trim() ? { bookerPhone: s.phoneNo.trim() } : {}),
        ...(source ? { source } : {}),
    };
    // A name is asked for only once signed in, and only while the account
    // has none (A9): nothing is typed that would then be thrown away.
    const asksName = s.customer !== null && !s.customer.name;
    const whoOk = !asksName || s.name.trim().length > 1;
    const bookerName = (s.customer?.name ?? s.name).trim();
    const bookerFirst = bookerName.split(/\s+/)[0] ?? "";
    // A phone is optional, but one typed must be a number to ring (#1036).
    const phoneOk = words.waiting || phoneNumberProblem(s.phoneNo) === null;
    const block = blockOf({
        hasService: !!service,
        unpayable: words.unpayable,
        hasStart: !!chosenStart,
        whoOk,
        phoneOk,
    });
    const whenText = chosenStart
        ? `${dateText(dateIn(chosenStart.startAt, zone), true)} at ${timeWords(chosenStart.startAt, zone)}${
              chosenStart.staffName ? ` with ${chosenStart.staffName}` : ""
          }`
        : "";

    // ── The step, and the address ───────────────────────────────────────

    const kept = useKeptChoice({
        times,
        services,
        waitlistOn,
        setWhere: s.setWhere,
        setPayChoice: s.setPayChoice,
        say: { error: s.sayError, notice: s.sayNotice },
    });
    const { pending } = times;
    const { phase } = s;
    const chooseStep: ChooseStep = !service
        ? "what"
        : s.stepState === "details"
          ? chosenStart || pending
              ? "details"
              : "when"
          : s.stepState === "who" &&
              asksWho({ people: service.staff.length, isClass })
            ? "who"
            : "when";
    const step: BookingStep =
        phase.kind === "done" ||
        phase.kind === "waitlisted" ||
        phase.kind === "booked"
            ? "done"
            : phase.kind === "paying" || phase.kind === "expired"
              ? "pay"
              : chooseStep;
    // A booking made, or read by its reference, is named by that alone:
    // its ticket's address carries nothing of the choosing.
    const bookedRef =
        phase.kind === "done"
            ? phase.booking.reference
            : phase.kind === "booked"
              ? phase.ref
              : null;
    const want: StepUrl = bookedRef
        ? { ...EMPTY_STEP_URL, step: "done", ref: bookedRef }
        : {
              step,
              service: service?.id ?? null,
              staff: service ? times.person : null,
              date: chosenStart
                  ? dateIn(chosenStart.startAt, zone)
                  : (pending?.date ?? times.date),
              start: chosenStart
                  ? timeIn(chosenStart.startAt, zone)
                  : (pending?.time ?? null),
              move: null,
              ref: null,
          };
    // Back and Forward put focus on the step's own heading (U9).
    const focusAfter = useRef(false);
    const history = useStepHistory({
        want,
        onTraverse: (url) => {
            traverseTo(url, {
                services,
                phase,
                setPhase: s.setPhase,
                aside: s.aside,
                setAside: s.setAside,
                finished: s.finished,
                setFinished: s.setFinished,
                times,
                setPending: times.setPending,
                setStep: s.setStepState,
                sayError: s.sayError,
                resetAttempt: keys.resetAttempt,
                lookup: account.booking,
            });
            focusAfter.current = true;
        },
    });
    useKeepDraft({
        restoring: kept.restoring,
        phaseKind: phase.kind,
        times,
        where: s.where,
        pay: s.payChoice,
        hadNote: s.note.trim() !== "",
        address: JSON.stringify(want),
    });
    useEffect(() => {
        if (!focusAfter.current) return;
        focusAfter.current = false;
        const heading =
            phase.kind !== "choose"
                ? headingRef.current
                : rootRef.current?.querySelector<HTMLElement>(
                      `[data-step="${STEP_HEAD[chooseStep]}"] h2`,
                  );
        heading?.focus();
    });
    // Each new screen puts focus on its heading, so a screen reader hears it.
    useEffect(() => {
        if (phase.kind !== "choose") headingRef.current?.focus();
    }, [phase.kind, headingRef]);

    const hold = useHoldWatch({
        apiUrl,
        phase,
        setPhase: s.setPhase,
        aside: s.aside,
        setAside: s.setAside,
        bookerFirst,
        leavingRef: keys.leavingRef,
    });
    const { checkHoldNow } = hold;
    /** The provider's window closed on a payment: read the hold now (P1). */
    const checkHold = useCallback(
        () => checkHoldNow.current?.(),
        [checkHoldNow],
    );
    const act = useBookingActions({
        s,
        keys,
        account,
        apiUrl,
        times,
        chosenStart,
        zone,
        block,
        testRelease,
        offerAfter: kept.offerAfter,
        waitMode,
        pay: words.pay,
        credit: credit.credit,
        askCredit: credit.ask,
        reloadCredit: credit.reload,
        putPlace: waitlist.put,
        dropPlace: waitlist.drop,
        price: words.price,
        payingNow: words.payingNow,
        rest: words.rest,
        whenText,
        bookerFirst,
        extras,
        willPush: history.willPush,
    });

    // ── Choosing ────────────────────────────────────────────────────────

    const pick = {
        service: (id: string) => {
            if (id === times.serviceId) return;
            s.sayError(null);
            times.setPending(null);
            times.pickService(id);
            const next = services.find((x) => x.id === id);
            const who =
                !!next &&
                asksWho({
                    people: next.staff.length,
                    isClass: next.kind === "class",
                });
            s.setStepState(who ? "who" : "when");
        },
        person: (next: string | null) => {
            if (!service) return;
            s.sayError(null);
            times.showDays(service.id, { skip: times.skip, person: next });
            s.setStepState("when");
        },
        // Another time, person or way of paying is another request: its
        // own key, so a retry never answers with what the first booked.
        start: (next: BookingStart | null) => {
            if (
                next?.startAt !== times.start?.startAt ||
                next?.staffId !== times.start?.staffId
            ) {
                keys.resetAttempt();
            }
            times.setStart(next);
            s.setStepState(next ? "details" : "when");
        },
        pay: (next: BookPay) => {
            if (next !== words.pay) keys.resetAttempt();
            s.setPayChoice(next);
        },
        where: (next: BookingWhere) => {
            if (next !== s.where) keys.resetAttempt();
            s.setWhere(next);
        },
        again: () => {
            act.bookAnother();
            s.setFinished(null);
            s.setStepState("what");
        },
    };

    return {
        s,
        times,
        step,
        chosenStart,
        waitlistOn,
        placeOf: waitlist.placeOf,
        waitMode,
        words,
        asks,
        onlyWhere,
        whereNow,
        whoOk,
        bookerName,
        block,
        whenText,
        now: hold.now,
        checkHold,
        act,
        pick,
    };

    /** The step the address opened on, as the page can stand on it. */
    function openedStep(): ChooseStep {
        const step = resolveStep(
            {
                step: props.initialStep ?? null,
                service: first?.id ?? null,
                staff: initialStaff,
                date: initialDate,
                start: initialStart,
                move: null,
                ref: initialRef,
            },
            {
                service: first !== null,
                people: first?.staff.length ?? 0,
                isClass: first?.kind === "class",
                hold: false,
                finished: false,
            },
        );
        if (step === "pay" || step === "done") return first ? "when" : "what";
        return step;
    }
}

export type BookingFlowEngine = ReturnType<typeof useBookingFlow>;
