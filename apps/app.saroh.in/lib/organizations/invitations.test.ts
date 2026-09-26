import { describe, expect, it } from "vitest";

import { shortDate } from "@/lib/sites/format-date";

import { invitationMeta, inviteEmailError, inviteSchema } from "./invitations";

// The month as this runtime's ICU spells it ("Sep" or "Sept").
const sep = (day: number) =>
    shortDate(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`);

const known = {
    memberEmails: ["Priya@Example.in"],
    invitedEmails: ["ravi@example.in"],
};

describe("inviteEmailError", () => {
    it("asks for an address when there is none", () => {
        expect(inviteEmailError("   ", known)).toBe("Add their email address.");
    });

    it("refuses something that is not an address", () => {
        expect(inviteEmailError("priya@", known)).toBe(
            "That doesn't look like an email address.",
        );
    });

    it("refuses someone already on the team, ignoring case and spaces", () => {
        expect(inviteEmailError(" priya@example.IN ", known)).toBe(
            "They're already on the team.",
        );
    });

    it("points an existing invite at Resend", () => {
        expect(inviteEmailError("Ravi@example.in", known)).toBe(
            "They're already invited — resend it from the list.",
        );
    });

    it("lets a new address through", () => {
        expect(inviteEmailError("anu@example.in", known)).toBeNull();
    });
});

describe("inviteSchema", () => {
    const schema = inviteSchema(known);

    it("puts the address's problem on the email field", () => {
        const res = schema.safeParse({
            email: "ravi@example.in",
            role: "MEMBER",
            siteIds: [],
        });
        expect(res.success).toBe(false);
        expect(res.error?.issues[0]).toMatchObject({
            path: ["email"],
            message: "They're already invited — resend it from the list.",
        });
    });

    it("asks a reviewer invite for its websites", () => {
        const res = schema.safeParse({
            email: "anu@example.in",
            role: "REVIEWER",
            siteIds: [],
        });
        expect(res.error?.issues.map((i) => i.path)).toEqual([["siteIds"]]);
    });

    it("accepts a new address at an invented role", () => {
        expect(
            schema.safeParse({
                email: "anu@example.in",
                role: "stock-clerk",
                siteIds: [],
            }).success,
        ).toBe(true);
    });
});

describe("invitationMeta", () => {
    const now = new Date("2026-09-10T12:00:00Z");

    it("says when it was sent and until when the link works", () => {
        expect(
            invitationMeta(
                {
                    createdAt: "2026-09-08T09:00:00Z",
                    expiresAt: "2026-09-15T09:00:00Z",
                },
                now,
            ),
        ).toBe(`Invited ${sep(8)} · link works until ${sep(15)}`);
    });

    it("says today for today", () => {
        expect(
            invitationMeta(
                {
                    createdAt: "2026-09-10T08:00:00Z",
                    expiresAt: "2026-09-17T08:00:00Z",
                },
                now,
            ),
        ).toBe(`Invited today · link works until ${sep(17)}`);
    });

    it("notices that it was sent again", () => {
        expect(
            invitationMeta(
                {
                    createdAt: "2026-09-01T09:00:00Z",
                    expiresAt: "2026-09-16T10:00:00Z",
                },
                now,
            ),
        ).toBe(
            `Invited ${sep(1)} · sent again ${sep(9)} · link works until ${sep(16)}`,
        );
    });

    it("says an expired link no longer works", () => {
        expect(
            invitationMeta(
                {
                    createdAt: "2026-08-20T09:00:00Z",
                    expiresAt: "2026-08-27T09:00:00Z",
                },
                now,
            ),
        ).toBe("Invited 20 Aug · link expired 27 Aug — resend for a fresh one");
    });
});
