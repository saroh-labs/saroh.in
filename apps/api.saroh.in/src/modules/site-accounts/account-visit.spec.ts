import { VISIT_GAP_MS, VISIT_TOUCH_MS, visitStep } from "./account-visit";

/**
 * When a customer was last here (DEC-142): the rule Home's "Since you were
 * last here" counts from. Pure: the marks in, where "since" stands and what
 * a read writes out.
 */

const at = (iso: string) => new Date(iso);
const t0 = at("2026-10-10T09:00:00Z");

describe("visitStep", () => {
    it("a first visit has nothing to compare with, and marks itself", () => {
        expect(
            visitStep({ lastVisitAt: null, previousVisitAt: null }, t0),
        ).toEqual({ since: null, write: { lastVisitAt: t0 } });
    });

    it("coming back after a gap counts from the last visit, and starts a new one", () => {
        const now = new Date(t0.getTime() + VISIT_GAP_MS);
        expect(
            visitStep({ lastVisitAt: t0, previousVisitAt: null }, now),
        ).toEqual({
            since: t0,
            write: { previousVisitAt: t0, lastVisitAt: now },
        });
    });

    it("inside a visit, the changes stay: a refresh counts from the visit before", () => {
        const earlier = at("2026-10-07T09:00:00Z");
        const now = new Date(t0.getTime() + 5 * 60_000);
        expect(
            visitStep({ lastVisitAt: t0, previousVisitAt: earlier }, now),
        ).toEqual({ since: earlier, write: { lastVisitAt: now } });
    });

    it("the same visit keeps going while Home is opened again inside the gap", () => {
        const earlier = at("2026-10-07T09:00:00Z");
        let marks = { lastVisitAt: t0, previousVisitAt: earlier };
        // Every 20 minutes for two hours: still one visit.
        for (let i = 1; i <= 6; i++) {
            const now = new Date(t0.getTime() + i * 20 * 60_000);
            const step = visitStep(marks, now);
            expect(step.since).toEqual(earlier);
            marks = { ...marks, ...step.write };
        }
        expect(marks.previousVisitAt).toEqual(earlier);
    });

    it("a second read in the same minute writes nothing", () => {
        const now = new Date(t0.getTime() + VISIT_TOUCH_MS - 1);
        expect(
            visitStep({ lastVisitAt: t0, previousVisitAt: null }, now),
        ).toEqual({ since: null, write: null });
    });

    it("a first visit's refresh still has nothing to compare with", () => {
        const now = new Date(t0.getTime() + 10 * 60_000);
        expect(
            visitStep({ lastVisitAt: t0, previousVisitAt: null }, now).since,
        ).toBeNull();
    });

    it("a clock that ran backwards moves nothing", () => {
        const earlier = at("2026-10-07T09:00:00Z");
        const now = new Date(t0.getTime() - 60 * 60_000);
        expect(
            visitStep({ lastVisitAt: t0, previousVisitAt: earlier }, now),
        ).toEqual({ since: earlier, write: null });
    });
});
