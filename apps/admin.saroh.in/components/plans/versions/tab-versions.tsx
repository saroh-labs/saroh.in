"use client";

import { upcomingVersions } from "@/lib/pricing-draft";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { VersionCard } from "./version-card";
import { nextVersion, rollbackBlocked } from "./versions";

/**
 * The Versions tab (plans catalogue U10): every published version, newest
 * first, with what it changed and who is on it. A scheduled one can be
 * cancelled; an earlier one rolled back to, as a new version. Both need
 * `pricing:publish` and go through `OperatorDialog`.
 */
export function TabVersions() {
    const { pricing, access } = usePlans();
    const { hasDraft } = useDraft();
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
                />
            ))}
        </section>
    );
}
