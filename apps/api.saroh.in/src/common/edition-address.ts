import { ForbiddenException } from "@nestjs/common";
import type { Edition } from "@saroh/edition";
import { editionOfHost } from "@saroh/edition";

/**
 * A business is reached through its own edition's address (DEC-204), so
 * api.saroh.tech refuses an India business and api.saroh.in a Global one. This
 * catches a frontend pointed the wrong way: the Host header is the caller's to
 * set, so it isn't a security boundary, and access still rests on membership.
 * An address belonging to no edition (local, merchant sites' API) has no say.
 */
export function assertEditionMatchesAddress(
    edition: Edition | undefined,
    host: string | undefined,
): void {
    if (!edition || !host) return;
    const served = editionOfHost(host);
    if (served && served !== edition) {
        throw new ForbiddenException({
            code: "EDITION_ADDRESS_MISMATCH",
            message: "This business isn't served from this address.",
        });
    }
}
