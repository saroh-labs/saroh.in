import { describe, expect, it } from "vitest";

import {
    bookingChangeText,
    classCancelText,
    isNoticeReach,
    readyDoneText,
    readyNoticeText,
    readyUndoneText,
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
            "Those who've signed in on your site are emailed. Tell the others yourself.",
        );
        expect(classCancelText({ email: false, thread: true })).toBe(
            "Each of them sees it in their account on your site.",
        );
        expect(classCancelText({ email: true, thread: true })).toBe(
            "Each of them sees it in their account on your site, and those who've signed in there are emailed.",
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
