import type {
    PosthogRegion,
    TrackerKind,
    VerificationService,
} from "@saroh/block-contract";
import {
    checkPrivacyUrl,
    checkTrackerId,
    checkVerificationCode,
    isPosthogRegion,
    isTrackerKind,
    isVerificationService,
} from "@saroh/block-contract";

/**
 * The public head read's answer, narrowed rather than cast (#264), and
 * every value checked again against its tool's shape before the page uses
 * it (DEC-108): the renderer never trusts a stored value to be safe to put
 * on a page. Kept apart from `site-head.ts`, which reads the app's env, so
 * it is tested without one.
 */
export interface SiteHeadTracker {
    kind: TrackerKind;
    id: string;
    region: PosthogRegion | null;
}

export interface SiteHead {
    verifications: { service: VerificationService; code: string }[];
    trackers: SiteHeadTracker[];
    privacyUrl: string | null;
}

/** Nothing: no codes, no trackers. */
export const NO_HEAD: SiteHead = {
    verifications: [],
    trackers: [],
    privacyUrl: null,
};

function rows(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.filter(
              (v): v is Record<string, unknown> =>
                  typeof v === "object" && v !== null,
          )
        : [];
}

export function siteHeadOf(body: unknown): SiteHead {
    if (body === null || typeof body !== "object") return NO_HEAD;
    const raw = body as {
        verifications?: unknown;
        trackers?: unknown;
        privacyUrl?: unknown;
    };
    const verifications = rows(raw.verifications).flatMap((row) => {
        const { service, code } = row;
        if (!isVerificationService(service) || typeof code !== "string") {
            return [];
        }
        const checked = checkVerificationCode(service, code);
        return checked.ok ? [{ service, code: checked.value }] : [];
    });
    const seen = new Set<string>();
    const trackers = rows(raw.trackers).flatMap((row) => {
        const { kind, id, region } = row;
        if (!isTrackerKind(kind) || typeof id !== "string" || seen.has(kind)) {
            return [];
        }
        const checked = checkTrackerId(kind, id);
        if (!checked.ok) return [];
        if (kind === "posthog" && !isPosthogRegion(region)) return [];
        seen.add(kind);
        return [
            {
                kind,
                id: checked.value,
                region:
                    kind === "posthog" && isPosthogRegion(region)
                        ? region
                        : null,
            },
        ];
    });
    const privacyUrl =
        typeof raw.privacyUrl === "string"
            ? checkPrivacyUrl(raw.privacyUrl)
            : null;
    return { verifications, trackers, privacyUrl };
}
