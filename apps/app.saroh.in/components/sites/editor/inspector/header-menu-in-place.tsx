"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { Input } from "@saroh/ui/input";
import { GripVertical, Plus } from "lucide-react";
import { useState } from "react";

import type { SiteNavigationItem, SitePage } from "@/lib/sites/service";

/** The entry dragged from `from` dropped before `to`'s place. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    if (from === to || from < 0 || from >= list.length) return [...list];
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
    return next;
}

/**
 * The menu edited in place on the selected header (H1, `fix/WXMGlobal`):
 * its entries as chips on the header itself, dragged to reorder and typed
 * in to rename, then "+ Add" for a page not in it. The Header panel keeps
 * the same menu with move and remove buttons, the keyboard's way.
 */
export function HeaderMenuInPlace({
    menu,
    setMenu,
    pages,
}: {
    menu: SiteNavigationItem[];
    setMenu: (next: (m: SiteNavigationItem[]) => SiteNavigationItem[]) => void;
    pages: SitePage[];
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const inMenu = new Set(menu.map((m) => m.pageId));
    const offered = pages.filter((p) => !inMenu.has(p.id) && !p.hidden);

    const rename = (i: number, label: string) =>
        setMenu((m) =>
            m.map((x, j) =>
                j === i
                    ? { pageId: x.pageId, ...(label.trim() ? { label } : {}) }
                    : x,
            ),
        );

    return (
        <div
            data-header-menu-in-place=""
            // Its own clicks: the header under it must not take them.
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 top-full z-20 flex flex-col items-center gap-2 px-4 pt-2 font-sans"
        >
            <ol
                aria-label="Menu"
                className="flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5 text-card-foreground shadow-md"
            >
                {menu.map((item, i) => {
                    const title = byId.get(item.pageId)?.title ?? "Page";
                    const name = item.label ?? title;
                    return (
                        <li
                            key={item.pageId}
                            draggable
                            data-menu-chip={item.pageId}
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = "move";
                                setDragging(i);
                            }}
                            onDragOver={(e) => {
                                if (dragging === null) return;
                                e.preventDefault();
                                setOver(i);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                if (dragging !== null) {
                                    const from = dragging;
                                    setMenu((m) => moveItem(m, from, i));
                                }
                                setDragging(null);
                                setOver(null);
                            }}
                            onDragEnd={() => {
                                setDragging(null);
                                setOver(null);
                            }}
                            className={`flex h-8 items-center gap-1 rounded-md pl-1 pr-1.5 ${
                                dragging === i
                                    ? "opacity-50"
                                    : over === i && dragging !== null
                                      ? "outline-dashed outline-1 outline-foreground"
                                      : ""
                            }`}
                        >
                            <GripVertical
                                aria-hidden
                                className="size-3.5 shrink-0 cursor-grab text-muted-foreground"
                            />
                            <Input
                                data-ph-mask=""
                                value={item.label ?? ""}
                                placeholder={title}
                                aria-label={`Menu label for ${title}`}
                                // Sized to its words, as the header draws them.
                                size={Math.max(4, name.length)}
                                onChange={(e) => rename(i, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                        e.currentTarget.blur();
                                }}
                                className="h-7 w-auto min-w-0 rounded border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-foreground focus-visible:bg-background"
                            />
                        </li>
                    );
                })}
                {offered.length ? (
                    <li>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 border-dashed px-2 text-xs"
                                >
                                    <Plus aria-hidden className="size-3.5" />
                                    Add
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {offered.map((p) => (
                                    <DropdownMenuItem
                                        key={p.id}
                                        data-ph-mask=""
                                        onSelect={() =>
                                            setMenu((m) => [
                                                ...m,
                                                { pageId: p.id },
                                            ])
                                        }
                                    >
                                        {p.title}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </li>
                ) : null}
            </ol>
            {menu.length ? (
                <p className="flex h-8 items-center gap-2 rounded-lg border bg-card px-3 text-xs font-medium text-card-foreground shadow-md">
                    <GripVertical aria-hidden className="size-3.5" />
                    Drag to reorder · type to rename
                    <kbd className="rounded border px-1 font-sans text-[11px]">
                        ↵
                    </kbd>
                    to finish
                </p>
            ) : null}
        </div>
    );
}
