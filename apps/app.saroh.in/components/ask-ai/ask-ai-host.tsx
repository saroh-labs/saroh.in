"use client";

import type { AskAiState } from "@saroh/api-contract";
import { Sheet, SheetContent, SheetDescription } from "@saroh/ui/sheet";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";

import { AskAiPanel } from "./ask-ai-panel";
import { OPEN_ASK_AI, onAskPage, sayAskAiShown } from "./open";

/**
 * Where Ask AI's panel lives (plan 2026-11-13-001 U10): one host in the
 * shell, opened by the top bar's button or ⌘J (⌘K stays Search), closed by
 * Esc. On a desk it is a panel at the right over whatever screen is open,
 * so nobody loses their place; below 760px it is a full-screen sheet. What
 * was asked stays while the panel is closed and opened again.
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
    const desk = useSyncExternalStore(
        subscribe,
        () => window.matchMedia(DESK).matches,
        () => true,
    );
    const [open, setOpen] = useState(false);
    // Mounted on first open, then kept, so the conversation survives a close.
    const [seen, setSeen] = useState(false);
    const box = useRef<HTMLTextAreaElement>(null);
    const aside = useRef<HTMLElement>(null);
    const back = useRef<HTMLElement | null>(null);

    const show = useCallback((next: boolean) => {
        if (next) {
            back.current = document.activeElement as HTMLElement | null;
            setSeen(true);
        }
        setOpen(next);
    }, []);

    useEffect(() => {
        const onOpen = () => show(true);
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "j" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (onAskPage()) return;
                setOpen((o) => {
                    if (!o) {
                        back.current =
                            document.activeElement as HTMLElement | null;
                        setSeen(true);
                    }
                    return !o;
                });
            }
        };
        window.addEventListener(OPEN_ASK_AI, onOpen);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener(OPEN_ASK_AI, onOpen);
            document.removeEventListener("keydown", onKey);
        };
    }, [show]);

    useEffect(() => {
        sayAskAiShown(open);
        if (open) {
            // The box, or the panel itself when it has none (locked, off),
            // so Esc reaches it.
            requestAnimationFrame(() =>
                (box.current ?? aside.current)?.focus(),
            );
        } else if (back.current?.isConnected) {
            back.current.focus();
            back.current = null;
        }
    }, [open]);

    if (!seen) return null;
    const panel = (
        <AskAiPanel
            state={state}
            businessName={businessName}
            zone={zone}
            phone={!desk}
            boxRef={box}
            onClose={() => show(false)}
        />
    );

    if (!desk) {
        return (
            <Sheet open={open} onOpenChange={show}>
                <SheetContent
                    side="bottom"
                    closeButton={false}
                    onOpenAutoFocus={(e) => {
                        if (!box.current) return;
                        e.preventDefault();
                        box.current.focus();
                    }}
                    className="inset-0 flex h-dvh max-h-none flex-col gap-0 bg-neutral-50 p-0 pt-[env(safe-area-inset-top)] dark:bg-background"
                >
                    <SheetDescription className="sr-only">
                        Ask about the business in plain words.
                    </SheetDescription>
                    {panel}
                </SheetContent>
            </Sheet>
        );
    }
    return (
        <aside
            ref={aside}
            tabIndex={-1}
            aria-label="Ask AI"
            hidden={!open}
            onKeyDown={(e) => {
                if (e.key === "Escape" && !e.defaultPrevented) {
                    e.stopPropagation();
                    show(false);
                }
            }}
            className={`fixed bottom-0 right-0 top-[61px] z-40 ${open ? "flex" : "hidden"} w-[440px] max-w-full flex-col border-l border-border bg-neutral-50 shadow-[-12px_0_32px_rgba(0,0,0,0.10)] outline-none dark:bg-background print:hidden`}
        >
            {panel}
        </aside>
    );
}
