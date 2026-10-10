"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";

import type { SiteNavigationItem, SitePage } from "@/lib/sites/service";

/**
 * The menu, open for editing (#206): its entries in order, each renamable,
 * movable and removable, then the pages not in it yet. Hidden pages are
 * not offered: an entry for one is the dead link the pre-publish check
 * flags.
 */
export function MenuEditor({
    menu,
    setMenu,
    pages,
}: {
    menu: SiteNavigationItem[];
    setMenu: (next: (m: SiteNavigationItem[]) => SiteNavigationItem[]) => void;
    pages: SitePage[];
}) {
    const pagesById = new Map(pages.map((p) => [p.id, p]));
    const inMenu = new Set(menu.map((m) => m.pageId));
    const offered = pages.filter((p) => !inMenu.has(p.id) && !p.hidden);

    const move = (i: number, d: -1 | 1) =>
        setMenu((m) => {
            const j = i + d;
            if (j < 0 || j >= m.length) return m;
            const next = [...m];
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });

    const rename = (i: number, label: string) =>
        setMenu((m) =>
            m.map((x, j) =>
                j === i
                    ? {
                          pageId: x.pageId,
                          ...(label.trim() ? { label } : {}),
                      }
                    : x,
            ),
        );

    return (
        <div className="grid gap-3">
            {menu.length ? (
                <ol className="grid gap-1.5">
                    {menu.map((item, i) => {
                        const page = pagesById.get(item.pageId);
                        const title = page?.title ?? "page";
                        return (
                            <li
                                key={item.pageId}
                                className="flex items-center gap-1.5"
                            >
                                <Input
                                    value={item.label ?? ""}
                                    placeholder={page?.title ?? "Page"}
                                    aria-label={`Menu label for ${title}`}
                                    className="h-9 min-w-0 flex-1"
                                    onChange={(e) => rename(i, e.target.value)}
                                />
                                <span className="hidden shrink-0 font-mono text-[11px] text-muted-foreground sm:inline">
                                    {page?.path}
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0"
                                    aria-label={`Move ${title} up`}
                                    disabled={i === 0}
                                    onClick={() => move(i, -1)}
                                >
                                    <ArrowUp aria-hidden className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0"
                                    aria-label={`Move ${title} down`}
                                    disabled={i === menu.length - 1}
                                    onClick={() => move(i, 1)}
                                >
                                    <ArrowDown aria-hidden className="size-4" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0"
                                    aria-label={`Remove ${title} from the menu`}
                                    onClick={() =>
                                        setMenu((m) =>
                                            m.filter((_, j) => j !== i),
                                        )
                                    }
                                >
                                    <X aria-hidden className="size-4" />
                                </Button>
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="text-sm text-muted-foreground">
                    No pages in the menu yet.
                </p>
            )}
            {offered.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {offered.map((p) => (
                        <Button
                            key={p.id}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                setMenu((m) => [...m, { pageId: p.id }])
                            }
                        >
                            <Plus aria-hidden className="size-3.5" />
                            {p.title}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
