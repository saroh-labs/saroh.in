import {
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import { appBase } from "../../../common/app-url";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { authorize } from "../../organizations/organization-policy";
import { apiBase } from "../../payments/webhook-setup";
import { SocialAccess } from "../access/social-access";
import { MetaNotSetUpError } from "../meta/meta-clients";
import type {
    ChannelKind,
    ConnectedAccount,
    SocialMetaPort,
} from "../meta/social-meta.port";
import { isMetaError, SOCIAL_META } from "../meta/social-meta.port";
import {
    dropWaitingJob,
    queuePublishInTx,
    queueRefreshInTx,
} from "../shared/jobs";
import { settlePostsInTx } from "../shared/status";
import type { StateRefusal } from "./connect-state";
import { signState, verifyState } from "./connect-state";
import type { ChannelView, PageChoiceView } from "./dto";
import { CHANNEL_ORDER, channelView, kindPath } from "./dto";
import { seal, tokenColumns, unseal } from "./sealing";

/** How long a Threads grant lasts from a connect, or a refresh that extends it. */
export const THREADS_GRANT_MS = 90 * 86_400_000;
/** How long a Facebook Page choice waits for the person to pick. */
export const CHOICE_TTL_MS = 10 * 60_000;

/** Where Meta sends the person back to, on the API. */
export const callbackPath = (kind: ChannelKind) =>
    `/integrations/${kindPath(kind)}/callback`;

/** The kinds whose sign-in can offer several Pages (or Instagram accounts): a choice to pick from. */
export const PICKER_KINDS: readonly ChannelKind[] = ["INSTAGRAM", "FACEBOOK"];
const pickerName = (kind: ChannelKind) =>
    kind === "INSTAGRAM" ? "Instagram" : "Facebook";

/**
 * How a callback ended, in the app's address (`result`):
 * - `connected`; `choose` (pick a Page or an Instagram account, `choice`
 *   names it);
 * - `denied` (they said no at Meta); `invalid` or `expired` (the state);
 * - `someone-else` (signed in as another person than who started);
 * - `no-instagram` (a Facebook sign-in none of whose Pages has an
 *   Instagram professional account linked);
 * - `no-pages` (a Facebook sign-in that manages no Page);
 * - `refused` (no permission, not rolled out, or the plan leaves it off);
 * - `unavailable` (Meta's keys aren't set here); `failed` (anything else).
 */
export type CallbackOutcome =
    | "connected"
    | "choose"
    | "denied"
    | StateRefusal
    | "someone-else"
    | "no-instagram"
    | "no-pages"
    | "refused"
    | "unavailable"
    | "failed";

/**
 * Social › Channels (U4, KTD3): one Instagram professional account, one
 * Facebook Page and one Threads profile a business. The API owns the
 * consent: a signed 10-minute state, a public callback per kind that
 * always ends in the app's address, a Page picker when the person manages
 * several. Connecting and disconnecting need `social:post`, the rollout
 * and the plan; reading needs `social:read`.
 */
@Injectable()
export class SocialChannelsService {
    private readonly logger = new Logger(SocialChannelsService.name);

    constructor(
        @Optional()
        @Inject(SOCIAL_META)
        private readonly meta: SocialMetaPort | null,
        private readonly access: SocialAccess,
    ) {}

    async list(ctx: OrganizationContext): Promise<ChannelView[]> {
        await this.access.assertOn(ctx, "social:read");
        const [rows, waiting] = await Promise.all([
            prisma.socialChannel.findMany({
                where: { organizationId: ctx.organizationId },
            }),
            prisma.socialDelivery.groupBy({
                by: ["kind"],
                where: {
                    organizationId: ctx.organizationId,
                    status: "WAITING",
                    post: { status: { in: ["SCHEDULED", "PUBLISHING"] } },
                },
                _count: { _all: true },
            }),
        ]);
        const held = await prisma.socialDelivery.groupBy({
            by: ["kind"],
            where: {
                organizationId: ctx.organizationId,
                status: "WAITING",
                post: { status: "PUBLISHING" },
            },
            _count: { _all: true },
        });
        return CHANNEL_ORDER.map((kind) =>
            channelView(kind, rows.find((r) => r.kind === kind) ?? null, {
                waiting: waiting.find((w) => w.kind === kind)?._count._all ?? 0,
                held: held.find((h) => h.kind === kind)?._count._all ?? 0,
                canConnect: this.meta?.available(kind) ?? false,
            }),
        );
    }

    /** Meta's consent page to send the person to. */
    async start(
        ctx: OrganizationContext,
        kind: ChannelKind,
    ): Promise<{ url: string }> {
        await this.access.assertOn(ctx, "social:post");
        const meta = this.metaFor(kind);
        const state = signState({
            organizationId: ctx.organizationId,
            userId: ctx.userId,
            kind,
        });
        return {
            url: meta.authorizeUrl(kind, {
                redirectUri: this.redirectUri(ctx.edition ?? null, kind),
                state,
            }),
        };
    }

    /**
     * Meta's answer. Always ends in the app's address, never a JSON error:
     * the person's browser is here. `resolve` builds the signed-in
     * person's context in the state's business.
     */
    async callback(
        kind: ChannelKind,
        query: { code?: string; state?: string; error?: string },
        signedInUserId: string,
        resolve: (orgId: string) => Promise<OrganizationContext>,
    ): Promise<string> {
        const state = verifyState(query.state, kind);
        if (typeof state === "string") return this.back(null, kind, state);
        const edition = await editionOf(state.organizationId);
        if (state.userId !== signedInUserId) {
            return this.back(edition, kind, "someone-else");
        }
        if (query.error || !query.code) {
            return this.back(edition, kind, "denied");
        }
        try {
            const ctx = await resolve(state.organizationId);
            const out = await runInOrgContext(ctx.organizationId, () =>
                this.connect(ctx, kind, query.code ?? ""),
            );
            return this.back(edition, kind, out.outcome, out.choiceId);
        } catch (error) {
            this.logger.warn(
                `social_connect_failed org=${state.organizationId} kind=${kind} reason=${reasonOf(error)}`,
            );
            return this.back(edition, kind, outcomeOf(error));
        }
    }

    /** Keep Meta's grant: the account and its sealed token, or the Page choice. */
    async connect(
        ctx: OrganizationContext,
        kind: ChannelKind,
        code: string,
        now: Date = new Date(),
    ): Promise<{ outcome: CallbackOutcome; choiceId?: string }> {
        await this.access.assertOn(ctx, "social:post", now);
        const meta = this.metaFor(kind);
        const redirectUri = this.redirectUri(ctx.edition ?? null, kind);
        if (kind === "THREADS") {
            const account = await meta.connect(kind, code, redirectUri);
            await this.keep(ctx, kind, account, now);
            return { outcome: "connected" };
        }
        // Facebook Login: the Pages, or the Instagram accounts linked to them.
        const { platformUserId, pages } = await meta.pageAccounts(
            kind,
            code,
            redirectUri,
        );
        if (kind === "INSTAGRAM" && pages.length === 0) {
            return { outcome: "no-instagram" };
        }
        if (pages.length === 0) return { outcome: "no-pages" };
        if (pages.length === 1) {
            await this.keep(ctx, kind, pages[0], now);
            return { outcome: "connected" };
        }
        const choiceId = crypto.randomUUID();
        const sealed = seal(JSON.stringify(pages), {
            organizationId: ctx.organizationId,
            rowId: choiceId,
        });
        await prisma.socialConnectChoice.create({
            data: {
                id: choiceId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                kind,
                platformUserId,
                choicesCiphertext: sealed.ciphertext,
                choicesIv: sealed.iv,
                choicesAuthTag: sealed.authTag,
                expiresAt: new Date(now.getTime() + CHOICE_TTL_MS),
            },
        });
        return { outcome: "choose", choiceId };
    }

    /** The Pages (or linked Instagram accounts) a sign-in offers, to pick one: names only. */
    async choices(
        ctx: OrganizationContext,
        kind: ChannelKind,
        choiceId: string,
    ): Promise<PageChoiceView[]> {
        await this.access.assertOn(ctx, "social:post");
        return (await this.openChoice(ctx, kind, choiceId)).map((p) => ({
            id: p.accountId,
            name: p.handle,
            avatarUrl: p.avatarUrl,
        }));
    }

    /** Connect the Page picked; the choice is gone after. */
    async choose(
        ctx: OrganizationContext,
        kind: ChannelKind,
        choiceId: string,
        pageId: string,
    ): Promise<ChannelView[]> {
        await this.access.assertOn(ctx, "social:post");
        const page = (await this.openChoice(ctx, kind, choiceId)).find(
            (p) => p.accountId === pageId,
        );
        if (!page) {
            throw new NotFoundException(
                `That ${kind === "INSTAGRAM" ? "account" : "Page"} isn't one you manage. Connect ${pickerName(kind)} again.`,
            );
        }
        await this.keep(ctx, kind, page, new Date());
        await prisma.socialConnectChoice.deleteMany({
            where: { id: choiceId, organizationId: ctx.organizationId },
        });
        return this.list(ctx);
    }

    /**
     * Stop posting to a channel (U4): its token and row go; deliveries
     * still waiting for it fail as "disconnected", and its posts are
     * otherwise kept. Never refused for a plan or a closing business: only
     * `social:post` is asked.
     */
    async disconnect(
        ctx: OrganizationContext,
        kind: ChannelKind,
    ): Promise<void> {
        authorize(ctx, "social:post");
        await prisma.$transaction(async (tx) => {
            const row = await tx.socialChannel.findUnique({
                where: {
                    organizationId_kind: {
                        organizationId: ctx.organizationId,
                        kind,
                    },
                },
                select: { id: true, refreshJobId: true },
            });
            if (!row) return;
            await failWaitingInTx(tx, row.id, "disconnected");
            await dropWaitingJob(tx, row.refreshJobId);
            await tx.socialChannel.delete({ where: { id: row.id } });
        });
    }

    /**
     * After a reconnect, and when the person says yes: post again what
     * waited for this channel (posts past their time, held for it). Each
     * post's run is queued now; what already went out elsewhere stays.
     */
    async retryHeld(
        ctx: OrganizationContext,
        kind: ChannelKind,
        now: Date = new Date(),
    ): Promise<{ queued: number }> {
        await this.access.assertOn(ctx, "social:post", now);
        return prisma.$transaction(async (tx) => {
            const channel = await tx.socialChannel.findUnique({
                where: {
                    organizationId_kind: {
                        organizationId: ctx.organizationId,
                        kind,
                    },
                },
                select: { id: true, status: true },
            });
            if (channel?.status !== "CONNECTED") {
                throw new ForbiddenException({
                    message: "Reconnect it first.",
                    details: { code: "SOCIAL_CHANNEL_ATTENTION" },
                });
            }
            const posts = await tx.socialPost.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    status: "PUBLISHING",
                    deliveries: { some: { kind, status: "WAITING" } },
                },
                select: { id: true, organizationId: true, publishJobId: true },
            });
            for (const post of posts) {
                await tx.socialDelivery.updateMany({
                    where: { postId: post.id, kind, status: "WAITING" },
                    data: { channelId: channel.id, reason: null },
                });
                await queuePublishInTx(tx, post, now);
            }
            return { queued: posts.length };
        });
    }

    /**
     * The account and its token, on the business's one row of its kind.
     * The same account again keeps the row (a reconnect clears its
     * attention); another account replaces it, and what was waiting for
     * the old one fails as "reconnected".
     */
    private async keep(
        ctx: OrganizationContext,
        kind: ChannelKind,
        account: ConnectedAccount,
        now: Date,
    ): Promise<void> {
        const organizationId = ctx.organizationId;
        await prisma.$transaction(async (tx) => {
            const before = await tx.socialChannel.findUnique({
                where: { organizationId_kind: { organizationId, kind } },
                select: { id: true, accountId: true },
            });
            const data = {
                accountId: account.accountId,
                platformUserId: account.platformUserId,
                handle: account.handle,
                avatarUrl: account.avatarUrl,
                pageId: account.pageId ?? null,
                status: "CONNECTED" as const,
                attentionReason: null,
                attentionAt: null,
                tokenIssuedAt: now,
                tokenExpiresAt: account.tokenExpiresAt,
                grantExpiresAt:
                    kind === "THREADS"
                        ? new Date(now.getTime() + THREADS_GRANT_MS)
                        : null,
                connectedByUserId: ctx.userId,
                connectedAt: now,
            };
            const row = before
                ? await tx.socialChannel.update({
                      where: { id: before.id },
                      data,
                  })
                : await tx.socialChannel.create({
                      data: { ...data, organizationId, kind },
                  });
            await tx.socialChannel.update({
                where: { id: row.id },
                data: tokenColumns(
                    seal(account.token, { organizationId, rowId: row.id }),
                ),
                select: { id: true },
            });
            if (before && before.accountId !== account.accountId) {
                await failWaitingInTx(tx, row.id, "reconnected");
            }
            // Facebook and Instagram post with a Page token, which doesn't expire.
            if (kind !== "FACEBOOK" && kind !== "INSTAGRAM") {
                await queueRefreshInTx(tx, row, now);
            }
        });
    }

    private async openChoice(
        ctx: OrganizationContext,
        kind: ChannelKind,
        choiceId: string,
    ): Promise<ConnectedAccount[]> {
        const row = await prisma.socialConnectChoice.findFirst({
            where: {
                id: choiceId,
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                kind,
                expiresAt: { gt: new Date() },
            },
        });
        if (!row) {
            throw new NotFoundException(
                `That choice has run out. Connect ${pickerName(kind)} again.`,
            );
        }
        return JSON.parse(
            unseal(
                {
                    ciphertext: row.choicesCiphertext,
                    iv: row.choicesIv,
                    authTag: row.choicesAuthTag,
                },
                { organizationId: ctx.organizationId, rowId: row.id },
            ),
        ) as ConnectedAccount[];
    }

    private metaFor(kind: ChannelKind): SocialMetaPort {
        if (!this.meta?.available(kind)) {
            throw new ServiceUnavailableException(
                "This channel can't be connected yet: Meta isn't set up on this server.",
            );
        }
        return this.meta;
    }

    private redirectUri(edition: Edition | null, kind: ChannelKind): string {
        const base = apiBase(edition);
        if (!base) {
            throw new ServiceUnavailableException(
                "Channels can't be connected yet: API_PUBLIC_URL is not set on this server.",
            );
        }
        return `${base}${callbackPath(kind)}`;
    }

    private back(
        edition: Edition | null,
        kind: ChannelKind,
        outcome: CallbackOutcome,
        choiceId?: string,
    ): string {
        const q = new URLSearchParams({
            tab: "channels",
            channel: kindPath(kind),
            result: outcome,
            ...(choiceId ? { choice: choiceId } : {}),
        });
        return `${appBase(edition ?? undefined)}/social?${q.toString()}`;
    }
}

/**
 * A channel's deliveries that were still to go fail, with `reason`, and
 * their started posts are settled.
 */
async function failWaitingInTx(
    tx: Prisma.TransactionClient,
    channelId: string,
    reason: "disconnected" | "reconnected",
): Promise<void> {
    // A draft's channels are only a choice: it keeps them.
    const where = {
        channelId,
        status: { in: ["WAITING" as const, "UNKNOWN" as const] },
        post: { status: { not: "DRAFT" as const } },
    };
    const waiting = await tx.socialDelivery.findMany({
        where,
        select: { postId: true },
    });
    await tx.socialDelivery.updateMany({
        where,
        data: { status: "FAILED", reason },
    });
    await settlePostsInTx(
        tx,
        waiting.map((d) => d.postId),
    );
}

async function editionOf(organizationId: string): Promise<Edition | null> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { edition: true },
    });
    return org?.edition ?? null;
}

function outcomeOf(error: unknown): CallbackOutcome {
    if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
    ) {
        return "refused";
    }
    if (
        error instanceof ServiceUnavailableException ||
        error instanceof MetaNotSetUpError
    ) {
        return "unavailable";
    }
    return "failed";
}

/** A failure in words for a log line: a kind and Meta's codes, never a token. */
function reasonOf(error: unknown): string {
    if (isMetaError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}
