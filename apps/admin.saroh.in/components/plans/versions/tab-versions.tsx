"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";

import {
    changeCount,
    liveVersionOf,
    namesList,
    upcomingVersions,
} from "@/lib/pricing-draft";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import { VersionCard } from "./version-card";
import { nextVersion, rollbackBlocked } from "./versions";

/**
 * The Versions tab (plans catalogue U10): every published version, newest
 * first, with what it changed and who is on it. A scheduled one can be
 * cancelled; an earlier one rolled back to, as a new version. Both need
 * `pricing:publish` and go through `OperatorDialog`. A draft heads the list
 * as the version it would become (admin redesign U13, R23), and any version
 * but the live one can be compared with live.
 */
export function TabVersions() {
    const { pricing, access } = usePlans();
    const { hasDraft, check, editors, live } = useDraft();
    const { setTab } = usePlansNav();
    const liveCatalog = liveVersionOf(pricing)?.catalog ?? null;
    const nextV = nextVersion(pricing.versions);
    const blocked = rollbackBlocked({
        hasDraft,
        upcoming: upcomingVersions(pricing).find(
            (v) => v.status === "scheduled",
        ),
    });

    return (
        <section aria-label="Versions" className="grid gap-2.5 text-[13.5px]">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
                <h2 className="font-display text-base font-semibold">
                    Versions
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    Each business stays on the version it joined on, until you
                    move them.
                </span>
            </div>
            {hasDraft && (
                <article
                    aria-label="Draft"
                    className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[12px] border border-dashed border-border-strong bg-card px-4 py-3.5"
                >
                    <span className="grid min-w-0 flex-[1_1_280px] gap-0.5">
                        <span className="font-semibold">
                            Draft · would be version {nextV}
                        </span>
                        <span className="text-[12.5px] text-muted-foreground">
                            {live
                                ? changeCount(check.changes.length)
                                : "The first version"}
                            {editors.length > 0 &&
                                ` · edited by ${namesList(editors)}`}
                        </span>
                    </span>
                    <Badge
                        variant="warning"
                        className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    >
                        Not live
                    </Badge>
                    <Button
                        type="button"
                        variant="outline"
                        className="h-[30px] rounded-[8px] px-3 text-[12.5px]"
                        onClick={() => setTab("publish")}
                    >
                        Review…
                    </Button>
                </article>
            )}
            {pricing.versions.length === 0 && (
                <p className="rounded-[12px] border border-border bg-card px-4 py-3.5 text-muted-foreground">
                    Nothing is published yet.
                </p>
            )}
            {pricing.versions.map((v) => (
                <VersionCard
                    key={v.version}
                    version={v}
                    nextV={nextV}
                    canPublish={access.canPublish}
                    rollbackBlockedBy={blocked}
                    live={liveCatalog}
                />
            ))}
        </section>
    );
}
