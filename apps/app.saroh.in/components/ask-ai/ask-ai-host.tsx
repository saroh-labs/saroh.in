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
}: {
    state: AskAiState | null;
    businessName: string;
    zone: string;
}) {
    // Nothing is read until it is first opened.
    const [seen, setSeen] = useState(false);
    const ai = useAskAi({ state, active: seen });
    return (
        <AskAiSheet
            ai={ai}
            businessName={businessName}
            zone={zone}
            onSeen={() => setSeen(true)}
        />
    );
}

/**
 * The sheet alone, on a conversation held above it: the shell's host, and
 * the editors' on a phone or a narrow window (`EditorAskAiProvider`), whose
 * conversation is also the one docked in the right column at the desk.
 */
export function AskAiSheet({
    ai,
    businessName,
    zone,
    onSeen,
}: {
    ai: ReturnType<typeof useAskAi>;
    businessName: string;
    zone: string;
    onSeen: () => void;
}) {
    const desk = useSyncExternalStore(
        subscribe,
        () => window.matchMedia(DESK).matches,
        () => true,
    );
    const [open, setOpen] = useState(false);
    const seen = useRef(onSeen);
    useEffect(() => {
        seen.current = onSeen;
    });
    const box = useRef<HTMLTextAreaElement>(null);
    const back = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const show = () => {
            back.current ??= document.activeElement as HTMLElement | null;
            seen.current();
            setOpen(true);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (onAskPage()) return;
                seen.current();
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

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
                side={desk ? "right" : "bottom"}
                // Close lives in the panel's header row (board 17).
                closeButton={false}
                data-ask-ai-panel=""
                // Ask AI's own size on the shared sheet: 480 wide at the
                // desk, the whole screen on a phone; the panel pads itself.
                className={
                    desk
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
