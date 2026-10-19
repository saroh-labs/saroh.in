import type { BookingLookup } from "../account/booking-page";
import type { Phase } from "./flow-state";
import type { BookingService } from "./model";
import type { BookingStep, StepUrl } from "./step-url";
import { resolveStep } from "./step-url";
import type { Paying } from "./use-hold-watch";
import type { PendingStart, Times } from "./use-times";

/** A booking made on this page, kept while they go Back from it. */
export type Finished = Extract<Phase, { kind: "done" | "waitlisted" }>;

/** The step a choosing page can stand on. */
export type ChooseStep = Extract<
    BookingStep,
    "what" | "who" | "when" | "details"
>;

/**
 * Back or Forward to an entry of the booking page (U9): the page is brought
 * to what the address says, with no server render.
 *
 * - **A hold being paid** (pay now) is never let go by Back: it is kept
 *   aside, still watched, and Forward — or the same choice booked again —
 *   goes back to paying it (`aside`).
 * - **A booking made** is kept too, so Forward shows it again; Back from it
 *   is the choosing it came from, with nothing booked twice (the next try
 *   is a new attempt, and the API refuses the same person twice).
 * - **The choices** — the service, who with, the day and time — are the
 *   address's. A time is chosen once its days are read, if still free.
 * - A step the page can't stand on falls back to the earliest it can
 *   (`resolveStep`), and the address is put right in place.
 */
export function traverseTo(
    url: StepUrl,
    ctx: {
        services: BookingService[];
        phase: Phase;
        setPhase: (phase: Phase) => void;
        aside: Paying | null;
        setAside: (held: Paying | null) => void;
        finished: Finished | null;
        setFinished: (done: Finished | null) => void;
        times: Times;
        setPending: (pending: PendingStart | null) => void;
        setStep: (step: ChooseStep) => void;
        sayError: (text: string | null) => void;
        resetAttempt: () => void;
        /** Read one of their bookings by reference, when the app can. */
        lookup?: (ref: string) => Promise<BookingLookup>;
    },
): void {
    const { phase, times } = ctx;
    const service = ctx.services.find((s) => s.id === url.service) ?? null;
    const held = phase.kind === "paying" ? phase : ctx.aside;
    const done =
        phase.kind === "done" || phase.kind === "waitlisted"
            ? phase
            : ctx.finished;
    const step = resolveStep(url, {
        service: service !== null,
        people: service?.staff.length ?? 0,
        isClass: service?.kind === "class",
        hold: held !== null,
        finished: done !== null,
    });
    ctx.sayError(null);

    if (step === "done") {
        if (done && (!url.ref || doneRef(done) === url.ref)) {
            ctx.setPhase(done);
            ctx.setFinished(null);
            return;
        }
        const ref = url.ref ?? "";
        ctx.setPhase({ kind: "booked", ref, lookup: null });
        const read = ctx.lookup
            ? ctx.lookup(ref).catch((): BookingLookup => ({
                  ok: false,
                  reason: "unavailable",
              }))
            : Promise.resolve<BookingLookup>({ ok: false, reason: "missing" });
        void read.then((lookup) =>
            ctx.setPhase({ kind: "booked", ref, lookup }),
        );
        return;
    }
    if (step === "pay" && held) {
        ctx.setAside(null);
        ctx.setPhase(held);
        return;
    }

    // Back to choosing: what was being paid or was booked is kept.
    if (phase.kind === "paying") ctx.setAside(phase);
    if (phase.kind === "done" || phase.kind === "waitlisted") {
        ctx.setFinished(phase);
    }
    if (phase.kind !== "choose") {
        ctx.setPhase({ kind: "choose" });
        ctx.resetAttempt();
    }

    const id = service?.id ?? null;
    const staff = url.staff;
    if (id !== times.serviceId) {
        if (id) times.pickService(id, staff ? { staffId: staff } : {});
        else times.clear();
    } else if (id && staff !== times.person) {
        times.showDays(id, { skip: times.skip, person: staff });
    } else {
        times.setStart(null);
        ctx.resetAttempt();
    }
    // After the service or person reset it: the day the address is on.
    times.setDate(url.date);
    ctx.setPending(
        id && url.date && url.start
            ? { serviceId: id, date: url.date, time: url.start }
            : null,
    );
    ctx.setStep(step === "pay" ? "when" : step);
}

function doneRef(done: Finished): string | null {
    return done.kind === "done" ? done.booking.reference : null;
}
