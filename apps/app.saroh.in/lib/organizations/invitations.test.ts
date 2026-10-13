import { formatDate } from "@/lib/format/datetime";
import { describe, expect, it } from "vitest";

import { pinClock } from "@/lib/format/test-clock";
import {
    bookableWithNoLogin,
    invitationMeta,
    inviteButton,
    inviteEmailError,
    inviteRoom,
    inviteSchema,
    teamCountLine,
    teamCounts,
} from "./invitations";

pinClock();

const ZONE = "Asia/Kolkata";

// The month as this runtime's ICU spells it ("Sep" or "Sept").
const sep = (day: number) =>
    formatDate(`2026-09-${String(day).padStart(2, "0")}T12:00:00Z`, ZONE);

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
            "They're already invited. Resend it from the list.",
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
            message: "They're already invited. Resend it from the list.",
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
        ).toBe("Invited 20 Aug · link expired 27 Aug, resend for a fresh one");
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

describe("the team cap, said (UX-028, DEC-155)", () => {
    it("counts the owner and the invites waiting", () => {
        expect(teamCountLine(1, 0)).toBe("Just you");
        expect(teamCountLine(1, 1)).toBe("Just you · 1 invite waiting");
        expect(teamCountLine(2, 3)).toBe(
            "2 people including you · 3 invites waiting",
        );
    });

    it("says nobody apart: no line of their own for people who only look", () => {
        for (const line of [
            teamCountLine(1, 0),
            teamCountLine(4, 2),
            teamCountLine(4, 2, 3),
        ]) {
            expect(line).not.toMatch(/view-only|no seat/i);
        }
    });

    it("says the bookable staff with no login: they take seats too (UX-053)", () => {
        expect(teamCountLine(1, 0, 1)).toBe(
            "Just you · 1 person taking bookings with no sign-in",
        );
        expect(teamCountLine(2, 1, 3)).toBe(
            "2 people including you · 3 people taking bookings with no sign-in · 1 invite waiting",
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

    it("counts everyone and every invite, whatever the role", () => {
        const members = [
            { role: "OWNER" },
            { role: "REVIEWER" },
            { role: "MEMBER" },
        ];
        const invites = [
            { role: "REVIEWER" },
            { role: "MEMBER" },
            // Someone on the diary with no login: counted there.
            { role: "calendar-only", countedOnDiary: true },
        ];
        expect(teamCounts(members, invites)).toEqual({ people: 3, waiting: 2 });
        // What an older API still sends is ignored: they use a seat.
        const old = [{ usesSeat: false, countedOnDiary: false }];
        expect(teamCounts(old, old)).toEqual({ people: 1, waiting: 1 });
    });

    it("a full team invites nobody new, at any role", () => {
        expect(inviteRoom(null)).toEqual({ open: true, reason: null });
        expect(inviteRoom({ full: false, why: "" })).toEqual({
            open: true,
            reason: null,
        });
        expect(inviteRoom({ full: true, why: "Your team is full" })).toEqual({
            open: false,
            reason: "Your team is full (invites count too).",
        });
    });
});

describe("inviteButton (UX-028, #868, #800)", () => {
    const FULL = {
        full: true,
        why: "You've reached your team members limit on Free",
    };

    it("invites anyone while there is room", () => {
        expect(inviteButton(null, 2)).toEqual({
            label: "Invite someone",
            diary: true,
            refused: null,
        });
    });

    it("at the limit, still gives someone on the diary a login", () => {
        expect(inviteButton(FULL, 2)).toEqual({
            label: "Invite someone on the diary",
            diary: true,
            refused: null,
        });
        expect(inviteButton(FULL, 0)).toEqual({
            label: "Team is full",
            diary: false,
            refused:
                "You've reached your team members limit on Free (invites count too). See plans in Plan and billing.",
        });
    });

    it("over the limit, offers nobody on the diary and says why", () => {
        // Their login would join as the newest, and be paused.
        const b = inviteButton(FULL, 2, true);
        expect(b.label).toBe("Team is full");
        expect(b.diary).toBe(false);
        expect(b.refused).toContain("over its plan's limit");
        expect(b.refused).toContain("Plan and billing");
    });

    it("never offers a way round a full team for people who only look", () => {
        for (const b of [
            inviteButton(FULL, 0),
            inviteButton(FULL, 2),
            inviteButton(FULL, 2, true),
        ]) {
            expect(b.label).not.toMatch(/view-only/i);
            expect(b.refused ?? "").not.toMatch(/view-only/i);
        }
    });
});
