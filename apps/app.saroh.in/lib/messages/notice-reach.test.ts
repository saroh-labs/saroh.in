import { describe, expect, it } from "vitest";

import {
    bookingChangeText,
    classCancelText,
    courierNoticeText,
    deliveryDoneText,
    isNoticeReach,
    readyDoneText,
    readyNoticeText,
    readyUndoneText,
    trackingSavedText,
} from "./notice-reach";

describe("what the workspace says a customer is told (A14)", () => {
    it("Order Detail's Ready: what marking it ready tells them", () => {
        expect(readyNoticeText("EMAIL_AND_ACCOUNT", "Asha")).toBe(
            "Asha is emailed and sees it in their account on your site.",
        );
        expect(readyNoticeText("EMAIL", "Asha")).toBe(
            "Asha is emailed that it's ready.",
        );
        expect(readyNoticeText("ACCOUNT", "Asha")).toBe(
            "Shown in their account on your site.",
        );
        expect(readyNoticeText("ON_SIGN_IN", "Asha")).toBe(
            "They'll see it when they sign in on your site.",
        );
        expect(readyNoticeText("NONE", "Asha")).toBe(
            "Nothing is sent to Asha. The step shows on the order.",
        );
    });

    it("claims nothing either way when it couldn't be read", () => {
        expect(readyNoticeText(null, "Asha")).toBe(
            "The step shows on the order.",
        );
        expect(readyNoticeText(undefined, "Asha")).toBe(
            "The step shows on the order.",
        );
    });

    it("the booking peek: told on a move or cancel, or tell them yourself", () => {
        expect(bookingChangeText("EMAIL", "Asha")).toBe(
            "If you move or cancel, Asha is emailed.",
        );
        expect(bookingChangeText("ACCOUNT", "Asha")).toBe(
            "If you move or cancel, it shows in Asha's account on your site.",
        );
        expect(bookingChangeText("NONE", "Asha")).toBe(
            "Saroh doesn't message Asha. Tell them yourself if you move or cancel.",
        );
        // Unknown keeps the advice to tell them.
        expect(bookingChangeText(null, "Asha")).toBe(
            "Saroh doesn't message Asha. Tell them yourself if you move or cancel.",
        );
    });

    it("a cancelled class speaks from what the business can use", () => {
        expect(classCancelText({ email: false, thread: false })).toBe(
            "Saroh doesn't message them.",
        );
        expect(classCancelText(null)).toBe("Saroh doesn't message them.");
        expect(classCancelText({ email: true, thread: false })).toBe(
            "Those with an email are emailed. Tell the others yourself.",
        );
        expect(classCancelText({ email: false, thread: true })).toBe(
            "Each of them sees it in their account on your site.",
        );
        expect(classCancelText({ email: true, thread: true })).toBe(
            "Each of them sees it in their account on your site, and those with an email are emailed.",
        );
    });

    it("knows only the API's five answers", () => {
        expect(isNoticeReach("EMAIL")).toBe(true);
        expect(isNoticeReach("SMS")).toBe(false);
        expect(isNoticeReach(null)).toBe(false);
    });

    it("the Ready toast: who is told and when, never a send that doesn't happen (U5)", () => {
        expect(readyDoneText("EMAIL_AND_ACCOUNT", "Asha")).toBe(
            "Asha will be told in 10 seconds.",
        );
        expect(readyDoneText("EMAIL", "Asha")).toBe(
            "Asha will be told in 10 seconds.",
        );
        expect(readyDoneText("ACCOUNT", "Asha")).toBe(
            "Asha sees it in their account in 10 seconds.",
        );
        expect(readyDoneText("ON_SIGN_IN", "Asha")).toBe(
            "Asha sees it when they sign in on your site.",
        );
        expect(readyDoneText("NONE", "Asha")).toBe(
            "Asha isn't told. It shows on the order.",
        );
        expect(readyDoneText(null, "Asha")).toBe("It shows on the order.");
        expect(readyDoneText("NONE", "Asha")).not.toMatch(/sent|emailed/);
    });

    it("the Ready toast's Undo: Not sent only where something would have gone", () => {
        expect(readyUndoneText("EMAIL", "Asha", false, "Preparing")).toBe(
            "Back to preparing. Not sent.",
        );
        expect(readyUndoneText("EMAIL", "Asha", true, "Preparing")).toBe(
            "Back to preparing. Asha has already been told.",
        );
        expect(readyUndoneText("NONE", "Asha", false, "Preparing")).toBe(
            "Back to preparing.",
        );
        expect(readyUndoneText(undefined, "Asha", undefined, "Preparing")).toBe(
            "Back to preparing.",
        );
    });
});

describe("naming the address it is emailed to (DEC-174 D1)", () => {
    it("Order Detail's Ready: Emailed to ‹email›", () => {
        expect(readyNoticeText("EMAIL", "Asha", "asha@example.com")).toBe(
            "Emailed to asha@example.com when it's ready.",
        );
        expect(
            readyNoticeText("EMAIL_AND_ACCOUNT", "Asha", "asha@example.com"),
        ).toBe(
            "Emailed to asha@example.com, and Asha sees it in their account on your site.",
        );
        // No address in the read: the words without it, as before.
        expect(readyNoticeText("EMAIL", "Asha", null)).toBe(
            "Asha is emailed that it's ready.",
        );
        // An address never makes a reach that sends nothing say it sends.
        expect(readyNoticeText("NONE", "Asha", "asha@example.com")).toBe(
            "Nothing is sent to Asha. The step shows on the order.",
        );
    });

    it("the booking peek: emailed to ‹email›", () => {
        expect(bookingChangeText("EMAIL", "Asha", "asha@example.com")).toBe(
            "If you move or cancel, it's emailed to asha@example.com.",
        );
        expect(
            bookingChangeText("EMAIL_AND_ACCOUNT", "Asha", "asha@example.com"),
        ).toBe(
            "If you move or cancel, it's emailed to asha@example.com, and Asha sees it in their account on your site.",
        );
        expect(bookingChangeText("NONE", "Asha", "asha@example.com")).toBe(
            "Saroh doesn't message Asha. Tell them yourself if you move or cancel.",
        );
    });
});

describe("delivery updates on Order Detail (U16)", () => {
    it("Delivered and Sent are told like Ready while delivery updates go; off says they aren't", () => {
        expect(deliveryDoneText("EMAIL", "Asha", true)).toBe(
            "Asha will be told in 10 seconds.",
        );
        expect(deliveryDoneText("NONE", "Asha", true)).toBe(
            "Asha isn't told. It shows on the order.",
        );
        expect(deliveryDoneText("EMAIL", "Asha", false)).toBe(
            "Asha isn't told: delivery updates are off. It shows on the order.",
        );
        expect(deliveryDoneText("EMAIL", "Asha", null)).toBe(
            "It shows on the order.",
        );
    });

    it("the handover sheet says the tracking goes with the handover's email, naming the address", () => {
        expect(
            courierNoticeText("EMAIL", "Asha", {
                mode: "handover",
                to: "asha@example.com",
            }),
        ).toBe(
            "It stays on the order. Asha gets the tracking with the handover by email, at asha@example.com.",
        );
        // The handover's notice has no switch: off doesn't silence it.
        expect(
            courierNoticeText("EMAIL", "Asha", {
                mode: "handover",
                deliveryUpdates: false,
            }),
        ).toBe(
            "It stays on the order. Asha gets the tracking with the handover by email.",
        );
        expect(courierNoticeText("ACCOUNT", "Asha", { mode: "handover" })).toBe(
            "It stays on the order. Asha sees the tracking with the handover in their account on your site.",
        );
    });

    it("the Tracking sheet promises the new tracking only while delivery updates go, and never with no email", () => {
        expect(
            courierNoticeText("EMAIL", "Asha", {
                mode: "change",
                deliveryUpdates: true,
            }),
        ).toBe("It stays on the order. Asha gets new tracking by email.");
        expect(
            courierNoticeText("EMAIL", "Asha", {
                mode: "change",
                deliveryUpdates: false,
            }),
        ).toBe(
            "It stays on the order. Nothing is sent to Asha: delivery updates are off.",
        );
        // No provider: nothing reaches them, so nothing is promised.
        expect(
            courierNoticeText("NONE", "Asha", {
                mode: "change",
                deliveryUpdates: true,
            }),
        ).toBe("It stays on the order. Nothing is sent to Asha.");
        expect(
            courierNoticeText(null, "Asha", {
                mode: "change",
                deliveryUpdates: null,
            }),
        ).toBe("It stays on the order.");
    });

    it("the saved toast says they're emailed only when a notice carries it", () => {
        expect(trackingSavedText("EMAIL", "Asha", true)).toBe(
            "It stays on the order. Asha is emailed the tracking.",
        );
        expect(trackingSavedText("EMAIL", "Asha", false)).toBe(
            "It stays on the order. Nothing is sent to Asha.",
        );
        expect(trackingSavedText("NONE", "Asha", true)).toBe(
            "It stays on the order. Nothing is sent to Asha.",
        );
        expect(trackingSavedText("EMAIL", "Asha", undefined)).not.toMatch(
            /emailed/,
        );
    });
});
