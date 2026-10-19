"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import type { HomeNew } from "@/components/shared/quick-actions";

import { NEW_ROW, NewRowBody } from "./new-menu";

/**
 * Home's New on a phone (DEC-171, plan U5; boards `HPMore` "New, owner"
 * and "New, Member", `HPHome`): the + floating over the tab bar's right
 * end, on Home only, opening a bottom sheet with the same rows as the
 * desk's menu and the same role line.
 *
 * A modal dialog, as the More sheet is: focus goes to Close on opening,
 * Tab stays inside, Escape and the scrim close it, and focus returns to
 * the + on the way out. Each row is 54px, past the 44px a thumb needs.
 * With nothing to offer, neither the + nor the sheet is drawn.
 */
export function NewSheet({ items, roleLine }: HomeNew) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);
    if (items.length === 0) return null;

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            {/* The + leaves room under the page's last line, so it never
                sits on something the merchant needs to press. */}
            <div aria-hidden className="h-[72px] desk:hidden" />
            <Dialog.Trigger asChild>
                <button
                    type="button"
                    aria-label="New"
                    className={cn(
                        // The board's 56px rounded square, 16px in from the
                        // edge and above the tab bar (`--tab-bar-inset`).
                        "fixed bottom-[calc(var(--tab-bar-inset)+16px)] right-4 z-30 grid size-14 cursor-pointer place-items-center rounded-[18px] border-0 bg-primary text-primary-foreground",
                        "shadow-[0_8px_24px_hsl(var(--shadow-color)/0.28)] transition-colors duration-fast hover:bg-primary-hover active:bg-primary-active",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        "desk:hidden print:hidden",
                    )}
                >
                    <Plus aria-hidden className="size-6" />
                </button>
            </Dialog.Trigger>
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
                    data-ph-unmask=""
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        closeRef.current?.focus();
                    }}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-50 flex max-h-[76%] flex-col overflow-hidden rounded-t-[18px] bg-card px-4 pt-2 text-card-foreground outline-none",
                        "shadow-[0_-10px_32px_hsl(var(--shadow-color)/0.2)]",
                        "ease-out data-[state=closed]:duration-base data-[state=open]:duration-slow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                    )}
                >
                    <span
                        aria-hidden
                        className="mb-2 h-1 w-10 shrink-0 self-center rounded-sm bg-border"
                    />
                    <div className="flex items-center justify-between pb-2">
                        <Dialog.Title className="font-display text-lg font-semibold tracking-[-0.02em]">
                            New
                        </Dialog.Title>
                        <Dialog.Close
                            ref={closeRef}
                            aria-label="Close"
                            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-foreground/80 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card active:bg-accent-active coarse:size-11"
                        >
                            <X aria-hidden className="size-[18px]" />
                        </Dialog.Close>
                    </div>
                    <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto overscroll-contain pb-[calc(12px+env(safe-area-inset-bottom))]">
                        <ul className="grid gap-0.5">
                            {items.map((item) => (
                                <li key={item.key}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            NEW_ROW,
                                            "flex w-full items-center text-left transition-colors duration-fast hover:bg-muted active:bg-accent-active",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                                        )}
                                    >
                                        <NewRowBody item={item} />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {roleLine ? (
                            <p className="text-pretty px-2.5 text-xs leading-[1.45] text-muted-foreground">
                                {roleLine}
                            </p>
                        ) : null}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
