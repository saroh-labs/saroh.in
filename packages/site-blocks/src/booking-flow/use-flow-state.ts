"use client";

import { useCallback, useRef, useState } from "react";

import type { SignedInCustomer } from "../account/api";
import type { BookingLookup } from "../account/booking-page";
import { accountPhone } from "./booking-account";
import type { Phase } from "./flow-state";
import type { BookingWhere, BookPay } from "./model";
import type { FlowMessage } from "./steps/flow-message";
import type { ChooseStep, Finished } from "./traverse";
import type { Paying } from "./use-hold-watch";

/**
 * The booking page's own state, beside the times (`use-times.ts`): who is
 * booking and what they typed, how they'll pay, what the page says, where
 * it stands (choosing, paying, booked) and on which step, and the keys of
 * the attempt under way. One object, so the hooks that act on it take it
 * whole.
 */
export function useFlowState({
    customer: signedIn,
    opened,
}: {
    customer: SignedInCustomer | null;
    /** What the address opened on: the step, and a booking read by its ref. */
    opened: {
        step: ChooseStep;
        ref: string | null;
        booked: BookingLookup | null;
    };
}) {
    const [customer, setCustomer] = useState(signedIn);
    const [name, setName] = useState("");
    const [sheetOpen, setSheetOpen] = useState(false);
    // A test release (DEC-071, T6): the last step stops here instead.
    const [testStop, setTestStop] = useState(false);
    const [signingOut, setSigningOut] = useState(false);
    // Where, for a service offered either way, and the note (E7).
    const [where, setWhere] = useState<BookingWhere>("IN_PERSON");
    const [note, setNote] = useState("");
    // A phone to reach them on (UX-049), optional; theirs if signed in.
    const [phoneNo, setPhoneNo] = useState(() => accountPhone(signedIn));
    const [touched, setTouched] = useState(false);
    const [payChoice, setPayChoice] = useState<BookPay | null>(null);
    const [submitting, setSubmitting] = useState(false);
    // What the page says under the steps: an error, or news that isn't one
    // (A10's credit found, a place held) — never the red alert for the latter.
    const [message, setMessage] = useState<FlowMessage | null>(null);
    const sayError = useCallback(
        (text: string | null) =>
            setMessage(text === null ? null : { text, tone: "error" }),
        [],
    );
    const sayNotice = useCallback(
        (text: string) => setMessage({ text, tone: "notice" }),
        [],
    );
    const [phase, setPhase] = useState<Phase>(() =>
        opened.ref && opened.booked
            ? { kind: "booked", ref: opened.ref, lookup: opened.booked }
            : { kind: "choose" },
    );
    // A hold kept while they went Back a step, and a booking made here
    // while they went Back from it (U9).
    const [aside, setAside] = useState<Paying | null>(null);
    const [finished, setFinished] = useState<Finished | null>(null);
    const [leaving, setLeaving] = useState(false);
    const [stepState, setStepState] = useState<ChooseStep>(opened.step);

    return {
        customer,
        setCustomer,
        name,
        setName,
        sheetOpen,
        setSheetOpen,
        testStop,
        setTestStop,
        signingOut,
        setSigningOut,
        where,
        setWhere,
        note,
        setNote,
        phoneNo,
        setPhoneNo,
        touched,
        setTouched,
        payChoice,
        setPayChoice,
        submitting,
        setSubmitting,
        message,
        sayError,
        sayNotice,
        phase,
        setPhase,
        aside,
        setAside,
        finished,
        setFinished,
        leaving,
        setLeaving,
        stepState,
        setStepState,
    };
}

export type FlowState = ReturnType<typeof useFlowState>;

/**
 * The keys of the booking attempt under way, kept out of the page's state
 * so nothing drawn reads them: one idempotency key per attempt, and the
 * desk's own after a hold is let go (#508).
 */
export function useAttemptKeys() {
    // One idempotency key per attempt: a double tap sends the same one.
    const attemptKey = useRef<string | null>(null);
    // Booking it at the desk after letting a hold go (#508): its own key
    // per attempt, and one request at a time — the ref, since a second tap
    // can land before the disabled buttons are drawn.
    const deskKey = useRef<string | null>(null);
    const leavingRef = useRef(false);
    const resetAttempt = useCallback(() => {
        attemptKey.current = null;
    }, []);

    return { attemptKey, deskKey, leavingRef, resetAttempt };
}

export type AttemptKeys = ReturnType<typeof useAttemptKeys>;
