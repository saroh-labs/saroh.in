import { describe, expect, it } from "vitest";

import {
    replaySwitchedOn,
    sharesUsageNow,
    USAGE_NOTICE,
    usageNoticeDue,
    usageNoticeShown,
} from "./sharing";

const SEEN = "2026-10-10T09:30:00.000Z";

describe("replaySwitchedOn (DEC-125)", () => {
    it("needs both a key and the switch exactly on", () => {
        expect(replaySwitchedOn({ key: "phc_x", replay: "on" })).toBe(true);
        for (const settings of [
            { key: undefined, replay: "on" },
            { key: "", replay: "on" },
            { key: "phc_x", replay: undefined },
            { key: "phc_x", replay: "off" },
            { key: "phc_x", replay: "true" },
            { key: undefined, replay: undefined },
        ])
            expect(replaySwitchedOn(settings)).toBe(false);
    });
});

describe("sharesUsageNow", () => {
    it("is what the person saved", () => {
        expect(sharesUsageNow({ sharesUsage: true, noticeSeenAt: null })).toBe(
            true,
        );
        expect(sharesUsageNow({ sharesUsage: false, noticeSeenAt: null })).toBe(
            false,
        );
    });

    it("is yes for someone who has never chosen", () => {
        expect(sharesUsageNow({ sharesUsage: null, noticeSeenAt: null })).toBe(
            true,
        );
    });

    it("is no when the choice could not be read: nobody is recorded on a guess", () => {
        expect(sharesUsageNow(null)).toBe(false);
    });
});

describe("the one-time notice (DEC-125, 10 Oct)", () => {
    it("is due for someone who shares and has not dismissed it", () => {
        expect(usageNoticeDue({ sharesUsage: null, noticeSeenAt: null })).toBe(
            true,
        );
        expect(usageNoticeDue({ sharesUsage: true, noticeSeenAt: null })).toBe(
            true,
        );
    });

    it("is not due once dismissed, for someone who turned sharing off, or on a failed read", () => {
        expect(usageNoticeDue({ sharesUsage: null, noticeSeenAt: SEEN })).toBe(
            false,
        );
        expect(usageNoticeDue({ sharesUsage: false, noticeSeenAt: null })).toBe(
            false,
        );
        expect(usageNoticeDue(null)).toBe(false);
    });

    it("counts as shown when dismissed before or on screen now, and not otherwise", () => {
        const fresh = { sharesUsage: null, noticeSeenAt: null };
        expect(usageNoticeShown(fresh, false)).toBe(false);
        expect(usageNoticeShown(fresh, true)).toBe(true);
        expect(
            usageNoticeShown({ sharesUsage: null, noticeSeenAt: SEEN }, false),
        ).toBe(true);
        expect(usageNoticeShown(null, false)).toBe(false);
    });

    it("says what the owner wrote", () => {
        expect(
            `${USAGE_NOTICE.body} ${USAGE_NOTICE.turnOff} ${USAGE_NOTICE.settings}.`,
        ).toBe(
            "We record how the workspace is used to make Saroh easier. Your customers' details and anything you type are hidden. Turn it off in Settings › Your profile.",
        );
        expect(USAGE_NOTICE.href).toBe("/settings/profile");
    });
});
