import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The booking page's booked step, read again by its reference after Back
 * and Forward (site templates v2 U9): only through the customer's own
 * session, only for a reference worth asking about, and only from the
 * site's own pages.
 */

const read = vi.hoisted(() => ({
    origin: true,
    getBooking: vi.fn(),
}));
vi.mock("@/lib/origin", () => ({
    siteOrigin: () => Promise.resolve(read.origin),
}));
vi.mock("@/lib/account-area", () => ({ getBooking: read.getBooking }));
vi.mock("@/lib/test-release", () => ({
    testMode: () => Promise.resolve(false),
}));
vi.mock("@/lib/customer-session", () => ({ accountFetch: vi.fn() }));

import { findMyBooking } from "../app/[domain]/book/actions";

beforeEach(() => {
    read.origin = true;
    read.getBooking.mockReset();
});

describe("findMyBooking", () => {
    it("reads the customer's own booking by its reference", async () => {
        read.getBooking.mockResolvedValue({ ok: false, reason: "missing" });
        expect(await findMyBooking("bk_1")).toEqual({
            ok: false,
            reason: "missing",
        });
        expect(read.getBooking).toHaveBeenCalledWith("bk_1");
    });

    it("asks nothing for a reference that isn't one", async () => {
        for (const ref of ["../me", "", "a".repeat(65), 42, null]) {
            expect(await findMyBooking(ref)).toEqual({
                ok: false,
                reason: "missing",
            });
        }
        expect(read.getBooking).not.toHaveBeenCalled();
    });

    it("answers nothing from another site's page", async () => {
        read.origin = false;
        expect(await findMyBooking("bk_1")).toEqual({
            ok: false,
            reason: "unavailable",
        });
        expect(read.getBooking).not.toHaveBeenCalled();
    });
});
