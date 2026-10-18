"use client";

import { Badge } from "@saroh/ui/badge";

import { ChangedRow } from "@/components/changed-row";
import { EmptyPanel } from "@/components/states/empty-panel";
import { siteTrackersAction } from "@/lib/business-actions";
import { trackerState } from "@/lib/business-words";
import type { SiteTrackersRow } from "@/lib/businesses";
import { formatDateTime } from "@/lib/format";
import { undoReason } from "@/lib/releases";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { OperatorDialog } from "../operator-dialog";

/**
 * Each of a business's sites and its trackers (#897, admin plan U6, R7).
 * A site's trackers are Allowed, or "Switched off by Saroh": none load,
 * whatever the plan, and the business can't turn one on. Staff holding
 * `organization:trackers:write` switch them off… and on…, with a reason;
 * the row lights and Undo puts it back (R9). The API refuses anyone else.
 */
export function SiteTrackers({
    organizationId,
    sites,
    canSwitch,
}: {
    organizationId: string;
    sites: SiteTrackersRow[];
    canSwitch: boolean;
}) {
    const feedback = useChangeFeedback();
    if (sites.length === 0) {
        return (
            <EmptyPanel
                size="inline"
                title="No sites yet"
                description="Trackers belong to a site, and this business has none."
            />
        );
    }

    async function change(
        site: SiteTrackersRow,
        switchOn: boolean,
        input: { reason: string; idempotencyKey: string },
    ) {
        const result = await siteTrackersAction(organizationId, site.id, {
            ...input,
            switchOn,
        });
        if (!result.ok) return result;
        feedback.report({
            rowId: site.id,
            message: switchOn
                ? `Trackers switched back on for ${site.name}.`
                : `Trackers switched off for ${site.name}.`,
            undo: async () => {
                const undone = await siteTrackersAction(
                    organizationId,
                    site.id,
                    {
                        reason: undoReason(input.reason),
                        idempotencyKey: crypto.randomUUID(),
                        switchOn: !switchOn,
                    },
                );
                return undone.ok ? { ok: true } : { ok: false };
            },
        });
        return result;
    }

    return (
        <ul className="grid">
            {sites.map((site) => {
                const tracker = trackerState(site);
                return (
                    <ChangedRow
                        as="li"
                        key={site.id}
                        changed={feedback.isHighlighted(site.id)}
                        data-site={site.id}
                        className="flex flex-wrap items-start justify-between gap-3 border-b py-3 last:border-0"
                    >
                        <div className="grid min-w-0 flex-1 basis-64 gap-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-sm font-medium">
                                    {site.name}
                                </span>
                                <Badge
                                    variant={tracker.tone}
                                    data-tracker-state={
                                        site.switchedOff ? "off" : "allowed"
                                    }
                                >
                                    {tracker.state}
                                </Badge>
                            </div>
                            <p className="break-words text-[12.5px] text-muted-foreground">
                                {site.subdomain ? `${site.subdomain} · ` : ""}
                                {tracker.text}
                            </p>
                            {site.switchedOff && (
                                <p className="break-words text-[12.5px] text-muted-foreground">
                                    {formatDateTime(site.switchedOff.at)} by{" "}
                                    {site.switchedOffBy ??
                                        "someone on Saroh's team"}
                                    {site.switchedOff.reason
                                        ? ` · ${site.switchedOff.reason}`
                                        : ""}
                                </p>
                            )}
                        </div>
                        {canSwitch && (
                            <SwitchTrackers
                                site={site}
                                onSubmit={(switchOn, input) =>
                                    change(site, switchOn, input)
                                }
                            />
                        )}
                    </ChangedRow>
                );
            })}
        </ul>
    );
}

function SwitchTrackers({
    site,
    onSubmit,
}: {
    site: SiteTrackersRow;
    onSubmit: (
        switchOn: boolean,
        input: { reason: string; idempotencyKey: string },
    ) => Promise<{ ok: boolean; error?: string }>;
}) {
    const off = site.switchedOff !== null;
    return (
        <OperatorDialog
            trigger={off ? "Switch on…" : "Switch off…"}
            triggerVariant={off ? "outline" : "ghost"}
            title={
                off
                    ? `Switch ${site.name}'s trackers back on`
                    : `Switch off ${site.name}'s trackers`
            }
            effect={
                off
                    ? "Its trackers load again on the next page view, if its plan includes them. The business can add and turn on trackers again."
                    : "No tracker loads on this site from the next page view, whatever its plan. The business sees that Saroh switched them off and can't turn one on until you switch them back on. Verification codes are not affected."
            }
            submitLabel={off ? "Switch back on" : "Switch off trackers"}
            destructive={!off}
            onSubmit={({ reason, idempotencyKey }) =>
                onSubmit(off, { reason, idempotencyKey })
            }
        />
    );
}
