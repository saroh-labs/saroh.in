"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { Panel } from "@/components/panel";
import { formatDateTime } from "@/lib/format";
import { deploySearchPages } from "@/lib/search-page-actions";
import type { PageRow } from "@/lib/search-page-words";
import {
    deployedWords,
    deployWords,
    PENDING_LABEL,
} from "@/lib/search-page-words";

import { DEPLOY_BAR_ID } from "./deploy-bar-anchor";
import { useRebuildPoll } from "./rebuild-banner";
import { SearchPageDialog } from "./search-page-dialog";

/**
 * "N changes waiting to deploy" (R13, owner 31 Oct): every page published
 * or taken off since the last deploy, each with Cancel this change, and
 * Deploy changes, which rebuilds the site once with all of them. While a
 * rebuild waits or runs, the bar says so (the list's only rebuild message)
 * and the button waits. Staff without `search-pages:publish` see the list
 * and who deploys it, never the buttons; with nothing waiting they see no
 * bar.
 */
export function DeployBar({
    rows,
    allRows = rows,
    site,
    reviewSite = site,
    rebuilding,
    rebuild,
    canPublish,
}: {
    /** Pages whose staged status the site doesn't have yet. */
    rows: PageRow[];
    /** Every page, for the cancel confirm. */
    allRows?: PageRow[];
    site: string;
    reviewSite?: string;
    rebuilding: boolean;
    /** When it started, what it carries, and Deployments for staff who can open it. */
    rebuild?: { startedAt?: string; words: string; deploymentsHref?: string };
    canPublish: boolean;
}) {
    const router = useRouter();
    const [cancelling, setCancelling] = useState<PageRow | null>(null);
    useRebuildPoll(rebuilding);
    if (rows.length === 0 && !canPublish) return null;
    // Nothing waiting and nothing building: one quiet line, so the list starts sooner.
    if (rows.length === 0 && !rebuilding)
        return (
            <section
                id={DEPLOY_BAR_ID}
                tabIndex={-1}
                aria-label="Deploy changes"
                className="flex scroll-mt-20 items-center gap-3 rounded-xl border bg-card py-1.5 pl-4 pr-1.5 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <span>No changes waiting to deploy</span>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled
                >
                    Deploy changes
                </Button>
            </section>
        );
    const words = deployWords(rows, site);
    const list = (
        <ul aria-label="Changes waiting" className="grid">
            {rows.map((row) => (
                <li
                    key={row.path}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                >
                    <span className="min-w-0 flex-1 font-medium">
                        {row.name}
                    </span>
                    <code className="font-mono text-xs text-muted-foreground">
                        {row.path}
                    </code>
                    {row.pending && (
                        <Badge variant="warning">
                            {PENDING_LABEL[row.pending]}
                        </Badge>
                    )}
                    {canPublish && (
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={`Cancel this change to ${row.name}`}
                            onClick={() => setCancelling(row)}
                        >
                            Cancel change
                        </Button>
                    )}
                </li>
            ))}
        </ul>
    );
    const description = rebuilding ? (
        <>
            {site} is rebuilding
            {rebuild?.startedAt
                ? ` · started ${formatDateTime(rebuild.startedAt)}`
                : ""}
            . {rebuild?.words ? `${rebuild.words} ` : ""}You can deploy again
            once it&apos;s done.
            {rebuild?.deploymentsHref && (
                <>
                    {" "}
                    <Link
                        href={rebuild.deploymentsHref}
                        className="whitespace-nowrap font-medium underline underline-offset-2"
                    >
                        See it in Deployments →
                    </Link>
                </>
            )}
        </>
    ) : rows.length === 0 ? undefined : canPublish ? (
        `Published and taken-off pages reach ${site} only when you deploy. One rebuild carries them all.`
    ) : (
        `They reach ${site} when they're deployed. A Platform owner deploys these.`
    );

    return (
        <section
            id={DEPLOY_BAR_ID}
            tabIndex={-1}
            aria-label="Deploy changes"
            // Nothing waiting: the Panel's empty body is dropped, one line is left (audit F8).
            className="scroll-mt-20 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div>div:last-child:empty]:hidden"
        >
            <Panel
                title={words.title}
                description={description}
                actions={
                    canPublish ? (
                        <OperatorDialog
                            trigger="Deploy changes"
                            triggerVariant="default"
                            disabled={rows.length === 0 || rebuilding}
                            disabledReason={
                                rebuilding
                                    ? `${site} is rebuilding`
                                    : "Nothing is waiting to deploy"
                            }
                            title={words.dialogTitle}
                            reasonRequired={false}
                            submitLabel="Deploy changes"
                            effect={
                                <div className="grid gap-1.5">
                                    <p className="font-medium text-foreground">
                                        What happens
                                    </p>
                                    <ul className="grid list-disc gap-1 pl-5">
                                        {words.points.map((point) => (
                                            <li key={point}>{point}</li>
                                        ))}
                                    </ul>
                                </div>
                            }
                            fields={
                                <div className="max-h-56 overflow-y-auto rounded-md border px-3">
                                    <ul
                                        aria-label="Changes to deploy"
                                        className="grid"
                                    >
                                        {rows.map((row) => (
                                            <li
                                                key={row.path}
                                                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                                            >
                                                <span className="min-w-0 flex-1 font-medium">
                                                    {row.name}
                                                </span>
                                                <code className="font-mono text-xs text-muted-foreground">
                                                    {row.path}
                                                </code>
                                                {row.pending && (
                                                    <Badge variant="warning">
                                                        {
                                                            PENDING_LABEL[
                                                                row.pending
                                                            ]
                                                        }
                                                    </Badge>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            }
                            onSubmit={async () => {
                                const result = await deploySearchPages();
                                if (!result.ok) {
                                    return { ok: false, error: result.error };
                                }
                                const said = deployedWords(
                                    result.data.paths.length,
                                    result.data.rebuildQueued,
                                    site,
                                );
                                showSuccess(said.title, said.description);
                                router.refresh();
                                return { ok: true };
                            }}
                        />
                    ) : undefined
                }
            >
                {() => (rows.length > 0 ? list : null)}
            </Panel>
            {cancelling && (
                <SearchPageDialog
                    action="cancel"
                    pages={[cancelling]}
                    rows={allRows}
                    site={site}
                    reviewSite={reviewSite}
                    onOpenChange={(next) => {
                        if (!next) setCancelling(null);
                    }}
                />
            )}
        </section>
    );
}
