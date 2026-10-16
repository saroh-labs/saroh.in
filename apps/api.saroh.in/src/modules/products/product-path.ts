import { prisma } from "@saroh/database";

/**
 * A product's path (its part of the shop's URL, `/products/<path>`) is
 * unique in the business (#510, @@unique([organizationId, slug])). A new
 * product made from a name that is taken gets the first free number on the
 * end ("packing-tape-2") instead of a refusal, and a path typed by hand that
 * is taken is refused naming who holds it and a free one to use (products
 * audit, 16 Oct 2026). Pure helpers first; tested in `product-path.spec.ts`.
 */

/** The longest a path can be, as the DTO and the editor say. */
export const PATH_MAX = 150;

/** How many numbers to try; a guard, not a limit anyone meets. */
const MAX_TRIES = 500;

/**
 * The n-th path for `base`: the base itself, then "-2", "-3", … trimmed so
 * the whole stays within `PATH_MAX`.
 */
export function pathCandidate(base: string, n: number): string {
    if (n <= 1) return base;
    const suffix = `-${n}`;
    const head = base.slice(0, PATH_MAX - suffix.length).replace(/-+$/g, "");
    return `${head}${suffix}`;
}

/** The first of `base`, `base-2`, `base-3`… that `taken` doesn't hold. */
export function firstFreePath(
    base: string,
    taken: ReadonlySet<string>,
): string {
    for (let n = 1; n <= MAX_TRIES; n++) {
        const path = pathCandidate(base, n);
        if (!taken.has(path)) return path;
    }
    throw new Error(`No free path for ${base} after ${MAX_TRIES}`);
}

/** "Packing Tape already uses this path. Try packing-tape-2." */
export function pathTakenMessage(holder: string, free: string): string {
    return `${holder} already uses this path. Try ${free}.`;
}

/**
 * The paths in the business that a number on `base` could clash with, read
 * once: the base and everything that starts with it (a trimmed long base is
 * checked too, by its own head).
 */
async function takenNear(
    organizationId: string,
    base: string,
    exceptProductId?: string,
): Promise<Set<string>> {
    const head = base.slice(0, PATH_MAX - `-${MAX_TRIES}`.length);
    const rows = await prisma.product.findMany({
        where: {
            organizationId,
            slug: { startsWith: head },
            ...(exceptProductId ? { id: { not: exceptProductId } } : {}),
        },
        select: { slug: true },
    });
    return new Set(rows.map((r) => r.slug));
}

/** The first free path from `base` in the business. */
export async function freePath(
    organizationId: string,
    base: string,
    exceptProductId?: string,
): Promise<string> {
    return firstFreePath(
        base,
        await takenNear(organizationId, base, exceptProductId),
    );
}

/**
 * Who holds `path` in the business, other than `exceptProductId`, and the
 * first free path from it; null when it is free.
 */
export async function pathHolder(
    organizationId: string,
    path: string,
    exceptProductId?: string,
): Promise<{ id: string; name: string; free: string } | null> {
    const holder = await prisma.product.findUnique({
        where: { organizationId_slug: { organizationId, slug: path } },
        select: { id: true, name: true },
    });
    if (!holder || holder.id === exceptProductId) return null;
    return {
        id: holder.id,
        name: holder.name,
        free: await freePath(organizationId, path, exceptProductId),
    };
}
