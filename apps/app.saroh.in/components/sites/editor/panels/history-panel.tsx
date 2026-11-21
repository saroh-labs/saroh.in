"use client";

import { Button } from "@saroh/ui/button";
import { FailedRead } from "@saroh/ui/failed-read";
import { Segmented } from "@saroh/ui/segmented";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { History } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { runAction } from "@/lib/api/run-action";
import { formatRelative } from "@/lib/format/datetime";
import { saveDraftSections } from "@/lib/sites/actions";
import { revertChange } from "@/lib/sites/change-revert-actions";
import { readSiteChanges } from "@/lib/sites/changes-read";
import { readVersions } from "@/lib/sites/history-read";
import type {
    ChangeUnit,
    SiteChanges,
    SitePublication,
} from "@/lib/sites/service";

import type { EditorModel } from "../shell/editor-model";
import type { HistoryScope } from "./history-compare";
import { HistoryCompare } from "./history-compare";
import { ROW, VersionRows, Who } from "./history-rows";

export interface HistoryPanelProps {
    model: EditorModel;
}

/**
 * Set before an Undo or a restore remounts the editor on the new draft
 * (`reloadDraft`), so the editor comes back with History open, not Pages:
 * `site-editor.tsx` reads it for its first rail tab, and the History it
 * opens clears it.
 */
let reopenHistory = false;
export function historyAfterReload(): "history" | null {
    return reopenHistory ? "history" : null;
}

/** "Changed · Top of the page" as a line after a name: "changed Top of the page". */
export function changeWords(label: string): string {
    const line = label.replace(" · ", " ");
    return line.charAt(0).toLowerCase() + line.slice(1);
}

/** The waiting changes this scope shows, newest group first, by person. */
export function scopedGroups(
    changes: SiteChanges,
    scope: HistoryScope,
    pageId: string,
): { key: string; name: string | null; units: ChangeUnit[] }[] {
    const byKey = new Map(changes.units.map((u) => [u.key, u]));
    return changes.groups.flatMap((group) => {
        const units = group.units
            .map((k) => byKey.get(k))
            .filter(
                (u): u is ChangeUnit =>
                    u !== undefined &&
                    (scope === "site" || u.pageId === pageId),
            );
        if (units.length === 0) return [];
        // Null: changed before names were kept. No person is drawn for it.
        const name = group.you ? "You" : group.name;
        return [{ key: group.userId ?? "earlier", name, units }];
    });
}

type Read<T> = T | null | "failed";

/**
 * Rail › History (U46b, `fix/WXEHistory`): "This page" or "Whole site";
 * the changes waiting to publish by who made them, each with Undo (it is
 * put back as it is live, U47a's revert, and the toast offers it back);
 * then the versions that went live and the test links, newest first, "Live
 * now" on the current one. A version opens Compare beside the panel: the
 * version as it was served beside the draft, the differences numbered, and
 * today's Restore. Every version, the scheduled go-lives and each page of a
 * version stay on Versions (`/versions`), linked at the foot.
 *
 * A reader sees the lists and Compare, no Undo and no Restore.
 */
export function HistoryPanel({ model }: HistoryPanelProps) {
    const router = useRouter();
    const zone = useBusinessZone();
    const [scope, setScope] = useState<HistoryScope>("page");
    const [changes, setChanges] = useState<Read<SiteChanges>>(null);
    const [versions, setVersions] = useState<Read<SitePublication[]>>(null);
    const [comparing, setComparing] = useState<SitePublication | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const [changesTry, setChangesTry] = useState(0);
    const [versionsTry, setVersionsTry] = useState(0);
    const { siteId, pageId } = model;

    useEffect(() => {
        reopenHistory = false;
    }, []);
    // Read again whenever the chip's count moves: an autosave, an Undo.
    const waiting = model.status.waiting;
    useEffect(() => {
        let live = true;
        readSiteChanges(siteId).then(
            (next) => live && setChanges(next ?? "failed"),
            () => live && setChanges("failed"),
        );
        return () => {
            live = false;
        };
    }, [siteId, changesTry, waiting]);
    useEffect(() => {
        let live = true;
        void readVersions(siteId).then(
            (next) => live && setVersions(next ?? "failed"),
        );
        return () => {
            live = false;
        };
    }, [siteId, versionsTry]);
    const loadChanges = () => {
        setChanges(null);
        setChangesTry((n) => n + 1);
    };
    const loadVersions = () => {
        setVersions(null);
        setVersionsTry((n) => n + 1);
    };

    /** Start the editor on what the server now holds, History open. */
    function reload(page = pageId) {
        if (model.reloadDraft) {
            reopenHistory = true;
            model.reloadDraft(page);
        } else {
            router.refresh();
        }
    }

    async function undo(unit: ChangeUnit) {
        const onPage = unit.kind === "section" && unit.pageId === pageId;
        // The draft as saved: Undo waits while it is still saving.
        const before = onPage ? model.draft.sections : null;
        const res = await runAction(
            () => revertChange(siteId, { unitKey: unit.key }),
            { setBusy: (b) => setBusy(b ? unit.key : null) },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const after = res.data.draft;
        const what = `Put back as it is live: ${unit.label}`;
        if (before && after) {
            // Offered back: the draft as it was, saved over the undo's own
            // revision, so a teammate's newer save is never overwritten.
            showUndo(what, async () => {
                const put = await saveDraftSections(
                    siteId,
                    pageId,
                    before,
                    after.revision,
                );
                if (put.ok) reload();
                return put.ok ? true : { ok: false, error: put.error };
            });
        } else {
            // shortcut: a page or site setting is not offered back; change it
            // back where it was made. Upgrade with a "put back" endpoint.
            showSuccess(what);
        }
        if (onPage || unit.kind !== "section") {
            reload();
            return;
        }
        // Another page's section: the editor's own page is as it was.
        loadChanges();
        const live = await model.releases.readLive();
        if (live) model.publish.recordSaved(live.sections, live.site);
    }

    const readOnly = model.readOnly;
    const canUndo = (unit: ChangeUnit) =>
        !readOnly &&
        (unit.kind === "section" || model.canUpdateSite) &&
        busy === null;

    return (
        <section
            ref={setPanel}
            aria-label="History"
            data-history-panel=""
            className="flex min-h-0 flex-1 flex-col"
        >
            <h2 className="flex h-12 shrink-0 items-center px-4 text-[0.9375rem] font-semibold">
                History
            </h2>
            <Segmented<HistoryScope>
                label="Show history for"
                block
                className="mx-4 mb-3 w-auto"
                value={scope}
                onValueChange={setScope}
                options={[
                    { value: "page", label: "This page" },
                    { value: "site", label: "Whole site" },
                ]}
            />
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
                <Waiting
                    changes={changes}
                    groups={
                        changes && changes !== "failed"
                            ? scopedGroups(changes, scope, pageId)
                            : []
                    }
                    unsaved={model.unsaved}
                    busy={busy}
                    canUndo={canUndo}
                    onUndo={(u) => void undo(u)}
                    onRetry={loadChanges}
                />
                <GroupHead>Versions</GroupHead>
                {versions === null ? (
                    <p className="px-4 py-2 text-sm text-muted-foreground">
                        Loading versions…
                    </p>
                ) : versions === "failed" ? (
                    <FailedRead
                        things="versions"
                        className="mx-4"
                        onRetry={loadVersions}
                    />
                ) : (
                    <VersionRows
                        versions={versions}
                        releases={model.releases.releases}
                        zone={zone}
                        comparing={comparing?.id ?? null}
                        onCompare={setComparing}
                        onOpenTestLinks={() =>
                            model.releases.setPanelOpen(true)
                        }
                    />
                )}
                <div className="px-4 pt-4">
                    <Button asChild variant="outline" className="w-full">
                        <Link href={`/sites/${siteId}/versions`}>
                            <History aria-hidden className="size-4" />
                            See all versions
                        </Link>
                    </Button>
                </div>
            </div>
            {comparing ? (
                <HistoryCompare
                    model={model}
                    version={comparing}
                    scope={scope}
                    anchor={panel}
                    onClose={() => setComparing(null)}
                    onRestored={() => reload()}
                />
            ) : null}
        </section>
    );
}

function GroupHead({
    children,
    count,
}: {
    children: ReactNode;
    count?: number;
}) {
    return (
        <h3 className="flex items-center gap-2 px-4 pb-1.5 pt-3 text-[0.8125rem] font-semibold text-muted-foreground">
            {children}
            {count !== undefined ? (
                <span className="inline-flex h-[18px] min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs tabular-nums text-foreground">
                    {count}
                </span>
            ) : null}
        </h3>
    );
}

function Waiting({
    changes,
    groups,
    unsaved,
    busy,
    canUndo,
    onUndo,
    onRetry,
}: {
    changes: Read<SiteChanges>;
    groups: ReturnType<typeof scopedGroups>;
    unsaved: boolean;
    busy: string | null;
    canUndo: (unit: ChangeUnit) => boolean;
    onUndo: (unit: ChangeUnit) => void;
    onRetry: () => void;
}) {
    const total = groups.reduce((n, g) => n + g.units.length, 0);
    return (
        <div data-history-waiting="">
            <GroupHead count={total}>Waiting to publish</GroupHead>
            {changes === null ? (
                <p className="px-4 py-2 text-sm text-muted-foreground">
                    Loading changes…
                </p>
            ) : changes === "failed" ? (
                <FailedRead
                    things="changes"
                    className="mx-4"
                    onRetry={onRetry}
                />
            ) : total === 0 ? (
                <p className="px-4 py-2 text-sm text-muted-foreground">
                    {changes.count === null
                        ? "Nothing is live yet. Everything goes live with your first Publish."
                        : "Nothing is waiting. What you see is live."}
                </p>
            ) : (
                <ul>
                    {groups.flatMap((group) =>
                        group.units.map((unit) => (
                            <li key={unit.key} className={ROW}>
                                {group.name ? <Who name={group.name} /> : null}
                                <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-muted-foreground">
                                    {group.name ? (
                                        <>
                                            <b className="font-semibold text-foreground">
                                                {group.name}
                                            </b>{" "}
                                            {changeWords(unit.label)}
                                        </>
                                    ) : (
                                        <span className="text-foreground">
                                            {unit.label.replace(" · ", " ")}
                                        </span>
                                    )}
                                    <span className="mt-0.5 block text-xs">
                                        {unit.where}
                                        {group.name
                                            ? ""
                                            : " · before names were kept"}
                                        {unit.editedAt
                                            ? ` · ${formatRelative(unit.editedAt)}`
                                            : ""}
                                    </span>
                                </span>
                                {canUndo(unit) || busy === unit.key ? (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={unsaved}
                                        title={
                                            unsaved
                                                ? "Wait until your changes are saved"
                                                : undefined
                                        }
                                        busy={busy === unit.key}
                                        busyLabel="Undoing…"
                                        onClick={() => onUndo(unit)}
                                    >
                                        Undo
                                    </Button>
                                ) : null}
                            </li>
                        )),
                    )}
                </ul>
            )}
        </div>
    );
}
