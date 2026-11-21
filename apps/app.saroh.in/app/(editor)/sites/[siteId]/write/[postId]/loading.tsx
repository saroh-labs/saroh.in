import { PostLoading } from "@/components/sites/posts/editor/post-frame";

/**
 * `blogdesk/WXWStates` "Loading": only the writing surface greys. The bar,
 * rail, list and right column are `write/layout.tsx`'s and stay; their post
 * parts grey themselves until the post is here.
 */
export default function Loading() {
    // A fetch that failed is said here, the frame kept (`PostLoading`).
    return <PostLoading />;
}
