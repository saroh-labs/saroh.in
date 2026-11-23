import { FileText, History, MessageSquare, Plus } from "lucide-react";

import type { TrailTab } from "@/components/sites/editor/shell/editor-trail";

export type PostTrailKey = "posts" | "add" | "history" | "feedback";

/**
 * The post editor’s rail (`blogdesk/WXWWrite`, C3): Post · Add · History ·
 * Feedback; a reader's Post · Feedback. History once U17 builds it. Ask AI
 * left the rail for the right column's tab (owner, 21 Nov).
 */
export function postTrailTabs({
    readOnly,
    history,
    openNotes,
    feedback,
}: {
    readOnly: boolean;
    history: boolean;
    openNotes: number;
    feedback: boolean;
}): TrailTab<PostTrailKey>[] {
    const tabs: (TrailTab<PostTrailKey> | false)[] = [
        { key: "posts", label: "Post", icon: FileText },
        !readOnly && { key: "add", label: "Add", icon: Plus },
        !readOnly &&
            history && {
                key: "history",
                label: "History",
                icon: History,
            },
        feedback && {
            key: "feedback",
            label: "Feedback",
            icon: MessageSquare,
            count: openNotes,
        },
    ];
    return tabs.filter((t): t is TrailTab<PostTrailKey> => t !== false);
}
