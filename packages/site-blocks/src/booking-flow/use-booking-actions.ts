"use client";

import type { SignedInCustomer } from "../account/api";
import { TEST_RELEASE_REASON } from "../test-release/words";
import type { FlowActionsContext } from "./actions-context";
import type { Result } from "./api";
import {
    CREDIT_GONE,
    creditRequest,
    OFFLINE_RESULT,
    releaseHold,
    startPayment,
} from "./api";
import { accountPhone } from "./booking-account";
import { newKey } from "./flow-helpers";
import { holdActions, SIGNED_OUT } from "./hold-actions";
import type { BookResult } from "./model";
import { creditUsedText } from "./model";
import { TIME_GONE } from "./use-kept-choice";
import type { WaitlistJoined } from "./waitlist";
import { heldForYouText, LEFT_WAITLIST } from "./waitlist";

/**
 * Signed in, they turned out to hold a credit for this class (A10): the page
 * stops before booking so they never pay for what their credit covers.
 */
const CREDIT_FOUND =
    "You have a class credit for this, so we've picked it. Book with 1 credit, or choose another way to pay.";

/**
 * Signed in at the last step, and the account has no name yet: the one
 * thing still to ask before the booking is made.
 */
const NAME_AFTER_SIGN_IN = "You're signed in. Add your name, then book.";

/**
 * What the booking page does: book, join or leave a class's line, sign in
 * at the last step and "Not you?", pay now and let a hold go, and start
 * again. Each keeps the rules it had before the steps went into the
 * address (#508's keys, K-2's hold that may still stand, A9's time gone
 * while signing in, A10's credit found, A12's waitlist).
 */
export function useBookingActions(ctx: FlowActionsContext) {
    const { account, apiUrl, times, chosenStart } = ctx;
    const service = times.service;
    const { nameFor, timeGone, backToChoosing, settleAside, leaveHold } =
        holdActions(ctx);

    const confirm = async () => {
        ctx.s.setTouched(true);
        if (ctx.block || !service || !chosenStart || ctx.s.submitting) return;
        if (ctx.testRelease) {
            ctx.s.sayError(null);
            ctx.s.setTestStop(true);
            return;
        }
        // Not signed in: the sheet, and the booking once the code checks.
        if (!ctx.s.customer) {
            ctx.s.sayError(null);
            ctx.s.setSheetOpen(true);
            return;
        }
        if (await settleAside()) return;
        if (ctx.waitMode === "join") return joinWaitlist(ctx.s.customer);
        if (ctx.waitMode === "waiting") return leaveWaitlist();
        await submit(ctx.s.customer, false);
    };

    /** Join a full class's line (A12); a place already held is booked. */
    const joinWaitlist = async (who: SignedInCustomer) => {
        if (!account.waitlist || !service || !chosenStart) return;
        ctx.s.setSubmitting(true);
        ctx.s.sayError(null);
        const result = await account.waitlist
            .join({ serviceId: service.id, startAt: chosenStart.startAt })
            .catch((): Result<WaitlistJoined> => OFFLINE_RESULT);
        ctx.s.setSubmitting(false);
        if (!result.ok) {
            if (result.reason === TEST_RELEASE_REASON) {
                ctx.s.setTestStop(true);
                return;
            }
            if (result.status === 401) {
                ctx.s.setCustomer(null);
                ctx.s.sayError(SIGNED_OUT);
                return;
            }
            // A place is free now: the times are read again, so it books.
            if (result.reason === "room") times.reloadDays(service.id);
            ctx.s.sayError(result.message);
            return;
        }
        const joined = result.value;
        ctx.putPlace(joined);
        if (joined.status === "OFFERED") {
            ctx.s.sayNotice(heldForYouText(joined.offeredUntil, ctx.zone));
            return;
        }
        ctx.s.setPhase({
            kind: "waitlisted",
            serviceName: service.name,
            when: ctx.whenText,
            first: (who.name ?? ctx.s.name).trim().split(/\s+/)[0] ?? "",
            placeInLine: joined.placeInLine,
            reach: joined.reach,
            email: who.email,
        });
    };

    /** Leave the line for the chosen class (A12). */
    const leaveWaitlist = async () => {
        if (!account.waitlist || !service || !chosenStart) return;
        const startAt = chosenStart.startAt;
        ctx.s.setSubmitting(true);
        ctx.s.sayError(null);
        const result = await account.waitlist
            .leave({ serviceId: service.id, startAt })
            .catch((): Result<{ left: boolean }> => OFFLINE_RESULT);
        ctx.s.setSubmitting(false);
        if (!result.ok) {
            ctx.s.sayError(result.message);
            return;
        }
        ctx.dropPlace(startAt);
        times.setStart(null);
        ctx.s.sayNotice(LEFT_WAITLIST);
    };

    /** Signed in from the sheet: book straight away, on what was chosen. */
    const signedIn = async (who: SignedInCustomer) => {
        ctx.s.setCustomer(who);
        // Their own phone, unless they typed one for this booking.
        if (!ctx.s.phoneNo.trim()) ctx.s.setPhoneNo(accountPhone(who));
        // A full class: they came to join its line (A12).
        if (ctx.waitMode === "join") {
            await joinWaitlist(who);
            return;
        }
        // A credit that covers this class (A10): shown and chosen, and
        // nothing booked or charged until they say so.
        if (service && chosenStart && ctx.pay !== "CREDIT") {
            const offered = await ctx.askCredit(
                who.email,
                service.id,
                chosenStart.startAt,
            );
            if (offered) {
                ctx.keys.attemptKey.current = null;
                ctx.s.setPayChoice("CREDIT");
                ctx.s.sayNotice(CREDIT_FOUND);
                return;
            }
        }
        // An account with no name yet: asked for now, and only now. The
        // time and everything chosen stay; the next press books.
        if (!who.name && ctx.s.name.trim().length < 2) {
            ctx.s.setTouched(false);
            ctx.s.sayNotice(NAME_AFTER_SIGN_IN);
            return;
        }
        void submit(who, true);
    };

    /** "Not you?": sign out, and ask again at the last step. */
    const notYou = async () => {
        if (ctx.s.signingOut) return;
        ctx.s.setSigningOut(true);
        const out = await account
            .signOut()
            .catch(() => ({ ok: false }) as const);
        ctx.s.setSigningOut(false);
        if (!out.ok) {
            ctx.s.sayError("We couldn't sign you out. Try again.");
            return;
        }
        ctx.s.setCustomer(null);
        ctx.s.setName("");
        ctx.s.sayError(null);
        ctx.keys.attemptKey.current = null;
        // A hold of theirs kept while they went Back a step (U9) is theirs
        // alone: let go, so whoever signs in next never pays for it. One
        // that won't let go runs out by itself, unpaid.
        const held = ctx.s.aside;
        if (held) {
            ctx.s.setAside(null);
            await releaseHold(apiUrl, held.token).catch(() => OFFLINE_RESULT);
        }
    };

    const submit = async (who: SignedInCustomer, justSignedIn: boolean) => {
        if (!service || !chosenStart) return;
        const pay = ctx.pay;
        ctx.s.setSubmitting(true);
        ctx.s.sayError(null);
        ctx.keys.attemptKey.current ??= newKey();
        const result = await account
            .book({
                serviceId: service.id,
                startAt: chosenStart.startAt,
                ...nameFor(who),
                idempotencyKey: ctx.keys.attemptKey.current,
                staffId: chosenStart.staffId ?? undefined,
                pay,
                ...(pay === "CREDIT" ? creditRequest(ctx.credit) : {}),
                ...ctx.extras,
            })
            .catch((): Result<BookResult> => OFFLINE_RESULT);
        ctx.s.setSubmitting(false);
        if (!result.ok) {
            if (result.reason === TEST_RELEASE_REASON) {
                ctx.keys.attemptKey.current = null;
                ctx.s.setTestStop(true);
                return;
            }
            if (result.reason === CREDIT_GONE) {
                // Spent or changed meanwhile (another tab, the desk): say
                // so, keep the time, and ask again what they can pay with.
                ctx.keys.attemptKey.current = null;
                ctx.s.setPayChoice(null);
                ctx.s.sayError(result.message);
                ctx.reloadCredit();
                return;
            }
            if (result.reason === "already-booked") {
                // Theirs already: nothing to pick again, nothing to retry.
                ctx.keys.attemptKey.current = null;
                ctx.s.sayError(result.message);
                return;
            }
            if (result.status === 401) {
                ctx.keys.attemptKey.current = null;
                ctx.s.setCustomer(null);
                ctx.s.sayError(SIGNED_OUT);
                return;
            }
            // Taken meanwhile: show what is left, and a fresh attempt.
            if (result.status === 409) {
                timeGone(
                    service.id,
                    result.message,
                    justSignedIn ? chosenStart.startAt : undefined,
                );
            } else ctx.s.sayError(result.message);
            return;
        }
        ctx.keys.attemptKey.current = null;
        const booking = result.value;
        const firstName = (who.name ?? ctx.s.name).trim().split(/\s+/)[0] ?? "";
        if (booking.state === "HELD" && booking.payToken) {
            const token = booking.payToken;
            ctx.s.setPhase({
                kind: "paying",
                booking,
                token,
                handoff: null,
                payError: null,
                when: ctx.whenText,
                price: ctx.payingNow,
                rest: ctx.rest,
                pay,
            });
            const started = await startPayment(apiUrl, token, newKey());
            ctx.s.setPhase((p) =>
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
        ctx.s.setPhase({
            kind: "done",
            booking,
            paid: false,
            price: ctx.price,
            rest: null,
            creditText:
                pay === "CREDIT" && ctx.credit
                    ? creditUsedText(ctx.credit)
                    : null,
            when: ctx.whenText,
            first: firstName,
        });
    };

    /** "Book something else": everything unchosen, a new entry in history. */
    const bookAnother = () => {
        ctx.willPush();
        ctx.s.setPhase({ kind: "choose" });
        times.clear();
        ctx.s.setPayChoice(null);
        ctx.s.setWhere("IN_PERSON");
        ctx.s.setNote("");
        ctx.s.setPhoneNo(accountPhone(ctx.s.customer));
        ctx.s.setTouched(false);
        ctx.s.sayError(null);
    };

    return {
        confirm,
        signedIn,
        notYou,
        leaveHold,
        backToChoosing,
        bookAnother,
    };
}
