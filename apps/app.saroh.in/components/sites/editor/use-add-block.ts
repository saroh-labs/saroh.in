import type { RefObject } from "react";
import { useState } from "react";

import type { EditorInspectorTab } from "@/components/sites/editor/use-editor-selection";
import type { SectionType } from "@/lib/sites/service";

/**
 * Adding a block: the rail's Add block tab, choosing a look first (#267), the
 * full picker, and what happens once a block goes in (#337). Moved out of
 * `site-editor.tsx` unchanged (#260).
 */
export function useAddBlock({
    insertSection,
    setSelectedIndex,
    setInspector,
    canvasRef,
}: {
    /** Puts the block in the draft and says where it went. */
    insertSection: (type: SectionType, variant?: string) => number;
    setSelectedIndex: (index: number | null) => void;
    setInspector: (next: EditorInspectorTab) => void;
    canvasRef: RefObject<HTMLDivElement | null>;
}) {
    /** The rail shows the Add block tab instead of this page's blocks (#337). */
    const [adding, setAdding] = useState(false);
    /** The block whose look is being chosen before it is added (#267). */
    const [lookFor, setLookFor] = useState<SectionType | null>(null);
    /** The full picker, every block drawn with previews (#267). */
    const [browsing, setBrowsing] = useState(false);

    /**
     * Add a block after the selected one (or at the end), select it, and
     * bring it into view (#337).
     */
    function addSection(type: SectionType, variant?: string) {
        const at = insertSection(type, variant);
        setSelectedIndex(at);
        setAdding(false);
        setInspector("block");
        // After the render that draws it.
        requestAnimationFrame(() => {
            canvasRef.current
                ?.querySelector(`[data-block-index="${at}"]`)
                ?.scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }

    return {
        adding,
        setAdding,
        lookFor,
        setLookFor,
        browsing,
        setBrowsing,
        addSection,
    };
}
