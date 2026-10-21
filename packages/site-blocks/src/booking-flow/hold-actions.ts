"use client";

import type { SignedInCustomer } from "../account/api";
import type { FlowActionsContext } from "./actions-context";
import type { Result } from "./api";
import { OFFLINE_RESULT, releaseHold } from "./api";
import { newKey } from "./flow-helpers";
import type { BookResult, HoldView } from "./model";
import { paidPhase } from "./use-hold-watch";
import { TIME_GONE } from "./use-kept-choice";

/** The hold couldn't be let go, so it may still stand (K-2). */
const LEAVE_HOLD_FAILED =
    "We couldn't let go of the time we're holding for you. Try again.";

/** The session ended between drawing the page and booking. */
export const SIGNED_OUT = "Your sign-in has ended. Sign in again to book.";

/**
 * A pay-now hold and a time that went: letting the hold go or booking it
 * at the desk instead (#508, K-2), the hold kept while they went Back a
 * step (U9), and going back to choosing when a time has gone.
 */
export function holdActions(ctx: FlowActionsContext) {
    const { account, apiUrl, times, chosenStart } = ctx;
    const service = times.service;

    /** The name to send: only for an account that has none yet. */
    const nameFor = (who: SignedInCustomer) =>
        !who.name && ctx.s.name.trim() ? { bookerName: ctx.s.name.trim() } : {};

    /**
     * The time chosen is gone: say so, and show what is left — and, when it
     * went while they signed in, choose the next free one (`offerNext`).
     */
    const timeGone = (id: string, message: string, offerNext?: string) => {
        ctx.s.setPhase({ kind: "choose" });
        ctx.s.sayError(message);
        ctx.keys.attemptKey.current = null;
        times.setStart(null);
        ctx.offerAfter.current = offerNext ?? null;
        times.reloadDays(id);
    };

    const backToChoosing = () => {
        ctx.s.setPhase({ kind: "choose" });
        times.setStart(null);
        ctx.keys.attemptKey.current = null;
        if (service) times.retry(service.id);
    };

    /**
     * A hold kept while they went Back a step (U9): the same choice goes
     * back to paying it; another is booked afresh once it is let go. Paid
     * meanwhile, it is theirs. Returns whether the press is answered.
     */
    const settleAside = async (): Promise<boolean> => {
        const held = ctx.s.aside;
        if (!held) return false;
        const same =
            !!chosenStart &&
            held.booking.startAt === chosenStart.startAt &&
            held.pay === ctx.pay;
        if (same) {
            ctx.s.setAside(null);
            ctx.s.setPhase(held);
            return true;
        }
        ctx.s.setSubmitting(true);
        const released = await releaseHold(apiUrl, held.token).catch(
            (): Result<HoldView> => OFFLINE_RESULT,
        );
        ctx.s.setSubmitting(false);
        if (released.ok && released.value.state === "CONFIRMED") {
            ctx.s.setAside(null);
            ctx.s.setPhase(
                paidPhase(held, released.value.booking, ctx.bookerFirst),
            );
            return true;
        }
        if (!released.ok || released.value.state === "HELD") {
            ctx.s.sayError(released.ok ? LEAVE_HOLD_FAILED : released.message);
            return true;
        }
        ctx.s.setAside(null);
        return false;
    };

    /** Let the hold go and go back to choosing — or book it at the desk. */
    const leaveHold = async (then: "choose" | "desk") => {
        const { phase } = ctx.s;
        if (phase.kind !== "paying" || ctx.keys.leavingRef.current) return;
        ctx.keys.leavingRef.current = true;
        ctx.s.setLeaving(true);
        const held = phase;
        try {
            const released = await releaseHold(apiUrl, held.token).catch(
                (): Result<HoldView> => OFFLINE_RESULT,
            );
            // Paid a moment ago: the place is theirs, so say so — never
            // book it again at the desk or send them back to choose.
            if (released.ok && released.value.state === "CONFIRMED") {
                ctx.s.setPhase(
                    paidPhase(held, released.value.booking, ctx.bookerFirst),
                );
                return;
            }
            // The hold may still stand: booking at the desk now would only
            // be refused as theirs already, so stay here and say it (K-2).
            if (
                then === "desk" &&
                (!released.ok || released.value.state === "HELD")
            ) {
                ctx.s.setPhase((p) =>
                    p.kind === "paying" && p.token === held.token
                        ? {
                              ...p,
                              payError: released.ok
                                  ? LEAVE_HOLD_FAILED
                                  : released.message,
                          }
                        : p,
                );
                return;
            }
            // The time the hold was for. Their own hold takes it off the
            // public list, so a read of the days since (the site's server
            // drawing the page again after they signed in) no longer offers
            // it and `chosenStart` has fallen away: the start they chose,
            // still kept, is booked when it is the held one.
            const heldStart =
                times.start?.startAt === held.booking.startAt
                    ? times.start
                    : null;
            if (then !== "desk" || !service || !heldStart) {
                backToChoosing();
                return;
            }
            ctx.s.setPayChoice("DESK");
            ctx.keys.deskKey.current ??= newKey();
            const result: Result<BookResult> = ctx.s.customer
                ? await account
                      .book({
                          serviceId: service.id,
                          startAt: heldStart.startAt,
                          ...nameFor(ctx.s.customer),
                          idempotencyKey: ctx.keys.deskKey.current,
                          staffId: heldStart.staffId ?? undefined,
                          pay: "DESK",
                          ...ctx.extras,
                      })
                      .catch((): Result<BookResult> => OFFLINE_RESULT)
                : { ok: false, status: 401, message: SIGNED_OUT };
            if (result.ok && result.value.state === "CONFIRMED") {
                ctx.keys.deskKey.current = null;
                ctx.s.setPhase({
                    kind: "done",
                    booking: result.value,
                    paid: false,
                    price: ctx.price,
                    rest: null,
                    when: held.when,
                    first: ctx.bookerFirst,
                });
                return;
            }
            ctx.s.setPhase({ kind: "choose" });
            if (!result.ok && result.status !== 409) {
                // Not known to have booked: trying again from the form sends
                // the same key, so a first try that did book answers with it.
                ctx.s.sayError(result.message);
                ctx.keys.attemptKey.current = ctx.keys.deskKey.current;
                ctx.keys.deskKey.current = null;
                return;
            }
            ctx.keys.deskKey.current = null;
            timeGone(service.id, result.ok ? TIME_GONE : result.message);
        } finally {
            ctx.keys.leavingRef.current = false;
            ctx.s.setLeaving(false);
        }
    };

    /**
     * Leaving the booking (a look's Close or Escape) with a hold of theirs
     * standing — on the pay step, or kept while they went Back a step:
     * let it go first, so the time is free again for someone else (review
     * #20). Paid meanwhile, the place is theirs, so the page says so and
     * stays. A hold that won't let go stays and says so (K-2), as Back
     * does. Paid in the checkout with its word on the way, the hold is
     * theirs: it is left to confirm. Returns whether the page may close.
     */
    const letGoToLeave = async (): Promise<boolean> => {
        const { phase } = ctx.s;
        const paying = phase.kind === "paying" ? phase : null;
        if (paying?.checkoutPaid) return true;
        const held = paying ?? ctx.s.aside;
        if (!held) return true;
        if (ctx.keys.leavingRef.current) return false;
        ctx.keys.leavingRef.current = true;
        ctx.s.setLeaving(true);
        let gone = false;
        try {
            const released = await releaseHold(apiUrl, held.token).catch(
                (): Result<HoldView> => OFFLINE_RESULT,
            );
            if (released.ok && released.value.state === "CONFIRMED") {
                ctx.s.setAside(null);
                ctx.s.setPhase(
                    paidPhase(held, released.value.booking, ctx.bookerFirst),
                );
                return false;
            }
            if (!released.ok || released.value.state === "HELD") {
                const text = released.ok ? LEAVE_HOLD_FAILED : released.message;
                if (paying) {
                    ctx.s.setPhase((p) =>
                        p.kind === "paying" && p.token === held.token
                            ? { ...p, payError: text }
                            : p,
                    );
                } else ctx.s.sayError(text);
                return false;
            }
            if (!paying) ctx.s.setAside(null);
            gone = true;
            return true;
        } finally {
            // Let go and closing: the page stays busy until it is gone, and
            // the hold's watch never draws "ran out" for a hold let go.
            if (!gone) {
                ctx.keys.leavingRef.current = false;
                ctx.s.setLeaving(false);
            }
        }
    };

    return {
        nameFor,
        timeGone,
        backToChoosing,
        settleAside,
        leaveHold,
        letGoToLeave,
    };
}
