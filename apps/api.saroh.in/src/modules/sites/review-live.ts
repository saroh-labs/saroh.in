import { prisma } from "@saroh/database";

/**
 * Copied product reviews, read live. A review the merchant picked into a
 * Testimonials section keeps its `reviewId`; on every public read it shows
 * only while that review is still published in the site's own business, so
 * one the customer or merchant hid, or that was deleted, leaves the live
 * site at once, without a publish. A hand-written testimonial (no
 * `reviewId`) is drawn as written. A snapshot with no copied review is
 * returned untouched, the same object, and costs no read.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj =>
    v !== null && typeof v === "object" && !Array.isArray(v);

const reviewIdOf = (item: unknown): string | null =>
    isObj(item) && typeof item.reviewId === "string" && item.reviewId !== ""
        ? item.reviewId
        : null;

const isTestimonials = (s: unknown): s is Obj & { content: Obj } =>
    isObj(s) && s.type === "testimonials" && isObj(s.content);

const itemsOf = (s: Obj): unknown[] => {
    const items = (s.content as Obj).items;
    return Array.isArray(items) ? items : [];
};

function pagesOf(snapshot: unknown): Obj[] {
    const pages = isObj(snapshot) ? snapshot.pages : null;
    return Array.isArray(pages) ? pages.filter(isObj) : [];
}

/** Every review id a snapshot's Testimonials sections copy. */
export function copiedReviewIds(snapshot: unknown): Set<string> {
    const ids = new Set<string>();
    for (const page of pagesOf(snapshot)) {
        const sections = Array.isArray(page.sections) ? page.sections : [];
        for (const s of sections.filter(isTestimonials)) {
            for (const item of itemsOf(s)) {
                const id = reviewIdOf(item);
                if (id) ids.add(id);
            }
        }
    }
    return ids;
}

/**
 * The snapshot with each copied review not in `live` dropped. A section left
 * with no testimonial goes too (with its key, which runs parallel to the
 * page's sections).
 */
export function withLiveReviews(snapshot: unknown, live: Set<string>): unknown {
    if (!isObj(snapshot) || !Array.isArray(snapshot.pages)) return snapshot;
    const keys = isObj(snapshot.keys) ? snapshot.keys : {};
    const nextKeys: Obj = { ...keys };
    const pages = snapshot.pages.map((page: unknown) => {
        if (!isObj(page) || !Array.isArray(page.sections)) return page;
        const kept: number[] = [];
        const sections: unknown[] = [];
        page.sections.forEach((s: unknown, i: number) => {
            if (!isTestimonials(s)) {
                kept.push(i);
                sections.push(s);
                return;
            }
            const items = itemsOf(s);
            const shown = items.filter((it) => {
                const id = reviewIdOf(it);
                return id === null || live.has(id);
            });
            if (shown.length === 0 && items.length > 0) return;
            kept.push(i);
            sections.push(
                shown.length === items.length
                    ? s
                    : { ...s, content: { ...s.content, items: shown } },
            );
        });
        const entry = typeof page.path === "string" ? keys[page.path] : null;
        if (
            kept.length < page.sections.length &&
            isObj(entry) &&
            Array.isArray(entry.sections)
        ) {
            nextKeys[page.path as string] = {
                ...entry,
                sections: kept.map((i) => (entry.sections as unknown[])[i]),
            };
        }
        return { ...page, sections };
    });
    return {
        ...snapshot,
        pages,
        ...(isObj(snapshot.keys) ? { keys: nextKeys } : {}),
    };
}

/** The snapshot as it reads now: one batched read, scoped to the business. */
export async function liveReviewSnapshot(
    snapshot: unknown,
    organizationId: string,
): Promise<unknown> {
    const ids = copiedReviewIds(snapshot);
    if (ids.size === 0) return snapshot;
    const rows = await prisma.productReview.findMany({
        where: { organizationId, status: "PUBLISHED", id: { in: [...ids] } },
        select: { id: true },
    });
    return withLiveReviews(snapshot, new Set(rows.map((r) => r.id)));
}
