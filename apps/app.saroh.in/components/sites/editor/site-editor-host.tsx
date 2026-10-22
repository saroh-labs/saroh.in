"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { SiteEditorProps } from "@/components/sites/editor/site-editor-props";
import type { EditorSheet } from "@/components/sites/editor/use-editor-layout";
import { SiteEditor } from "./site-editor";

/**
 * The editor, started afresh when its draft was changed on the server by
 * something other than its own saves: "Use this look with its starter
 * content" and its Undo (DEC-182) replace pages, the menu and the look at
 * once. The editor's state is seeded from its props, so new props alone
 * would leave it drawing the old draft.
 *
 * `reloadDraft` reads the page again (`router.refresh`, or the page asked
 * for) and, when the server's new props arrive, remounts the editor on
 * them. Until then the editor stays as it was, never a blank in between.
 * The sheet open when it was asked (a phone's Brand) is open on the new one.
 */
export function SiteEditorHost(props: SiteEditorProps) {
    const router = useRouter();
    const [generation, setGeneration] = useState(0);
    const [awaiting, setAwaiting] = useState(false);
    const [sheet, setSheet] = useState<EditorSheet>(null);
    // The props the editor was last started on. The server's re-render
    // hands new ones; this component's own updates keep the same object.
    const [seen, setSeen] = useState(props);
    if (seen !== props) {
        setSeen(props);
        if (awaiting) {
            setAwaiting(false);
            setGeneration((n) => n + 1);
        }
    }

    const reloadDraft = (pageId?: string, open?: EditorSheet) => {
        setAwaiting(true);
        setSheet(open ?? null);
        if (pageId && pageId !== props.pageId) {
            router.push(`/sites/${props.siteId}?page=${pageId}`);
        } else {
            router.refresh();
        }
    };

    return (
        <SiteEditor
            key={generation}
            {...props}
            reloadDraft={reloadDraft}
            initialSheet={sheet}
        />
    );
}
