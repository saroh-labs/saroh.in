import { describe, expect, it } from "vitest";

import { refusalOf } from "./api";
import { staffInviteReadStatus } from "./staff-invite";
import {
    acceptResult,
    rolesInWords,
    STAFF_INVITE_TOKEN_PATTERN,
    staffInviteScreen,
} from "./staff-invite-words";

const invite = {
    email: "asha.rao@example.com",
    name: "Asha Rao",
    roles: ["ACCOUNT_MANAGER"],
    worksAs: "ACCOUNT_MANAGER_JOB",
    invitedByName: "Sam",
    expiresAt: "2026-10-25T10:00:00.000Z",
};
const found = { status: "found", invite } as const;

/** A staff invite on accounts (admin console U24): which screen, what it says. */
describe("staffInviteScreen", () => {
    it("asks for the email's link again when there is no cookie", () => {
        expect(
            staffInviteScreen({
                hasToken: false,
                read: null,
                signedInAs: null,
            }),
        ).toEqual({ kind: "no-link" });
    });

    it("says gone, or couldn't check, as the API answered", () => {
        expect(
            staffInviteScreen({
                hasToken: true,
                read: { status: "gone" },
                signedInAs: "asha.rao@example.com",
            }).kind,
        ).toBe("gone");
        expect(
            staffInviteScreen({
                hasToken: true,
                read: { status: "unreachable" },
                signedInAs: null,
            }).kind,
        ).toBe("unreachable");
    });

    it("asks a signed-out holder to sign in", () => {
        expect(
            staffInviteScreen({
                hasToken: true,
                read: found,
                signedInAs: null,
            }),
        ).toEqual({ kind: "sign-in", invite });
    });

    it("offers Join the team to the invite's address, whatever its case", () => {
        expect(
            staffInviteScreen({
                hasToken: true,
                read: found,
                signedInAs: "Asha.Rao@Example.com",
            }).kind,
        ).toBe("ready");
    });

    it("says when someone else is signed in", () => {
        expect(
            staffInviteScreen({
                hasToken: true,
                read: found,
                signedInAs: "ravi@example.com",
            }),
        ).toEqual({
            kind: "wrong-account",
            invite,
            signedInAs: "ravi@example.com",
        });
    });
});

describe("acceptResult", () => {
    it("is joined on success", () => {
        expect(acceptResult({ ok: true })).toEqual({ ok: true });
    });

    it.each([
        ["ALREADY_ON_TEAM", "You're already on the team", { final: true }],
        ["INVITE_GONE", "This invite can no longer be used", { final: true }],
        [
            "INVITE_WRONG_ACCOUNT",
            "This invite is for another email",
            { signOut: true },
        ],
        [
            "INVITE_EMAIL_NOT_CONFIRMED",
            "Confirm your email first",
            { signOut: true },
        ],
        [
            "INVITE_SENDER_CANNOT_GRANT",
            "This invite can't be used now",
            { final: true },
        ],
    ])("reads %s", (code, title, extra) => {
        expect(
            acceptResult({
                ok: false,
                status: 403,
                error: "The API's words.",
                code,
            }),
        ).toMatchObject({ ok: false, title, ...extra });
    });

    it("never shows a server failure's words", () => {
        expect(
            acceptResult({ ok: false, status: 500, error: "stack trace" }),
        ).toMatchObject({
            description: "Nothing has changed. Try again in a moment.",
        });
    });
});

describe("rolesInWords", () => {
    it("names the console's roles as the console does", () => {
        expect(rolesInWords(["ACCOUNT_MANAGER"])).toBe("Account manager");
        expect(rolesInWords(["SUPPORT", "BILLING", "AUDITOR"])).toBe(
            "Support, Billing and Auditor",
        );
    });
});

describe("the token and the API's answers", () => {
    it("knows a token's shape", () => {
        expect(STAFF_INVITE_TOKEN_PATTERN.test("a".repeat(43))).toBe(true);
        expect(STAFF_INVITE_TOKEN_PATTERN.test("a".repeat(42))).toBe(false);
        expect(STAFF_INVITE_TOKEN_PATTERN.test(`${"a".repeat(42)}/`)).toBe(
            false,
        );
    });

    it("reads a preview's status", () => {
        expect(staffInviteReadStatus(200)).toBe("found");
        expect(staffInviteReadStatus(404)).toBe("gone");
        expect(staffInviteReadStatus(503)).toBe("unreachable");
        expect(staffInviteReadStatus(429)).toBe("unreachable");
    });

    it("reads a refusal from the API's envelope", async () => {
        const res = new Response(
            JSON.stringify({
                error: {
                    code: "FORBIDDEN",
                    message: "This invite is for another email address.",
                    statusCode: 403,
                    details: { code: "INVITE_WRONG_ACCOUNT" },
                },
            }),
            { status: 403 },
        );
        await expect(refusalOf(res)).resolves.toEqual({
            error: "This invite is for another email address.",
            field: undefined,
            code: "INVITE_WRONG_ACCOUNT",
        });
    });
});
