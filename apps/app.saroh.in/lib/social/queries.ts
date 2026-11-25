import { z } from "zod";

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { OwnPost } from "./own-posts";
import type { PickRow } from "./pick";
import type {
    Read,
    SocialAccess,
    SocialChannel,
    SocialParams,
    SocialPost,
} from "./saroh-social-types";

/**
 * Social's reads (DEC-259). Client-safe: the keys and the routes; the
 * services are paired in `access.ts`. A channel crosses as display facts
 * only (name, handle, state, when connected): never a token, a Page token,
 * an app secret or a signed request (KTD-6d).
 */

/** Every Social read of a business: what a post or channel change invalidates. */
export const socialKeys = (orgId: string): DomainKey =>
    domainKey("social", orgId);

/** Saroh Social's screen: whether it's open (and this month's count), the channels and the posts. */
export interface SocialScreen {
    access: SocialAccess;
    channels: Read<SocialChannel[]>;
    posts: Read<SocialPost[]>;
}

export const socialScreenRead = defineRead<SocialScreen>()({
    key: (orgId) => domainKey("social", orgId, "screen"),
    route: { path: "/api/social", params: {} },
    // The team's posts and channels; a connect or disconnect reads it again.
    tier: "records",
});

/** One post `?post=` names, when it isn't in the list. */
export const socialPostRead = defineRead<SocialPost>()({
    key: (orgId, ask) => domainKey("social", orgId, "post", ask),
    route: {
        path: "/api/social/post",
        params: { id: z.string().min(1).max(100) },
    },
    tier: "records",
});

export type SocialPostAsk = Parameters<typeof socialPostRead.options>[1];

/** The free Share's Your posts: the business's own posts, newest first. */
export const ownPostsRead = defineRead<OwnPost[]>()({
    key: (orgId) => domainKey("social", orgId, "own"),
    route: { path: "/api/social/own-posts", params: {} },
    tier: "records",
});

/** The free Share's What's worth posting: the rows to pick from, and what couldn't be read. */
export interface SocialPicks {
    rows: PickRow[];
    /** "products", "blog posts": said once beside what could be read. */
    failed: string[];
}

export const socialPicksRead = defineRead<SocialPicks>()({
    key: (orgId) => domainKey("social", orgId, "picks"),
    route: { path: "/api/social/picks", params: {} },
    tier: "records",
});

const one = (v: string | string[] | null | undefined) =>
    typeof v === "string" && v !== "" ? v : null;

/** Where Social is, from its address: one function for the page and the screen. */
export function socialParams(
    q: Record<string, string | string[] | undefined>,
): SocialParams {
    return {
        tab: one(q.tab) === "channels" ? "channels" : "posts",
        channel: one(q.channel),
        result: one(q.result),
        choice: one(q.choice),
        post: one(q.post),
    };
}
