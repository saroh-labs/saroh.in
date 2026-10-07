import { describe, expect, it } from "vitest";

import { shortDate } from "@/lib/sites/format-date";

import {
    bookableWithNoLogin,
    invitationMeta,
    inviteEmailError,
    inviteRoom,
    inviteSchema,
    teamCountLine,
    teamCounts,
} from "./invitations";

const ZONE = "Asia/Kolkata";

// The month as this runtime's ICU spells it ("Sep" or "Sept").
const sep = (day: number) =>
    shortDate(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`, ZONE);

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
                ZONE,
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
                ZONE,
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
                ZONE,
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
                ZONE,
                now,
            ),
        ).toBe("Invited 20 Aug · link expired 27 Aug — resend for a fresh one");
    });

    it("says the day in the business's zone, not UTC's (UX-008)", () => {
        // 19:00 UTC on the 8th is already 00:30 on the 9th in Kolkata.
        const late = {
            createdAt: "2026-09-08T19:00:00Z",
            expiresAt: "2026-09-15T19:00:00Z",
        };
        expect(invitationMeta(late, ZONE, now)).toBe(
            `Invited ${sep(9)} · link works until ${sep(16)}`,
        );
        expect(invitationMeta(late, "UTC", now)).toBe(
            `Invited ${sep(8)} · link works until ${sep(15)}`,
        );
    });
});

describe("the team cap, said (UX-028, DEC-105)", () => {
    it("counts the owner and the invites waiting", () => {
        expect(teamCountLine(1, 0)).toBe("Just you");
        expect(teamCountLine(1, 1)).toBe("Just you · 1 invite waiting");
        expect(teamCountLine(2, 3)).toBe(
            "2 people including you · 3 invites waiting",
        );
    });

    it("says view-only people apart: they use no seat", () => {
        expect(teamCountLine(1, 0, 1)).toBe(
            "Just you · 1 view-only person, no seat",
        );
        expect(teamCountLine(2, 1, 3)).toBe(
            "2 people including you · 1 invite waiting · 3 view-only people, no seat",
        );
    });

    it("says the bookable staff with no login: they take seats too (UX-053)", () => {
        expect(teamCountLine(1, 0, 0, 1)).toBe(
            "Just you · 1 person taking bookings with no login",
        );
        expect(teamCountLine(2, 1, 1, 3)).toBe(
            "2 people including you · 3 people taking bookings with no login · 1 invite waiting · 1 view-only person, no seat",
        );
        expect(
            bookableWithNoLogin([
                { status: "ACTIVE", membership: null },
                // A team member: counted once, on Team already.
                { status: "ACTIVE", membership: { id: "m" } },
                { status: "ARCHIVED", membership: null },
            ]),
        ).toBe(1);
        expect(bookableWithNoLogin(null)).toBe(0);
    });

    it("counts seats by what the API says each uses, never by role name", () => {
        expect(
            teamCounts(
                [
                    { usesSeat: true },
                    { usesSeat: false },
                    // An older API: counted.
                    {},
                ],
                [{ usesSeat: false }, { usesSeat: true }],
            ),
        ).toEqual({ people: 2, waiting: 1, viewOnly: 2 });
    });

    it("keeps Invite open for view-only people while the seats are full", () => {
        expect(inviteRoom(null)).toEqual({
            open: true,
            seatReason: null,
            viewOnlyReason: null,
        });
        const full = inviteRoom({ full: true, why: "Your team is full" });
        expect(full.open).toBe(true);
        expect(full.seatReason).toBe(
            "Your team is full (invites count too). View-only people don't take a seat.",
        );
        expect(full.viewOnlyReason).toBeNull();
        expect(
            inviteRoom({ full: true, why: "x", reviewersFull: true }).open,
        ).toBe(false);
    });

    it("keeps Invite open for seats while view-only people are full", () => {
        const room = inviteRoom({
            full: false,
            why: "",
            reviewersFull: true,
            reviewersWhy: "You've reached your 1 view-only person on Plan A",
        });
        expect(room).toEqual({
            open: true,
            seatReason: null,
            viewOnlyReason:
                "You've reached your 1 view-only person on Plan A (invites count too).",
        });
    });
});
