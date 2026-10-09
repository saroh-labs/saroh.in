import { TRACKER_KINDS, VERIFICATION_SERVICES } from "@saroh/block-contract";

import {
    Block,
    LineRow,
    LockNotice,
    SearchTrackingFailed,
    SearchTrackingFrame,
    SwitchedOffNotice,
} from "@/components/sites/search-tracking/parts";
import type { TrackerStanding } from "@/components/sites/search-tracking/tracker-row";
import { TrackerRow } from "@/components/sites/search-tracking/tracker-row";
import { VerificationCodes } from "@/components/sites/search-tracking/verification-codes";
import { VerifyAddress } from "@/components/sites/search-tracking/verify-address";
import type { SearchTrackingRead } from "@/lib/sites/search-tracking";
import { PRIVACY_NOTE, VERIFICATION_WORDS } from "@/lib/sites/search-tracking";
import type { SiteAddress } from "@/lib/sites/share-links";
import type { TrackersLock } from "@/lib/sites/trackers-lock";

/**
 * "Search and tracking" for someone who may see the site and not change it
 * (no `site:update`, DEC-108 U7). As `site-settings-read.tsx`: the values,
 * and none of the controls the API would refuse — no inputs, no switches,
 * no actions — with one sentence saying who has them.
 */
export function SiteSearchTrackingRead({
    read,
    address,
    lock,
}: {
    read: SearchTrackingRead;
    address: SiteAddress | null;
    lock: TrackersLock | null;
}) {
    if (!read.ok) {
        return (
            <SearchTrackingFrame>
                <SearchTrackingFailed />
            </SearchTrackingFrame>
        );
    }
    const view = read.data;
    const standing: TrackerStanding = view.switchedOff
        ? "switched-off"
        : lock
          ? "locked"
          : "open";
    const byKind = new Map(view.trackers.map((t) => [t.kind, t]));

    return (
        <SearchTrackingFrame>
            <p className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
                You can see this site&apos;s codes and trackers. Changing them
                is the owner&apos;s or an admin&apos;s.
            </p>
            {view.switchedOff ? <SwitchedOffNotice /> : null}

            <Block title="Your trackers">
                {lock && !view.switchedOff ? <LockNotice lock={lock} /> : null}
                {view.trackers.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">
                        No trackers connected yet.
                    </p>
                ) : (
                    TRACKER_KINDS.filter((k) => byKind.has(k)).map((kind) => (
                        <TrackerRow
                            key={kind}
                            kind={kind}
                            tracker={byKind.get(kind) ?? null}
                            standing={standing}
                            lock={lock}
                        />
                    ))
                )}
                <LineRow label="Privacy page">
                    {view.privacyUrl ?? (
                        <span className="text-muted-foreground">
                            Not set. {PRIVACY_NOTE}
                        </span>
                    )}
                </LineRow>
            </Block>

            <VerificationCodes
                services={VERIFICATION_SERVICES}
                added={
                    VERIFICATION_SERVICES.filter((s) => view.verifications[s])
                        .length
                }
            >
                <VerifyAddress address={address} />
                {VERIFICATION_SERVICES.map((service) => {
                    const code = view.verifications[service];
                    return (
                        <LineRow
                            key={service}
                            label={VERIFICATION_WORDS[service].label}
                        >
                            {code ? (
                                <span className="font-mono">{code}</span>
                            ) : (
                                <span className="text-muted-foreground">
                                    Not set
                                </span>
                            )}
                        </LineRow>
                    );
                })}
            </VerificationCodes>
        </SearchTrackingFrame>
    );
}
