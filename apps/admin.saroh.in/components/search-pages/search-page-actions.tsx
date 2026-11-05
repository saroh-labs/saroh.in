"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { PageAction, PageRow } from "@/lib/search-page-words";
import { canDo } from "@/lib/search-page-words";

import type { AnyPageData } from "./page-checks";
import { failingCount, useChecks } from "./page-checks";
import { SearchPageDialog } from "./search-page-dialog";

/** The page's words in the repository (public), on the branch dev builds from. */
const CODE_URL =
    "https://github.com/saroh-labs/saroh.in/blob/development/packages/search-pages/content";

/**
 * A search page's header actions (DEC-193): Read on the development site,
 * then Publish / Unpublish / Restore as its state allows, and ⋯ with Open on
 * the live site (when live, production only), the words in the code,
 * Cancel this change (while one waits to deploy) and Archive. Only `search-pages:publish` sees the writes.
 */
export function SearchPageActions({
    row,
    rows,
    site,
    siteUrl,
    production,
    reviewSite,
    reviewUrl,
    canPublish,
    page,
}: {
    row: PageRow;
    /** Every page, for what this one links to and what links to it (U12). */
    rows?: PageRow[];
    site: string;
    siteUrl: string;
    production: boolean;
    reviewSite: string;
    reviewUrl: string;
    canPublish: boolean;
    /** The page's words, for the checks Publish counts. */
    page: AnyPageData;
}) {
    const [opened, setOpened] = useState<PageAction | null>(null);
    // Run when Publish opens: its confirm says how many checks need you.
    const checks = failingCount(useChecks(page, opened === "publish"));
    const main = (["publish", "unpublish", "restore"] as const).find((a) =>
        canDo(a, row.state),
    );
    // A GST page's, guide's or download's failing checks hold Publish back.
    const held = main === "publish" && row.blocked.length > 0;
    const label = {
        publish: `Publish on ${site}`,
        unpublish: "Unpublish",
        restore: "Restore",
    } as const;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
                <a
                    href={`${reviewUrl}${row.path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    // A draft is readable there, marked Draft: reading it is the step before Publish.
                    title={
                        row.onSite
                            ? undefined
                            : `Opens on ${reviewSite}, marked Draft`
                    }
                >
                    {row.onSite
                        ? `Read on ${reviewSite} ↗`
                        : "Read the draft ↗"}
                </a>
            </Button>
            {canPublish && main && (
                <Button
                    type="button"
                    size="sm"
                    variant={main === "unpublish" ? "outline" : "default"}
                    disabled={held}
                    aria-describedby={held ? "publish-held" : undefined}
                    onClick={() => setOpened(main)}
                >
                    {label[main]}
                </Button>
            )}
            {/* Held: the header's line says why ("Can't publish yet: …", #publish-held), so the actions stay one row. */}
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="More actions"
                    >
                        <MoreHorizontal className="size-4" aria-hidden />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    {production && row.onSite && (
                        <DropdownMenuItem asChild>
                            <a
                                href={`${siteUrl}${row.path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Open on {site} ↗
                            </a>
                        </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                        <a
                            href={`${CODE_URL}/${row.kind}/${row.slug}.mdx`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            See the words in the code ↗
                        </a>
                    </DropdownMenuItem>
                    {canPublish && (
                        <>
                            <DropdownMenuSeparator />
                            {row.pending && (
                                <DropdownMenuItem
                                    onSelect={() => setOpened("cancel")}
                                >
                                    Cancel this change
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="text-destructive"
                                disabled={!canDo("archive", row.state)}
                                onSelect={() => setOpened("archive")}
                            >
                                Archive
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
            {opened && (
                <SearchPageDialog
                    action={opened}
                    pages={[row]}
                    rows={rows}
                    site={site}
                    reviewSite={reviewSite}
                    reviewUrl={reviewUrl}
                    checks={checks}
                    showPages={false}
                    onOpenChange={(next) => {
                        if (!next) setOpened(null);
                    }}
                />
            )}
        </div>
    );
}
