/**
 * Saroh Social's shapes, as the API's `organizations/:id/social` answers
 * them (plan saroh-social U9 to U13). Client-safe: no reads here; those
 * are `saroh-social.ts`, server-only.
 */

export type ChannelKind = "INSTAGRAM" | "FACEBOOK" | "THREADS";
export const CHANNEL_KINDS: readonly ChannelKind[] = [
    "INSTAGRAM",
    "FACEBOOK",
    "THREADS",
];

/** The kinds whose sign-in can offer several Pages (or Instagram accounts) to pick from. */
export const PICKER_KINDS: readonly ChannelKind[] = ["INSTAGRAM", "FACEBOOK"];

/** `GET …/social`: whether Saroh Social is open here, and this month's count. */
export interface SocialAccess {
    state: "on" | "locked" | "unavailable";
    canPost: boolean;
    canBuy: boolean;
    plan: { id: string; name: string } | null;
    upgradeTo: { planId: string; name: string } | null;
    usage: {
        used: number;
        limit: number | null;
        resetsAt: string;
        requested: boolean;
    } | null;
    /** The next suggested times to post (ISO). */
    goodTimes: string[];
}

/** One row of Channels (S2). */
export interface SocialChannel {
    kind: ChannelKind;
    state: "NOT_CONNECTED" | "CONNECTED" | "NEEDS_ATTENTION";
    handle: string | null;
    avatarUrl: string | null;
    connectedAt: string | null;
    attention: { reason: string; since: string } | null;
    grantEndsAt: string | null;
    waitingPosts: number;
    heldPosts: number;
    canConnect: boolean;
}

export interface PageChoice {
    id: string;
    name: string;
    avatarUrl: string | null;
}

export interface SocialDelivery {
    kind: ChannelKind;
    status: "WAITING" | "POSTING" | "POSTED" | "FAILED" | "UNKNOWN";
    reason: string | null;
    retryAfter: string | null;
    permalink: string | null;
    postedAt: string | null;
}

export type SocialPostStatus =
    | "DRAFT"
    | "SCHEDULED"
    | "PUBLISHING"
    | "DONE"
    | "PARTLY_DONE"
    | "FAILED"
    | "CANCELLED";

export interface SocialPost {
    id: string;
    status: SocialPostStatus;
    sourceKind: string;
    sourceRef: string | null;
    title: string;
    picture: {
        kind: string;
        cardStyle: string;
        size: string;
        headline: string | null;
        mediaId: string | null;
        imageUrl: string | null;
    };
    caption: string;
    captions: Partial<Record<ChannelKind, string>>;
    linkPath: string;
    ref: string;
    publishAt: string | null;
    zone: string | null;
    channels: SocialDelivery[];
    canEdit: boolean;
    /** Past its time and waiting, with no run coming: cancel, delete, or post it from Channels. */
    held: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PostResults {
    visits: number;
    /** Visits from its link that paid: an order or a booking. */
    paid: number;
    from: string | null;
    to: string;
}

/** What the composer saves (`PostInputDto`). */
export interface SocialPostInput {
    sourceKind?: string;
    sourceRef?: string | null;
    title?: string;
    picture?: "card" | "photo";
    cardStyle?: string;
    size?: "post" | "square";
    headline?: string | null;
    mediaId?: string | null;
    caption?: string;
    captions?: Partial<Record<ChannelKind, string>> | null;
    linkPath?: string;
    channels?: ChannelKind[];
    action?: "draft" | "schedule" | "now";
    publishAt?: string;
}

export type PostFilter = "scheduled" | "posted" | "failed" | "draft";

/** A read that may come back: the answer, or that it couldn't be read. */
export type Read<T> = { ok: true; data: T } | { ok: false };

export const UNAVAILABLE: SocialAccess = {
    state: "unavailable",
    canPost: false,
    canBuy: false,
    plan: null,
    upgradeTo: null,
    usage: null,
    goodTimes: [],
};

/** Where Social is, from its address (`?tab=`, `?channel=`, `?result=`, `?choice=`, `?post=`). */
export interface SocialParams {
    tab: "posts" | "channels";
    channel: string | null;
    result: string | null;
    choice: string | null;
    post: string | null;
}
