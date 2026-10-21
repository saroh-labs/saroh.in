import { describe, expect, it } from "vitest";

import type { StepFacts, StepUrl } from "./step-url";
import {
    BOOKING_STEPS,
    closeHref,
    EMPTY_STEP_URL,
    impliedStep,
    parseStepUrl,
    resolveStep,
    serializeStepUrl,
} from "./step-url";

/**
 * The booking step in the address (site templates v2 U9): what is written,
 * what is read back, and which step a link can stand on.
 */

const FULL: StepUrl = {
    step: "details",
    service: "svc_pt",
    staff: "staff_karan",
    date: "2026-09-20",
    start: "07:00",
    move: null,
    ref: null,
};

const FACTS: StepFacts = {
    service: true,
    people: 2,
    isClass: false,
    hold: false,
    finished: false,
};

describe("writing and reading the step", () => {
    it("reads back every step it writes, with its choices", () => {
        for (const step of BOOKING_STEPS) {
            const url = { ...FULL, step, ref: step === "done" ? "bk_1" : null };
            expect(parseStepUrl(serializeStepUrl("", url))).toEqual(url);
        }
    });

    it("keeps a booking being moved and a booked reference", () => {
        const url = {
            ...EMPTY_STEP_URL,
            step: "done" as const,
            move: "bk_9",
            ref: "bk_1",
        };
        const back = parseStepUrl(serializeStepUrl("", url));
        expect(back.move).toBe("bk_9");
        expect(back.ref).toBe("bk_1");
    });

    it("leaves the address's other parameters as they were", () => {
        const search = serializeStepUrl("?src=qr-h7c&utm_source=flyer", FULL);
        const q = new URLSearchParams(search);
        expect(q.get("src")).toBe("qr-h7c");
        expect(q.get("utm_source")).toBe("flyer");
        expect(q.get("step")).toBe("details");
    });

    it("never writes a note, an email, a phone, a name or a token, even when passed one", () => {
        const wider = {
            ...FULL,
            note: "I take blood thinners",
            email: "asha@example.com",
            phone: "98450 12345",
            bookerName: "Asha Rao",
            payToken: "tok_secret",
            holdToken: "hold_secret",
        } as StepUrl;
        const search = serializeStepUrl(
            "?note=old&email=a%40example.com&token=t&code=123456",
            wider,
        );
        for (const word of [
            "blood",
            "asha",
            "98450",
            "secret",
            "note",
            "email",
            "token",
            "code",
            "phone",
        ]) {
            expect(search.toLowerCase()).not.toContain(word);
        }
        expect(Array.from(new URLSearchParams(search).keys()).sort()).toEqual([
            "date",
            "service",
            "staff",
            "start",
            "step",
        ]);
    });

    it("reads nothing it can't trust: an unknown step, a bad id, a bad day or time", () => {
        expect(
            parseStepUrl(
                "?step=checkout&service=../etc&date=20-9-2026&start=7am&staff=a%20b",
            ),
        ).toEqual(EMPTY_STEP_URL);
    });

    it("writes nothing for an empty choice", () => {
        expect(serializeStepUrl("", EMPTY_STEP_URL)).toBe("");
    });
});

describe("the step a link can stand on", () => {
    it("is the step it names, when its choices are there", () => {
        expect(resolveStep(FULL, FACTS)).toBe("details");
        expect(resolveStep({ ...FULL, step: "who" }, FACTS)).toBe("who");
        expect(resolveStep({ ...FULL, step: "when" }, FACTS)).toBe("when");
    });

    it("falls to what without a service the page offers", () => {
        expect(resolveStep({ ...FULL, service: null }, FACTS)).toBe("what");
        expect(
            resolveStep(
                { ...FULL, step: "when" },
                { ...FACTS, service: false },
            ),
        ).toBe("what");
    });

    it("an unknown step falls to the earliest one whose choices are missing", () => {
        const unknown = parseStepUrl("?step=checkout&service=svc_pt");
        expect(resolveStep(unknown, FACTS)).toBe("when");
        expect(resolveStep(parseStepUrl("?step=checkout"), FACTS)).toBe("what");
    });

    it("pay without a time goes to when", () => {
        expect(
            resolveStep(
                { ...FULL, step: "pay", date: null, start: null },
                { ...FACTS, hold: true },
            ),
        ).toBe("when");
    });

    it("pay with no hold in memory — a link or a reload — goes to when", () => {
        expect(resolveStep({ ...FULL, step: "pay" }, FACTS)).toBe("when");
        expect(
            resolveStep({ ...FULL, step: "pay" }, { ...FACTS, hold: true }),
        ).toBe("pay");
    });

    it("who, for a service one person takes (or a class), goes to when", () => {
        expect(
            resolveStep({ ...FULL, step: "who" }, { ...FACTS, people: 1 }),
        ).toBe("when");
        expect(
            resolveStep({ ...FULL, step: "who" }, { ...FACTS, isClass: true }),
        ).toBe("when");
    });

    it("details without a time goes to when", () => {
        expect(resolveStep({ ...FULL, start: null }, FACTS)).toBe("when");
    });

    it("done needs a booked reference or a booking made on the page", () => {
        expect(resolveStep({ ...FULL, step: "done", ref: "bk_1" }, FACTS)).toBe(
            "done",
        );
        expect(resolveStep({ ...FULL, step: "done" }, FACTS)).toBe("when");
        expect(
            resolveStep(
                { ...FULL, step: "done" },
                { ...FACTS, finished: true },
            ),
        ).toBe("done");
        // A reference stands without a service: the booking is read by it.
        expect(
            resolveStep(
                { ...EMPTY_STEP_URL, step: "done", ref: "bk_1" },
                { ...FACTS, service: false },
            ),
        ).toBe("done");
    });

    it("a link from before steps means the furthest its choices reach", () => {
        expect(impliedStep(EMPTY_STEP_URL)).toBe("what");
        expect(impliedStep({ ...EMPTY_STEP_URL, service: "svc_pt" })).toBe(
            "when",
        );
        expect(impliedStep({ ...FULL, step: null })).toBe("details");
    });
});

describe("a look's own pay step (U10)", () => {
    it("is pay with a time where the page asks how to pay as a step", () => {
        const pay = { ...FULL, step: "pay" as const };
        expect(resolveStep(pay, { ...FACTS, payStep: true })).toBe("pay");
        expect(
            resolveStep({ ...pay, start: null }, { ...FACTS, payStep: true }),
        ).toBe("when");
    });

    it("leaves Classic's pay needing a hold, as before", () => {
        const pay = { ...FULL, step: "pay" as const };
        expect(resolveStep(pay, FACTS)).toBe("when");
        expect(resolveStep(pay, { ...FACTS, payStep: false })).toBe("when");
        expect(resolveStep(pay, { ...FACTS, hold: true })).toBe("pay");
    });
});

describe("closing the booking (U10's frames)", () => {
    const ORIGIN = "https://prana.saroh.app";

    it("goes back to the page on this site it was opened from", () => {
        expect(closeHref(`${ORIGIN}/classes?week=2#hatha`, ORIGIN)).toBe(
            "/classes?week=2#hatha",
        );
    });

    it("goes home from another site, from /book itself, or with no referrer", () => {
        expect(closeHref("https://elsewhere.example.com/", ORIGIN)).toBe("/");
        expect(closeHref(`${ORIGIN}/book?step=when`, ORIGIN)).toBe("/");
        expect(closeHref("", ORIGIN)).toBe("/");
    });
});
