import {
    Body,
    Controller,
    Header,
    HttpCode,
    Param,
    Post,
    UseGuards,
} from "@nestjs/common";

import { PublicSiteOnlineGuard } from "../../common/guards/public-site-online.guard";
import type { SiteRelay } from "../site-accounts/site-relay";
import { RelayContext, SiteRelayGuard } from "../site-accounts/site-relay";
import type { QrScanResult } from "./public-qr.service";
import { PublicQrService } from "./public-qr.service";
import { QrScanDto } from "./qr-codes.dto";

/**
 * The scan behind a QR code's short link. A merchant site's server calls it
 * when a phone opens `/q/<code>`, and forwards the phone to the answer.
 *
 * No session and no organization context: the business is read from the
 * code. Server to server only: without the signed relay it is a 401, so
 * nobody can add to a count by calling the API themselves, and the limit
 * counts the visitor the relay names, not the site's server. A deleted
 * business's codes are a 404 with its site (`PublicSiteOnlineGuard`), and a
 * test release's host is refused by `TestHostWriteGuard` (a tester's scans
 * are not the business's).
 */
@Controller("public/sites/:siteId/qr")
@UseGuards(PublicSiteOnlineGuard, SiteRelayGuard)
export class PublicQrController {
    constructor(private readonly qr: PublicQrService) {}

    /**
     * Where the code forwards to, counting the scan: `{ kind: "path", path }`
     * for a page of the site, `{ kind: "home" }` for a retired code or one
     * whose target is gone. 404 for a code the site doesn't have.
     */
    @Post(":code/scan")
    @HttpCode(200)
    @Header("Cache-Control", "no-store")
    scan(
        @Param("siteId") siteId: string,
        @Param("code") code: string,
        @RelayContext() relay: SiteRelay,
        @Body() dto: QrScanDto,
    ): Promise<QrScanResult> {
        return this.qr.scan(siteId, code, relay.clientHash, {
            userAgent: dto.userAgent,
            head: dto.head,
        });
    }
}
