"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";

/**
 * The phone Home's bottom sheet (DEC-171, plan U17, boards `HPSheets`,
 * `HPMore`): a group's rows with their own inline actions, the day, or
 * setup, opened from the line that stands for it. Not a form: what is done
 * inside it is done row by row, with each row's own confirm, hold and Undo,
 * so there is no Save, only Close. The New sheet (`new-sheet.tsx`) is the
 * same frame.
 *
 * A modal dialog: focus goes to Close on opening, Tab stays inside, Escape
 * and the scrim close it, and focus goes back to the line that opened it.
 * Its body scrolls under a fixed head and foot; it is never taller than
 * 85% of the screen.
 */
export function HomeSheet({
    open,
    onOpenChange,
    trigger,
    eyebrow,
    title,
    foot,
    children,
    name,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The line or button that opens it, focused again on the way out. */
    trigger: ReactElement;
    /** The small line over the title: "Needs you". */
    eyebrow?: string;
    title: string;
    /** The sheet's own buttons, pinned under the rows. */
    foot?: ReactNode;
    children: ReactNode;
    /** `data-home-sheet`, for a test. */
    name: string;
}) {
    const closeRef = useRef<HTMLButtonElement>(null);
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        // The app's scrim, as every sheet's.
                        "fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.45)]",
                        "duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    )}
                />
                <Dialog.Content
                    aria-modal="true"
                    aria-describedby={undefined}
                    data-home-sheet={name}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        closeRef.current?.focus();
                    }}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-50 flex max-h-[85%] flex-col overflow-hidden rounded-t-[18px] bg-card px-4 pt-2 text-card-foreground outline-none",
                        "shadow-[0_-10px_32px_hsl(var(--shadow-color)/0.2)]",
                        "ease-out data-[state=closed]:duration-base data-[state=open]:duration-slow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                    )}
                >
                    <span
                        aria-hidden
                        className="mb-2 h-1 w-10 shrink-0 self-center rounded-sm bg-border"
                    />
                    <div className="flex shrink-0 items-center justify-between gap-3 pb-2">
                        <div className="grid min-w-0 gap-0.5">
                            {eyebrow ? (
                                <p data-ph-unmask="" className="label">
                                    {eyebrow}
                                </p>
                            ) : null}
                            {/* A group's title holds its money and counts:
                                the business's, so it stays masked. */}
                            <Dialog.Title className="text-balance font-display text-lg font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
                                {title}
                            </Dialog.Title>
                        </div>
                        <Dialog.Close
                            ref={closeRef}
                            aria-label="Close"
                            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-foreground/80 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:bg-accent-active"
                        >
                            <X aria-hidden className="size-[18px]" />
                        </Dialog.Close>
                    </div>
                    <div
                        className={cn(
                            "-mx-4 grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto overscroll-contain px-4",
                            foot
                                ? "pb-3"
                                : "pb-[calc(16px+env(safe-area-inset-bottom))]",
                        )}
                    >
                        {children}
                    </div>
                    {foot ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
                            {foot}
                        </div>
                    ) : null}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
