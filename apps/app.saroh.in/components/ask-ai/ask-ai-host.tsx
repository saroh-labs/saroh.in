"use client";

import type { AskAiState } from "@saroh/api-contract";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { AskAiPanel } from "./ask-ai-panel";
import { OPEN_ASK_AI, onAskPage, sayAskAiShown } from "./open";
import { useAskAi } from "./use-ask-ai";

/**
 * Where Ask AI's panel lives (plan 2026-11-13-001 U10): one host in the
 * shell, opened by the top bar's button or ⌘J (⌘K stays Search), closed by
 * Esc. It is the shared sheet, as it comes (DEC-195): from the right on a
 * desk, from the foot below 760px; the sheet traps focus and closes on Esc.
 * With no `SheetTrigger` (the button and ⌘J open it by event) Radix gives
 * focus back to nothing, so the host returns it to the opener. The host
 * holds the conversation
 * (`useAskAi`), so what was asked stays while the sheet is closed.
 */

const DESK = "(min-width: 760px)";

function subscribe(onChange: () => void) {
    const query = window.matchMedia(DESK);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
}

export function AskAiHost({
    state,
    businessName,
    zone,
    persistent = false,
}: {
    state: AskAiState | null;
    businessName: string;
    zone: string;
    /**
     * In the editors (owner, 21 Nov 2026): at the desk the panel stays open
     * beside the page while the merchant keeps editing. No overlay, no focus
     * trap, a click on the page or Esc in the page doesn't close it; its own
     * Close and ⌘J do. On a phone it stays the full-screen sheet.
     */
    persistent?: boolean;
}) {
    const desk = useSyncExternalStore(
        subscribe,
        () => window.matchMedia(DESK).matches,
        () => true,
    );
    const [open, setOpen] = useState(false);
    // Nothing is read until it is first opened.
    const [seen, setSeen] = useState(false);
    const ai = useAskAi({ state, active: seen });
    const box = useRef<HTMLTextAreaElement>(null);
    const back = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const show = () => {
            back.current ??= document.activeElement as HTMLElement | null;
            setSeen(true);
            setOpen(true);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (onAskPage()) return;
                setSeen(true);
                setOpen((o) => {
                    if (!o) {
                        back.current =
                            document.activeElement as HTMLElement | null;
                    }
                    return !o;
                });
            }
        };
        window.addEventListener(OPEN_ASK_AI, show);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener(OPEN_ASK_AI, show);
            document.removeEventListener("keydown", onKey);
        };
    }, []);

    useEffect(() => {
        sayAskAiShown(open);
    }, [open]);

    const beside = persistent && desk;
    // Esc or a click outside the panel belongs to the page being edited.
    const keepOpen = (e: Event) => {
        if (beside) e.preventDefault();
    };

    return (
        <Sheet open={open} onOpenChange={setOpen} modal={!beside}>
            <SheetContent
                side={desk ? "right" : "bottom"}
                // Close lives in the panel's header row (board 17).
                closeButton={false}
                overlay={!beside}
                onInteractOutside={keepOpen}
                onEscapeKeyDown={(e) => {
                    const inPanel = (e.target as Element | null)?.closest(
                        "[data-ask-ai-panel]",
                    );
                    if (!inPanel) keepOpen(e);
                }}
                data-ask-ai-panel=""
                // Ask AI's own size on the shared sheet: 480 wide at the
                // desk, the whole screen on a phone; the panel pads itself.
                // Beside the editor it takes the inspector's place (400), with
                // a shadow instead of an overlay to say it sits over the page.
                className={
                    beside
                        ? // Under the editor's top bar (60px), so Publish
                          // and the status chip stay in reach while it's open.
                          "bottom-0 top-[60px] h-auto w-full gap-0 bg-neutral-50 px-4 pb-4 pt-0 shadow-xl dark:bg-background sm:max-w-[400px]"
                        : desk
                          ? "w-full gap-0 bg-neutral-50 px-4 pb-4 pt-0 dark:bg-background sm:max-w-[480px]"
                          : "h-dvh max-h-none gap-0 rounded-none border-t-0 bg-neutral-50 px-4 pb-3 pt-[env(safe-area-inset-top)] dark:bg-background"
                }
                // The question box, when there is one (locked and off have none).
                onOpenAutoFocus={(e) => {
                    if (!box.current) return;
                    e.preventDefault();
                    box.current.focus();
                }}
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    if (back.current?.isConnected) back.current.focus();
                    back.current = null;
                }}
            >
                <SheetTitle className="sr-only">Ask AI</SheetTitle>
                <SheetDescription className="sr-only">
                    Ask about the business in plain words.
                </SheetDescription>
                <div className="flex h-full min-h-0 flex-col">
                    <AskAiPanel
                        ai={ai}
                        businessName={businessName}
                        zone={zone}
                        phone={!desk}
                        boxRef={box}
                        onClose={() => setOpen(false)}
                    />
                </div>
            </SheetContent>
        </Sheet>
    );
}
