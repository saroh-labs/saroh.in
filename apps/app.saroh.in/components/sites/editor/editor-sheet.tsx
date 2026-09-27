"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A panel over the page when the editor is narrow (G4): the inspector, or on a
 * phone the rail. Saroh Site Editor.dc.html draws it below the top bar, over
 * a scrim that covers only the page, so it reads as a panel laid on the page
 * rather than as clipped layout — which is why it is portalled into the
 * editor's body and not the document's.
 *
 * A modal dialog, as the other sheets in the app are (`tab-bar-sheet.tsx`):
 * focus goes to Close when it opens, Tab stays inside it, Escape and the scrim
 * close it, and focus goes back to what it was about on the way out.
 */
export function EditorSheet({
    open,
    onClose,
    container,
    side,
    title,
    closeLabel,
    returnFocus,
    className,
    children,
}: {
    open: boolean;
    onClose: () => void;
    /** The editor's body, below the top bar; null until it has mounted. */
    container: HTMLElement | null;
    /** Beside the page when narrow; from the foot, in thumb's reach, on a phone. */
    side: "right" | "bottom";
    /** The sheet's name for assistive tech. */
    title: string;
    closeLabel: string;
    /** Where focus goes when it closes: the thing it was about. */
    returnFocus?: () => HTMLElement | null;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Dialog.Root
            open={open && container !== null}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <Dialog.Portal container={container}>
                <Dialog.Overlay
                    data-editor-scrim=""
                    className={cn(
                        // The design's scrim: Ink at 28%, over the page only.
                        "absolute inset-0 z-40 bg-[hsl(var(--shadow-color)/0.28)]",
                        "duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    )}
                />
                <Dialog.Content
                    aria-modal="true"
                    aria-describedby={undefined}
                    // A toast is not "outside": its Undo is pressed while the
                    // sheet that caused it is still open (`@saroh/ui/sheet`).
                    onInteractOutside={(event) => {
                        const target = event.target as Element | null;
                        if (target?.closest("[data-sonner-toaster]")) {
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
                        side === "right"
                            ? // 300px, never more than 88% of a small window.
                              "inset-y-0 right-0 w-[300px] max-w-[88%] border-l shadow-[-8px_0_24px_hsl(var(--shadow-color)/0.12)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
                            : "inset-x-0 bottom-0 max-h-[85%] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_hsl(var(--shadow-color)/0.24)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                        className,
                    )}
                >
                    <Dialog.Title className="sr-only">{title}</Dialog.Title>
                    <div className="flex shrink-0 px-4 pt-3">
                        <Dialog.Close
                            aria-label={closeLabel}
                            className="flex items-center gap-[7px] rounded pb-2.5 pt-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
                        >
                            <X
                                aria-hidden
                                className="size-3.5"
                                strokeWidth={2}
                            />
                            Close
                        </Dialog.Close>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col">
                        {children}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
