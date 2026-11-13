import { env } from "@/env";

/**
 * Whether Share as a post and Create post are shown (DEC-217): the Share
 * buttons on products, services, blog posts and the booking page, the
 * Social rail row and `/social/new`. Only when `NEXT_PUBLIC_SHARE_POSTS`
 * is `on`; unset or anything else is off, so a production build that
 * leaves it out shows none of it. Unset counts as on only under
 * `next dev`; `off` there checks the hidden state. It hides; the API's
 * `SHARE_POSTS` keeps it private. Readers: `read.ts` (every Share button),
 * the rail (`navFor`) and the Create post page. Removed with them once it
 * has been on in production for a release.
 */
export function sharePostsOnFor(
    flag: string | undefined,
    nodeEnv: string | undefined,
): boolean {
    if (flag) return flag === "on";
    return nodeEnv === "development";
}

/** {@link sharePostsOnFor} for this build. Client-safe: both are public. */
export function sharePostsOn(): boolean {
    return sharePostsOnFor(env.NEXT_PUBLIC_SHARE_POSTS, env.NODE_ENV);
}
