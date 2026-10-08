"use client";

import { Badge } from "@saroh/ui/badge";
import { EmptyState } from "@saroh/ui/data-state";

import { siteTrackersAction } from "@/lib/business-actions";
import type { SiteTrackersRow } from "@/lib/businesses";
import { formatDateTime, plural } from "@/lib/format";

import { OperatorDialog } from "../operator-dialog";

/**
 * Each of a business's sites and its trackers (#897). Staff holding
 * `organization:trackers:write` can switch a site's trackers off — none
 * load, whatever the plan, and the business can't turn one on — and back
 * on. Only staff can switch them back on. The API refuses anyone else.
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
    if (sites.length === 0) {
        return <EmptyState title="No sites yet" />;
    }
    return (
        <ul className="grid gap-3">
            {sites.map((site) => (
                <li
                    key={site.id}
                    className="flex flex-wrap items-start justify-between gap-3"
                >
                    <div className="grid min-w-0 gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">
                                {site.name}
                            </span>
                            {site.switchedOff ? (
                                <Badge variant="error">Switched off</Badge>
                            ) : (
                                <Badge variant="outline">On</Badge>
                            )}
                        </div>
                        <p className="break-words text-[12.5px] text-muted-foreground">
                            {site.subdomain ? `${site.subdomain} · ` : ""}
                            {plural(site.trackersOn, "tracker")} on
                        </p>
                        {site.switchedOff && (
                            <p className="break-words text-[12.5px] text-muted-foreground">
                                {formatDateTime(site.switchedOff.at)} by{" "}
                                {site.switchedOffBy ?? "an operator"}
                                {site.switchedOff.reason
                                    ? ` · ${site.switchedOff.reason}`
                                    : ""}
                            </p>
                        )}
                    </div>
                    {canSwitch && (
                        <SwitchTrackers
                            organizationId={organizationId}
                            site={site}
                        />
                    )}
                </li>
            ))}
        </ul>
    );
}

function SwitchTrackers({
    organizationId,
    site,
}: {
    organizationId: string;
    site: SiteTrackersRow;
}) {
    const off = site.switchedOff !== null;
    return (
        <OperatorDialog
            trigger={off ? "Switch back on" : "Switch off"}
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
                siteTrackersAction(organizationId, site.id, {
                    reason,
                    idempotencyKey,
                    switchOn: off,
                })
            }
        />
    );
}
