// "Your membership ends on ‹date›" (U19, #1150): its words, its link, and
// when the daily sweep says it is due, in the membership's own zone.
import { backLink, renderNotice, withLink } from ".";
import { endingNoticeDue } from "../../subscriptions/membership-ending.handler";
import { pathOf } from "../notice-link";
import type { MembershipEndingNotice } from "./membership-ending";
import {
    membershipEndingNoticeKey,
    membershipEndingSentence,
} from "./membership-ending";

jest.mock("../../../env", () => ({ env: { SITE_ACCOUNT_AREA: "on" } }));

// 29 Oct 2026, midnight in India.
const END = new Date("2026-10-28T18:30:00.000Z");

const notice = (): MembershipEndingNotice => ({
    kind: "MEMBERSHIP_ENDING",
    ending: {
        business: "Rye & Co",
        firstName: "Asha",
        plan: "Monthly yoga",
        endsAt: END,
        timeZone: "Asia/Kolkata",
        link: null,
    },
});

describe("the words", () => {
    it("names the plan and the day it ends in the membership's zone, and how to keep it", () => {
        expect(membershipEndingSentence(notice().ending)).toBe(
            "Your Monthly yoga membership ends on Thu 29 Oct 2026. Nothing more will be charged. To keep it, let us know before then.",
        );
        expect(renderNotice(notice()).subject).toBe(
            "Your membership at Rye & Co ends on Thu 29 Oct 2026",
        );
    });

    it("links to their Messages on the site, only a web address", () => {
        const linked = withLink(
            notice(),
            "https://rye.saroh.app/account/messages",
        );
        expect(backLink(linked)).toEqual({
            lead: "To keep it, send us a message:",
            url: "https://rye.saroh.app/account/messages",
        });
        expect(renderNotice(linked).body).toContain(
            "https://rye.saroh.app/account/messages",
        );
        expect(backLink(withLink(notice(), "javascript:alert(1)"))).toBeNull();
        expect(pathOf({ kind: "MEMBERSHIP_ENDING" })).toBe("/account/messages");
    });

    it("is keyed once per membership and end date", () => {
        expect(membershipEndingNoticeKey("sub_1", END)).toBe(
            "membership-ending:sub_1:2026-10-28T18:30:00.000Z",
        );
    });
});

describe("when it is due", () => {
    const at = (iso: string) => new Date(iso);
    const due = (now: string, scheduledAt: Date | null = null) =>
        endingNoticeDue({
            endsAt: END,
            timeZone: "Asia/Kolkata",
            scheduledAt,
            now: at(now),
        });

    it("7 days before the end, by the membership's calendar", () => {
        // 22 Oct, 9 am in India: the end is 7 days away.
        expect(due("2026-10-22T03:30:00.000Z")).toBe(true);
        // 21 Oct, 10:59 pm in India: 8 days away, not yet.
        expect(due("2026-10-21T17:29:00.000Z")).toBe(false);
        // 22 Oct, 00:10 in India, though still 21 Oct in UTC: due.
        expect(due("2026-10-21T18:40:00.000Z")).toBe(true);
    });

    it("a run missed still tells it later that week, never on or after the day", () => {
        expect(due("2026-10-25T03:30:00.000Z")).toBe(true);
        expect(due("2026-10-28T10:30:00.000Z")).toBe(true);
        // On the day it ends (29 Oct in India): too late.
        expect(due("2026-10-29T03:30:00.000Z")).toBe(false);
        expect(due("2026-10-30T03:30:00.000Z")).toBe(false);
    });

    it("not when the member cancelled inside the week: that email named the day", () => {
        const weekBefore = at("2026-10-21T18:30:00.000Z"); // 22 Oct 00:00 IST
        expect(
            due("2026-10-25T03:30:00.000Z", at("2026-10-24T03:30:00.000Z")),
        ).toBe(false);
        expect(due("2026-10-22T03:30:00.000Z", weekBefore)).toBe(false);
        expect(
            due("2026-10-22T03:30:00.000Z", at("2026-10-01T03:30:00.000Z")),
        ).toBe(true);
    });

    it("a zone that isn't one reads as India", () => {
        expect(
            endingNoticeDue({
                endsAt: END,
                timeZone: "Not/AZone",
                scheduledAt: null,
                now: at("2026-10-22T03:30:00.000Z"),
            }),
        ).toBe(true);
    });
});
