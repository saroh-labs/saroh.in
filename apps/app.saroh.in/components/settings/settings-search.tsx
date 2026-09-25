"use client";

import { cn } from "@saroh/ui/lib/utils";
import {
    Popover,
    PopoverAnchor,
    PopoverContent,
    PopoverTrigger,
} from "@saroh/ui/popover";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import type { SettingsActor } from "@/lib/settings/search";
import { searchSettings } from "@/lib/settings/search";

/**
 * Search settings ("Saroh Settings" design): on the settings screen the top
 * bar's search finds a setting rather than the workspace. A 340px box under
 * the top bar, 16px in from its right edge; type, arrow to a result, Enter
 * to go. A result opens the tab that holds it — for Business, the right one
 * of its four (`?section=tax`).
 *
 * ⌘K is untouched and still opens the command menu from here, which finds
 * the same settings by name (`searchSettings`).
 */
export function SettingsSearch({
    actor,
    className,
}: {
    actor: SettingsActor;
    className?: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const trigger = useRef<HTMLButtonElement>(null);
    const listId = useId();

    const hits = searchSettings(query, actor);
    const hi = Math.min(active, Math.max(0, hits.length - 1));

    // The design's box hangs from the top bar's right edge, not from the
    // button: measured live, so a resize keeps it there.
    const edge = useRef({
        getBoundingClientRect: () => {
            const bar = trigger.current?.closest("header");
            const r = bar?.getBoundingClientRect();
            return DOMRect.fromRect({
                x: (r?.right ?? window.innerWidth) - 16,
                y: r?.bottom ?? 0,
                width: 0,
                height: 0,
            });
        },
    });

    const toggle = (next: boolean) => {
        setOpen(next);
        setQuery("");
        setActive(0);
    };
    const go = (href: string) => {
        toggle(false);
        router.push(href);
    };
    const onKeyDown = (e: React.KeyboardEvent) => {
        const n = Math.max(1, hits.length);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((hi + 1) % n);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((hi - 1 + n) % n);
        } else if (e.key === "Enter" && hits[hi]) {
            e.preventDefault();
            go(hits[hi].href);
        }
        // Escape is the popover's own: it closes and hands focus back.
    };

    return (
        <Popover open={open} onOpenChange={toggle}>
            <PopoverAnchor virtualRef={edge} />
            <PopoverTrigger asChild>
                <button
                    ref={trigger}
                    type="button"
                    aria-label="Search settings"
                    title="Search settings"
                    className={className}
                >
                    <Search className="size-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={0}
                collisionPadding={16}
                aria-label="Search settings"
                onKeyDown={onKeyDown}
                className="w-[340px] max-w-[calc(100vw-32px)] rounded-xl p-2 shadow-[0_8px_24px_rgba(28,28,26,0.16)]"
            >
                <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                    }}
                    placeholder="Find a setting — GSTIN, invoice prefix…"
                    aria-label="Find a setting"
                    role="combobox"
                    aria-expanded
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={
                        hits[hi] ? `${listId}-${hi}` : undefined
                    }
                    className="h-[38px] w-full rounded-lg border border-input bg-card px-[11px] text-[13.5px] text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div
                    id={listId}
                    role="listbox"
                    aria-label="Results"
                    className="mt-1.5 flex max-h-[300px] flex-col gap-px overflow-y-auto"
                >
                    {hits.map((hit, i) => (
                        <button
                            key={hit.href + hit.label}
                            id={`${listId}-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === hi}
                            // Reached by the arrows from the box, not by Tab.
                            tabIndex={-1}
                            onClick={() => go(hit.href)}
                            onMouseMove={() => setActive(i)}
                            className={cn(
                                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-left text-[13.5px] text-foreground transition-colors duration-fast coarse:min-h-11",
                                i === hi ? "bg-muted" : "hover:bg-muted",
                            )}
                        >
                            <span className="min-w-0 flex-1">{hit.label}</span>
                            <span className="shrink-0 text-[11.5px] text-muted-foreground">
                                {hit.where}
                            </span>
                        </button>
                    ))}
                    {hits.length === 0 ? (
                        <p className="p-2.5 text-[13px] text-muted-foreground">
                            Nothing called that in Settings.
                        </p>
                    ) : null}
                </div>
            </PopoverContent>
        </Popover>
    );
}
