"use client";

import type { ReactNode } from "react";

import type { PostEditorModel } from "../editor/post-model";

/**
 * Publish post (U15 stub; U18 fills it as `blogdesk/WXWPublish` draws it:
 * Now or Later, the checks, the changes since the live copy, Tell people,
 * and the plan refusal in the sheet). Until then the button does what
 * today's Publish does: it saves what is on screen and puts it live now.
 *
 * `open` runs on Publish post and on the status chip; `node` is drawn once
 * by the shell (the sheet, when there is one).
 */
export function usePublishPost(model: PostEditorModel): {
    open: () => void;
    node: ReactNode;
} {
    return {
        open: () => {
            if (model.needsTitle()) return;
            void model.draft.publish();
        },
        node: null,
    };
}
