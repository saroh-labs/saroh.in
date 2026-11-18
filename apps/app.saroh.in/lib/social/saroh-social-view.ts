import {
    formatDate,
    formatMonth,
    formatRelative,
    formatTime,
    localDateKey,
} from "@/lib/format/datetime";
import { sentenceStart } from "@/lib/format/sentence";

import type {
    ChannelKind,
    SocialAccess,
    SocialChannel,
    SocialPost,
} from "./saroh-social-types";
import { CHANNEL_KINDS } from "./saroh-social-types";
import {
    CHANNEL_NAMES,
    CHANNEL_SHORT,
    SOCIAL_WORDS,
} from "./saroh-social-words";

/**
 * Saroh Social's screens, worked out (U9 to U13). Pure: every function
 * here takes what the API said and the business's zone, and returns what
 * a screen draws.
 */

export type PostChip = "all" | "scheduled" | "posted" | "failed" | "draft";
export const POST_CHIPS: readonly PostChip[] = [
    "all",
    "posted",
    "scheduled",
    "failed",
    "draft",
];

/** A pill's tone, by the names `StatusBadge` takes. */
export type PillTone =
    "draft" | "info" | "active" | "success" | "warning" | "error" | "neutral";

/** "Instagram", "Instagram and Threads", "Instagram, Facebook and Threads". */
export function joinList(words: readonly string[]): string {
    if (words.length <= 1) return words.join("");
    return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

const hasFailed = (p: SocialPost) =>
    p.channels.some((c) => c.status === "FAILED");

/** Which chip a post is under, as the API's own filters split them. */
export function inChip(post: SocialPost, chip: PostChip): boolean {
    switch (chip) {
        case "all":
            return post.status !== "CANCELLED";
        case "scheduled":
            return post.status === "SCHEDULED" || post.status === "PUBLISHING";
        case "posted":
            return post.status === "DONE" || post.status === "PARTLY_DONE";
        case "failed":
            return (
                (post.status === "PARTLY_DONE" || post.status === "FAILED") &&
                hasFailed(post)
            );
        case "draft":
            return post.status === "DRAFT";
    }
}

/** The posts under a chip: soonest to go first, then the newest gone. */
export function chipPosts(posts: readonly SocialPost[], chip: PostChip) {
    const at = (p: SocialPost) => Date.parse(p.publishAt ?? p.updatedAt);
    const upcoming = (p: SocialPost) =>
        p.status === "SCHEDULED" || p.status === "PUBLISHING";
    return posts
        .filter((p) => inChip(p, chip))
        .sort((a, b) =>
            upcoming(a) !== upcoming(b)
                ? upcoming(a)
                    ? -1
                    : 1
                : upcoming(a)
                  ? at(a) - at(b)
                  : at(b) - at(a),
        );
}

/** A post's pill: its words and tone. Said in words, never colour alone. */
export function postPill(post: SocialPost): { word: string; tone: PillTone } {
    switch (post.status) {
        case "DRAFT":
            return { word: SOCIAL_WORDS.draft, tone: "draft" };
        case "SCHEDULED":
            return { word: SOCIAL_WORDS.scheduled, tone: "info" };
        case "PUBLISHING":
            return { word: SOCIAL_WORDS.posting, tone: "active" };
        case "DONE":
            return { word: SOCIAL_WORDS.posted, tone: "success" };
        case "PARTLY_DONE":
            return hasFailed(post)
                ? { word: SOCIAL_WORDS.didntPost, tone: "warning" }
                : { word: SOCIAL_WORDS.posted, tone: "success" };
        case "FAILED":
            return { word: SOCIAL_WORDS.didntPost, tone: "error" };
        case "CANCELLED":
            return { word: SOCIAL_WORDS.cancelled, tone: "neutral" };
    }
}

/** One channel of a post, as its row in the sheet says it. */
export function deliveryPill(d: SocialPost["channels"][number]): {
    word: string;
    tone: PillTone;
} {
    switch (d.status) {
        case "POSTED":
            return { word: SOCIAL_WORDS.posted, tone: "success" };
        case "FAILED":
            return { word: SOCIAL_WORDS.didntPost, tone: "error" };
        case "POSTING":
        case "UNKNOWN":
            return { word: SOCIAL_WORDS.posting, tone: "active" };
        case "WAITING":
            return d.reason === "attention"
                ? { word: SOCIAL_WORDS.waitsReconnect, tone: "warning" }
                : { word: SOCIAL_WORDS.scheduled, tone: "info" };
    }
}

/** "Instagram, Facebook and Threads"; "all 3" where room is short. */
export function channelList(kinds: readonly ChannelKind[], short = false) {
    if (short && kinds.length === CHANNEL_KINDS.length) return "all 3";
    return joinList(kinds.map((k) => CHANNEL_SHORT[k]));
}

/**
 * The line under a post's name: when, and where. "Posted today ·
 * Instagram, Facebook", "Thu 19 Nov, 7:30 pm · Instagram", "Draft · saved
 * 2 hours ago".
 */
export function postLine(post: SocialPost, zone: string, now = new Date()) {
    const kinds = post.channels.map((c) => c.kind);
    const where = kinds.length > 0 ? ` · ${channelList(kinds)}` : "";
    if (post.status === "DRAFT") {
        return `${SOCIAL_WORDS.draft} · saved ${formatRelative(post.updatedAt, now)}`;
    }
    if (!post.publishAt) return channelList(kinds);
    const day = formatDate(post.publishAt, zone, {
        now,
        relative: "lower",
        weekday: "short",
    });
    if (post.status === "DONE" || post.status === "PARTLY_DONE") {
        const posted = post.channels
            .filter((c) => c.status === "POSTED")
            .map((c) => c.kind);
        return `Posted ${day}${posted.length > 0 ? ` · ${channelList(posted)}` : ""}`;
    }
    return `${sentenceStart(day)}, ${formatTime(post.publishAt, zone)}${where}`;
}

/** One day of the next seven (board BSocialHomeSocialDesk). */
export interface WeekDay {
    key: string;
    label: string;
    today: boolean;
    posts: SocialPost[];
    /** The day's good time, when it's still ahead and the day is free. */
    goodTime: string | null;
    goodTimeAt: string | null;
}

/** Today and the six days after, with what goes out on each. */
export function nextSevenDays(
    posts: readonly SocialPost[],
    goodTimes: readonly string[],
    zone: string,
    now = new Date(),
): WeekDay[] {
    const days: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
        const at = new Date(now.getTime() + i * 86_400_000);
        const key = localDateKey(at, zone);
        const onDay = posts.filter(
            (p) =>
                p.publishAt &&
                p.status !== "DRAFT" &&
                p.status !== "CANCELLED" &&
                localDateKey(p.publishAt, zone) === key,
        );
        const good =
            onDay.length === 0
                ? (goodTimes.find((g) => localDateKey(g, zone) === key) ?? null)
                : null;
        days.push({
            key,
            label: `${formatDate(at, zone, { now, weekday: "short", year: "never" })}${i === 0 ? " · today" : ""}`,
            today: i === 0,
            posts: onDay.sort(
                (a, b) =>
                    Date.parse(a.publishAt ?? "") -
                    Date.parse(b.publishAt ?? ""),
            ),
            goodTime: good ? formatTime(good, zone) : null,
            goodTimeAt: good,
        });
    }
    return days;
}

/** The month's count, as the meter says it (S7). */
export interface Meter {
    line: string;
    /** Amber from 90%, full at the limit: never colour alone, the line says it. */
    tone: "ink" | "warning" | "danger";
    used: number;
    limit: number | null;
    full: boolean;
    resets: string;
    month: string;
}

export function meterOf(
    usage: NonNullable<SocialAccess["usage"]>,
    zone: string,
    now = new Date(),
): Meter {
    const { used, limit } = usage;
    // The count starts again at `resetsAt`: the day before it is this month's last.
    const resets = formatDate(usage.resetsAt, zone, { now });
    const month = formatMonth(
        new Date(Date.parse(usage.resetsAt) - 86_400_000),
        zone,
        { year: "never" },
    );
    const base = { used, limit, resets, month };
    if (limit === null) {
        return {
            ...base,
            line: SOCIAL_WORDS.used(used, null),
            tone: "ink",
            full: false,
        };
    }
    if (used >= limit) {
        return {
            ...base,
            line: SOCIAL_WORDS.usedAll(limit, month),
            tone: "danger",
            full: true,
        };
    }
    if (used >= Math.ceil(limit * 0.9)) {
        return {
            ...base,
            line: SOCIAL_WORDS.left(limit - used, resets),
            tone: "warning",
            full: false,
        };
    }
    return {
        ...base,
        line: SOCIAL_WORDS.used(used, limit),
        tone: "ink",
        full: false,
    };
}

/** "Instagram @chaiandcrumb, Facebook Page and Threads are connected." */
export function connectedLine(channels: readonly SocialChannel[]): string {
    const on = channels.filter((c) => c.state !== "NOT_CONNECTED");
    if (on.length === 0) return SOCIAL_WORDS.noneConnected;
    return SOCIAL_WORDS.connectedLine(
        joinList(
            on.map((c, i) =>
                i === 0 && c.handle
                    ? `${CHANNEL_NAMES[c.kind]} ${c.handle}`
                    : CHANNEL_NAMES[c.kind],
            ),
        ),
        on.length,
    );
}

/** The channels a new post goes to at first: every one connected and working. */
export const workingKinds = (channels: readonly SocialChannel[]) =>
    channels.filter((c) => c.state === "CONNECTED").map((c) => c.kind);

// — Captions ————————————————————————————————————————————————————

/** Threads counts bytes: an Indian script's letter is three. */
export const THREADS_MAX_BYTES = 500;
const REF_LENGTH = "?ref=social-abcdefghij".length;
const bytes = (s: string) => new TextEncoder().encode(s).length;

/** How the words and the link join on each channel, as the API joins them. */
export function captionWithLink(
    kind: ChannelKind,
    text: string,
    link: string,
): string {
    const words = text.trim();
    const tail =
        kind === "INSTAGRAM" ? `${SOCIAL_WORDS.linkInBio}\n${link}` : link;
    return words ? `${words}\n\n${tail}` : tail;
}

/**
 * What Threads would make of `text` with the post's link, its tag counted
 * too: fine, cut (the post's own words, cut with "…"), or over (words
 * written for Threads alone, which must fit as they are).
 */
export function threadsFit(
    text: string,
    link: string,
    own: boolean,
): { state: "fits" | "cut" | "over"; bytes: number } {
    const n = bytes(captionWithLink("THREADS", text, link)) + REF_LENGTH;
    if (n <= THREADS_MAX_BYTES) return { state: "fits", bytes: n };
    return { state: own ? "over" : "cut", bytes: n };
}

/** A post's time is in next month's count (its `publishAt` is past the reset). */
export function countsNextMonth(
    publishAt: string | null,
    usage: SocialAccess["usage"],
    zone: string,
): string | null {
    if (!publishAt || !usage) return null;
    return Date.parse(publishAt) >= Date.parse(usage.resetsAt)
        ? formatMonth(publishAt, zone, { year: "never" })
        : null;
}

/** "Thu 19 Nov, 7:30 pm" (or "today, 7:30 pm"), a time a button names. */
export function whenWords(at: string, zone: string, now = new Date()) {
    return `${formatDate(at, zone, { now, weekday: "short", relative: "lower" })}, ${formatTime(at, zone)}`;
}
