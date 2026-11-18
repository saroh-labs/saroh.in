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
import { IsOptional, IsString, MaxLength } from "class-validator";

import { appBase } from "../../../common/app-url";
import { markAttentionInTx } from "../channels/channel-attention";
import { kindParam } from "../channels/dto";
import { callbackSecrets, parseSignedRequest } from "./signed-request";
import type { ChannelKind } from "./social-meta.port";

/** Meta's form body: `signed_request`, checked by the service. */
export class SignedRequestDto {
    @IsOptional()
    @IsString()
    @MaxLength(4096)
    signed_request?: string;
}

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
                where: { kind, platformUserId: req.userId },
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
                const { count } = await tx.socialChannel.deleteMany({
                    where: { kind, platformUserId: req.userId },
                });
                await tx.socialConnectChoice.deleteMany({
                    where: { kind, platformUserId: req.userId },
                });
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
        @Body() body: SignedRequestDto,
    ): Promise<Record<string, never>> {
        await this.callbacks.deauthorize(kindParam(kind), body?.signed_request);
        return {};
    }

    @Post("webhooks/meta/data-deletion/:kind")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    dataDeletion(
        @Param("kind") kind: string,
        @Body() body: SignedRequestDto,
    ): Promise<{ url: string; confirmation_code: string }> {
        return this.callbacks.dataDeletion(
            kindParam(kind),
            body?.signed_request,
        );
    }

    @Get("social/deletion/:code")
    @Header("Cache-Control", "no-store")
    status(@Param("code") code: string): Promise<DeletionView> {
        return this.callbacks.status(code);
    }
}
