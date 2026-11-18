import type { Prisma } from "@saroh/database";

import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * Saroh Social telling the business, once (plan saroh-social
 * 2026-11-18-001, U7):
 *
 * - `channel`: a connected channel needs reconnecting: Meta refused or
 *   revoked its token, or a Threads grant ended. Queued only by the write
 *   that moved it to NEEDS_ATTENTION (`social/channels/channel-attention.ts`),
 *   keyed to the channel and that instant, so ten jobs meeting the same
 *   refusal tell it once. Still standing when told: the channel is there
 *   and still needs attention since that instant.
 * - `deleted`: Meta asked Saroh to delete what it held for a person
 *   (`social/meta/meta-callbacks.controller.ts`), and a channel of this
 *   business went with it: what waited for it won't go out (S-02). Still
 *   standing when told: that kind hasn't been connected again since.
 * - `post`: a post that didn't go out on one or more channels, keyed to
 *   the post and the run that found it. Still standing when told: a
 *   delivery of it is still FAILED.
 *
 * On the Saroh Social row (bell, and email on by default), from Saroh,
 * with fixed words: never the caption.
 */

export const SOCIAL_ATTENTION_NOTIFICATION_TYPE = "social.attention";
export const SOCIAL_FAILED_NOTIFICATION_TYPE = "social.failed";

type Tx = Prisma.TransactionClient;
type SocialAlert = Extract<TeamAlertPayload, { event: "social" }>;

const KIND_NAMES: Record<string, string> = {
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    THREADS: "Threads",
};

export async function wordSocial(
    tx: Tx,
    organizationId: string,
    p: SocialAlert,
): Promise<WordedAlert | null> {
    if (p.about === "channel") {
        const row = await tx.socialChannel.findFirst({
            where: { id: p.channelId, organizationId },
            select: { kind: true, status: true, attentionAt: true },
        });
        if (
            row?.status !== "NEEDS_ATTENTION" ||
            row.attentionAt?.toISOString() !== p.since
        ) {
            return null;
        }
        const name = KIND_NAMES[row.kind] ?? row.kind;
        const words = {
            heading: `Reconnect ${name}`,
            body: `${name} stopped Saroh's access, so posts to it won't go out until you reconnect it in Social.`,
        };
        return {
            event: "social",
            eventKey: `team:social-channel:${p.channelId}:${p.since}`,
            notificationId: null,
            ...noticeOf(SOCIAL_ATTENTION_NOTIFICATION_TYPE, {}),
            title: words.heading,
            body: words.body,
            mail: words,
            path: "/social?tab=channels",
            cta: "Open Social",
            skipUserId: null,
        };
    }
    if (p.about === "deleted") {
        const again = await tx.socialChannel.findFirst({
            where: {
                organizationId,
                kind: p.kind,
                connectedAt: { gt: new Date(p.at) },
            },
            select: { id: true },
        });
        if (again) return null;
        const name = KIND_NAMES[p.kind] ?? p.kind;
        const words = {
            heading: `${name} was disconnected`,
            body: `Meta asked Saroh to delete its connection to ${name}, so posts waiting for it won't go out there. Connect it again in Social to keep posting.`,
        };
        return {
            event: "social",
            eventKey: `team:social-deleted:${p.kind}:${p.at}`,
            notificationId: null,
            ...noticeOf(SOCIAL_ATTENTION_NOTIFICATION_TYPE, {}),
            title: words.heading,
            body: words.body,
            mail: words,
            path: "/social?tab=channels",
            cta: "Open Social",
            skipUserId: null,
        };
    }
    const failed = await tx.socialDelivery.findMany({
        where: { postId: p.postId, organizationId, status: "FAILED" },
        select: { kind: true },
    });
    if (failed.length === 0) return null;
    const names = failed.map((d) => KIND_NAMES[d.kind] ?? d.kind);
    const words = {
        heading:
            names.length === 1
                ? `A post didn't go out on ${names[0]}`
                : "A post didn't go out",
        body: `Saroh couldn't post it to ${list(names)}. Open it in Social to see why and try again.`,
    };
    return {
        event: "social",
        eventKey: `team:social-post:${p.postId}:${p.at}`,
        notificationId: null,
        ...noticeOf(SOCIAL_FAILED_NOTIFICATION_TYPE, {}),
        title: words.heading,
        body: words.body,
        mail: words,
        path: `/social?post=${encodeURIComponent(p.postId)}`,
        cta: "Open Social",
        skipUserId: null,
    };
}

function list(names: string[]): string {
    if (names.length < 2) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
