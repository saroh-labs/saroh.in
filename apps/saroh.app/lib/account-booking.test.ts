import { describe, expect, it } from "vitest";

import { accountBookingBody } from "./account-booking";

/**
 * What the signed-in booking forwards to the API (round-2 plan A, A9): the
 * page's own fields only. A server action's arguments come from the
 * browser, so nothing else is passed on — never an email, an amount or a
 * business, and a phone only when it looks like one (UX-049).
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
            bookerPhone: "call me <script>",
            amount: 1,
            organizationId: "org_other",
        });
        expect(body).toEqual(REQUEST);
    });

    it("forwards a phone they gave (UX-049)", () => {
        expect(
            accountBookingBody({
                ...REQUEST,
                bookerPhone: " +91 98450 12345 ",
            }),
        ).toEqual({ ...REQUEST, bookerPhone: "+91 98450 12345" });
    });

    it("passes on a QR code's tag, and books without anything else sent as one", () => {
        expect(accountBookingBody({ ...REQUEST, source: "qr-h7c" })).toEqual({
            ...REQUEST,
            source: "qr-h7c",
        });
        for (const source of ["newsletter", "qr-", 7, "cuid_of_a_row", null]) {
            expect(accountBookingBody({ ...REQUEST, source })).toEqual(REQUEST);
        }
    });

    it("forwards paying a deposit (E8), never an amount", () => {
        expect(
            accountBookingBody({ ...REQUEST, pay: "DEPOSIT", amount: 400 }),
        ).toEqual({ ...REQUEST, pay: "DEPOSIT" });
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

    it("forwards a class credit (A10): the one pack or membership it names", () => {
        expect(
            accountBookingBody({
                ...REQUEST,
                pay: "CREDIT",
                packPurchaseId: "pp_1",
            }),
        ).toEqual({ ...REQUEST, pay: "CREDIT", packPurchaseId: "pp_1" });
        expect(
            accountBookingBody({
                ...REQUEST,
                pay: "CREDIT",
                subscriptionId: "sub_1",
            }),
        ).toEqual({ ...REQUEST, pay: "CREDIT", subscriptionId: "sub_1" });
    });

    it("refuses a credit that names none or both, and drops one on another way to pay", () => {
        expect(accountBookingBody({ ...REQUEST, pay: "CREDIT" })).toBeNull();
        expect(
            accountBookingBody({
                ...REQUEST,
                pay: "CREDIT",
                packPurchaseId: "pp_1",
                subscriptionId: "sub_1",
            }),
        ).toBeNull();
        expect(
            accountBookingBody({ ...REQUEST, packPurchaseId: "pp_1" }),
        ).toEqual(REQUEST);
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
