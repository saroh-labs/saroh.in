/**
 * The last five things this person opened from search (10 Oct 2026), so
 * the command menu on day 100 starts with what they were working on.
 *
 * Kept in this browser only (`localStorage`), per business, and never
 * sent anywhere: an id, the kind of thing, the label it was found by and
 * where it opens. No customer's details beyond the label the search
 * already showed. A browser that refuses storage simply has no recents.
 *
 * Client-only at call time; every call is wrapped, and what is read back
 * is checked field by field.
 */

export interface Recent {
    kind: string;
    id: string;
    title: string;
    href: string;
}

export const RECENTS_MAX = 5;

const key = (scope: string) => `saroh-recent-v1:${scope}`;

function isRecent(value: unknown): value is Recent {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    return (
        typeof r.kind === "string" &&
        typeof r.id === "string" &&
        typeof r.title === "string" &&
        typeof r.href === "string" &&
        // Only ever a page of this app.
        r.href.startsWith("/") &&
        !r.href.startsWith("//")
    );
}

/** The recents for a business, newest first. Empty when there are none. */
export function readRecents(scope: string): Recent[] {
    try {
        const raw = window.localStorage.getItem(key(scope));
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isRecent).slice(0, RECENTS_MAX);
    } catch {
        return [];
    }
}

/** Put one on top; the same thing opened again moves up, never doubles. */
export function withRecent(list: readonly Recent[], opened: Recent): Recent[] {
    return [
        {
            kind: opened.kind,
            id: opened.id,
            title: opened.title,
            href: opened.href,
        },
        ...list.filter((r) => !(r.kind === opened.kind && r.id === opened.id)),
    ].slice(0, RECENTS_MAX);
}

/** Remember that this was opened. Answers the new list. */
export function rememberRecent(scope: string, opened: Recent): Recent[] {
    const next = withRecent(readRecents(scope), opened);
    try {
        window.localStorage.setItem(key(scope), JSON.stringify(next));
    } catch {
        // Storage is full or refused: nothing to remember with.
    }
    return next;
}
