import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

/**
 * Which packs are on sale (round-2 E14, as D21 is for plans).
 *
 * A pack's `status` is a String: ACTIVE, ARCHIVED, and DRAFT. Only an ACTIVE
 * pack is sold. A DRAFT isn't published yet (DEC-043), and an ARCHIVED pack
 * isn't sold any more; both keep whoever already holds one (a draft has
 * nobody).
 *
 * Every path that sells a pack checks {@link assertPackOnSale}, and every
 * read that lists packs a buyer can choose (the desk's sell dialog, and the
 * site once packs are sold online, A11) filters by {@link PACKS_ON_SALE}.
 * The image before E14 already refused to sell anything but ACTIVE.
 */

export const PACK_ON_SALE = "ACTIVE";
export const PACK_DRAFT = "DRAFT";
export const PACK_ARCHIVED = "ARCHIVED";

/** The `where` for any read that lists packs a buyer can choose. */
export const PACKS_ON_SALE = {
    status: PACK_ON_SALE,
} as const satisfies Prisma.ClassPackWhereInput;

/** Said when someone tries to sell a draft pack. */
export const PACK_NOT_PUBLISHED = "This pack isn't published yet";

/**
 * Refuse a pack that isn't on sale, as a 409: a draft can't be sold until
 * it is published, and an archived pack keeps today's words.
 */
export function assertPackOnSale(
    pack: { status: string },
    field = "packId",
): void {
    if (pack.status === PACK_ON_SALE) return;
    if (pack.status === PACK_DRAFT) {
        throw new ConflictException({
            message: PACK_NOT_PUBLISHED,
            details: { field },
        });
    }
    throw new ConflictException(
        "That pack is archived and is not sold any more.",
    );
}
