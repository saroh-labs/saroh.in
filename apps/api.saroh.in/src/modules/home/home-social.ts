import type { prisma } from "@saroh/database";

import type { HomeAction, HomeEvidence } from "./home-model";
import { EVIDENCE_LIMIT } from "./home-model";

type Db = Pick<typeof prisma, "socialChannel" | "socialPost">;

const NAMES: Record<string, string> = {
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    THREADS: "Threads",
};

/**
 * Saroh Social on Home › Needs you (U7, research S6): one row for each
 * channel that needs reconnecting, and one for each post that didn't go
 * out on a channel. A row clears when it is fixed: the channel
 * reconnected, the post tried again, or removed. Suggestions never come
 * here. The caller has checked `social:read`.
 */
export async function socialNeeds(
    db: Db,
    organizationId: string,
): Promise<HomeAction | null> {
    const [channels, posts] = await Promise.all([
        db.socialChannel.findMany({
            where: { organizationId, status: "NEEDS_ATTENTION" },
            orderBy: { kind: "asc" },
            select: { id: true, kind: true, attentionAt: true },
        }),
        db.socialPost.findMany({
            where: {
                organizationId,
                removedAt: null,
                status: { in: ["PARTLY_DONE", "FAILED"] },
                deliveries: { some: { status: "FAILED" } },
            },
            orderBy: { publishAt: "desc" },
            take: 50,
            select: {
                id: true,
                title: true,
                publishAt: true,
                deliveries: {
                    where: { status: "FAILED" },
                    select: { kind: true },
                },
            },
        }),
    ]);
    const count = channels.length + posts.length;
    if (count === 0) return null;
    const evidence: HomeEvidence[] = [
        ...channels.map((c) => ({
            id: c.id,
            title: NAMES[c.kind] ?? c.kind,
            subtitle: null,
            at: c.attentionAt?.toISOString() ?? null,
            amountMinor: null,
            currency: null,
            href: "/social?tab=channels",
            tag: "Needs attention",
            tone: "bad" as const,
            headline: `Reconnect ${NAMES[c.kind] ?? c.kind}`,
            detail: "Scheduled posts to it wait until you do.",
        })),
        ...posts.map((p) => {
            const where = p.deliveries.map((d) => NAMES[d.kind] ?? d.kind);
            return {
                id: p.id,
                title: p.title || "A post",
                subtitle: null,
                at: p.publishAt?.toISOString() ?? null,
                amountMinor: null,
                currency: null,
                href: `/social?post=${encodeURIComponent(p.id)}`,
                tag: "Didn't post",
                tone: "bad" as const,
                headline: `${p.title || "A post"} didn't post`,
                detail: `Not on ${where.join(" and ")}. Open it to see why.`,
            };
        }),
    ].slice(0, EVIDENCE_LIMIT);
    return {
        code: "SOCIAL_NEEDS_YOU",
        title:
            count === 1
                ? (evidence[0].headline ?? "Social needs you")
                : `${count} things in Social need you`,
        href: count === 1 ? evidence[0].href : "/social",
        severity: "ATTENTION",
        count,
        evidence,
        tone: "bad",
    };
}
