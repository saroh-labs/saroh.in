import type { Prisma } from "@saroh/database";

import type { ChannelKind } from "../meta/social-meta.port";

/** What a post read selects. */
export const POST_SELECT = {
    id: true,
    organizationId: true,
    sourceKind: true,
    sourceRef: true,
    title: true,
    picture: true,
    cardStyle: true,
    size: true,
    headline: true,
    mediaId: true,
    imageKey: true,
    imageUrl: true,
    caption: true,
    captions: true,
    linkPath: true,
    ref: true,
    status: true,
    publishAt: true,
    zone: true,
    publishJobId: true,
    removedAt: true,
    createdAt: true,
    updatedAt: true,
    deliveries: {
        orderBy: { kind: "asc" },
        select: {
            kind: true,
            status: true,
            reason: true,
            retryAfter: true,
            permalink: true,
            postedAt: true,
            lastTriedAt: true,
        },
    },
} as const satisfies Prisma.SocialPostSelect;

export type PostRow = Prisma.SocialPostGetPayload<{
    select: typeof POST_SELECT;
}>;

/** One channel of a post, as S3, S5 and S6 show it. */
export interface DeliveryView {
    kind: ChannelKind;
    /** WAITING (scheduled, or held for a reconnect), POSTING, POSTED, FAILED, UNKNOWN (being checked). */
    status: string;
    /**
     * Why it didn't post, or why it waits: `auth` (reconnect), `limit`
     * (try after `retryAfter`), `media` (the picture was refused),
     * `stuck` (the platform didn't take it in time), `unknown`,
     * `disconnected`, `reconnected` (another account now), `attention`
     * (waits for a reconnect), `off` (Social isn't on for the business now),
     * `removed` (the post was removed from Saroh before it went out here).
     */
    reason: string | null;
    retryAfter: string | null;
    /** "Open on Instagram". */
    permalink: string | null;
    postedAt: string | null;
}

/** A post as the screens read it. */
export interface PostView {
    id: string;
    status: string;
    sourceKind: string;
    sourceRef: string | null;
    title: string;
    picture: {
        kind: string;
        cardStyle: string;
        size: string;
        headline: string | null;
        mediaId: string | null;
        /** The JPEG Saroh drew; null for a draft not drawn yet. */
        imageUrl: string | null;
    };
    caption: string;
    captions: Partial<Record<ChannelKind, string>>;
    linkPath: string;
    /** `?ref=` on its link: its visits are counted by it. */
    ref: string;
    publishAt: string | null;
    zone: string | null;
    channels: DeliveryView[];
    /** A draft or a post not started can be changed, moved and cancelled. */
    canEdit: boolean;
    /**
     * Past its time and not going out on its own (S-02): Social was off
     * for the business then, or a channel needs reconnecting. It can be
     * cancelled (nothing sent yet) or deleted, or posted from Channels.
     */
    held: boolean;
    createdAt: string;
    updatedAt: string;
}

export function postView(row: PostRow): PostView {
    return {
        id: row.id,
        status: row.status,
        sourceKind: row.sourceKind,
        sourceRef: row.sourceRef,
        title: row.title,
        picture: {
            kind: row.picture,
            cardStyle: row.cardStyle,
            size: row.size,
            headline: row.headline,
            mediaId: row.mediaId,
            imageUrl: row.imageUrl,
        },
        caption: row.caption,
        captions: captionsOf(row.captions),
        linkPath: row.linkPath,
        ref: row.ref,
        publishAt: row.publishAt?.toISOString() ?? null,
        zone: row.zone,
        channels: row.deliveries.map((d) => ({
            kind: d.kind,
            status: d.status,
            reason: d.reason,
            retryAfter: d.retryAfter?.toISOString() ?? null,
            permalink: d.permalink,
            postedAt: d.postedAt?.toISOString() ?? null,
        })),
        canEdit: row.status === "DRAFT" || row.status === "SCHEDULED",
        held:
            row.status === "PUBLISHING" &&
            !row.publishJobId &&
            row.deliveries.some((d) => d.status === "WAITING") &&
            !row.deliveries.some(
                (d) => d.status === "POSTING" || d.status === "UNKNOWN",
            ),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
    };
}

/** A channel's own words from the stored JSON. */
export function captionsOf(
    value: unknown,
): Partial<Record<ChannelKind, string>> {
    if (!value || typeof value !== "object") return {};
    const out: Partial<Record<ChannelKind, string>> = {};
    for (const kind of ["INSTAGRAM", "FACEBOOK", "THREADS"] as const) {
        const v = (value as Record<string, unknown>)[kind];
        if (typeof v === "string" && v.trim()) out[kind] = v;
    }
    return out;
}
