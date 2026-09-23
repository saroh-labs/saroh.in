"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import type { MobileSheetGroup, MobileSheetRow } from "@/lib/nav/mobile-nav";

/**
 * "Everything else": the More tab's bottom sheet (the "Saroh Tab Bar"
 * design).
 *
 * Every section the actor reaches, with all of its pages — including a
 * seated section's, since its tab can only open one of them — then the rows
 * that belong to no section, under Workspace. What the bar does not hold is
 * here, so the phone reaches exactly what the rail does.
 *
 * A modal dialog: focus goes to Close when it opens (not the first row, so a
 * screen reader starts at the top of the sheet), Tab stays inside it, Escape
 * closes it, and focus returns to More on the way out. Radix's dialog gives
 * the trap, the Escape and the return; the rest is set here.
 */
export function TabBarSheet({
    groups,
    note,
    trigger,
}: {
    groups: MobileSheetGroup[];
    note: string;
    /** The More tab, drawn by the bar; told whether the sheet is open. */
    trigger: (open: boolean) => React.ReactElement;
}) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);

    return (
        <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>{trigger(open)}</Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        // The app's scrim: Ink at 45%, as every sheet's.
                        "fixed inset-0 z-50 bg-[hsl(var(--shadow-color)/0.45)]",
                        "duration-base ease-out data-[state=closed]:duration-fast data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    )}
                />
                <Dialog.Content
                    aria-modal="true"
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        event.preventDefault();
                        closeRef.current?.focus();
                    }}
                    className={cn(
                        "fixed inset-x-0 bottom-0 z-50 max-h-[76%] overflow-y-auto overscroll-contain rounded-t-2xl bg-card text-card-foreground outline-none",
                        "shadow-[0_-8px_30px_hsl(var(--shadow-color)/0.24)]",
                        "ease-out data-[state=closed]:duration-base data-[state=open]:duration-slow data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
                    )}
                >
                    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-[18px] pb-2.5 pt-3.5">
                        <Dialog.Title className="flex-1 font-display text-[17px] font-semibold tracking-[-0.02em]">
                            Everything else
                        </Dialog.Title>
                        <Dialog.Close
                            ref={closeRef}
                            aria-label="Close"
                            className="grid size-[34px] shrink-0 place-items-center rounded-[9px] border-0 bg-muted text-foreground/75 transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card coarse:size-11"
                        >
                            <X aria-hidden className="size-4" strokeWidth={2} />
                        </Dialog.Close>
                    </div>
                    <div className="px-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2">
                        {groups.map((group) => (
                            <SheetGroup
                                key={group.label}
                                group={group}
                                onGo={() => setOpen(false)}
                            />
                        ))}
                        <p className="text-pretty px-2.5 pt-3 text-[11.5px] leading-[1.5] text-muted-foreground">
                            {note}
                        </p>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function SheetGroup({
    group,
    onGo,
}: {
    group: MobileSheetGroup;
    onGo: () => void;
}) {
    const headingId = useId();
    return (
        <div role="group" aria-labelledby={headingId}>
            <p
                id={headingId}
                className="px-2.5 pb-[5px] pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
            >
                {group.label}
            </p>
            {group.rows.map((row) => (
                <SheetRow key={row.key} row={row} onGo={onGo} />
            ))}
        </div>
    );
}

function SheetRow({ row, onGo }: { row: MobileSheetRow; onGo: () => void }) {
    const Icon = row.icon;
    return (
        <Link
            href={row.href}
            onClick={onGo}
            aria-current={row.current ? "page" : undefined}
            className={cn(
                "flex min-h-[46px] w-full items-center gap-[11px] rounded-[9px] p-2.5 text-left text-[13.5px] transition-colors duration-fast hover:bg-muted/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                row.current
                    ? "bg-muted/50 font-semibold text-foreground"
                    : "font-medium text-foreground/75",
            )}
        >
            <Icon
                aria-hidden
                className="size-[19px] shrink-0"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.count > 0 ? (
                // The rail's waiting count: a Saffron-tinted pill.
                <span
                    aria-label={`${row.count} waiting`}
                    className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle px-1.5 text-[11px] font-semibold tabular-nums text-brand-subtle-foreground"
                >
                    {row.count}
                </span>
            ) : null}
        </Link>
    );
}
