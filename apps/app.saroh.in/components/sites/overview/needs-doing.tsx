import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import { ListTable } from "@saroh/ui/list-table";
import Link from "next/link";

import type { SiteOverview } from "@/lib/sites/service";

import type { NeedsDoingItem } from "./overview-words";
import { needsDoingItems } from "./overview-words";

/**
 * Where an item is fixed: a page's Google text and share photo in its page
 * settings on Pages with Needs fixing on (U5 opens the sheet from
 * `?page=`, and the list behind it is the pages to fix), a link in the
 * editor on that page.
 */
export function fixHref(siteId: string, item: NeedsDoingItem): string {
    return item.issue === "brokenLink"
        ? `/sites/${siteId}?page=${item.pageId}`
        : `/sites/${siteId}/pages?view=fix&page=${item.pageId}`;
}

/**
 * What needs doing (WXHOverview): at most three, one per kind of problem,
 * each naming its pages and, for someone who may edit, the button that
 * fixes it. A reviewer reads the list with no buttons (DEC-200).
 */
export function NeedsDoing({
    siteId,
    pages,
    canEdit,
}: {
    siteId: string;
    pages: SiteOverview["needsDoing"];
    canEdit: boolean;
}) {
    const items = needsDoingItems(pages);
    return (
        <section
            aria-labelledby="ov-todo"
            className="flex min-w-0 flex-col gap-3"
        >
            <div className="flex items-baseline gap-2">
                <h2 id="ov-todo" className="text-base font-semibold">
                    What needs doing
                </h2>
                {items.length > 0 ? (
                    <span className="text-sm text-muted-foreground">
                        {items.length}
                    </span>
                ) : null}
            </div>
            {items.length === 0 ? (
                <EmptyState
                    size="inline"
                    title="Nothing to fix"
                    description="Every page has text for Google, a share photo and working links."
                />
            ) : (
                <ListTable>
                    <ul className="divide-y divide-border">
                        {items.map((item) => (
                            <li
                                key={item.issue}
                                data-needs-doing={item.issue}
                                className="flex min-h-[60px] items-center gap-3 px-4 py-2.5"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold">
                                        {item.title}
                                    </span>
                                    <span className="block text-sm text-muted-foreground">
                                        {item.line}
                                    </span>
                                </span>
                                {canEdit ? (
                                    <Button
                                        asChild
                                        size="sm"
                                        variant="outline"
                                        className="shrink-0 coarse:h-11"
                                    >
                                        <Link href={fixHref(siteId, item)}>
                                            {item.action}
                                        </Link>
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </ListTable>
            )}
        </section>
    );
}
