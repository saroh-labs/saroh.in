import type { PostLiveCopy } from "@/lib/content/service";

/** The parts of a post a change is counted in, in the words the editor uses. */
export type PostPart =
    | "title"
    | "words"
    | "shortDescription"
    | "cover"
    | "coverDescription"
    | "pageLink"
    | "category"
    | "searchTitle"
    | "searchDescription";

/** The draft as the editor holds it (empty is "none"). */
export interface PostDraftView {
    title: string;
    content: string;
    excerpt: string;
    image: string;
    imageAlt: string;
    slug: string;
    /** The category's name, or "" for none. */
    category: string;
    seoTitle: string;
    seoDescription: string;
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
    (a ?? "").trim() === (b ?? "").trim();

/**
 * What differs between the draft and the live copy (U15; U17's review and
 * U18's Publish post list the same parts): one entry per changed part, so
 * the status chip's "Live · n changes waiting" is this list's length. No
 * live copy means the post isn't live, and nothing is "waiting".
 */
export function postChanges(
    draft: PostDraftView,
    live: PostLiveCopy | null | undefined,
): PostPart[] {
    if (!live) return [];
    const parts: [PostPart, boolean][] = [
        ["title", same(draft.title, live.title)],
        ["words", draft.content === live.content],
        ["shortDescription", same(draft.excerpt, live.excerpt)],
        ["cover", same(draft.image, live.image)],
        ["coverDescription", same(draft.imageAlt, live.imageAlt)],
        // An empty link follows the title on save; it isn't a change yet.
        ["pageLink", !draft.slug.trim() || same(draft.slug, live.slug)],
        ["category", same(draft.category, live.category)],
        ["searchTitle", same(draft.seoTitle, live.seoTitle)],
        ["searchDescription", same(draft.seoDescription, live.seoDescription)],
    ];
    return parts.filter(([, unchanged]) => !unchanged).map(([part]) => part);
}

/**
 * The post's status in RULES §2's one form: "Live", "Live · 2 changes
 * waiting", "Not live yet", "Scheduled for Fri 21 Nov, 9 am".
 */
export function postStatusLabel({
    live,
    waiting,
    scheduledFor,
}: {
    live: boolean;
    waiting: number;
    /** The schedule already in the business's words, or null. */
    scheduledFor: string | null;
}): string {
    if (scheduledFor) return `Scheduled for ${scheduledFor}`;
    if (!live) return "Not live yet";
    if (waiting === 0) return "Live";
    return `Live · ${waiting} ${waiting === 1 ? "change" : "changes"} waiting`;
}

/** Each part as a merchant reads it, in the Publish post list and History. */
export const POST_PART_WORDS: Record<PostPart, string> = {
    title: "Title",
    words: "The writing",
    shortDescription: "Short description",
    cover: "Cover",
    coverDescription: "The cover's description",
    pageLink: "Page link",
    category: "Category",
    searchTitle: "Title in search",
    searchDescription: "Description in search",
};

/** One run of words: in both, only in the newer copy, or only in the older. */
export interface DiffRun {
    kind: "same" | "added" | "removed";
    text: string;
}

/** The longest common run of `a` and `b`, as pairs of positions. */
function common<T>(a: T[], b: T[]): [number, number][] {
    const n = a.length;
    const m = b.length;
    const len: number[][] = Array.from({ length: n + 1 }, () =>
        new Array<number>(m + 1).fill(0),
    );
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            len[i][j] =
                a[i] === b[j]
                    ? len[i + 1][j + 1] + 1
                    : Math.max(len[i + 1][j], len[i][j + 1]);
        }
    }
    const pairs: [number, number][] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            pairs.push([i, j]);
            i++;
            j++;
        } else if (len[i + 1][j] >= len[i][j + 1]) i++;
        else j++;
    }
    return pairs;
}

/**
 * Word by word, what changed between two lines of text (spaces kept with
 * the word before them, so the runs join back into the line).
 */
export function wordDiff(older: string, newer: string): DiffRun[] {
    const a = older.match(/\S+\s*/g) ?? [];
    const b = newer.match(/\S+\s*/g) ?? [];
    const runs: DiffRun[] = [];
    const push = (kind: DiffRun["kind"], words: string[]) => {
        if (words.length === 0) return;
        const last = runs.at(-1);
        if (last?.kind === kind) last.text += words.join("");
        else runs.push({ kind, text: words.join("") });
    };
    let i = 0;
    let j = 0;
    for (const [ci, cj] of [...common(a, b), [a.length, b.length]]) {
        push("removed", a.slice(i, ci));
        push("added", b.slice(j, cj));
        if (ci < a.length) push("same", [a[ci]]);
        i = ci + 1;
        j = cj + 1;
    }
    return runs;
}

/** One paragraph of a compared post. */
export type ParagraphDiff =
    | { kind: "same" | "added" | "removed"; text: string }
    | { kind: "changed"; runs: DiffRun[] };

/**
 * Paragraph by paragraph (plain text, `postParagraphs`), what changed
 * between an older copy and a newer one: a paragraph taken out right
 * before one put in is one changed paragraph, compared word by word.
 */
export function paragraphDiff(
    older: string[],
    newer: string[],
): ParagraphDiff[] {
    const out: ParagraphDiff[] = [];
    let i = 0;
    let j = 0;
    for (const [ci, cj] of [
        ...common(older, newer),
        [older.length, newer.length],
    ]) {
        const gone = older.slice(i, ci);
        const put = newer.slice(j, cj);
        const paired = Math.min(gone.length, put.length);
        for (let k = 0; k < paired; k++) {
            out.push({ kind: "changed", runs: wordDiff(gone[k], put[k]) });
        }
        for (const text of gone.slice(paired))
            out.push({ kind: "removed", text });
        for (const text of put.slice(paired)) out.push({ kind: "added", text });
        if (ci < older.length) out.push({ kind: "same", text: older[ci] });
        i = ci + 1;
        j = cj + 1;
    }
    return out;
}

/** How many runs were put in and taken out, for "2 added · 1 taken out". */
export function diffCounts(paragraphs: ParagraphDiff[]): {
    added: number;
    removed: number;
} {
    let added = 0;
    let removed = 0;
    for (const p of paragraphs) {
        if (p.kind === "added") added++;
        else if (p.kind === "removed") removed++;
        else if (p.kind === "changed") {
            for (const r of p.runs) {
                if (r.kind === "added") added++;
                else if (r.kind === "removed") removed++;
            }
        }
    }
    return { added, removed };
}
