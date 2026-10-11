import {
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { QR_CODE_SHAPE, qrTargetPath } from "./qr-target";

/**
 * A scan of a QR code's short link: where it forwards to, and one more on
 * today's count.
 *
 * Called only by the merchant site's own server, behind the signed relay
 * (`SiteRelayGuard`), when a phone opens `/q/<code>`. Nothing about the
 * visitor is stored: the relayed address is hashed and used only to count
 * a burst from one place once, in memory, and the browser's name only to
 * tell a link preview from a person. No cookie, no identifier.
 *
 * - The target is worked out now, not when the code was made, so a renamed
 *   product or a moved page still opens.
 * - A retired code, or one whose product or page is gone, forwards to the
 *   home page: paper outlives the row. A retired code is never counted.
 * - Counting never decides the answer: past the limit, for a link preview,
 *   or when the write fails, the scan still forwards.
 */

/** Where a scan goes. `home`: the site's home page, with no tag. */
export type QrScanResult =
    | { kind: "path"; path: string; counted: boolean }
    | { kind: "home"; counted: boolean };

/** What the site's server relays about the request. */
export interface QrScanInput {
    userAgent?: string;
    /** The request only asked for headers: forwarded, never counted. */
    head?: boolean;
}

/**
 * Scans one address may add to one site's codes in a window. A counter on
 * shop Wi-Fi shares an address, so this is generous; it is here to stop a
 * loop, not a queue.
 */
export const QR_SCANS_PER_WINDOW = 30;
export const QR_SCAN_WINDOW_MS = 10 * 60_000;

/**
 * Callers that open a link without a person behind them: the apps that draw
 * a preview when a link is pasted, search crawlers, and command-line
 * fetchers. Matched anywhere in the browser's name, lower-cased. Kept short
 * on purpose: an unknown browser is counted as a person. `bot/` and not
 * `bot`: crawlers name themselves "Somebot/1.0", and a phone whose model
 * merely ends in "bot" is a person.
 */
export const QR_UNCOUNTED_AGENTS = [
    "bot/",
    "crawler",
    "spider",
    "preview",
    "facebookexternalhit",
    "whatsapp",
    "slack",
    "telegram",
    "discord",
    "curl/",
    "wget/",
    "headless",
] as const;

/** Whether a browser's name is a person's, as far as a count cares. */
export function countsAsPerson(userAgent: string | undefined): boolean {
    const agent = userAgent?.trim().toLowerCase();
    // No name at all is a script, not a phone's browser.
    if (!agent) return false;
    return !QR_UNCOUNTED_AGENTS.some((word) => agent.includes(word));
}

/** The UTC day a scan is counted on, as `YYYY-MM-DD`. */
export function scanDay(now: Date): string {
    return now.toISOString().slice(0, 10);
}

function notFound(): never {
    throw new NotFoundException("No QR code found");
}

@Injectable()
export class PublicQrService {
    private readonly logger = new Logger(PublicQrService.name);

    constructor(
        // Not a DI provider: a per-instance default that tests replace.
        @Optional()
        private readonly limiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            QR_SCANS_PER_WINDOW,
            QR_SCAN_WINDOW_MS,
        ),
    ) {}

    /**
     * Resolve `code` on `siteId` and count the scan. 404 for a site or a
     * code that doesn't exist; everything else forwards somewhere.
     *
     * `visitorHash` is the relayed visitor's address, hashed by the relay
     * check. The business is read from the code's own row, never sent.
     */
    async scan(
        siteId: string,
        rawCode: string,
        visitorHash: string,
        input: QrScanInput = {},
        now: Date = new Date(),
    ): Promise<QrScanResult> {
        const code = rawCode.trim().toLowerCase();
        if (!QR_CODE_SHAPE.test(code)) notFound();
        const site = await prisma.site.findFirst({
            where: { id: siteId, deletedAt: null },
            select: {
                id: true,
                organizationId: true,
                storefrontId: true,
                currentPublicationId: true,
            },
        });
        if (!site) notFound();

        return runInOrgContext(site.organizationId, async () => {
            const row = await prisma.qrCode.findFirst({
                where: {
                    siteId: site.id,
                    organizationId: site.organizationId,
                    code,
                },
                select: {
                    id: true,
                    organizationId: true,
                    targetKind: true,
                    targetRef: true,
                    retiredAt: true,
                },
            });
            if (!row) notFound();
            if (row.retiredAt) return { kind: "home", counted: false };

            const path = await qrTargetPath(prisma, site, row);
            const counted =
                input.head !== true &&
                countsAsPerson(input.userAgent) &&
                this.limiter.take(`${site.id}:${visitorHash}`) &&
                (await this.count(row, now));
            return path === null
                ? { kind: "home", counted }
                : { kind: "path", path, counted };
        });
    }

    /**
     * One more on today's row, made if it isn't there, in one statement so
     * two scans at once both land. False when the write failed: the scan
     * forwards regardless, and the failure is logged without the visitor.
     */
    private async count(
        row: { id: string; organizationId: string },
        now: Date,
    ): Promise<boolean> {
        try {
            await prisma.$executeRaw`
                INSERT INTO "QrScanDay" ("qrCodeId", "organizationId", "day", "count")
                VALUES (${row.id}, ${row.organizationId}, ${scanDay(now)}::date, 1)
                ON CONFLICT ("qrCodeId", "day")
                DO UPDATE SET "count" = "QrScanDay"."count" + 1`;
            return true;
        } catch (error) {
            this.logger.warn(
                `qr_scan_not_counted code=${row.id} error=${error instanceof Error ? error.name : "unknown"}`,
            );
            return false;
        }
    }
}
