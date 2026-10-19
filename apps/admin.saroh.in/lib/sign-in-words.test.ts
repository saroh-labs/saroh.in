import { describe, expect, it } from "vitest";

import type { SignInState } from "./people";
import {
    codesWords,
    displayName,
    historyWords,
    mayConfirmChange,
    signInBanner,
    verifiedWords,
} from "./sign-in-words";
import { userTabOf } from "./user-tabs";

const when = (iso: string) => `at ${iso}`;

function state(over: Partial<SignInState> = {}): SignInState {
    return {
        verifiedBy: "self",
        verifiedByStaffAt: null,
        block: null,
        lastChange: null,
        codesThisHour: 0,
        codesPerHour: 3,
        lastCodeSentAt: null,
        ...over,
    };
}

const heldChange = {
    id: "c1",
    oldEmail: "old@example.com",
    newEmail: "new@example.com",
    requestedByUserId: "staff-a",
    requestedByName: "Asha",
    codeHeldUntil: "2026-10-19T10:00:00.000Z",
    confirmedAt: null,
    confirmedByUserId: null,
    codeSentAt: null,
    createdAt: "2026-10-18T10:00:00.000Z",
    held: true,
};

describe("sign-in in words (U9)", () => {
    it("names a user by their email when they have no name", () => {
        expect(displayName({ name: null, email: "a@example.com" })).toBe(
            "a@example.com",
        );
        expect(displayName({ name: "  ", email: "a@example.com" })).toBe(
            "a@example.com",
        );
        expect(displayName({ name: "Asha", email: "a@example.com" })).toBe(
            "Asha",
        );
    });

    it("tells their own verification from staff's", () => {
        expect(verifiedWords("self")).toBe("Verified by them");
        expect(verifiedWords("staff")).toBe("Marked verified by Saroh staff");
        expect(verifiedWords(null)).toBe("Not verified");
    });

    it("has no banner when nothing stops them signing in", () => {
        expect(signInBanner(state(), when)).toBeNull();
    });

    it("says why when their email is unverified", () => {
        const banner = signInBanner(
            state({ verifiedBy: null, block: "unverified" }),
            when,
        );
        expect(banner?.title).toBe("Their email isn't verified");
        expect(banner?.body).toMatch(/Send a sign-in code/);
    });

    it("says who changed the email and until when it is held", () => {
        const banner = signInBanner(
            state({ block: "held", lastChange: heldChange }),
            when,
        );
        expect(banner?.title).toBe("They can't sign in yet");
        expect(banner?.body).toContain("Asha changed their sign-in email");
        expect(banner?.body).toContain("at 2026-10-19T10:00:00.000Z");
        expect(banner?.body).toMatch(/second staff member/);
    });

    it("offers the confirm to anyone but the person who made the change", () => {
        const held = state({ block: "held", lastChange: heldChange });
        expect(mayConfirmChange(held, "staff-a")).toBe(false);
        expect(mayConfirmChange(held, "staff-b")).toBe(true);
        expect(
            mayConfirmChange(
                state({ lastChange: { ...heldChange, held: false } }),
                "staff-b",
            ),
        ).toBe(false);
    });

    it("counts codes against the hour's limit, and words the history", () => {
        expect(codesWords(state({ codesThisHour: 2 }))).toBe(
            "2 of 3 sent this hour",
        );
        expect(historyWords("person.sign-in-email.changed")).toBe(
            "Changed their sign-in email",
        );
        expect(historyWords("person.something-new")).toBe("Something new");
    });

    it("knows which tab an address is", () => {
        const base = "/users/u1";
        expect(userTabOf("/users/u1", base)).toBe("overview");
        expect(userTabOf("/users/u1/sign-in", base)).toBe("sign-in");
        expect(userTabOf("/users/u1/history/", base)).toBe("history");
        expect(userTabOf("/users/u1/nope", base)).toBe("overview");
    });
});
