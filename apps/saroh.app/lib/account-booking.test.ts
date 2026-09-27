import { describe, expect, it } from "vitest";

import { accountBookingBody } from "./account-booking";

/**
 * What the signed-in booking forwards to the API (round-2 plan A, A9): the
 * page's own fields only. A server action's arguments come from the
 * browser, so nothing else is passed on — never an email, a phone, an
 * amount or a business.
 */
const REQUEST = {
    serviceId: "svc_pt",
    startAt: "2026-09-20T01:30:00.000Z",
    idempotencyKey: "key_1",
    pay: "DESK",
};

describe("accountBookingBody", () => {
    it("forwards the page's request", () => {
        expect(
            accountBookingBody({
                ...REQUEST,
                staffId: "staff_karan",
                bookerName: " Meera Shah ",
                locationType: "ONLINE",
                intakeNote: "I take blood thinners",
            }),
        ).toEqual({
            ...REQUEST,
            staffId: "staff_karan",
            bookerName: "Meera Shah",
            locationType: "ONLINE",
            intakeNote: "I take blood thinners",
        });
    });

    it("drops anything the page never sends", () => {
        const body = accountBookingBody({
            ...REQUEST,
            bookerEmail: "someone-else@example.in",
            bookerPhone: "+91 98450",
            amount: 1,
            organizationId: "org_other",
        });
        expect(body).toEqual(REQUEST);
    });

    it("refuses a request that isn't one", () => {
        expect(accountBookingBody(null)).toBeNull();
        expect(accountBookingBody("book")).toBeNull();
        expect(accountBookingBody({ ...REQUEST, serviceId: "" })).toBeNull();
        expect(
            accountBookingBody({ ...REQUEST, idempotencyKey: undefined }),
        ).toBeNull();
        expect(accountBookingBody({ ...REQUEST, pay: "LATER" })).toBeNull();
        expect(
            accountBookingBody({ ...REQUEST, locationType: "EITHER" }),
        ).toBeNull();
        expect(
            accountBookingBody({ ...REQUEST, serviceId: "x".repeat(65) }),
        ).toBeNull();
    });

    it("leaves out an empty name and an empty note", () => {
        expect(
            accountBookingBody({
                ...REQUEST,
                bookerName: "  ",
                intakeNote: "",
            }),
        ).toEqual(REQUEST);
    });
});
