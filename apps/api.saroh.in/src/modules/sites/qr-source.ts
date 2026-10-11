import { Logger } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { codeOfQrSource, qrSourceCode } from "./qr-target";

/**
 * Which QR code a booking or an order came from, for the record's
 * `sourceCode`.
 *
 * THE RULE: attribution rides the address, and nothing else. A scan opens a
 * page with `?src=qr-<code>` on it; a booking or an order started from that
 * page load sends the tag back with its request, and it is read here. The
 * site keeps no cookie, no storage and no identifier for it (DEC-108), so a
 * visitor who reloads without the tag, comes back later or opens the site
 * another way is not counted.
 *
 * The tag is the browser's word, so nothing in it is trusted:
 *
 * - Only a well-formed `qr-<code>` is looked at.
 * - The code is looked up on the site the customer is signed in to, in that
 *   site's business. Another site's or another business's code is no code.
 * - What is stored is the row's own id, read here ({@link qrSourceCode}),
 *   never anything the browser sent.
 * - A retired code still counts: the paper is still out there.
 * - Anything else, a failed read included, is no source. It never refuses
 *   or fails the booking or the order it came with.
 *
 * Called on customer routes, which already run in the business's row-level
 * security context; the query names the business as well.
 */

const logger = new Logger("QrSource");

export async function qrSourceFor(
    scope: { siteId: string; organizationId: string },
    tag: string | null | undefined,
): Promise<string | null> {
    const code = codeOfQrSource(tag);
    if (!code) return null;
    try {
        const row = await prisma.qrCode.findFirst({
            where: {
                siteId: scope.siteId,
                organizationId: scope.organizationId,
                code,
            },
            select: { id: true },
        });
        return row ? qrSourceCode(row) : null;
    } catch (err) {
        logger.warn(
            `Couldn't read a QR source on site ${scope.siteId}: ${
                err instanceof Error ? err.message : "unknown error"
            }`,
        );
        return null;
    }
}
