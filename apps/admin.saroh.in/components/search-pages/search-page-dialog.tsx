"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { searchPageAction } from "@/lib/search-page-actions";
import type { PageAction, PageRow } from "@/lib/search-page-words";
import {
    dialogWords,
    linkedFromWords,
    linkWords,
    publishLinks,
    refusalWords,
    successWords,
} from "@/lib/search-page-words";

export interface SearchPageDialogProps {
    action: PageAction;
    /** The pages it acts on: those the action can be done to. */
    pages: PageRow[];
    /** Every page in the code (all kinds): what the pages link to, and what links to them (U12). */
    rows?: PageRow[];
    /** How many of the picked pages were left out, as the action can't be done to them. */
    skipped?: number;
    site: string;
    reviewSite: string;
    /** Checks that didn't pass (one page). */
    checks?: number;
    /** List the pages in the dialog (the list's dialog does; a page's own doesn't). */
    showPages?: boolean;
    onOpenChange: (open: boolean) => void;
    onDone?: () => void;
}

/**
 * The confirm for every search page action (DEC-193): what happens, and
 * for Publish "I've read … on <review site>" before the button works. The
 * API takes no reason, so none is asked; it records who and when.
 */
export function SearchPageDialog({
    action,
    pages: picked,
    rows = picked,
    skipped = 0,
    site,
    reviewSite,
    checks = 0,
    showPages = true,
    onOpenChange,
    onDone,
}: SearchPageDialogProps) {
    const id = useId();
    const router = useRouter();
    const [read, setRead] = useState(false);
    // Pages added by "Publish these too": the linked pages that aren't live yet.
    const [added, setAdded] = useState<PageRow[]>([]);
    const pages = [...picked, ...added];
    const words = dialogWords(action, pages, site, reviewSite, checks);
    const links = action === "publish" ? publishLinks(pages, rows) : null;
    const linkNote = links ? linkWords(links, pages) : null;
    const linkedFrom =
        action === "unpublish" || action === "archive"
            ? linkedFromWords(pages, rows)
            : null;

    return (
        <OperatorDialog
            open
            onOpenChange={onOpenChange}
            title={words.title}
            reasonRequired={false}
            destructive={words.destructive}
            submitLabel={words.confirm}
            ready={(!words.tick || read) && !linkNote}
            effect={
                <div className="grid gap-1.5">
                    <p className="font-medium text-foreground">What happens</p>
                    <ul className="grid list-disc gap-1 pl-5">
                        {words.points.map((point) => (
                            <li key={point}>{point}</li>
                        ))}
                    </ul>
                </div>
            }
            fields={
                <div className="grid gap-3">
                    {linkNote && links && (
                        <Notice
                            tone={links.blocking.length ? "error" : "warning"}
                            title={linkNote.title}
                            action={
                                linkNote.button && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setAdded((was) => [
                                                ...was,
                                                ...links.add,
                                            ]);
                                            // They're read before they're published, like the rest.
                                            setRead(false);
                                        }}
                                    >
                                        {linkNote.button}
                                    </Button>
                                )
                            }
                        >
                            <ul className="grid list-disc gap-1 pl-5">
                                {linkNote.lines.map((line) => (
                                    <li key={line}>{line}</li>
                                ))}
                            </ul>
                        </Notice>
                    )}
                    {linkedFrom && <Notice tone="warning">{linkedFrom}</Notice>}
                    {(showPages || added.length > 0) && (
                        <ul
                            aria-label="Pages"
                            className="max-h-56 overflow-y-auto rounded-md border"
                        >
                            {pages.map((page) => (
                                <li
                                    key={page.path}
                                    className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
                                >
                                    <span className="flex-1 font-medium">
                                        {page.name}
                                    </span>
                                    <code className="font-mono text-xs text-muted-foreground">
                                        {page.path}
                                    </code>
                                </li>
                            ))}
                        </ul>
                    )}
                    {skipped > 0 && (
                        <p className="text-sm text-warning-subtle-foreground">
                            {skipped} of the pages you picked{" "}
                            {skipped === 1 ? "isn't" : "aren't"} in a state for
                            this, so {skipped === 1 ? "it's" : "they're"} left
                            out.
                        </p>
                    )}
                    {words.tick && (
                        <div className="flex min-h-11 items-center gap-2.5 rounded-md bg-muted px-3">
                            <Checkbox
                                id={`${id}-read`}
                                checked={read}
                                onCheckedChange={(v) => setRead(v === true)}
                            />
                            <Label htmlFor={`${id}-read`}>{words.tick}</Label>
                        </div>
                    )}
                </div>
            }
            onSubmit={async () => {
                const paths = pages.map((p) => p.path);
                const result = await searchPageAction(action, paths);
                if (!result.ok) {
                    const refused = (
                        result.details as { paths?: unknown } | undefined
                    )?.paths;
                    if (result.status === 409 && Array.isArray(refused)) {
                        return {
                            ok: false,
                            error: refusalWords(
                                action,
                                refused.filter(
                                    (p): p is string => typeof p === "string",
                                ),
                                pages,
                            ),
                        };
                    }
                    return { ok: false, error: result.error };
                }
                const said = successWords(action, paths.length, site);
                showSuccess(said.title, said.description);
                router.refresh();
                onDone?.();
                return { ok: true };
            }}
        />
    );
}
