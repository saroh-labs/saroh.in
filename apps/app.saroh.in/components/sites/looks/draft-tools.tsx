"use client";

import type { LookId } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { useState } from "react";

import { viewerTimeZone } from "@/lib/format/datetime";
import { useNarrow } from "@/lib/hooks/use-narrow";
import {
    FILL_DETAILS_LABEL,
    ROLLBACK_CONFIRM,
    versionSectionName,
    versionTitle,
    versionWhen,
} from "@/lib/sites/starter-content";
import type { StarterContentActions } from "./starter-content-actions";
import { useDraftVersions } from "./use-draft-versions";

/**
 * Under the looks (DEC-182, amended 22 Oct 2026): "Bring in my details",
 * which fills a starter's sample words with the business's own at any
 * time, and Previous versions, the draft as it was before each starter
 * copy, fill, roll back or section brought in, to roll back to or bring a
 * section in from. Both wait while the editor has unsaved changes.
 */
export function DraftTools({
    starter,
    lookName,
}: {
    starter: StarterContentActions;
    lookName: (look: LookId | null) => string;
}) {
    const [filling, setFilling] = useState(false);
    const [open, setOpen] = useState(false);
    const narrow = useNarrow();
    const versions = useDraftVersions(starter, () => setOpen(false));
    const blocked = starter.blocked !== null;

    async function fill() {
        setFilling(true);
        try {
            await starter.fillDetails();
        } finally {
            setFilling(false);
        }
    }

    return (
        <div className="space-y-1.5" data-draft-tools="">
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={blocked}
                    busy={filling}
                    busyLabel="Bringing in…"
                    data-fill-details=""
                    onClick={() => void fill()}
                >
                    {FILL_DETAILS_LABEL}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-draft-versions-open=""
                    onClick={() => {
                        setOpen(true);
                        void versions.load();
                    }}
                >
                    Previous versions
                </Button>
            </div>
            {starter.blocked ? (
                <p role="status" className="text-xs text-muted-foreground">
                    {starter.blocked}
                </p>
            ) : null}
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                    side={narrow ? "bottom" : "right"}
                    className="flex max-h-dvh flex-col gap-0 p-0 sm:max-w-md"
                    data-draft-versions=""
                >
                    <div className="space-y-1 border-b px-4 py-3 pr-14">
                        <SheetTitle className="text-base">
                            Previous versions
                        </SheetTitle>
                        <SheetDescription className="text-xs">
                            Your draft before each change, kept for as long as
                            the site is. Nothing goes live until you publish.
                        </SheetDescription>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                        <VersionList
                            versions={versions}
                            blocked={starter.blocked}
                            lookName={lookName}
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

function VersionList({
    versions,
    blocked,
    lookName,
}: {
    versions: ReturnType<typeof useDraftVersions>;
    blocked: string | null;
    lookName: (look: LookId | null) => string;
}) {
    const { read } = versions;
    if (read === null) {
        return (
            <p role="status" className="text-sm text-muted-foreground">
                Reading your previous versions…
            </p>
        );
    }
    if (!read.ok) {
        return (
            <p role="alert" className="text-sm text-destructive">
                {read.error}
            </p>
        );
    }
    if (read.versions.length === 0) {
        return (
            <EmptyState
                size="inline"
                title="No previous versions yet"
                description="One is kept each time starter content or your details change the draft."
            />
        );
    }
    const zone = viewerTimeZone();
    return (
        <div className="space-y-3">
            <ul className="space-y-3">
                {read.versions.map((v) => (
                    <li
                        key={v.id}
                        className="space-y-2 rounded border p-3"
                        data-draft-version={v.reason}
                    >
                        <div className="space-y-0.5">
                            <p className="text-sm font-medium">
                                {versionTitle(v, lookName(v.look))}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {versionWhen(v, zone)}
                            </p>
                        </div>
                        {versions.confirming === v.id ? (
                            <div className="space-y-2" data-rollback-confirm="">
                                <p className="text-xs">{ROLLBACK_CONFIRM}</p>
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={blocked !== null}
                                        busy={versions.busy}
                                        busyLabel="Rolling back…"
                                        onClick={() =>
                                            void versions.rollback(v.id)
                                        }
                                    >
                                        Roll back to this version
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={versions.busy}
                                        onClick={() =>
                                            versions.askRollback(null)
                                        }
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={blocked !== null}
                                    data-rollback-open=""
                                    onClick={() => versions.askRollback(v.id)}
                                >
                                    Roll back
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    aria-expanded={versions.showing === v.id}
                                    data-bring-in-open=""
                                    onClick={() =>
                                        versions.toggleSections(v.id)
                                    }
                                >
                                    Bring in a section
                                </Button>
                            </div>
                        )}
                        {versions.showing === v.id ? (
                            <div className="space-y-2">
                                {v.pages.map((page) => (
                                    <div
                                        key={page.pageId}
                                        className="space-y-1"
                                    >
                                        <p className="label">
                                            {page.title ??
                                                "A page removed since"}
                                        </p>
                                        {page.sections.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">
                                                It was empty.
                                            </p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {page.sections.map(
                                                    (section) => (
                                                        <li
                                                            key={section.key}
                                                            className="flex items-center gap-2"
                                                        >
                                                            <span className="min-w-0 flex-1 truncate text-sm">
                                                                {versionSectionName(
                                                                    section,
                                                                )}
                                                            </span>
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="outline"
                                                                disabled={
                                                                    blocked !==
                                                                        null ||
                                                                    versions.busy
                                                                }
                                                                data-bring-in-section={
                                                                    section.key
                                                                }
                                                                aria-label={`Bring in ${versionSectionName(section)}`}
                                                                onClick={() =>
                                                                    void versions.bringIn(
                                                                        v.id,
                                                                        page.pageId,
                                                                        section.key,
                                                                    )
                                                                }
                                                            >
                                                                Bring in
                                                            </Button>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
            {versions.error ? (
                <p role="alert" className="text-xs text-destructive">
                    {versions.error}
                </p>
            ) : null}
        </div>
    );
}
