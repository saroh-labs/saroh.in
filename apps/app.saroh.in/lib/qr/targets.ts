import type { QrCodeView, QrPlace, QrTargetKind } from "./types";

/**
 * What a QR code can open, built from reads the workspace already has (there
 * is no target-picker endpoint): the web-address read's live links, the
 * shop's published products and the site's published free-form pages. Pure;
 * the reads are `screen.ts`.
 *
 * Most useful first: the booking page, the online shop, the website. A
 * product or a page sits behind "More…", so the column stays short. A page
 * nobody can open is never offered: the API would refuse it, and says why
 * if one closes between the read and the save.
 */

export interface QrTarget {
    /** `BOOK`, `SHOP`, `SITE`, `PRODUCT:<id>` or `PAGE:<id>`. */
    key: string;
    kind: QrTargetKind;
    /** The product's or page's id; null for the others. */
    ref: string | null;
    name: string;
    /** "glow.saroh.app/book": where it opens, as the merchant reads it. */
    address: string;
}

export interface QrTargets {
    /** The cards always in the column. */
    main: QrTarget[];
    /** Products, then pages: behind "More…". */
    more: QrTarget[];
}

export function targetKey(kind: QrTargetKind, ref: string | null): string {
    return ref ? `${kind}:${ref}` : kind;
}

/** `https://glow.saroh.app` + `/book` → `glow.saroh.app/book`. */
export function targetAddress(origin: string | null, path: string): string {
    const host = (origin ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
    const tail = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
    return `${host}${tail}`;
}

/** A page's path as the published site holds it: leading slash, no trailing. */
export function pagePath(path: string): string {
    const trimmed = path.trim().replace(/\/+$/, "");
    if (trimmed === "") return "/";
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * The site's free-form pages a code may open: not the home page (that is
 * Website), not hidden, and at an address the published site holds. With
 * the published paths unknown (never published, or the read failed) none is
 * offered.
 */
export function publishedFreePages(
    pages: readonly {
        id: string;
        title: string;
        path: string;
        isHome: boolean;
        hidden: boolean;
        kind?: string;
    }[],
    publishedPaths: readonly string[] | null,
): { id: string; title: string; path: string }[] {
    if (!publishedPaths) return [];
    const live = new Set(publishedPaths.map(pagePath));
    return pages
        .filter(
            (p) =>
                (p.kind ?? "FREE") === "FREE" &&
                !p.isHome &&
                !p.hidden &&
                live.has(pagePath(p.path)),
        )
        .map((p) => ({ id: p.id, title: p.title, path: pagePath(p.path) }));
}

export interface QrTargetSources {
    /**
     * Where customers go: the web-address read's origin (the custom domain
     * when there is one), else the site's Saroh address. Only for the line
     * under each name; a code's own link is always on the Saroh address.
     */
    origin: string | null;
    /**
     * Which pages are live, from the web-address read. Null: not known (a
     * role the API doesn't show it to), so only the website is offered.
     */
    links: { shop: string | null; book: string | null } | null;
    /** Published products the shop sells; null: not read. */
    products: readonly { id: string; name: string; slug: string }[] | null;
    /** From {@link publishedFreePages}. */
    pages: readonly { id: string; title: string; path: string }[];
}

export function buildQrTargets(sources: QrTargetSources): QrTargets {
    const { origin, links } = sources;
    const fixed = (
        kind: "BOOK" | "SHOP" | "SITE",
        name: string,
        path: string,
    ): QrTarget => ({
        key: kind,
        kind,
        ref: null,
        name,
        address: targetAddress(origin, path),
    });

    const main: QrTarget[] = [];
    if (links?.book) main.push(fixed("BOOK", "Booking page", "/book"));
    if (links?.shop) main.push(fixed("SHOP", "Online shop", "/shop"));
    main.push(fixed("SITE", "Website", "/"));

    const more: QrTarget[] = [];
    // A product opens only while the shop does.
    if (links?.shop) {
        for (const p of sources.products ?? []) {
            more.push({
                key: targetKey("PRODUCT", p.id),
                kind: "PRODUCT",
                ref: p.id,
                name: p.name,
                address: targetAddress(
                    origin,
                    `/shop/${encodeURIComponent(p.slug)}`,
                ),
            });
        }
    }
    for (const p of sources.pages) {
        more.push({
            key: targetKey("PAGE", p.id),
            kind: "PAGE",
            ref: p.id,
            name: p.title,
            address: targetAddress(origin, p.path),
        });
    }
    return { main, more };
}

/** The "More…" list narrowed to what was typed, by name or address. */
export function searchTargets(
    targets: readonly QrTarget[],
    query: string,
): QrTarget[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...targets];
    return targets.filter(
        (t) =>
            t.name.toLowerCase().includes(needle) ||
            t.address.toLowerCase().includes(needle),
    );
}

export function findTarget(
    targets: QrTargets,
    key: string | null,
): QrTarget | null {
    if (!key) return null;
    return (
        targets.main.find((t) => t.key === key) ??
        targets.more.find((t) => t.key === key) ??
        null
    );
}

/** A saved code's target as a picker choice, even when it is no longer offered. */
export function targetOfCode(
    code: Pick<QrCodeView, "target">,
    origin: string | null,
): QrTarget {
    const { kind, ref, name, path } = code.target;
    return {
        key: targetKey(kind, ref),
        kind,
        ref,
        name: kind === "SHOP" ? "Online shop" : name,
        address: targetAddress(origin, path ?? "/"),
    };
}

const sameNote = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * A code already made for this target and place, so choosing the same two
 * again selects it rather than making a duplicate. Retired codes never
 * match; for "Other" the note must match too. The list is newest first, so
 * the newest wins.
 */
export function findReusable(
    codes: readonly QrCodeView[],
    want: {
        targetKey: string;
        place: QrPlace;
        placeNote?: string | null;
    },
): QrCodeView | null {
    return (
        codes.find(
            (c) =>
                !c.retired &&
                targetKey(c.target.kind, c.target.ref) === want.targetKey &&
                c.place === want.place &&
                (c.place !== "OTHER" || sameNote(c.placeNote, want.placeNote)),
        ) ?? null
    );
}
