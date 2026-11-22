import type {
    Post,
    PostApproval,
    PostCategory,
    PostLiveCopy,
} from "@/lib/content/service";
import type { ShareSetup } from "@/lib/share-item/share";
import type { SiteCommentView } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";

import type { AskAiStart, PostDraft } from "./use-post-draft";

/** What the desk post editor's server page reads (KTD-E7). */
export interface PostEditorData {
    siteId: string;
    /** Who it is written by: the writer's account name, or null for a new post. */
    author: string | null;
    /** The business name, shown as "By … · <business>" and on the bar. */
    siteName: string;
    /** "gulmohar.saroh.app", or null before the site has one. */
    address: string | null;
    /** Where posts live: "blog" unless the site says otherwise. */
    postsPrefix: string;
    categories: PostCategory[];
    /** The site's posts for the left panel; null when they couldn't be read. */
    posts: Post[] | null;
    /** The site's look, so the writing reads as it will on the page. */
    style: SiteStyle | null;
    styleOptions: SiteStyleOptions | null;
    /** Past the plan's blog posts limit (#800): read only, and why. */
    paused: boolean;
    /** A Reviewer or a Member (DEC-200 U8): every field shown, none changeable. */
    readOnly: boolean;
    /** This post's notes, and what the caller may do with them. */
    feedback?: {
        comments: SiteCommentView[];
        canComment: boolean;
        canSettle: boolean;
    };
    /**
     * Share as a post (#1375), for any saved post; each Share shows only
     * while it is live, and Publish post names it beforehand (Y2).
     */
    share: { setup: ShareSetup; url: string } | null;
    /** Started from an Ask AI blog draft; null when it couldn't be read. */
    fromAskAi?: AskAiStart | null;
    /** Ask AI is on for this person. */
    askAi: boolean;
    /**
     * "Read by N" from the page results by the post's path (U47a), or null
     * until they are read. No booking count is tied to a post (A3).
     */
    readBy: number | null;
}

/**
 * Everything the desk post editor holds, handed to the pieces later units
 * fill (U17's History and review, U18's Publish post) so they never edit
 * the shell (KTD-E2). Read it, don't copy it.
 */
export interface PostEditorModel {
    data: PostEditorData;
    draft: PostDraft;
    /** The live copy as last read: what "changes waiting" counts against. */
    liveCopy: PostLiveCopy | null;
    /** Publish post › Later: when it goes live, or null. */
    scheduledAt: string | null;
    /** "Publishing needs approval" for this post (O7); null for a new one. */
    approval: PostApproval | null;
    /** The parts that differ from the live copy (`postChanges`). */
    waiting: number;
    /** The chip's words (RULES §2). */
    status: string;
    /** Show a title error and stop: a post needs a title to save or publish. */
    needsTitle: () => boolean;
}
