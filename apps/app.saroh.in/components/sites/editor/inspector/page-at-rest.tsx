"use client";

import { Button } from "@saroh/ui/button";
import { ChevronRight } from "lucide-react";

import { PrePublishChecks } from "@/components/sites/publish/pre-publish-checks";
import { SaveFooter } from "@/components/sites/shell/save-footer";
import type { Flag, SitePage } from "@/lib/sites/service";

import { useEditorReadOnly } from "../read-only";
import { PageResultsLine } from "./page-results-line";

/** The Page settings card's rows (`fix/WXKRest`): what the sheet holds. */
export function pageSettingsRows(
    page: SitePage,
    address: string | null,
): { label: string; value: string }[] {
    return [
        { label: "Title", value: page.title },
        { label: "Page link", value: `${address ?? ""}${page.path}` },
        {
            label: "Search description",
            value: page.seoDescription?.trim()
                ? page.seoDescription
                : "Not written yet",
        },
        {
            label: "Share image",
            value: page.shareImageUrl ? "This page's own" : "The site's",
        },
        {
            label: "In the menu",
            value: page.inMenu === false ? "Not in the menu" : "In the menu",
        },
        {
            label: "Who can see it",
            value: page.hidden
                ? "Hidden · comes off the site when you publish"
                : "Public · anyone with the link",
        },
    ];
}

/**
 * The inspector with nothing selected (U47, `fix/WXKRest`): the page's
 * results this week, the checks before publishing on this page with each
 * fix in place, and its settings as a card that opens Page settings (the
 * same sheet as Website › Pages). A reader sees the results and settings,
 * not the fixes.
 */
export function PageAtRest({
    siteId,
    page,
    pages,
    address,
    flags,
    onShowFlag,
    onFlagsChanged,
    onOpenSettings,
}: {
    siteId: string;
    page: SitePage;
    pages: SitePage[];
    address: string | null;
    /** The site's flags; the checks read this page's. */
    flags: Flag[];
    onShowFlag: (flag: Flag) => void;
    onFlagsChanged: () => void;
    onOpenSettings: () => void;
}) {
    const readOnly = useEditorReadOnly();
    const rows = pageSettingsRows(page, address);
    return (
        <div data-page-at-rest="" className="grid gap-5">
            <PageResultsLine siteId={siteId} path={page.path} />
            {readOnly ? null : (
                <PrePublishChecks
                    siteId={siteId}
                    flags={flags.filter((f) => f.pageId === page.id)}
                    pages={pages}
                    onShow={onShowFlag}
                    onChanged={onFlagsChanged}
                />
            )}
            <section
                aria-labelledby="page-settings-card"
                className="grid gap-2"
            >
                <h3 id="page-settings-card" className="text-sm font-semibold">
                    Page settings
                </h3>
                <ul className="grid divide-y rounded-lg border bg-card">
                    {rows.map((row) => {
                        const body = (
                            <>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs text-muted-foreground">
                                        {row.label}
                                    </span>
                                    <span
                                        data-ph-mask=""
                                        className="block text-sm [overflow-wrap:anywhere]"
                                    >
                                        {row.value}
                                    </span>
                                </span>
                                {readOnly ? null : (
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                )}
                            </>
                        );
                        return (
                            <li key={row.label}>
                                {readOnly ? (
                                    <div className="flex items-center gap-2 px-3 py-2">
                                        {body}
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={onOpenSettings}
                                        className="h-auto min-h-11 w-full justify-start gap-2 whitespace-normal rounded-none px-3 py-2 text-left font-normal"
                                    >
                                        {body}
                                    </Button>
                                )}
                            </li>
                        );
                    })}
                </ul>
                {readOnly ? null : (
                    <p className="text-xs text-muted-foreground">
                        Opens Page settings, the same one as Website › Pages.
                    </p>
                )}
            </section>
            {readOnly ? null : <SaveFooter>{null}</SaveFooter>}
        </div>
    );
}
