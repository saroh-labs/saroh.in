import { randomBytes } from "node:crypto";

import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    Injectable,
    Logger,
    NotFoundException,
    Param,
    Post,
} from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import { appBase } from "../../../common/app-url";
import { enqueueTeamAlert } from "../../notifications/team-alerts";
import { markAttentionInTx } from "../channels/channel-attention";
import { failWaitingInTx } from "../channels/channels.service";
import { kindParam } from "../channels/dto";
import { callbackSecrets, parseSignedRequest } from "./signed-request";
import type { ChannelKind } from "./social-meta.port";

/** What the deletion status page shows. */
export interface DeletionView {
    code: string;
    kind: ChannelKind;
    /** Connections deleted, with their tokens. */
    channels: number;
    deletedAt: string;
}

/**
 * Meta's required callbacks (U8, KTD11), per login: deauthorize (someone
 * took Saroh's access away at Meta) marks their channels as needing
 * attention; data deletion deletes their channels and tokens and answers
 * with the status page's address and a code. Both carry Meta's
 * `signed_request`, checked against that login's secret; a bad signature
 * is a 400, an old one is refused too.
 *
 * Facebook and Instagram sign in through the same Facebook Login, so the
 * person Meta names is the same Facebook user for both: a callback for
 * either reaches both kinds' channels.
 *
 * CROSS-TENANT: Meta names a person, not a business, so their channels in
 * any business are found; nothing is returned about them.
 */
@Injectable()
export class MetaCallbacksService {
    private readonly logger = new Logger(MetaCallbacksService.name);

    async deauthorize(
        kind: ChannelKind,
        signed: unknown,
        now: Date = new Date(),
    ): Promise<{ marked: number }> {
        const req = this.verify(kind, signed, now);
        return outsideOrgContext(async () => {
            const rows = await prisma.socialChannel.findMany({
                where: {
                    kind: { in: loginKinds(kind) },
                    platformUserId: req.userId,
                },
                select: { id: true },
            });
            let marked = 0;
            for (const row of rows) {
                if (
                    await prisma.$transaction((tx) =>
                        markAttentionInTx(tx, row.id, "revoked", now),
                    )
                ) {
                    marked++;
                }
            }
            this.logger.log(`meta_deauthorize kind=${kind} channels=${marked}`);
            return { marked };
        });
    }

    async dataDeletion(
        kind: ChannelKind,
        signed: unknown,
        now: Date = new Date(),
    ): Promise<{ url: string; confirmation_code: string }> {
        const req = this.verify(kind, signed, now);
        const code = randomBytes(9).toString("base64url");
        await outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                const where = {
                    kind: { in: loginKinds(kind) },
                    platformUserId: req.userId,
                };
                // What waited for them fails now, and each business is told
                // once, rather than posts failing one by one at their time (S-02).
                const rows = await tx.socialChannel.findMany({
                    where,
                    select: { id: true, organizationId: true, kind: true },
                });
                for (const row of rows) {
                    await failWaitingInTx(tx, row.id, "deleted");
                    await enqueueTeamAlert(tx, row.organizationId, {
                        event: "social",
                        about: "deleted",
                        kind: row.kind,
                        at: now.toISOString(),
                    });
                }
                const { count } = await tx.socialChannel.deleteMany({ where });
                await tx.socialConnectChoice.deleteMany({ where });
                await tx.socialDeletion.create({
                    data: { code, kind, channels: count, createdAt: now },
                });
            }),
        );
        this.logger.log(`meta_data_deletion kind=${kind} code=${code}`);
        return {
            url: `${appBase()}/social/deletion/${code}`,
            confirmation_code: code,
        };
    }

    async status(code: string): Promise<DeletionView> {
        const row = await outsideOrgContext(() =>
            prisma.socialDeletion.findUnique({ where: { code } }),
        );
        if (!row) throw new NotFoundException("No such deletion request.");
        return {
            code: row.code,
            kind: row.kind,
            channels: row.channels,
            deletedAt: row.createdAt.toISOString(),
        };
    }

    private verify(kind: ChannelKind, signed: unknown, now: Date) {
        const req = parseSignedRequest(signed, callbackSecrets(kind), now);
        if (typeof req === "string") {
            throw new BadRequestException(
                req === "expired"
                    ? "That request is too old."
                    : "That request isn't signed by Meta.",
            );
        }
        return req;
    }
}

/** The kinds one Meta sign-in covers: Facebook Login's two, or Threads. */
const loginKinds = (kind: ChannelKind): ChannelKind[] =>
    kind === "THREADS" ? ["THREADS"] : ["FACEBOOK", "INSTAGRAM"];

/**
 *   POST public/webhooks/meta/deauthorize/:kind      Meta: someone removed Saroh
 *   POST public/webhooks/meta/data-deletion/:kind    Meta: delete what Saroh holds
 *   GET  public/social/deletion/:code                the status page's read
 *
 * `:kind` is instagram, facebook or threads: each login's callback fields
 * in Meta's dashboard name their own. Under `/public/webhooks`, so no
 * browser origin or test-release check applies.
 */
@Controller("public")
export class MetaCallbacksController {
    constructor(private readonly callbacks: MetaCallbacksService) {}

    @Post("webhooks/meta/deauthorize/:kind")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    async deauthorize(
        @Param("kind") kind: string,
        // Only `signed_request` is read: a field Meta adds beside it is
        // ignored, not a 400 (S-14). The parser checks its type and length.
        @Body("signed_request") signed: unknown,
    ): Promise<Record<string, never>> {
        await this.callbacks.deauthorize(kindParam(kind), signed);
        return {};
    }

    @Post("webhooks/meta/data-deletion/:kind")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    dataDeletion(
        @Param("kind") kind: string,
        @Body("signed_request") signed: unknown,
    ): Promise<{ url: string; confirmation_code: string }> {
        return this.callbacks.dataDeletion(kindParam(kind), signed);
    }

    @Get("social/deletion/:code")
    @Header("Cache-Control", "no-store")
    status(@Param("code") code: string): Promise<DeletionView> {
        return this.callbacks.status(code);
    }
}
