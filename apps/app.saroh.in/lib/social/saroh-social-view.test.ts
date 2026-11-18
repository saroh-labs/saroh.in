import { describe, expect, it } from "vitest";

import type {
    SocialChannel,
    SocialDelivery,
    SocialPost,
} from "./saroh-social-types";
import {
    chipPosts,
    connectedLine,
    countsNextMonth,
    deliveryPill,
    inChip,
    meterOf,
    nextSevenDays,
    postLine,
    postPill,
    threadsFit,
    workingKinds,
} from "./saroh-social-view";
import { connectResultLine, deliveryReason } from "./saroh-social-words";

const ZONE = "Asia/Kolkata";
// Wed 18 Nov 2026, 12:00 in Kolkata.
const NOW = new Date("2026-11-18T06:30:00.000Z");

const delivery = (
    kind: SocialDelivery["kind"],
    status: SocialDelivery["status"],
    reason: string | null = null,
): SocialDelivery => ({
    kind,
    status,
    reason,
    retryAfter: null,
    permalink: null,
    postedAt: null,
});

const post = (
    id: string,
    status: SocialPost["status"],
    publishAt: string | null,
    channels: SocialDelivery[] = [delivery("INSTAGRAM", "WAITING")],
): SocialPost => ({
    id,
    status,
    sourceKind: "product",
    sourceRef: "cardamom-bun-box",
    title: `Post ${id}`,
    picture: {
        kind: "card",
        cardStyle: "price",
        size: "post",
        headline: null,
        mediaId: null,
        imageUrl: null,
    },
    caption: "Fresh buns",
    captions: {},
    linkPath: "/shop/cardamom-bun-box",
    ref: "social-abcdefghij",
    publishAt,
    zone: ZONE,
    channels,
    canEdit: status === "DRAFT" || status === "SCHEDULED",
    held: false,
    createdAt: "2026-11-17T06:30:00.000Z",
    updatedAt: "2026-11-17T06:30:00.000Z",
});

const channel = (
    kind: SocialChannel["kind"],
    state: SocialChannel["state"],
    handle: string | null = null,
): SocialChannel => ({
    kind,
    state,
    handle,
    avatarUrl: null,
    connectedAt: null,
    attention: null,
    grantEndsAt: null,
    waitingPosts: 0,
    heldPosts: 0,
    canConnect: true,
});

describe("Posted and drafts chips (S3)", () => {
    const posts = [
        post("draft", "DRAFT", null),
        post("later", "SCHEDULED", "2026-11-20T14:00:00.000Z"),
        post("sooner", "SCHEDULED", "2026-11-19T14:00:00.000Z"),
        post("done", "DONE", "2026-11-10T14:00:00.000Z", [
            delivery("INSTAGRAM", "POSTED"),
        ]),
        post("partly", "PARTLY_DONE", "2026-11-12T14:00:00.000Z", [
            delivery("INSTAGRAM", "POSTED"),
            delivery("THREADS", "FAILED", "limit"),
        ]),
        post("off", "CANCELLED", "2026-11-21T14:00:00.000Z"),
    ];

    it("splits posts as the API's own filters do", () => {
        expect(
            posts.filter((p) => inChip(p, "posted")).map((p) => p.id),
        ).toEqual(["done", "partly"]);
        expect(
            posts.filter((p) => inChip(p, "failed")).map((p) => p.id),
        ).toEqual(["partly"]);
        expect(
            posts.filter((p) => inChip(p, "draft")).map((p) => p.id),
        ).toEqual(["draft"]);
        expect(posts.some((p) => p.id === "off" && inChip(p, "all"))).toBe(
            false,
        );
    });

    it("puts what goes next first, then the newest gone", () => {
        expect(chipPosts(posts, "scheduled").map((p) => p.id)).toEqual([
            "sooner",
            "later",
        ]);
        expect(chipPosts(posts, "posted").map((p) => p.id)).toEqual([
            "partly",
            "done",
        ]);
    });

    it("says a partial failure in words, not only colour", () => {
        expect(postPill(posts[4])).toEqual({
            word: "Didn't post",
            tone: "warning",
        });
        expect(postPill(posts[3]).word).toBe("Posted");
        expect(postPill(posts[0]).tone).toBe("draft");
    });

    it("says a held post is on hold, not posting (S-02)", () => {
        const held = {
            ...post("held", "PUBLISHING", "2026-11-17T14:00:00.000Z", [
                delivery("INSTAGRAM", "WAITING", "off"),
            ]),
            held: true,
        };
        expect(postPill(held)).toEqual({ word: "On hold", tone: "warning" });
        expect(deliveryPill(held.channels[0]).word).toBe("On hold");
        expect(
            postPill({
                ...held,
                held: false,
                channels: [delivery("INSTAGRAM", "POSTING")],
            }).word,
        ).toBe("Posting");
    });

    it("writes when and where under a post", () => {
        expect(postLine(posts[3], ZONE, NOW)).toBe(
            "Posted Tue 10 Nov · Instagram",
        );
        expect(postLine(posts[2], ZONE, NOW)).toBe(
            "Tomorrow, 7:30 pm · Instagram",
        );
    });
});

describe("the next seven days", () => {
    it("puts each scheduled post on its day in the business's zone", () => {
        const days = nextSevenDays(
            [post("thu", "SCHEDULED", "2026-11-19T14:00:00.000Z")],
            ["2026-11-18T14:00:00.000Z", "2026-11-19T14:00:00.000Z"],
            ZONE,
            NOW,
        );
        expect(days).toHaveLength(7);
        expect(days[0].today).toBe(true);
        expect(days[0].label).toContain("today");
        // A free day offers its good time; a day with a post doesn't.
        expect(days[0].goodTime).toBe("7:30 pm");
        expect(days[1].posts.map((p) => p.id)).toEqual(["thu"]);
        expect(days[1].goodTime).toBeNull();
    });
});

describe("the month's count (S7)", () => {
    const usage = (used: number, limit: number | null) => ({
        used,
        limit,
        resetsAt: "2026-11-30T18:30:00.000Z",
        requested: false,
    });

    it("is quiet, then amber from 90%, then full at the limit", () => {
        expect(meterOf(usage(12, 100), ZONE, NOW)).toMatchObject({
            tone: "ink",
            line: "12 of 100 posts this month",
        });
        expect(meterOf(usage(90, 100), ZONE, NOW)).toMatchObject({
            tone: "warning",
            line: "10 posts left this month, more from 1 Dec",
        });
        expect(meterOf(usage(100, 100), ZONE, NOW)).toMatchObject({
            tone: "danger",
            full: true,
            line: "You've used your 100 posts for November",
        });
    });

    it("has no cap to count against when the plan sets none", () => {
        expect(meterOf(usage(3, null), ZONE, NOW)).toMatchObject({
            tone: "ink",
            full: false,
            line: "3 posts this month",
        });
    });

    it("says a post scheduled past the reset counts next month", () => {
        expect(
            countsNextMonth("2026-12-02T14:00:00.000Z", usage(1, 100), ZONE),
        ).toBe("December");
        expect(
            countsNextMonth("2026-11-20T14:00:00.000Z", usage(1, 100), ZONE),
        ).toBeNull();
    });
});

describe("captions", () => {
    const link = "https://rye.example.com/shop/cardamom-bun-box";

    it("fits Threads by bytes, counting the link and its tag", () => {
        expect(threadsFit("Fresh buns", link, false).state).toBe("fits");
        // A Devanagari letter is three bytes: 160 of them overrun 500.
        const long = "क".repeat(160);
        expect(threadsFit(long, link, false).state).toBe("cut");
        expect(threadsFit(long, link, true).state).toBe("over");
    });
});

describe("channels", () => {
    const rows = [
        channel("INSTAGRAM", "CONNECTED", "@chaiandcrumb"),
        channel("FACEBOOK", "NEEDS_ATTENTION", "Chai & Crumb"),
        channel("THREADS", "NOT_CONNECTED"),
    ];

    it("names what is connected, the first by its handle", () => {
        expect(connectedLine(rows)).toBe(
            "Instagram @chaiandcrumb and Facebook Page are connected.",
        );
        expect(connectedLine([rows[2]])).toBe("No channel connected yet.");
    });

    it("starts a new post on the channels that work only", () => {
        expect(workingKinds(rows)).toEqual(["INSTAGRAM"]);
    });

    it("says each way a connect came back, once, in its own words", () => {
        expect(connectResultLine("INSTAGRAM", "connected")).toBeNull();
        expect(connectResultLine("FACEBOOK", "choose")).toBeNull();
        expect(connectResultLine("INSTAGRAM", "no-instagram")).toContain(
            "link your Instagram professional account to a Facebook Page first",
        );
        expect(connectResultLine("FACEBOOK", "no-pages")).toContain(
            "manages no Page",
        );
        for (const result of [
            "denied",
            "invalid",
            "expired",
            "someone-else",
            "refused",
            "unavailable",
            "failed",
            "anything",
        ]) {
            expect(connectResultLine("THREADS", result), result).toMatch(
                /^Threads/,
            );
        }
    });

    it("gives a failed channel one reason and one fix (S6)", () => {
        expect(deliveryReason("INSTAGRAM", "auth", null).fix).toBe("reconnect");
        expect(
            deliveryReason("INSTAGRAM", "limit", "today, 4:10 pm").line,
        ).toBe(
            "Instagram's daily limit for your account was reached. Post it after today, 4:10 pm.",
        );
        expect(deliveryReason("THREADS", "disconnected", null).fix).toBe(
            "connect",
        );
        expect(deliveryReason("FACEBOOK", null, null).line).toBe(
            "Facebook didn't take it and didn't say why. Try again.",
        );
    });
});
