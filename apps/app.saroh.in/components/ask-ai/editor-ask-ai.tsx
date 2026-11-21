"use client";

import type { AskAiState } from "@saroh/api-contract";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { AskAiSheet } from "./ask-ai-host";
import { AskAiPanel } from "./ask-ai-panel";
import type { RightTab } from "./editor-ask-ai-context";
import { EditorAskAiContext } from "./editor-ask-ai-context";
import { OPEN_ASK_AI } from "./open";
import { useAskAi } from "./use-ask-ai";

/**
 * Ask AI in the editors (owner, 21 Nov): one conversation for the editor,
 * held here in the editor layout. At the desk it is a tab of the right
 * column beside the inspector (Edit · Ask AI): an Ask AI button or ⌘J
 * switches to it, the Edit tab goes back, and switching never loses the
 * conversation. Where there is no right column (a phone, a narrow window)
 * it is the shared sheet, on the same conversation. A Reviewer gets none:
 * the layout mounts no provider.
 */

export function EditorAskAiProvider({
    state,
    businessName,
    zone,
    children,
}: {
    state: AskAiState | null;
    businessName: string;
    zone: string;
    children: ReactNode;
}) {
    const [docked, setDocked] = useState(false);
    const [tab, setTab] = useState<RightTab>("edit");
    // Nothing is read until Ask AI is first shown.
    const [seen, setSeen] = useState(false);
    const ai = useAskAi({ state, active: seen || tab === "ask" });

    // Switching to Ask AI puts the cursor in its box, as the sheet did.
    const box = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (tab === "ask") box.current?.focus();
    }, [tab]);

    useEffect(() => {
        if (!docked) return;
        const show = () => setTab("ask");
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setTab((t) => (t === "ask" ? "edit" : "ask"));
            }
        };
        window.addEventListener(OPEN_ASK_AI, show);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener(OPEN_ASK_AI, show);
            document.removeEventListener("keydown", onKey);
        };
    }, [docked]);

    return (
        <EditorAskAiContext.Provider
            value={{
                tab,
                setTab,
                setDocked,
                panel: (
                    <AskAiPanel
                        ai={ai}
                        businessName={businessName}
                        zone={zone}
                        phone={false}
                        boxRef={box}
                    />
                ),
            }}
        >
            {children}
            {docked ? null : (
                <AskAiSheet
                    ai={ai}
                    businessName={businessName}
                    zone={zone}
                    onSeen={() => setSeen(true)}
                />
            )}
        </EditorAskAiContext.Provider>
    );
}
