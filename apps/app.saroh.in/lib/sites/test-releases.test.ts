import { describe, expect, it } from "vitest";

import type { ReleaseAbilities, TestRelease } from "./test-releases";
import {
    changesAskedLine,
    goLiveGate,
    linkLine,
    LIVE_OUTSIDE_RELEASE,
    NEEDS_APPROVAL_OTHERS,
    NEEDS_PUBLISH_PERMISSION,
    nextSlot,
    publishOverScheduleWarning,
    releaseStatusCopy,
    replacesLine,
    scheduledReadout,
    standingCopy,
    wentLiveToast,
    whenIn,
} from "./test-releases";

const KOLKATA = "Asia/Kolkata";
// Tue 30 Sep 2026, 15:00 in Kolkata.
const NOW = new Date("2026-09-30T09:30:00Z");

function release(over: Partial<TestRelease> = {}): TestRelease {
    return {
        id: "rel_1",
        number: 3,
        name: "Diwali menu",
        note: null,
        status: "ready",
        createdAt: "2026-09-30T04:40:00Z",
        createdBy: { name: "Asha" },
        draftChangedSince: false,
        standing: {
            outstanding: false,
            route: "NONE",
            approved: false,
            latest: null,
        },
        schedule: null,
        wentLiveAt: null,
        livePublicationId: null,
        discardedAt: null,
        lastGoLive: null,
        links: [],
        ...over,
    };
}

const OWNER: ReleaseAbilities = {
    canPublish: true,
    canUpdate: true,
    needsApproval: false,
    canOverride: true,
};

describe("when, in the business's zone", () => {
    it("says today, tomorrow, a weekday this week, and a date further off", () => {
        expect(whenIn("2026-09-30T12:30:00Z", KOLKATA, NOW)).toBe(
            "today, 6:00pm",
        );
        expect(whenIn("2026-10-01T12:30:00Z", KOLKATA, NOW)).toBe(
            "tomorrow, 6:00pm",
        );
        expect(whenIn("2026-10-02T12:30:00Z", KOLKATA, NOW)).toBe("Fri 6:00pm");
        expect(whenIn("2026-10-20T12:30:00Z", KOLKATA, NOW)).toBe(
            "Tue 20 Oct, 6:00pm",
        );
    });

    it("reads the same instant in the business's zone, not the browser's", () => {
        // 22:30 UTC on the 30th is already the 1st in Kolkata, and still
        // the 30th in London (BST).
        expect(whenIn("2026-09-30T22:30:00Z", KOLKATA, NOW)).toBe(
            "tomorrow, 4:00am",
        );
        expect(whenIn("2026-09-30T22:30:00Z", "Europe/London", NOW)).toBe(
            "today, 11:30pm",
        );
    });

    it("offers the next half hour at least an hour ahead, in the zone", () => {
        expect(nextSlot(NOW, KOLKATA)).toEqual({
            date: "2026-09-30",
            time: "16:00",
        });
        expect(nextSlot(new Date("2026-09-30T18:00:00Z"), KOLKATA)).toEqual({
            date: "2026-10-01",
            time: "00:30",
        });
    });
});

describe("a release's status copy", () => {
    it("ready: who made it and when", () => {
        expect(releaseStatusCopy(release(), KOLKATA, NOW)).toEqual({
            label: "Ready",
            tone: "draft",
            line: "Made today, 10:10am by Asha",
        });
    });

    it("scheduled: when it goes live, in the business's zone, and who set it", () => {
        const copy = releaseStatusCopy(
            release({
                status: "scheduled",
                schedule: {
                    goLiveAt: "2026-10-02T12:30:00Z",
                    zone: KOLKATA,
                    by: { name: "Ravi" },
                },
            }),
            KOLKATA,
            NOW,
        );
        expect(copy.label).toBe("Scheduled");
        expect(copy.line).toBe("Goes live Fri 6:00pm (Kolkata time) by Ravi");
    });

    it("live and discarded say when", () => {
        expect(
            releaseStatusCopy(
                release({
                    status: "live",
                    wentLiveAt: "2026-09-30T09:00:00Z",
                }),
                KOLKATA,
                NOW,
            ),
        ).toMatchObject({ label: "Live", line: "Went live today, 2:30pm" });
        expect(
            releaseStatusCopy(
                release({
                    status: "discarded",
                    discardedAt: "2026-09-29T09:00:00Z",
                }),
                KOLKATA,
                NOW,
            ),
        ).toMatchObject({
            label: "Discarded",
            line: "Discarded yesterday, 2:30pm. Its links no longer open it.",
        });
    });

    it("a scheduled go-live that didn't happen says why, in the API's words", () => {
        const reason =
            "The site was published at 3:10pm, after this was scheduled. Go live now, or schedule it again.";
        expect(
            releaseStatusCopy(
                release({ lastGoLive: { outcome: "NOT_LIVE", reason } }),
                KOLKATA,
                NOW,
            ),
        ).toEqual({ label: "Didn't go live", tone: "error", line: reason });
    });
});

describe("the top bar and publishing over a schedule", () => {
    const scheduled = release({
        status: "scheduled",
        schedule: {
            goLiveAt: "2026-10-02T12:30:00Z",
            zone: KOLKATA,
            by: { name: "Ravi" },
        },
    });

    it("says what is going live and when", () => {
        expect(scheduledReadout([release(), scheduled], KOLKATA, NOW)).toBe(
            "Going live Fri 6:00pm · Diwali menu",
        );
        expect(scheduledReadout([release()], KOLKATA, NOW)).toBeNull();
    });

    it("warns that a publish now stops the schedule (KTD-14)", () => {
        expect(publishOverScheduleWarning(scheduled, KOLKATA, NOW)).toMatch(
            /^“Diwali menu” is scheduled to go live Fri 6:00pm\. If you publish now, it won't go live then/,
        );
    });
});

describe("who can go live", () => {
    it("without site:publish, Go live is disabled and says why", () => {
        expect(goLiveGate(release(), { ...OWNER, canPublish: false })).toEqual({
            kind: "blocked",
            why: NEEDS_PUBLISH_PERMISSION,
        });
    });

    it("with approval needed and none given, an owner overrides and others wait", () => {
        const needs = { ...OWNER, needsApproval: true };
        expect(goLiveGate(release(), needs).kind).toBe("override");
        expect(goLiveGate(release(), { ...needs, canOverride: false })).toEqual(
            { kind: "blocked", why: NEEDS_APPROVAL_OTHERS },
        );
    });

    it("an approved release goes live for anyone who can publish", () => {
        const approved = release({
            standing: {
                outstanding: false,
                route: "APPROVED",
                approved: true,
                latest: {
                    outcome: "APPROVED",
                    at: "2026-09-30T08:00:00Z",
                    by: "Ravi",
                },
            },
        });
        expect(
            goLiveGate(approved, {
                ...OWNER,
                needsApproval: true,
                canOverride: false,
            }),
        ).toEqual({ kind: "go" });
    });

    it("a scheduled, live or discarded release doesn't offer Go live", () => {
        expect(goLiveGate(release({ status: "scheduled" }), OWNER).kind).toBe(
            "blocked",
        );
        expect(goLiveGate(release({ status: "live" }), OWNER).kind).toBe(
            "blocked",
        );
        expect(goLiveGate(release({ status: "discarded" }), OWNER).kind).toBe(
            "blocked",
        );
    });
});

describe("review standing", () => {
    it("says whose approval counts (KTD-10)", () => {
        expect(
            standingCopy({
                outstanding: false,
                route: "APPROVED",
                approved: true,
                latest: { outcome: "APPROVED", at: "", by: "Ravi" },
            }),
        ).toEqual({ text: "Approved by Ravi", approved: true });
        expect(
            standingCopy({
                outstanding: false,
                route: "BYPASSED",
                approved: false,
                latest: { outcome: "APPROVED", at: "", by: "Asha" },
            }).text,
        ).toMatch(/needs someone else's approval/);
        expect(
            standingCopy({
                outstanding: true,
                route: "BYPASSED",
                approved: false,
                latest: { outcome: "CHANGES_REQUESTED", at: "", by: "Ravi" },
            }).text,
        ).toBe("Ravi asked for changes");
    });

    it("no longer reads In review once going live closed it (DEC-101)", () => {
        expect(
            standingCopy({
                outstanding: false,
                route: "DIRECT",
                approved: false,
                latest: { outcome: "BYPASSED", at: "", by: "Asha" },
            }),
        ).toEqual({
            text: "Asha put it live without approval",
            approved: false,
        });
    });
});

describe("links, going live and what stays live", () => {
    it("a link says until when it works and whether it was opened", () => {
        expect(
            linkLine(
                {
                    id: "l1",
                    purpose: "SHARE",
                    state: "active",
                    createdAt: "2026-09-30T04:40:00Z",
                    expiresAt: "2026-10-07T04:40:00Z",
                    revokedAt: null,
                    lastUsedAt: null,
                    createdBy: { name: "Asha" },
                },
                KOLKATA,
                NOW,
            ),
        ).toBe("Works until 7 Oct · Not opened yet");
    });

    it("Go live says what it replaces, and the toast what it did", () => {
        expect(replacesLine("2026-09-30T09:40:00Z", KOLKATA, NOW)).toBe(
            "It replaces the version that's been live since today, 3:10pm. Your draft is left as it is.",
        );
        expect(
            wentLiveToast(
                {
                    publishedAt: "2026-09-30T09:30:00Z",
                    bypassed: false,
                    overridden: true,
                    replaced: {
                        publishedAt: "2026-09-30T09:40:00Z",
                        publishedBy: { name: "Asha" },
                    },
                    release: release(),
                },
                KOLKATA,
                NOW,
            ),
        ).toBe(
            "“Diwali menu” is live. It replaced the version published today, 3:10pm by Asha. Recorded as gone live without approval.",
        );
    });

    it("lists what stays live in the bar's own words (R6)", () => {
        expect(LIVE_OUTSIDE_RELEASE).toContain("Products, prices and stock");
        expect(LIVE_OUTSIDE_RELEASE).toContain("Opening hours");
    });
});

describe("changesAskedLine (UX-068)", () => {
    const standing = (latest: TestRelease["standing"]["latest"]) => ({
        ...release().standing,
        latest,
    });

    it("says who asked for what before going live", () => {
        expect(
            changesAskedLine(
                standing({
                    outcome: "CHANGES_REQUESTED",
                    at: "",
                    by: "Rina",
                    reason: "Hours are wrong",
                }),
            ),
        ).toBe(
            "Rina asked for changes on this release: “Hours are wrong”. Going live now is recorded as without approval.",
        );
    });

    it("says nothing for an approval or no review", () => {
        expect(changesAskedLine(standing(null))).toBeNull();
        expect(
            changesAskedLine(
                standing({ outcome: "APPROVED", at: "", by: "Rina" }),
            ),
        ).toBeNull();
    });
});
