"use client";

import type { TrackerKind } from "@saroh/block-contract";
import { VERIFICATION_SERVICES } from "@saroh/block-contract";
import { Button } from "@saroh/ui/button";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import type { SaveSection } from "@/components/sites/search-tracking/parts";
import {
    Block,
    LockNotice,
    SearchTrackingFailed,
    SearchTrackingFrame,
    SwitchedOffNotice,
} from "@/components/sites/search-tracking/parts";
import { PrivacyField } from "@/components/sites/search-tracking/privacy-field";
import type { TrackerStanding } from "@/components/sites/search-tracking/tracker-row";
import { TrackerRow } from "@/components/sites/search-tracking/tracker-row";
import { TrackerSetupDialog } from "@/components/sites/search-tracking/tracker-setup-dialog";
import { VerificationCodes } from "@/components/sites/search-tracking/verification-codes";
import { VerificationField } from "@/components/sites/search-tracking/verification-field";
import { VerifyAddress } from "@/components/sites/search-tracking/verify-address";
import { saveSearchTracking } from "@/lib/sites/actions";
import type {
    SearchTrackingRead,
    SearchTrackingView,
    TrackerSave,
    TrackerView,
} from "@/lib/sites/search-tracking";
import {
    OWN_DOMAIN_NOTE,
    OWN_DOMAIN_SERVICES,
    TRACKER_WORDS,
    trackerRunsLine,
    trackerSavedLine,
} from "@/lib/sites/search-tracking";
import type { SiteAddress } from "@/lib/sites/share-links";
import { moreToolsLine, splitTrackers } from "@/lib/sites/tracker-order";
import type { TrackersLock } from "@/lib/sites/trackers-lock";
import { trackersLockOfRefusal } from "@/lib/sites/trackers-lock";

/**
 * "Search and tracking" on a site's settings (DEC-108, U7), for someone who
 * may change it (`site:update`); `site-search-tracking-read.tsx` is the
 * view without controls.
 *
 * Unlike the rest of the settings it isn't draft state: a save reaches the
 * live site at once, and the API answers with the whole section, which is
 * what is drawn next. A failed read draws a failed state with Retry and no
 * form, so nothing can be saved over rows the page never saw.
 *
 * - Verification codes are on every plan. Meta and Pinterest verify only a
 *   domain of the business's own, so they show once one is connected.
 * - Trackers are the plan's (`site-trackers`). Locked, a tracker can't be
 *   added or turned on; one saved before is kept and said to be not running.
 *   A save the plan refuses (`MODULE_LOCKED`) turns the section locked.
 * - Switched off by Saroh, nothing can be turned on, and it says whom to ask.
 */
export function SiteSearchTracking({
    siteId,
    read,
    address,
    lock,
}: {
    siteId: string;
    read: SearchTrackingRead;
    /** Where the site is reached (`siteAddressOf`); null without one. */
    address: SiteAddress | null;
    /** The plan leaves trackers off (`trackersLock`); null when it doesn't. */
    lock: TrackersLock | null;
}) {
    if (!read.ok) {
        return (
            <SearchTrackingFrame>
                <SearchTrackingFailed />
            </SearchTrackingFrame>
        );
    }
    // A fresh read (Retry, or a refresh after a refusal) starts it again.
    return (
        <Editable
            key={JSON.stringify(read.data)}
            siteId={siteId}
            initial={read.data}
            address={address}
            planLock={lock}
        />
    );
}

function Editable({
    siteId,
    initial,
    address,
    planLock,
}: {
    siteId: string;
    initial: SearchTrackingView;
    address: SiteAddress | null;
    planLock: TrackersLock | null;
}) {
    const router = useRouter();
    const [view, setView] = useState(initial);
    const [refusedLock, setRefusedLock] = useState<TrackersLock | null>(null);
    const [setup, setSetup] = useState<TrackerKind | null>(null);
    const [busy, startTransition] = useTransition();
    const lock = planLock ?? refusedLock;

    const save: SaveSection = async (input) => {
        const res = await saveSearchTracking(siteId, input);
        if (res.ok) {
            setView(res.data);
            return { ok: true };
        }
        const locked = trackersLockOfRefusal(res.plan);
        if (locked) {
            setRefusedLock(locked);
            setSetup(null);
            return { ok: false, error: locked.line };
        }
        if (res.plan) {
            showPlanRefusal(res.plan);
            return { ok: false, error: res.error };
        }
        if (res.field) return { ok: false, error: res.error, field: res.field };
        // Switched off by Saroh meanwhile, or anything else: say it, and
        // read the section again so it draws what is so.
        showError(res.error);
        router.refresh();
        return { ok: false, error: res.error };
    };

    /** A toggle or a removal: no field to put a refusal under. */
    function act(input: Parameters<SaveSection>[0], said: string) {
        startTransition(async () => {
            const res = await save(input);
            if (res.ok) showSuccess(said);
            else if (res.field) showError(res.error);
        });
    }

    async function saveTracker(kind: TrackerKind, tracker: TrackerSave) {
        const res = await save({ trackers: { [kind]: tracker } });
        if (res.ok) {
            const said = trackerSavedLine(kind);
            showSuccess(said.title, said.description);
        }
        return res;
    }

    const standing: TrackerStanding = view.switchedOff
        ? "switched-off"
        : lock
          ? "locked"
          : "open";
    const ownDomain = address !== null && address.host !== address.platformHost;
    const byKind = new Map(view.trackers.map((t) => [t.kind, t]));
    // Meta and Pinterest verify only a domain of the business's own.
    const services = VERIFICATION_SERVICES.filter(
        (s) => ownDomain || !OWN_DOMAIN_SERVICES.includes(s),
    );

    function actionsFor(kind: TrackerKind, tracker: TrackerView | null) {
        const name = TRACKER_WORDS[kind].name;
        const remove = tracker ? (
            <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                    act(
                        { trackers: { [kind]: null } },
                        `${name} removed from your live site.`,
                    )
                }
            >
                Remove
            </Button>
        ) : null;
        if (standing !== "open") return remove;
        if (!tracker) {
            return (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSetup(kind)}
                >
                    Set up
                </Button>
            );
        }
        return (
            <>
                <Switch
                    checked={tracker.enabled}
                    disabled={busy}
                    aria-label={`${name} on your site`}
                    onCheckedChange={(on) =>
                        act(
                            {
                                trackers: {
                                    [kind]: {
                                        id: tracker.trackerId,
                                        ...(tracker.region
                                            ? { region: tracker.region }
                                            : {}),
                                        enabled: on,
                                    },
                                },
                            },
                            on
                                ? `${name} is on. ${trackerRunsLine(kind)}`
                                : `${name} is off. It's no longer on your site.`,
                        )
                    }
                />
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSetup(kind)}
                >
                    Edit
                </Button>
                {remove}
            </>
        );
    }

    // The common tools and every connected one first; the rest fold.
    const trackers = splitTrackers(new Set(byKind.keys()));
    const row = (kind: TrackerKind) => {
        const tracker = byKind.get(kind) ?? null;
        return (
            <TrackerRow
                key={kind}
                kind={kind}
                tracker={tracker}
                standing={standing}
                lock={lock}
                actions={actionsFor(kind, tracker)}
            />
        );
    };

    return (
        <SearchTrackingFrame>
            {view.switchedOff ? <SwitchedOffNotice /> : null}

            <Block
                title="Your trackers"
                description="Your own analytics and ad tools. Visitors are asked first for any that uses cookies."
            >
                {lock && !view.switchedOff ? <LockNotice lock={lock} /> : null}
                {trackers.shown.map(row)}
                {trackers.folded.length ? (
                    <details className="group" data-more-tools>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active coarse:min-h-11 [&::-webkit-details-marker]:hidden">
                            <span>
                                <span className="group-open:hidden">
                                    {moreToolsLine(trackers.folded.length)}
                                </span>
                                <span className="hidden group-open:inline">
                                    Fewer tools
                                </span>
                                <span className="font-normal text-muted-foreground">
                                    {" "}
                                    ·{" "}
                                    {trackers.folded
                                        .map((k) => TRACKER_WORDS[k].name)
                                        .join(", ")}
                                </span>
                            </span>
                            <ChevronDown
                                aria-hidden
                                className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-open:rotate-180"
                            />
                        </summary>
                        <div className="divide-y divide-border border-t border-border">
                            {trackers.folded.map(row)}
                        </div>
                    </details>
                ) : null}
                <PrivacyField saved={view.privacyUrl} save={save} />
            </Block>

            <VerificationCodes
                services={services}
                added={services.filter((s) => view.verifications[s]).length}
            >
                <VerifyAddress address={address} />
                {services.map((service) => (
                    <VerificationField
                        key={service}
                        service={service}
                        saved={view.verifications[service]}
                        host={address?.url ?? null}
                        liveUrl={address?.url ?? null}
                        save={save}
                    />
                ))}
                {ownDomain ? null : (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                        {OWN_DOMAIN_NOTE}
                    </p>
                )}
            </VerificationCodes>

            {setup ? (
                <TrackerSetupDialog
                    key={setup}
                    kind={setup}
                    existing={byKind.get(setup) ?? null}
                    onClose={() => setSetup(null)}
                    onSave={saveTracker}
                />
            ) : null}
        </SearchTrackingFrame>
    );
}
