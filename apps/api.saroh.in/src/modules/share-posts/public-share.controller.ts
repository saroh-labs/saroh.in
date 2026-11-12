import {
    Controller,
    Get,
    Ip,
    Param,
    Query,
    Res,
    StreamableFile,
    UseGuards,
} from "@nestjs/common";
import type { Response } from "express";

import { hashClientIp } from "../../common/client-ip";
import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import type { ShareQuery } from "./public-share.service";
import { PublicShareService } from "./public-share.service";

/** How long anyone may keep a picture: a price change shows within it. */
export const SHARE_IMAGE_CACHE = "public, max-age=300";

/**
 * Share pictures (#1375, #1378): PNGs anyone may fetch, the workspace's
 * share sheet and a phone's alike, with no session. Answered with
 * `Access-Control-Allow-Origin: *` (`common/cors.ts`, `SHARE_IMAGE`).
 * A refusal is a JSON error the filter never lets anything keep.
 */
@Controller("public/share")
@UseGuards(PublicSiteOnlineGuard)
export class PublicShareController {
    constructor(private readonly share: PublicShareService) {}

    /** A business's own post (Create post), on its live site's look. */
    @Get("own/:id/image")
    async own(
        @Param("id") id: string,
        @Query() query: ShareQuery,
        @Ip() ip: string,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        return png(res, await this.share.own(id, query, visitor(ip)));
    }

    /** `?style=photo|price|offer|simple&size=post|square|story&font=…` */
    @Get(":siteId/:kind/:ref/image")
    async item(
        @Param("siteId") siteId: string,
        @Param("kind") kind: string,
        @Param("ref") ref: string,
        @Query() query: ShareQuery,
        @Ip() ip: string,
        @Res({ passthrough: true }) res: Response,
    ): Promise<StreamableFile> {
        return png(
            res,
            await this.share.item(siteId, kind, ref, query, visitor(ip)),
        );
    }
}

const visitor = (ip: string) => `share:${hashClientIp(ip) ?? "unknown"}`;

function png(res: Response, bytes: Buffer): StreamableFile {
    res.setHeader("Cache-Control", SHARE_IMAGE_CACHE);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return new StreamableFile(bytes, {
        type: "image/png",
        length: bytes.length,
    });
}
