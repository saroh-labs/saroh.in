import { showError } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import type {
    EditorInspectorTab,
    EditorRailTab,
} from "@/components/sites/editor/use-editor-selection";
import type { Section } from "@/lib/sites/service";

/**
 * Going to what a note or a pre-publish flag is about: a selection on this
 * page, or a navigation to another. Moved out of `site-editor.tsx` unchanged
 * (#260).
 */
export function useEditorJumps({
    siteId,
    pageId,
    dirty,
    sections,
    setRail,
    setSelectedIndex,
    setInspector,
    closeCheck,
}: {
    siteId: string;
    pageId: string;
    dirty: boolean;
    sections: Section[];
    setRail: (next: EditorRailTab) => void;
    setSelectedIndex: (index: number | null) => void;
    setInspector: (next: EditorInspectorTab) => void;
    /** Close the pre-publish check a flag was opened from. */
    closeCheck: () => void;
}) {
    const router = useRouter();

    /**
     * Open the block a note is about. A note names a block by KEY, and only
     * the open page's blocks are loaded — so a note on another page is a
     * navigation first and a selection after it.
     */
    function jumpToNote(jumpPageId: string, sectionKey: string) {
        if (jumpPageId !== pageId) {
            // The same guard the Pages tab puts on opening a page: leaving
            // mid-flight loses whatever autosave has not sent yet.
            if (dirty) {
                showError("Save this page before opening another.");
                return;
            }
            router.push(`/sites/${siteId}?page=${jumpPageId}`);
            return;
        }
        const index = sections.findIndex((sec) => sec.key === sectionKey);
        if (index === -1) return;
        setRail("sections");
        setSelectedIndex(index);
    }

    /**
     * Open what a pre-publish flag is about. A flag on another page needs
     * that page loaded, which is a navigation. One on this page is just a
     * selection — doing it without a round trip keeps the jump instant where
     * it can be.
     */
    function jumpToFlag(
        jumpPageId: string | null,
        sectionIndex: number | null,
    ) {
        closeCheck();
        if (jumpPageId !== null && jumpPageId !== pageId) {
            router.push(`/sites/${siteId}?page=${jumpPageId}`);
            return;
        }
        if (sectionIndex !== null) {
            setRail("sections");
            setSelectedIndex(sectionIndex);
            // The flag is about the block's fields.
            setInspector("block");
        }
    }

    return { jumpToNote, jumpToFlag };
}
