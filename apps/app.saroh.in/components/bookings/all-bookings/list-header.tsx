"use client";

import { Button } from "@saroh/ui/button";
import { RadioCards } from "@saroh/ui/choice-group";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import type { ViewId } from "@/lib/services/all-bookings";
import { cancelledWord, VIEWS } from "@/lib/services/all-bookings";

const BUTTON =
    "inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[8px] border border-border bg-card px-3 text-[14px] text-foreground transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-foreground max-[759px]:h-11 max-[759px]:rounded-[10px] max-[759px]:text-[14.5px]";

/**
 * "Showing: Upcoming 2 ▾" (BLHB, variant B): the six views as one picker,
 * each with its count, and a dot on Needs an outcome while it has something
 * to mark (the one view that is a to-do). A popover at a desk, a six-row
 * sheet on a phone.
 */
export function ShowingPicker({
    view,
    counts,
    onChange,
}: {
    view: ViewId;
    counts: Record<ViewId, number>;
    onChange: (view: ViewId) => void;
}) {
    const [open, setOpen] = useState(false);
    const now = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
    return (
        <HeaderOverlay
            open={open}
            onOpenChange={setOpen}
            width={300}
            title="Show"
            subtitle="Pick one view"
            trigger={
                <button
                    type="button"
                    data-showing=""
                    aria-label={`Showing: ${now.label}, ${counts[view]}. Change`}
                    className={BUTTON}
                >
                    <span data-ph-unmask="" className="text-muted-foreground">
                        Showing:
                    </span>
                    <span className="font-semibold">{now.label}</span>
                    <span className="tabular-nums opacity-70">
                        {counts[view]}
                    </span>
                    <ChevronDown aria-hidden className="size-4" />
                </button>
            }
        >
            <RadioCards
                label="Show"
                value={view}
                onChange={(v) => {
                    onChange(v);
                    setOpen(false);
                }}
                options={VIEWS.map((v) => ({
                    value: v.id,
                    label: (
                        <span className="inline-flex items-center gap-1.5">
                            {v.label}
                            {v.id === "outcome" && counts.outcome > 0 ? (
                                <span
                                    aria-hidden
                                    className="size-1.5 rounded-full bg-warning"
                                />
                            ) : null}
                        </span>
                    ),
                    aside: (
                        <span className="tabular-nums text-muted-foreground">
                            {counts[v.id]}
                        </span>
                    ),
                }))}
                className="gap-1"
            />
        </HeaderOverlay>
    );
}

/**
 * Search as an icon that opens the same field in its place ("/" still
 * focuses it), with a close that clears it. The term is the list's: it
 * stays on while the field is shut, so the narrowing line can name it.
 */
export function SearchToggle({
    term,
    onSearch,
    fieldKey,
}: {
    term: string;
    onSearch: (term: string) => void;
    fieldKey: number;
}) {
    const [open, setOpen] = useState(term !== "");
    const input = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (open) {
            input.current?.focus();
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target;
            if (
                t instanceof HTMLElement &&
                (t.isContentEditable ||
                    /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
            ) {
                return;
            }
            if (document.querySelector('[role="dialog"]')) return;
            e.preventDefault();
            setOpen(true);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open]);

    if (!open) {
        return (
            <button
                type="button"
                aria-label="Search bookings"
                data-search-open=""
                onClick={() => setOpen(true)}
                className={cn(
                    BUTTON,
                    "w-[38px] justify-center px-0 max-[759px]:w-11",
                )}
            >
                <Search aria-hidden className="size-4" />
            </button>
        );
    }
    return (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 min-[760px]:flex-none">
            <ListSearch
                key={fieldKey}
                ref={input}
                shortcut={false}
                defaultValue={term}
                placeholder="Search bookings"
                describe="By name, phone or service"
                onSearch={onSearch}
            />
            <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                    onSearch("");
                    setOpen(false);
                }}
                className="grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-[8px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:size-11"
            >
                <X aria-hidden className="size-4" />
            </button>
        </div>
    );
}

/** One narrowing, as a removable pill: "With: Demo Owner ×". */
export function NarrowPill({
    children,
    onRemove,
}: {
    children: string;
    onRemove: () => void;
}) {
    return (
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-muted pl-2.5 pr-1 text-[13px] font-medium text-foreground max-[759px]:h-8">
            {children}
            <button
                type="button"
                aria-label={`Remove ${children}`}
                onClick={onRemove}
                className="grid size-5 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:size-7"
            >
                <X aria-hidden className="size-3.5" />
            </button>
        </span>
    );
}

/** "2 cancelled · Show": a day's cancelled bookings, folded under it. */
export function FoldLine({
    count,
    open,
    onToggle,
}: {
    count: number;
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <li
            data-fold=""
            className="flex min-h-10 items-center gap-2 border-b border-border px-[14px] text-[13px] text-muted-foreground last:border-b-0 max-[759px]:min-h-11"
        >
            {cancelledWord(count)}
            <span aria-hidden>·</span>
            <Button
                type="button"
                variant="link"
                size="inline"
                aria-expanded={open}
                onClick={onToggle}
                className="font-semibold text-foreground max-[759px]:min-h-11"
            >
                {open ? "Hide" : "Show"}
            </Button>
        </li>
    );
}
