"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

/**
 * A panel over the page when the editor is not wide (G4): the inspector
 * beside the page when narrow; on a phone every sheet, from the foot
 * (DEC-185). Saroh Site Editor.dc.html draws it below the top bar, over a
 * scrim that covers only the page, which is why it is portalled into the
 * editor's body and not the document's.
 *
 * A modal dialog, as the other sheets in the app are (`tab-bar-sheet.tsx`):
 * focus goes into it when it opens, Tab stays inside it, Escape and the
 * scrim close it, and focus goes back to what it was about on the way out.
 * A tapped block's settings on a phone are the exception (`modal={false}`):
 * no scrim, so the block's toolbar above the sheet stays in reach.
 *
 * From the foot it opens to about half the height, the page in view above,
 * and its grip pulls it up (or down, and away).
 */
export function EditorSheet({
    open,
    onClose,
    container,
    side,
    title,
    closeLabel,
    returnFocus,
    actions,
    modal = true,
    className,
    children,
}: {
    open: boolean;
    onClose: () => void;
    /** The editor's body, below the top bar; null until it has mounted. */
    container: HTMLElement | null;
    /** Beside the page when narrow; from the foot, in thumb's reach, on a phone. */
    side: "right" | "bottom";
    /** The sheet's name, for assistive tech; written in a bottom sheet's head. */
    title: string;
    closeLabel: string;
    /** Where focus goes when it closes: the thing it was about. */
    returnFocus?: () => HTMLElement | null;
    /** Beside a bottom sheet's close: "Saved", a ⋯ menu. */
    actions?: ReactNode;
    /** False: no scrim, and the page stays in reach (a block's settings). */
    modal?: boolean;
    className?: string;
    children: ReactNode;
}) {
    const bottom = side === "bottom";
    const [tall, setTall] = useState(false);
    const drag = useRef<number | null>(null);
    // Each opening starts at half height.
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (open) setTall(false);
    }

    const close = (
        <Dialog.Close
            aria-label={closeLabel}
            className={cn(
                "flex items-center gap-[7px] rounded text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                bottom
                    ? "size-11 shrink-0 justify-center"
                    : "pb-2.5 pt-0.5 text-xs font-semibold coarse:min-h-11",
            )}
        >
            <X aria-hidden className={bottom ? "size-5" : "size-3.5"} />
            {bottom ? null : "Close"}
        </Dialog.Close>
    );

    return (
        <Dialog.Root
            open={open && container !== null}
            modal={modal}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <Dialog.Portal container={container}>
                {modal ? (
                    <Dialog.Overlay
                        data-editor-scrim=""
                        className={cn(
                            // The design's scrim: Ink at 28%, over the page only.
                            "absolute inset-0 z-40 bg-[hsl(var(--shadow-color)/0.28)]",
                            "duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                        )}
                    />
                ) : null}
                <Dialog.Content
                    aria-modal={modal ? "true" : undefined}
                    aria-describedby={undefined}
                    data-editor-sheet={title}
                    onInteractOutside={(event) => {
                        const target = event.target as Element | null;
                        // A toast is not "outside": its Undo is pressed while
                        // the sheet that caused it is still open; nor is the
                        // page under a sheet with no scrim, where the block's
                        // toolbar and the next block are tapped.
                        if (
                            !modal ||
                            target?.closest("[data-sonner-toaster]")
                        ) {
                            event.preventDefault();
                        }
                    }}
                    onCloseAutoFocus={(event) => {
                        const target = returnFocus?.() ?? null;
                        if (target === null) return;
                        event.preventDefault();
                        target.focus();
                    }}
                    className={cn(
                        "absolute z-50 flex flex-col bg-background text-foreground outline-none",
                        "ease-out data-[state=closed]:duration-base data-[state=open]:duration-slow data-[state=open]:animate-in data-[state=closed]:animate-out",
                        bottom
                            ? cn(
                                  "inset-x-0 bottom-0 rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_hsl(var(--shadow-color)/0.24)] transition-[height] duration-base data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom motion-reduce:transition-none",
                                  tall ? "h-[92%]" : "h-[55%]",
                              )
                            : // 300px, never more than 88% of a small window.
                              "inset-y-0 right-0 w-[300px] max-w-[88%] border-l shadow-[-8px_0_24px_hsl(var(--shadow-color)/0.12)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
                        className,
                    )}
                >
                    {bottom ? (
                        <div
                            className="shrink-0 touch-none"
                            // The grip pulls the sheet up, or down and away.
                            onPointerDown={(e) => {
                                if ((e.target as Element).closest("button"))
                                    return;
                                drag.current = e.clientY;
                            }}
                            onPointerUp={(e) => {
                                const from = drag.current;
                                drag.current = null;
                                if (from === null) return;
                                const dy = e.clientY - from;
                                if (dy < -24) setTall(true);
                                else if (dy > 24) {
                                    if (tall) setTall(false);
                                    else onClose();
                                }
                            }}
                        >
                            <button
                                type="button"
                                aria-label={
                                    tall
                                        ? "Make the sheet smaller"
                                        : "Make the sheet taller"
                                }
                                // A grip for the thumb; the keyboard starts on
                                // Close, and the sheet scrolls either way.
                                tabIndex={-1}
                                onClick={() => setTall(!tall)}
                                className="mx-auto flex h-5 w-16 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span
                                    aria-hidden
                                    className="h-1 w-9 rounded-full bg-border"
                                />
                            </button>
                            <div className="flex items-center gap-1 pb-1 pl-4 pr-1.5">
                                <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
                                    {title}
                                </Dialog.Title>
                                {actions}
                                {close}
                            </div>
                        </div>
                    ) : (
                        <>
                            <Dialog.Title className="sr-only">
                                {title}
                            </Dialog.Title>
                            <div className="flex shrink-0 px-4 pt-3">
                                {close}
                            </div>
                        </>
                    )}
                    <div className="flex min-h-0 flex-1 flex-col">
                        {children}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
