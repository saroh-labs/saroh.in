import { randomInt } from "node:crypto";

import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { forgetOrganizationLinkLabels } from "../../analytics/site-link-labels";
import { readLinkCounts } from "../../analytics/visit-sources";
import { businessTimezone } from "../../bookings/staff-availability";
import { MediaService } from "../../media/media.service";
import type { MediaStorages } from "../../media/object-storage.provider";
import { OBJECT_STORAGE } from "../../media/object-storage.provider";
import { authorize } from "../../organizations/organization-policy";
import { PublicShareService } from "../../share-posts/public-share.service";
import { siteOriginOf } from "../../sites/site-origin";
import {
    assertPostRoom,
    countRoom,
    postLimitReached,
    SocialAccess,
} from "../access/social-access";
import type { ChannelKind } from "../meta/social-meta.port";
import { dropWaitingJob, queuePublishInTx } from "../shared/jobs";
import { settledStatus } from "../shared/status";
import { captionProblem, trackedLink } from "./captions";
import type { PostAction, PostInputDto, PostListQueryDto } from "./dto";
import { drawAndStore, removePicture } from "./picture";
import type { PostRow, PostView } from "./post-view";
import { captionsOf, POST_SELECT, postView } from "./post-view";

/** How soon a scheduled post may go out, and how far ahead. */
export const MIN_AHEAD_MS = 2 * 60_000;
export const MAX_AHEAD_DAYS = 180;
const KIND_NAMES: Record<ChannelKind, string> = {
    INSTAGRAM: "Instagram",
    FACEBOOK: "Facebook",
    THREADS: "Threads",
};
/** What a post holds before it is saved, merged from the stored row and the change. */
type Draft = Omit<PostInputDto, "action" | "publishAt" | "captions"> & {
    captions: Partial<Record<ChannelKind, string>>;
    channels: ChannelKind[];
};

/**
 * Saroh Social's posts (U5): drafts, schedule, post now, move, cancel,
 * remove, try the failed channels again, and Request more. Every write asks
 * `social:post`, the rollout and the plan (`SocialAccess`); reads ask
 * `social:read`. A post counts once, in the month it goes out, from the
 * moment it is scheduled; the count is checked under the business's meter
 * lock on the write's own transaction.
 */
@Injectable()
export class SocialPostsService {
    private readonly logger = new Logger(SocialPostsService.name);

    constructor(
        private readonly access: SocialAccess,
        private readonly share: PublicShareService,
        private readonly media: MediaService,
        @Inject(OBJECT_STORAGE) private readonly storages: MediaStorages,
    ) {}

    async list(
        ctx: OrganizationContext,
        q: PostListQueryDto,
    ): Promise<PostView[]> {
        await this.access.assertOn(ctx, "social:read");
        const status: Prisma.SocialPostWhereInput =
            q.status === "scheduled"
                ? { status: { in: ["SCHEDULED", "PUBLISHING"] } }
                : q.status === "posted"
                  ? { status: { in: ["DONE", "PARTLY_DONE"] } }
                  : q.status === "failed"
                    ? {
                          status: { in: ["PARTLY_DONE", "FAILED"] },
                          deliveries: { some: { status: "FAILED" } },
                      }
                    : q.status === "draft"
                      ? { status: "DRAFT" }
                      : {};
        const rows = await prisma.socialPost.findMany({
            where: {
                organizationId: ctx.organizationId,
                removedAt: null,
                ...status,
                ...(q.from || q.to
                    ? {
                          publishAt: {
                              ...(q.from ? { gte: new Date(q.from) } : {}),
                              ...(q.to ? { lt: new Date(q.to) } : {}),
                          },
                      }
                    : {}),
            },
            orderBy: [{ publishAt: "asc" }, { updatedAt: "desc" }],
            take: 200,
            select: POST_SELECT,
        });
        return rows.map(postView);
    }

    async get(ctx: OrganizationContext, id: string): Promise<PostView> {
        await this.access.assertOn(ctx, "social:read");
        return postView(await this.row(ctx, id));
    }

    /** A new post: a draft, or scheduled, or out now. */
    async create(
        ctx: OrganizationContext,
        dto: PostInputDto,
        now: Date = new Date(),
    ): Promise<PostView> {
        const draft = merge(null, dto);
        if (!draft.sourceKind) {
            throw new BadRequestException("Say what the post is about.");
        }
        const ref = newRef();
        return this.save(
            ctx,
            null,
            draft,
            ref,
            dto.action ?? "draft",
            dto.publishAt,
            now,
        );
    }

    /**
     * Change a draft or a post not started: its words, picture, channels or
     * time (Move), or schedule it, post it now, or take it back to a draft.
     */
    async update(
        ctx: OrganizationContext,
        id: string,
        dto: PostInputDto,
        now: Date = new Date(),
    ): Promise<PostView> {
        // Asked before the post is read, so its status never answers first.
        authorize(ctx, "social:post");
        const before = await this.row(ctx, id);
        if (before.status !== "DRAFT" && before.status !== "SCHEDULED") {
            throw goneOut();
        }
        const action: PostAction =
            dto.action ??
            (before.status === "SCHEDULED" ? "schedule" : "draft");
        const publishAt =
            dto.publishAt ??
            (action === "schedule"
                ? before.publishAt?.toISOString()
                : undefined);
        return this.save(
            ctx,
            before,
            merge(before, dto),
            before.ref,
            action,
            publishAt,
            now,
        );
    }

    /**
     * Cancel a post not started, or one held with nothing sent (S-02): it
     * no longer counts. Only `social:post` is asked, as for disconnect: a
     * business whose plan or rollout ended can still clear its posts.
     */
    async cancel(ctx: OrganizationContext, id: string): Promise<PostView> {
        authorize(ctx, "social:post");
        await prisma.$transaction(async (tx) => {
            const post = await lockPost(tx, ctx, id);
            const held = await heldState(tx, post);
            if (post.status !== "SCHEDULED" && held !== "nothing-sent") {
                throw goneOut();
            }
            if (!(await dropWaitingJob(tx, post.publishJobId)))
                throw postingNow();
            await tx.socialPost.update({
                where: { id },
                data: { status: "CANCELLED", publishJobId: null },
            });
        });
        return postView(await this.row(ctx, id));
    }

    /**
     * Delete a draft, a cancelled post, one not started or one held with
     * nothing sent; "Remove from Saroh" on one that went out (or was held
     * after some channels posted: what waited won't go), which stays
     * counted in its month and is never deleted from the platform. Refused
     * while it is posting. Only `social:post` is asked (S-02).
     */
    async remove(ctx: OrganizationContext, id: string): Promise<void> {
        authorize(ctx, "social:post");
        const picture = await prisma.$transaction(async (tx) => {
            const post = await lockPost(tx, ctx, id);
            const held = await heldState(tx, post);
            if (post.status === "PUBLISHING" && !held) throw postingNow();
            if (!(await dropWaitingJob(tx, post.publishJobId)))
                throw postingNow();
            if (held === "some-sent") {
                await tx.socialDelivery.updateMany({
                    where: { postId: id, status: "WAITING" },
                    data: { status: "FAILED", reason: "removed" },
                });
                const ds = await tx.socialDelivery.findMany({
                    where: { postId: id },
                    select: { status: true },
                });
                await tx.socialPost.update({
                    where: { id },
                    data: { status: settledStatus(ds) },
                });
            }
            if (
                held === "some-sent" ||
                ["DONE", "PARTLY_DONE", "FAILED"].includes(post.status)
            ) {
                await tx.socialPost.update({
                    where: { id },
                    data: {
                        removedAt: new Date(),
                        imageKey: null,
                        imageUrl: null,
                    },
                });
            } else {
                await tx.socialPost.delete({ where: { id } });
            }
            return post;
        });
        await removePicture(this.storages, picture);
    }

    /**
     * Try a post's failed channels again (S6), now or at `publishAt`: only
     * those channels, and it doesn't count again.
     */
    async retry(
        ctx: OrganizationContext,
        id: string,
        publishAt: string | undefined,
        now: Date = new Date(),
    ): Promise<PostView> {
        await this.access.assertOn(ctx, "social:post", now);
        const at = publishAt ? when(publishAt, now) : now;
        await prisma.$transaction(async (tx) => {
            const post = await lockPost(tx, ctx, id);
            if (post.status !== "PARTLY_DONE" && post.status !== "FAILED") {
                throw new ConflictException(
                    "Only a post that didn't go out can be tried again.",
                );
            }
            const failed = await tx.socialDelivery.findMany({
                where: { postId: id, status: "FAILED" },
                select: { kind: true },
            });
            await assertConnected(
                tx,
                ctx.organizationId,
                failed.map((d) => d.kind),
            );
            await tx.socialDelivery.updateMany({
                where: { postId: id, status: "FAILED" },
                data: {
                    status: "WAITING",
                    reason: null,
                    retryAfter: null,
                    containerId: null,
                    checks: 0,
                    attempts: 0,
                },
            });
            await tx.socialPost.update({
                where: { id },
                data: { status: "PUBLISHING" },
            });
            await queuePublishInTx(tx, post, at);
        });
        return postView(await this.row(ctx, id));
    }

    /**
     * Request more posts this month (S7): reaches Saroh's team once a
     * business a month (a note on the business in the admin console, and a
     * log line); asking again changes nothing.
     */
    async requestMore(
        ctx: OrganizationContext,
        now: Date = new Date(),
    ): Promise<{ requested: true }> {
        const row = await this.access.assertOn(ctx, "social:post", now);
        const room = await countRoom(prisma, ctx.organizationId, row, now);
        await prisma.$transaction(async (tx) => {
            const made = await tx.socialRequest.createMany({
                data: [
                    {
                        organizationId: ctx.organizationId,
                        userId: ctx.userId,
                        windowKey: room.windowKey,
                    },
                ],
                skipDuplicates: true,
            });
            if (made.count === 0) return;
            await tx.adminOrganizationNote.create({
                data: {
                    organizationId: ctx.organizationId,
                    authorUserId: "saroh-social",
                    body: `Saroh Social (automatic): asked for more posts this month (${room.used} of ${room.limit ?? "no limit"} used, window ${room.windowKey}).`,
                },
            });
            this.logger.warn(
                `social_request_more org=${ctx.organizationId} window=${room.windowKey} used=${room.used}`,
            );
        });
        return { requested: true };
    }

    /**
     * What a post brought (S5): visits from its link since it went out, and
     * how many of those visits paid (an order or a booking). Counts only;
     * no amounts are kept per link.
     */
    async results(
        ctx: OrganizationContext,
        id: string,
        now: Date = new Date(),
    ): Promise<{
        visits: number;
        paid: number;
        from: string | null;
        to: string;
    }> {
        await this.access.assertOn(ctx, "social:read");
        const post = await this.row(ctx, id);
        const to = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
        if (
            !post.publishAt ||
            post.status === "DRAFT" ||
            post.status === "CANCELLED"
        ) {
            return { visits: 0, paid: 0, from: null, to: to.toISOString() };
        }
        const from = new Date(
            `${post.publishAt.toISOString().slice(0, 10)}T00:00:00Z`,
        );
        const counts = await readLinkCounts(prisma, ctx.organizationId, {
            from,
            to,
        });
        let visits = 0;
        let paid = 0;
        for (const [key, c] of counts) {
            if (!key.endsWith(`:${post.ref}`)) continue;
            visits += c.visits;
            paid += c.paid;
        }
        return { visits, paid, from: from.toISOString(), to: to.toISOString() };
    }

    /** Save a post as a draft, or scheduled, or to go out now. */
    private async save(
        ctx: OrganizationContext,
        before: PostRow | null,
        draft: Draft,
        ref: string,
        action: PostAction,
        publishAt: string | undefined,
        now: Date,
    ): Promise<PostView> {
        const row = await this.access.assertOn(ctx, "social:post", now);
        const org = ctx.organizationId;
        if (action === "draft") {
            const id = await prisma.$transaction(async (tx) => {
                if (before) {
                    const post = await lockPost(tx, ctx, before.id);
                    // It went out (or started) since it was read (S-10).
                    if (post.status !== before.status) throw goneOut();
                    if (!(await dropWaitingJob(tx, post.publishJobId)))
                        throw postingNow();
                }
                return this.write(tx, ctx, before, draft, ref, {
                    status: "DRAFT",
                    publishAt: null,
                    publishJobId: null,
                });
            });
            return postView(await this.row(ctx, id));
        }

        const at = action === "now" ? now : when(publishAt, now);
        if (draft.channels.length === 0) {
            throw new BadRequestException("Pick at least one channel.");
        }
        await assertConnected(prisma, org, draft.channels);
        const origin = await siteOriginOf(org);
        if (!origin) {
            throw new ConflictException({
                message:
                    "Your website isn't live yet. Put it live first: posts link to it.",
                details: { code: "SOCIAL_NOT_PUBLIC" },
            });
        }
        const link = trackedLink(origin, draft.linkPath ?? "/", ref);
        for (const kind of draft.channels) {
            const own = draft.captions[kind];
            const problem = own ? captionProblem(kind, own, link) : null;
            if (problem) {
                throw new BadRequestException({
                    message: `${KIND_NAMES[kind]} takes ${problem.limit} ${problem.unit} with the link. This is ${problem.used}.`,
                    details: {
                        code: "SOCIAL_CAPTION_TOO_LONG",
                        kind,
                        ...problem,
                    },
                });
            }
        }

        // A cheap count before the picture is drawn and stored (S-04); the
        // locked check below still decides.
        if (before?.status !== "SCHEDULED") {
            const room = await countRoom(prisma, org, row, at);
            if (room.limit !== null && room.used >= room.limit) {
                throw postLimitReached(room);
            }
        }
        const redraw =
            !before?.imageKey ||
            PICTURE_FIELDS.some((f) => before[f] !== draft[f]) ||
            before.sourceRef !== (draft.sourceRef ?? null);
        const picture = redraw
            ? await drawAndStore(
                  {
                      share: this.share,
                      media: this.media,
                      storage: (await this.storages.forOrganization(org))
                          .storage,
                  },
                  {
                      organizationId: org,
                      sourceKind: draft.sourceKind ?? "own",
                      sourceRef: draft.sourceRef ?? null,
                      picture: draft.picture ?? "card",
                      cardStyle: draft.cardStyle ?? "photo",
                      size: draft.size ?? "post",
                      headline: draft.headline ?? null,
                      mediaId: draft.mediaId ?? null,
                  },
              )
            : null;
        const zone = await businessTimezone(prisma, org);
        let id: string;
        try {
            id = await prisma.$transaction(async (tx) => {
                const counted = before?.status === "SCHEDULED";
                if (before) {
                    const post = await lockPost(tx, ctx, before.id);
                    if (post.status !== before.status) throw goneOut();
                    if (!(await dropWaitingJob(tx, post.publishJobId)))
                        throw postingNow();
                }
                const sameMonth =
                    counted &&
                    before.publishAt &&
                    (await countRoom(tx, org, row, before.publishAt))
                        .windowKey ===
                        (await countRoom(tx, org, row, at)).windowKey;
                if (!sameMonth) await assertPostRoom(tx, org, row, at);
                const postId = await this.write(tx, ctx, before, draft, ref, {
                    status: "SCHEDULED",
                    publishAt: at,
                    zone,
                    ...(picture ?? {}),
                });
                await queuePublishInTx(
                    tx,
                    { id: postId, organizationId: org, publishJobId: null },
                    at,
                );
                return postId;
            });
        } catch (error) {
            await removePicture(this.storages, picture);
            throw error;
        }
        if (picture) await removePicture(this.storages, before);
        forgetOrganizationLinkLabels(org);
        return postView(await this.row(ctx, id));
    }

    /** Write the post's fields and keep one waiting delivery per chosen channel. */
    private async write(
        tx: Prisma.TransactionClient,
        ctx: OrganizationContext,
        before: PostRow | null,
        draft: Draft,
        ref: string,
        state: Prisma.SocialPostUncheckedUpdateInput,
    ): Promise<string> {
        const fields = {
            sourceKind: draft.sourceKind ?? "own",
            sourceRef: draft.sourceRef ?? null,
            title: draft.title ?? "",
            picture: draft.picture ?? "card",
            cardStyle: draft.cardStyle ?? "photo",
            size: draft.size ?? "post",
            headline: draft.headline ?? null,
            mediaId: draft.mediaId ?? null,
            caption: draft.caption ?? "",
            captions: draft.captions,
            linkPath: draft.linkPath ?? "/",
        };
        const id = before
            ? (
                  await tx.socialPost.update({
                      where: { id: before.id },
                      data: { ...fields, ...state },
                      select: { id: true },
                  })
              ).id
            : (
                  await tx.socialPost.create({
                      data: {
                          ...fields,
                          ...(state as Prisma.SocialPostUncheckedCreateInput),
                          organizationId: ctx.organizationId,
                          createdByUserId: ctx.userId,
                          ref,
                      },
                      select: { id: true },
                  })
              ).id;
        await tx.socialDelivery.deleteMany({
            where: { postId: id, kind: { notIn: draft.channels } },
        });
        const channels = await tx.socialChannel.findMany({
            where: {
                organizationId: ctx.organizationId,
                kind: { in: draft.channels },
            },
            select: { id: true, kind: true },
        });
        await tx.socialDelivery.createMany({
            data: draft.channels.map((kind) => ({
                organizationId: ctx.organizationId,
                postId: id,
                kind,
                channelId: channels.find((c) => c.kind === kind)?.id ?? null,
            })),
            skipDuplicates: true,
        });
        if (state.status === "SCHEDULED") {
            // Not started yet: each channel starts afresh on its current
            // connection, so a delivery failed by an old disconnect isn't
            // skipped at its time (S-14).
            for (const c of channels) {
                await tx.socialDelivery.updateMany({
                    where: { postId: id, kind: c.kind },
                    data: {
                        channelId: c.id,
                        status: "WAITING",
                        reason: null,
                        retryAfter: null,
                        containerId: null,
                        checks: 0,
                        attempts: 0,
                    },
                });
            }
        }
        return id;
    }

    private async row(ctx: OrganizationContext, id: string): Promise<PostRow> {
        const row = await prisma.socialPost.findFirst({
            where: { id, organizationId: ctx.organizationId, removedAt: null },
            select: POST_SELECT,
        });
        if (!row) throw new NotFoundException("No such post.");
        return row;
    }
}

/** The fields a picture is drawn from: a change redraws it. */
const PICTURE_FIELDS = [
    "picture",
    "cardStyle",
    "size",
    "headline",
    "mediaId",
    "sourceKind",
] as const;

/** The stored post with the change laid over it. */
function merge(before: PostRow | null, dto: PostInputDto): Draft {
    const pick = <K extends keyof PostInputDto>(k: K, fallback: unknown) =>
        // A null the change sent clears the field: only "left out" keeps it.
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        dto[k] !== undefined ? dto[k] : fallback;
    return {
        sourceKind: pick(
            "sourceKind",
            before?.sourceKind,
        ) as Draft["sourceKind"],
        sourceRef: pick("sourceRef", before?.sourceRef ?? null) as
            string | null,
        title: pick("title", before?.title ?? "") as string,
        picture: pick("picture", before?.picture ?? "card") as "card" | "photo",
        cardStyle: pick("cardStyle", before?.cardStyle ?? "photo") as string,
        size: pick("size", before?.size ?? "post") as "post" | "square",
        headline: pick("headline", before?.headline ?? null) as string | null,
        mediaId: pick("mediaId", before?.mediaId ?? null) as string | null,
        caption: pick("caption", before?.caption ?? "") as string,
        linkPath: pick("linkPath", before?.linkPath ?? "/") as string,
        captions:
            dto.captions !== undefined
                ? captionsOf(dto.captions)
                : captionsOf(before?.captions),
        channels: dto.channels ?? before?.deliveries.map((d) => d.kind) ?? [],
    };
}

/** `social-` and ten letters: a label the site's visits keep (no digits, no id). */
function newRef(): string {
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let out = "social-";
    for (let i = 0; i < 10; i++) out += letters[randomInt(letters.length)];
    return out;
}

/** A schedule's time, at least 2 minutes and at most 180 days ahead. */
function when(value: string | undefined, now: Date): Date {
    const at = value ? new Date(value) : null;
    if (!at || Number.isNaN(at.getTime())) {
        throw new BadRequestException("Pick when it goes out.");
    }
    if (at.getTime() < now.getTime() + MIN_AHEAD_MS) {
        throw new BadRequestException(
            "Pick a time at least 2 minutes from now, or post it now.",
        );
    }
    if (at.getTime() > now.getTime() + MAX_AHEAD_DAYS * 86_400_000) {
        throw new BadRequestException(
            `Pick a time within ${MAX_AHEAD_DAYS} days.`,
        );
    }
    return at;
}

/** Refuse unless every channel named is connected and working. */
async function assertConnected(
    db: Pick<Prisma.TransactionClient, "socialChannel">,
    organizationId: string,
    kinds: readonly ChannelKind[],
): Promise<void> {
    const rows = await db.socialChannel.findMany({
        where: { organizationId, kind: { in: [...kinds] } },
        select: { kind: true, status: true },
    });
    for (const kind of kinds) {
        const row = rows.find((r) => r.kind === kind);
        if (row?.status === "CONNECTED") continue;
        throw new ConflictException({
            message: row
                ? `${KIND_NAMES[kind]} needs reconnecting first.`
                : `Connect ${KIND_NAMES[kind]} first.`,
            details: {
                code: row
                    ? "SOCIAL_CHANNEL_ATTENTION"
                    : "SOCIAL_CHANNEL_NOT_CONNECTED",
                kind,
            },
        });
    }
}

/** The post's row, locked for this transaction; another business's is a 404. */
async function lockPost(
    tx: Prisma.TransactionClient,
    ctx: OrganizationContext,
    id: string,
) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "SocialPost"
        WHERE id = ${id} AND "organizationId" = ${ctx.organizationId}
          AND "removedAt" IS NULL
        FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException("No such post.");
    return tx.socialPost.findUniqueOrThrow({
        where: { id },
        select: {
            id: true,
            organizationId: true,
            status: true,
            publishJobId: true,
            imageKey: true,
            imageUrl: true,
        },
    });
}

/**
 * Whether a PUBLISHING post is held (S-02): no job will run it (the plan
 * or rollout was off at its time, or a channel needs reconnecting) and
 * something still waits. `nothing-sent` when every channel still waits.
 */
async function heldState(
    tx: Prisma.TransactionClient,
    post: { id: string; status: string; publishJobId: string | null },
): Promise<"nothing-sent" | "some-sent" | null> {
    if (post.status !== "PUBLISHING" || post.publishJobId) return null;
    const ds = await tx.socialDelivery.findMany({
        where: { postId: post.id },
        select: { status: true },
    });
    if (!ds.some((d) => d.status === "WAITING")) return null;
    if (ds.some((d) => d.status === "POSTING" || d.status === "UNKNOWN")) {
        return null;
    }
    return ds.every((d) => d.status === "WAITING")
        ? "nothing-sent"
        : "some-sent";
}

function goneOut(): ConflictException {
    return new ConflictException({
        message: "This post has gone out. It can't be changed now.",
        details: { code: "SOCIAL_POST_GONE_OUT" },
    });
}

function postingNow(): ConflictException {
    return new ConflictException({
        message: "It's posting now. Try again in a minute.",
        details: { code: "SOCIAL_POST_POSTING" },
    });
}
