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
