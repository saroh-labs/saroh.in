import type { Prisma } from "@saroh/database";
import {
    currentOrgContext,
    isRlsEnforcementEnabled,
    outsideOrgContext,
    prisma,
} from "@saroh/database";

type Reader = Pick<Prisma.TransactionClient, "store">;

/**
 * Whether any business's storefront already has `slug`. `Store.slug` is
 * unique across every business, so "is this slug free" is cross-business by
 * nature, but it is asked during one business's request (a new location, the
 * Sell turn-on). With RLS enforced, `db` there is scoped to that business and
 * another business's storefront would look free, so the insert would end in
 * the unique index's raw error. In that case the read goes to the unscoped
 * client outside the request's context (and so outside its transaction), as
 * `addressUse` does for web addresses (`sites/site-address.ts`); every other
 * time it uses `db` as given.
 */
export async function storeSlugInUse(
    db: Reader,
    slug: string,
): Promise<boolean> {
    const read = (reader: Reader) =>
        reader.store.findUnique({ where: { slug }, select: { id: true } });
    const found =
        isRlsEnforcementEnabled() && currentOrgContext() !== undefined
            ? await outsideOrgContext(() => read(prisma))
            : await read(db);
    return found !== null;
}
