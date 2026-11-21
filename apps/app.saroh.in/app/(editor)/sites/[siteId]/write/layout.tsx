import type { ReactNode } from "react";

import { PostFrame } from "@/components/sites/posts/editor/post-frame";

/**
 * The post editor's frame (the bar, the rail, the list, the right column)
 * as a layout, so it stays mounted from post to post: a layout keeps its
 * state and doesn't render again on navigation (Next's "partial
 * rendering"). Only the page under it, the post, is read again, and its
 * `loading.tsx` greys the writing surface alone. It reads nothing itself:
 * the frame is drawn from the post it holds, and the site's list stays
 * from the last one (docs/patterns/frontend-data-and-state.md).
 */
export default function WriteLayout({ children }: { children: ReactNode }) {
    return <PostFrame>{children}</PostFrame>;
}
