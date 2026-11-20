"use client";

import type { PostEditorModel } from "../editor/post-model";

/**
 * Rail › History for a post (U15 stub; U17 fills it as `blogdesk/WXWHistory`
 * draws it from `listPostRevisions`, `getPostRevision` and
 * `restorePostRevision`). The rail shows the tab once this is true.
 */
export const POST_HISTORY_READY = false as boolean;

export function PostHistoryPanel(_props: { model: PostEditorModel }) {
    return null;
}
