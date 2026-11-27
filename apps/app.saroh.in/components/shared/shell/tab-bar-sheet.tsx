"use client";

import { IntentLink } from "@saroh/ui/intent-link";
import { cn } from "@saroh/ui/lib/utils";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTitle,
    SheetTrigger,
} from "@saroh/ui/sheet";
import { X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { NavGroupToggle } from "@/components/shared/navigation/nav-group-toggle";
import type { MobileSheetGroup, MobileSheetRow } from "@/lib/nav/mobile-nav";
import { useNavFolds } from "@/lib/nav/nav-folds";
import { CountBadge } from "@saroh/ui/count-badge";

/**
 * "Everything else": the More tab's bottom sheet (the "Saroh Tab Bar"
 * design).
 *
 * The rail's groups, in the rail's order and under its headings, each with
 * the rows the bar has no seat for (DEC-263). What the bar does not hold is
 * here, so the phone reaches exactly what the rail does.
 *
 * A modal dialog: focus goes to Close when it opens (not the first row, so a
 * screen reader starts at the top of the sheet), Tab stays inside it, Escape
 * closes it, and focus returns to More on the way out. Radix's dialog gives
 * the trap, the Escape and the return through the shared sheet
 * (`@saroh/ui/sheet`, DEC-195); its size and Close are set here.
 *
 * Its groups fold as the rail's do, from the same per-person state
 * (DEC-279): fold Online on the desk and it is folded here too.
 */
export function TabBarSheet({
    groups,
    note,
    trigger,
    userId = "",
}: {
    /** Whose menu: the folds are this person's (DEC-279). */
    userId?: string;
    groups: MobileSheetGroup[];
    note: string;
    /** The More tab, drawn by the bar; told whether the sheet is open. */
    trigger: (open: boolean) => React.ReactElement;
}) {
    const [open, setOpen] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);
    const folds = useNavFolds(
        userId,
        groups.find((group) => group.rows.some((row) => row.current))?.label ??
            null,
    );

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>{trigger(open)}</SheetTrigger>
            <SheetContent
                side="bottom"
                // Close is in the sheet's own header row (the board's).
                closeButton={false}
                // The rest of the navigation: Saroh's own words, which
                // a session recording may read.
                data-ph-unmask=""
                aria-describedby={undefined}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    closeRef.current?.focus();
                }}
                // The design's sheet on the shared one: 76% tall at most and
                // scrolling as one, no edge or padding (the head pads itself).
                className="max-h-[76%] overflow-y-auto overscroll-contain rounded-t-2xl border-t-0 p-0 shadow-[0_-8px_30px_hsl(var(--shadow-color)/0.24)] outline-none"
            >
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-[18px] pb-2.5 pt-3.5">
                    <SheetTitle className="flex-1 font-display text-[17px] font-semibold tracking-[-0.02em]">
                        Everything else
                    </SheetTitle>
                    <SheetClose
                        ref={closeRef}
                        aria-label="Close"
                        className="grid size-[34px] shrink-0 place-items-center rounded-[9px] border-0 bg-muted text-foreground/75 transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card coarse:size-11"
                    >
                        <X aria-hidden className="size-4" />
                    </SheetClose>
                </div>
                <div className="px-2.5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2">
                    {groups.map((group) => (
                        <SheetGroup
                            key={group.label}
                            group={group}
                            open={folds.isOpen(group.label)}
                            onToggle={() => folds.toggle(group.label)}
                            onGo={() => setOpen(false)}
                        />
                    ))}
                    <p className="text-pretty px-2.5 pt-3 text-[11.5px] leading-[1.5] text-muted-foreground">
                        {note}
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function SheetGroup({
    group,
    open,
    onToggle,
    onGo,
}: {
    group: MobileSheetGroup;
    open: boolean;
    onToggle: () => void;
    onGo: () => void;
}) {
    const id = useId();
    return (
        <div role="group" aria-labelledby={`${id}-label`}>
            {/* The whole label row is the 44px tap target; chevron trailing. */}
            <div id={`${id}-label`}>
                <NavGroupToggle
                    label={group.label}
                    open={open}
                    controls={`${id}-rows`}
                    rows={group.rows.length}
                    waiting={group.rows.reduce((sum, r) => sum + r.count, 0)}
                    onToggle={onToggle}
                    className="min-h-11 px-2.5 pb-[5px] pt-3 focus-visible:ring-offset-card"
                />
            </div>
            {/* `hidden`: a folded group's rows are neither focused nor read. */}
            <div id={`${id}-rows`} hidden={!open}>
                {group.rows.map((row) => (
                    <SheetRow key={row.key} row={row} onGo={onGo} />
                ))}
            </div>
        </div>
    );
}

function SheetRow({ row, onGo }: { row: MobileSheetRow; onGo: () => void }) {
    const Icon = row.icon;
    return (
        <IntentLink
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
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.count > 0 ? (
                // The rail's waiting count: a Saffron-tinted pill.
                <CountBadge
                    count={row.count}
                    tone="strong"
                    aria-label={`${row.count} waiting`}
                    className="shrink-0"
                />
            ) : null}
        </IntentLink>
    );
}
