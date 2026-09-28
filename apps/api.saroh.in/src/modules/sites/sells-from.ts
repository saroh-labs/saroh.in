import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";

/**
 * The storefront a site sells from (round-2 G11): `Site.storefrontId`.
 *
 * Shown, never silent. It is set on its own only when the business has
 * exactly one open storefront with listings (the migration's backfill and
 * site creation), and the site's settings then say "Your site sells from
 * Online · Change". With several it stays unset until the merchant answers
 * "Which storefront does this site sell from?", and the pre-publish check
 * names it. It is never "the first storefront" by creation order. Closing
 * the storefront clears it (`storefronts.service.ts`), and a read treats a
 * closed one as unset anyway.
 *
 * `/shop`, the product pages, the Product grid (G12) and checkout (G13) all
 * read it through {@link effectiveStorefront}, so they can never disagree
 * about where the site sells from.
 *
 * The whole shop sits behind the `SITE_SHOP` rollout flag until checkout
 * (G13) ships: {@link shopRolloutOn} is the one gate every reader asks.
 */

type Db = Pick<Prisma.TransactionClient, "store" | "site">;

/** An open storefront that lists at least one published product. */
const SELLS_SOMETHING = {
    deletedAt: null,
    listings: { some: { product: { status: "PUBLISHED" } } },
} satisfies Prisma.StoreWhereInput;

/** A storefront the merchant may choose: open and theirs. */
export interface SellsFromChoice {
    id: string;
    name: string;
    /** Published products listed there. */
    products: number;
}

/**
 * What the site's settings show. `storefront` is the one it sells from, or
 * null when unanswered; `choices` are the open storefronts with listings.
 */
export interface SellsFromView {
    storefront: { id: string; name: string } | null;
    choices: SellsFromChoice[];
}

// Stateless (it reads the flag rows on every call), so one instance serves
// the free functions here and in the modules that have no DI to hand.
const flags = new FeatureFlagService();

/**
 * Whether the shop is open for this business at all (the `SITE_SHOP`
 * flag). Off: no `/shop`, no product pages, no Sells from row and no
 * pre-publish question. The flag fails closed when never configured.
 */
export function shopRolloutOn(organizationId: string): Promise<boolean> {
    return flags.isEnabled(FlagKey.SITE_SHOP, organizationId);
}

/**
 * Whether the business still sells, as far as the Commerce module is
 * concerned: the public shop's routes carry no module guard (a visitor has
 * no organization context), so they ask this, as public booking asks
 * `appointmentsOpen`. A COMMERCE row in any state but ENABLED means the
 * merchant switched it off; a missing row counts as on (enforcement ships
 * dark, and the backfill may not have written rows yet).
 */
export async function commerceOpen(
    db: Pick<Prisma.TransactionClient, "organizationModule">,
    organizationId: string,
): Promise<boolean> {
    const switchedOff = await db.organizationModule.findFirst({
        where: {
            organizationId,
            moduleKey: "COMMERCE",
            status: { not: "ENABLED" },
        },
        select: { id: true },
    });
    return !switchedOff;
}

/** Open storefronts that list a published product, by name. */
export async function sellsFromChoices(
    db: Db,
    organizationId: string,
): Promise<SellsFromChoice[]> {
    const stores = await db.store.findMany({
        where: { organizationId, ...SELLS_SOMETHING },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
            id: true,
            name: true,
            _count: {
                select: {
                    listings: { where: { product: { status: "PUBLISHED" } } },
                },
            },
        },
    });
    return stores.map((s) => ({
        id: s.id,
        name: s.name,
        products: s._count.listings,
    }));
}

/**
 * The storefront to set on its own: the only candidate, or null when there
 * are none or several. Used at site creation, as the migration's backfill
 * did for existing sites.
 */
export async function automaticStorefront(
    db: Db,
    organizationId: string,
): Promise<string | null> {
    const candidates = await db.store.findMany({
        where: { organizationId, ...SELLS_SOMETHING },
        select: { id: true },
        take: 2,
    });
    return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}

/**
 * The storefront a site sells from now: its choice, while that storefront
 * is still open and the business's. Null means unanswered.
 */
export async function effectiveStorefront(
    db: Db,
    site: { organizationId: string; storefrontId: string | null },
): Promise<{ id: string; name: string } | null> {
    if (!site.storefrontId) return null;
    return db.store.findFirst({
        where: {
            id: site.storefrontId,
            organizationId: site.organizationId,
            deletedAt: null,
        },
        select: { id: true, name: true },
    });
}

/** The settings' view: where it sells from, and what it could. */
export async function sellsFromView(
    db: Db,
    site: { organizationId: string; storefrontId: string | null },
): Promise<SellsFromView> {
    const [storefront, choices] = await Promise.all([
        effectiveStorefront(db, site),
        sellsFromChoices(db, site.organizationId),
    ]);
    return { storefront, choices };
}

/**
 * Check a storefront the merchant picked: open, and their business's. A
 * storefront of another business, or a closed one, is refused at save —
 * the same answer for both, so the refusal says nothing about the other.
 */
export async function assertSellsFromChoice(
    db: Db,
    organizationId: string,
    storefrontId: string,
): Promise<void> {
    const store = await db.store.findFirst({
        where: { id: storefrontId, organizationId, deletedAt: null },
        select: { id: true },
    });
    if (!store) {
        throw new BadRequestException({
            message: "Pick one of this business's open storefronts.",
            details: { field: "storefrontId" },
        });
    }
}

/** The addresses the shop owns (Key Technical Decisions): /shop and below. */
export const SHOP_PATH = "/shop";

/** Whether a page path sits at the shop's address or under it. */
export function isShopPath(path: string): boolean {
    const p = path.toLowerCase().replace(/\/+$/, "");
    return p === SHOP_PATH || p.startsWith(`${SHOP_PATH}/`);
}
