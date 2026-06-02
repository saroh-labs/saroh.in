import { prisma } from "@saroh/database";

/** Turn an arbitrary name into a URL-safe slug. */
export function slugify(input: string): string {
    return input
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s_-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Store slugs are globally unique (Store.slug @unique). */
export async function isSlugAvailable(slug: string): Promise<boolean> {
    const existing = await prisma.store.findUnique({ where: { slug } });
    return !existing;
}
