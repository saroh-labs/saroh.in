"use client";

import { EmptyState } from "@saroh/ui/empty-state";
import { FailedRead } from "@saroh/ui/failed-read";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Columns2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { DraftPreview } from "@/components/sites/canvas/section-preview";
import { PastVersionPreview } from "@/components/sites/versions/past-version-preview";
import { RestoreVersion } from "@/components/sites/versions/restore-version";
import { formatDate } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { readChangesAgainst, readVersion } from "@/lib/sites/history-read";
import type {
    ChangeUnit,
    SiteChanges,
    SitePublication,
    SitePublicationDetail,
} from "@/lib/sites/service";

import type { EditorModel } from "../shell/editor-model";
import { FRAME_WIDTH, ScaledPage } from "./preview-frames";

/** Page or whole site: what History compares. */
export type HistoryScope = "page" | "site";

type Loaded =
    | { state: "loading" }
    | { state: "failed" }
    | { state: "ready"; detail: SitePublicationDetail; changes: SiteChanges };

/** The differences Compare numbers: this page's, or the whole site's. */
export function compareUnits(
    changes: SiteChanges,
    scope: HistoryScope,
    pageId: string,
): ChangeUnit[] {
    return changes.units.filter((u) => scope === "site" || u.pageId === pageId);
}

/**
 * Compare (U46b, `fix/WXEHistory`): a version beside the draft, over the
 * canvas and the inspector, right of the History panel. The version is
 * drawn from its stored snapshot as it was served (`PastVersionPreview`),
 * the draft as Preview draws it, both at desktop width scaled to their
 * column; the differences between them (`changes?against=`, U47a) are
 * numbered above. Restore is today's (`RestoreVersion`): that version goes
 * live again as a new entry, and the draft is left alone.
 */
export function HistoryCompare({
    model,
    version,
    scope,
    anchor,
    onClose,
    onRestored,
}: {
    model: EditorModel;
    version: SitePublication;
    scope: HistoryScope;
    /** The History panel, whose right edge Compare starts at. */
    anchor: HTMLElement | null;
    onClose: () => void;
    onRestored: () => void;
}) {
    const zone = useBusinessZone();
    const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
    const [place, setPlace] = useState({ left: 0, top: 0 });
    const [width, setWidth] = useState(0);
    const body = useRef<HTMLDivElement>(null);
    const { siteId, pageId } = model;

    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let live = true;
        void Promise.all([
            readVersion(siteId, version.id),
            readChangesAgainst(siteId, version.id),
        ]).then(([detail, changes]) => {
            if (!live) return;
            setLoaded(
                detail && changes
                    ? { state: "ready", detail, changes }
                    : { state: "failed" },
            );
        });
        return () => {
            live = false;
        };
    }, [siteId, version.id, attempt]);

    useEffect(() => {
        const measure = () => {
            const rect = anchor?.getBoundingClientRect();
            if (rect) setPlace({ left: rect.right, top: rect.top });
            if (body.current) setWidth(body.current.clientWidth);
        };
        measure();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("resize", measure);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("resize", measure);
            window.removeEventListener("keydown", onKey);
        };
    }, [anchor, onClose]);

    const date = formatDate(version.publishedAt, zone);
    const by = version.publishedBy ?? "Someone";
    const units =
        loaded.state === "ready"
            ? compareUnits(loaded.changes, scope, pageId)
            : [];
    // Two columns with a 24px gap inside 24px of padding each side.
    const column = Math.max(160, (width - 48 - 24) / 2);
    const scale = column / FRAME_WIDTH.desktop;

    const overlay = (
        <div
            role="region"
            aria-label="Compare a version with your draft"
            data-history-compare={version.id}
            className="fixed bottom-0 right-0 z-30 flex flex-col border-l bg-background"
            style={{ left: place.left, top: place.top }}
        >
            <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2.5 border-b px-4 py-2 text-sm">
                <Columns2 aria-hidden className="size-[18px] shrink-0" />
                <span className="min-w-0 flex-1">
                    <b>{date}</b> by {by}, beside <b>your draft now</b>
                    {loaded.state === "ready"
                        ? ` · ${count(units.length, "difference")}`
                        : ""}
                </span>
                {model.canPublish && !model.readOnly ? (
                    <RestoreVersion
                        siteId={siteId}
                        publicationId={version.id}
                        isCurrent={version.isCurrent}
                        renderable={
                            loaded.state !== "ready" ||
                            loaded.detail.renderability.renderable
                        }
                        needsApproval={model.publish.needsApproval}
                        canOverride={model.publish.canOverride}
                        onRestored={onRestored}
                    />
                ) : null}
                <IconButton
                    label="Close compare"
                    icon={<X className="size-[18px]" />}
                    onClick={onClose}
                />
            </div>
            <div
                ref={body}
                className="min-h-0 flex-1 overflow-y-auto px-6 pb-6"
            >
                {loaded.state === "loading" ? (
                    <p className="py-6 text-sm text-muted-foreground">
                        Loading that version…
                    </p>
                ) : loaded.state === "failed" ? (
                    <FailedRead
                        things="that version"
                        className="mt-6"
                        onRetry={() => {
                            setLoaded({ state: "loading" });
                            setAttempt((n) => n + 1);
                        }}
                    />
                ) : (
                    <>
                        <Differences units={units} />
                        <div className="grid grid-cols-2 gap-6">
                            <div className="min-w-0">
                                <h3 className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
                                    {date} · {by}
                                </h3>
                                <VersionPage
                                    detail={loaded.detail}
                                    path={model.page?.path ?? "/"}
                                    scale={scale}
                                />
                            </div>
                            <div className="min-w-0">
                                <h3 className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
                                    Your draft now
                                </h3>
                                <ScaledPage
                                    width={FRAME_WIDTH.desktop}
                                    scale={scale}
                                    title="Your draft now"
                                >
                                    <div inert>
                                        <DraftPreview
                                            siteId={siteId}
                                            siteAddress={model.address}
                                            sections={model.draft.sections}
                                            pages={model.pages}
                                            page={model.page ?? null}
                                            style={model.siteStyle.style}
                                            styleOptions={model.styleOptions}
                                            chrome={model.canvasChrome}
                                        />
                                    </div>
                                </ScaledPage>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
    return typeof document === "undefined"
        ? overlay
        : createPortal(overlay, document.body);
}

/** The differences, numbered, each said as the Publish sheet says it. */
function Differences({ units }: { units: ChangeUnit[] }) {
    if (units.length === 0) {
        return (
            <EmptyState
                size="inline"
                className="py-4"
                title="No differences"
                description="Your draft is the same as this version."
            />
        );
    }
    return (
        <ol data-compare-differences="" className="flex flex-wrap gap-2 py-4">
            {units.map((unit, i) => {
                const gone =
                    unit.change === "removed" || unit.change === "hidden";
                return (
                    <li
                        key={unit.key}
                        className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-[0.8125rem]"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "grid size-6 place-items-center rounded-full text-xs font-semibold",
                                gone
                                    ? "bg-warning text-warning-foreground"
                                    : "bg-success text-success-foreground",
                            )}
                        >
                            {i + 1}
                        </span>
                        {unit.label}
                        {unit.pageId === null || unit.where === "" ? null : (
                            <span className="text-muted-foreground">
                                · {unit.where}
                            </span>
                        )}
                    </li>
                );
            })}
        </ol>
    );
}

/** The open page as it was in that version, matched by its link. */
function VersionPage({
    detail,
    path,
    scale,
}: {
    detail: SitePublicationDetail;
    path: string;
    scale: number;
}) {
    const page = (detail.snapshot.pages ?? []).find((p) => p.path === path);
    if (!page) {
        return (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                This page was not on the site in that version.
            </p>
        );
    }
    // Left out rather than handed to a component that no longer knows them,
    // as the Versions page does.
    const skipped = new Set(
        detail.renderability.unrenderable
            .filter((u) => u.path === page.path)
            .map((u) => u.index),
    );
    const sections = page.sections.filter((_, i) => !skipped.has(i));
    return (
        <ScaledPage
            width={FRAME_WIDTH.desktop}
            scale={scale}
            title="That version"
        >
            <PastVersionPreview
                sections={sections}
                variables={detail.snapshot.site?.styleVariables}
                look={detail.snapshot.site?.look}
            />
        </ScaledPage>
    );
}
