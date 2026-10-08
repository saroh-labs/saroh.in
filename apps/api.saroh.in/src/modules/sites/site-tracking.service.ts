import {
    BadRequestException,
    ForbiddenException,
    Injectable,
} from "@nestjs/common";
import type {
    CodeProblem,
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
    TRACKER_KINDS,
    VERIFICATION_SERVICES,
} from "@saroh/block-contract";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { authorize } from "../organizations/organization-policy";
import { assertSiteInOrg } from "./site-access";

/**
 * A site's verification codes and the merchant's own trackers (DEC-108,
 * #892): what the workspace's "Search and tracking" section reads and
 * saves.
 *
 * - Only public ids are stored, each checked against its tool's shape
 *   (`@saroh/block-contract`). A value shaped like a secret is refused as
 *   one, and no refusal ever repeats what was sent.
 * - Saving takes effect on the live site at once: these rows are read
 *   beside the publication, never inside it, so they are never an
 *   unpublished change.
 * - Verification codes are on every plan. Adding a tracker, or turning one
 *   back on, is the `site-trackers` catalogue row; changing or removing one
 *   never is, so nothing a business set up is lost on a downgrade.
 * - While Saroh staff have switched a site's trackers off (#897), none can
 *   be added or turned on.
 */

/** The section as the workspace reads it. */
export interface SiteTrackingView {
    verifications: Record<VerificationService, string | null>;
    trackers: {
        kind: TrackerKind;
        trackerId: string;
        region: PosthogRegion | null;
        enabled: boolean;
    }[];
    /** The merchant's own privacy page; null: the generated notice. */
    privacyUrl: string | null;
    /** Saroh staff have switched this site's trackers off. */
    switchedOff: boolean;
}

/** One tracker as a save names it. */
interface TrackerInput {
    id: string;
    region: PosthogRegion | null;
    enabled: boolean | undefined;
}

/** A save, parsed: absent leaves a value alone, null removes it. */
export interface SiteTrackingInput {
    verifications: Partial<Record<VerificationService, string | null>>;
    trackers: Partial<Record<TrackerKind, TrackerInput | null>>;
    privacyUrl: string | null | undefined;
}

const PROBLEM_WORDS: Record<CodeProblem, string> = {
    empty: "Enter the code, or remove it.",
    secret: "This looks like a private key. Never paste it here.",
    "tag-manager":
        "Google Tag Manager isn't supported. Connect each tool on its own.",
    format: "This doesn't look like the right code for this tool.",
};

function refuse(field: string, problem: CodeProblem | "invalid"): never {
    throw new BadRequestException({
        message:
            problem === "invalid"
                ? `${field} isn't something this section saves.`
                : PROBLEM_WORDS[problem],
        field,
        problem,
    });
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse a save. Anything this section doesn't know is a 400 naming the
 * field; a refused value is never repeated back.
 */
export function parseSiteTrackingInput(body: unknown): SiteTrackingInput {
    if (!isRecord(body)) refuse("body", "invalid");
    for (const key of Object.keys(body)) {
        if (!["verifications", "trackers", "privacyUrl"].includes(key)) {
            refuse(key, "invalid");
        }
    }

    const verifications: SiteTrackingInput["verifications"] = {};
    if (body.verifications !== undefined) {
        if (!isRecord(body.verifications)) refuse("verifications", "invalid");
        for (const [service, value] of Object.entries(body.verifications)) {
            const field = `verifications.${service}`;
            if (!isVerificationService(service)) refuse(field, "invalid");
            if (value === null) {
                verifications[service] = null;
                continue;
            }
            if (typeof value !== "string") refuse(field, "invalid");
            const checked = checkVerificationCode(service, value);
            if (!checked.ok) refuse(field, checked.problem);
            verifications[service] = checked.value;
        }
    }

    const trackers: SiteTrackingInput["trackers"] = {};
    if (body.trackers !== undefined) {
        if (!isRecord(body.trackers)) refuse("trackers", "invalid");
        for (const [kind, value] of Object.entries(body.trackers)) {
            const field = `trackers.${kind}`;
            if (!isTrackerKind(kind)) refuse(field, "invalid");
            if (value === null) {
                trackers[kind] = null;
                continue;
            }
            if (!isRecord(value) || typeof value.id !== "string") {
                refuse(field, "invalid");
            }
            for (const key of Object.keys(value)) {
                if (!["id", "region", "enabled"].includes(key)) {
                    refuse(`${field}.${key}`, "invalid");
                }
            }
            const checked = checkTrackerId(kind, value.id);
            if (!checked.ok) refuse(field, checked.problem);
            let region: PosthogRegion | null = null;
            if (kind === "posthog") {
                if (!isPosthogRegion(value.region)) {
                    refuse(`${field}.region`, "invalid");
                }
                region = value.region;
            } else if (value.region !== undefined && value.region !== null) {
                refuse(`${field}.region`, "invalid");
            }
            if (
                value.enabled !== undefined &&
                typeof value.enabled !== "boolean"
            ) {
                refuse(`${field}.enabled`, "invalid");
            }
            trackers[kind] = {
                id: checked.value,
                region,
                enabled: value.enabled,
            };
        }
    }

    let privacyUrl: string | null | undefined;
    if (body.privacyUrl === null) privacyUrl = null;
    else if (body.privacyUrl !== undefined) {
        if (typeof body.privacyUrl !== "string")
            refuse("privacyUrl", "invalid");
        const url = checkPrivacyUrl(body.privacyUrl);
        if (url === null) {
            throw new BadRequestException({
                message:
                    "Use the full address of your privacy page, starting https://",
                field: "privacyUrl",
                problem: "format",
            });
        }
        privacyUrl = url;
    }

    return { verifications, trackers, privacyUrl };
}

@Injectable()
export class SiteTrackingService {
    /** The section, for anyone who can see the site. */
    async read(
        ctx: OrganizationContext,
        siteId: string,
    ): Promise<SiteTrackingView> {
        authorize(ctx, "site:read");
        await assertSiteInOrg(ctx, siteId);
        return this.view(ctx.organizationId, siteId);
    }

    /**
     * Save what changed. `site:update`, like the site's other settings: this
     * is what the public's browsers load.
     */
    async save(
        ctx: OrganizationContext,
        siteId: string,
        body: unknown,
    ): Promise<SiteTrackingView> {
        authorize(ctx, "site:update");
        await assertSiteInOrg(ctx, siteId);
        const input = parseSiteTrackingInput(body);
        const organizationId = ctx.organizationId;

        const [existing, settings] = await Promise.all([
            prisma.siteTracker.findMany({
                where: { siteId, organizationId },
                select: { kind: true, enabled: true },
            }),
            prisma.siteTrackingSettings.findFirst({
                where: { siteId, organizationId },
                select: { switchedOffAt: true },
            }),
        ]);
        const enabledNow = new Map(existing.map((t) => [t.kind, t.enabled]));
        // Adding a tracker, or turning one back on, is what the plan
        // governs; changing or removing one is always allowed.
        const turnsOn = Object.entries(input.trackers).some(([kind, t]) => {
            if (!t) return false;
            const was = enabledNow.get(kind);
            const will = t.enabled ?? was ?? true;
            return will && was !== true;
        });
        if (turnsOn) {
            if (settings?.switchedOffAt) {
                // `details`, because the exception filter passes that on and
                // drops other keys: the workspace tells this 403 by its code.
                throw new ForbiddenException({
                    message:
                        "Saroh has switched off trackers on this site. Contact support to turn them back on.",
                    details: { code: "TRACKERS_SWITCHED_OFF" },
                });
            }
            await planMeter.assertIncluded(organizationId, "site-trackers");
        }

        await prisma.$transaction(async (tx) => {
            for (const [service, code] of Object.entries(input.verifications)) {
                if (code === null) {
                    await tx.siteVerification.deleteMany({
                        where: { siteId, organizationId, service },
                    });
                } else {
                    await tx.siteVerification.upsert({
                        where: { siteId_service: { siteId, service } },
                        create: { siteId, organizationId, service, code },
                        update: { code },
                    });
                }
            }
            for (const [kind, t] of Object.entries(input.trackers)) {
                if (t === null) {
                    await tx.siteTracker.deleteMany({
                        where: { siteId, organizationId, kind },
                    });
                } else {
                    await tx.siteTracker.upsert({
                        where: { siteId_kind: { siteId, kind } },
                        create: {
                            siteId,
                            organizationId,
                            kind,
                            trackerId: t.id,
                            region: t.region,
                            enabled: t.enabled ?? true,
                        },
                        update: {
                            trackerId: t.id,
                            region: t.region,
                            ...(t.enabled === undefined
                                ? {}
                                : { enabled: t.enabled }),
                        },
                    });
                }
            }
            if (input.privacyUrl !== undefined) {
                await tx.siteTrackingSettings.upsert({
                    where: { siteId },
                    create: {
                        siteId,
                        organizationId,
                        privacyUrl: input.privacyUrl,
                    },
                    update: { privacyUrl: input.privacyUrl },
                });
            }
        });

        return this.view(organizationId, siteId);
    }

    private async view(
        organizationId: string,
        siteId: string,
    ): Promise<SiteTrackingView> {
        const [codes, trackers, settings] = await Promise.all([
            prisma.siteVerification.findMany({
                where: { siteId, organizationId },
                select: { service: true, code: true },
            }),
            prisma.siteTracker.findMany({
                where: { siteId, organizationId },
                select: {
                    kind: true,
                    trackerId: true,
                    region: true,
                    enabled: true,
                },
            }),
            prisma.siteTrackingSettings.findFirst({
                where: { siteId, organizationId },
                select: { privacyUrl: true, switchedOffAt: true },
            }),
        ]);
        const verifications = Object.fromEntries(
            VERIFICATION_SERVICES.map((s) => [
                s,
                codes.find((c) => c.service === s)?.code ?? null,
            ]),
        ) as Record<VerificationService, string | null>;
        return {
            verifications,
            // In the list's own order, so the section never reshuffles.
            trackers: TRACKER_KINDS.flatMap((kind) => {
                const t = trackers.find((row) => row.kind === kind);
                if (!t) return [];
                return [
                    {
                        kind,
                        trackerId: t.trackerId,
                        region: isPosthogRegion(t.region) ? t.region : null,
                        enabled: t.enabled,
                    },
                ];
            }),
            privacyUrl: settings?.privacyUrl ?? null,
            switchedOff: Boolean(settings?.switchedOffAt),
        };
    }
}
