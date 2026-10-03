import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    UnprocessableEntityException,
} from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { Catalog } from "@saroh/pricing-catalog";
import { diff, validateCatalog } from "@saroh/pricing-catalog";

import type { Impact, ModuleUsage } from "./impact";
import { moduleUsage } from "./impact";
import { ImpactService } from "./impact.service";
import { signPreviewToken, verifyPreviewToken } from "./preview-token";
import {
    pricingPreviewSecret,
    pricingPreviewSecretOrNull,
} from "./pricing-secrets";
import type { PublicPricing } from "./public-catalog";
import { publicCatalog } from "./public-catalog";

/** The one shared draft's row id (KTD-3). */
export const SHARED_DRAFT_ID = "shared";

/** A member of staff as the admin shows them beside a version or a save. */
export interface StaffName {
    userId: string;
    name: string | null;
    email: string | null;
}

export type VersionStatus = "live" | "scheduled" | "earlier";

export interface AdminVersion {
    version: number;
    goLiveAt: string;
    /** Live: the newest whose go-live has passed. Scheduled: still ahead. */
    status: VersionStatus;
    policy: string;
    note: string;
    /** The change log, in words (`diff` against the version before). */
    changes: string[];
    /** Null for a version nobody published from the console (the installer). */
    publishedBy: StaffName | null;
    createdAt: string;
    /** Businesses whose subscription is on this version. */
    businesses: number;
    /** Subscriptions with a pending move to this version. */
    moving: number;
    catalog: Catalog;
}

export interface AdminDraft {
    /** As saved: it may not validate while it is being edited. */
    catalog: unknown;
    revision: number;
    baseVersion: number | null;
    createdAt: string;
    updatedAt: string;
    updatedBy: StaffName | null;
    valid: boolean;
    /** What stops it being published, in the words shown beside Publish. */
    errors: string[];
    /** What it changes from the live version, in words; empty when invalid. */
    changes: string[];
}

export interface AdminPlanCount {
    planId: string;
    name: string;
    retired: boolean;
    businesses: number;
    /** Of those, on a catalogue version other than the live one. */
    olderVersion: number;
}

/** `GET /admin/pricing`. */
export interface AdminPricing {
    now: string;
    liveVersion: number | null;
    draft: AdminDraft | null;
    /** Newest first. */
    versions: AdminVersion[];
    /**
     * Counts and usage are against the catalogue being edited: the draft when
     * it validates, else the live version.
     */
    editing: "draft" | "live" | null;
    plans: AdminPlanCount[];
    /** By plan id, one entry per module in catalogue order. */
    usage: Record<string, ModuleUsage[]>;
    /** Businesses counted, and the modules whose usage is counted at all. */
    businesses: { total: number; measured: string[] };
}

/** `GET /admin/pricing/impact`. */
export interface AdminPricingImpact {
    /** The draft revision this was worked out for. */
    revision: number;
    liveVersion: number | null;
    impact: Impact;
}

export interface PreviewTokenResult {
    token: string;
    expiresAt: string;
    revision: number;
}

/** What `impact()` compares a first-ever draft with: nothing published. */
function nothingPublished(next: Catalog): Catalog {
    return {
        plans: [],
        groups: [],
        modules: [],
        yearly: { on: false, paid: next.yearly.paid },
        gst: next.gst,
        addons: [],
    };
}

/**
 * Reads of the pricing catalogue (plans catalogue U3): the published version
 * for saroh.in, a draft preview for a signed token, and the full picture for
 * staff. Writes — the draft, publish, schedule, roll back — are U4's.
 *
 * The live version is resolved at read time (KTD-2): the newest version
 * whose `goLiveAt` has passed. Nothing here caches across requests, so a
 * scheduled version goes live at its `goLiveAt` on the next read.
 */
@Injectable()
export class CatalogueService {
    private readonly logger = new Logger(CatalogueService.name);

    constructor(private readonly impactService: ImpactService) {}

    /** A stored snapshot, parsed. One that doesn't is a corrupt row: a 500. */
    private parseStored(version: number, catalog: unknown): Catalog {
        const r = validateCatalog(catalog);
        if (r.ok) return r.catalog;
        this.logger.error(
            `pricing_catalogue_version_invalid version=${version} errors=${r.errors.length}`,
        );
        throw new Error(`Catalogue version ${version} does not validate`);
    }

    /** The live version and its snapshot, or null before any is installed. */
    async live(now: Date): Promise<{
        version: number;
        goLiveAt: Date;
        catalog: Catalog;
    } | null> {
        const row = await liveCatalogueVersion(prisma, now);
        if (!row) return null;
        return {
            version: row.version,
            goLiveAt: row.goLiveAt,
            catalog: this.parseStored(row.version, row.catalog),
        };
    }

    /** `GET /public/pricing`: the live catalogue as a visitor sees it. */
    async publicPricing(now: Date): Promise<PublicPricing> {
        const live = await this.live(now);
        if (!live) throw new NotFoundException("No pricing is published yet");
        return {
            version: live.version,
            goLiveAt: live.goLiveAt.toISOString(),
            preview: false,
            catalog: publicCatalog(live.catalog),
        };
    }

    /**
     * `GET /public/pricing?preview=`: the draft, as a visitor would see it,
     * for a token that checks and still names the draft's current revision.
     * Everything else — a forged, expired or over-long token, a newer save,
     * a draft that was published or discarded — is the same 404, so a caller
     * learns nothing about the draft.
     */
    async previewPricing(token: string, now: Date): Promise<PublicPricing> {
        const gone = () => new NotFoundException("Nothing to preview");
        const secret = pricingPreviewSecretOrNull();
        if (!secret) {
            this.logger.error("pricing_preview_secret_missing");
            throw gone();
        }
        const claim = verifyPreviewToken(secret, token, now);
        if (!claim) throw gone();
        const draft = await prisma.pricingCatalogDraft.findUnique({
            where: { id: SHARED_DRAFT_ID },
        });
        if (
            draft?.revision !== claim.revision ||
            draft.createdAt.getTime() !== claim.draftEpoch
        ) {
            throw gone();
        }
        const r = validateCatalog(draft.catalog);
        if (!r.ok) throw gone();
        return {
            version: null,
            goLiveAt: null,
            preview: true,
            catalog: publicCatalog(r.catalog),
        };
    }

    /**
     * `POST /admin/pricing/preview-token`: a token for the draft revision the
     * staff member is looking at. Refused when the draft has moved on (409,
     * naming the revision now saved) or doesn't validate (422, with why).
     */
    async mintPreviewToken(
        revision: number,
        now: Date,
    ): Promise<PreviewTokenResult> {
        const draft = await prisma.pricingCatalogDraft.findUnique({
            where: { id: SHARED_DRAFT_ID },
        });
        if (!draft) throw new NotFoundException("There's no draft to preview");
        if (draft.revision !== revision) {
            throw new ConflictException({
                message:
                    "The draft has been saved since. Reload to preview the latest.",
                details: { revision: draft.revision },
            });
        }
        const r = validateCatalog(draft.catalog);
        if (!r.ok) {
            throw new UnprocessableEntityException({
                message: "Fix the draft before previewing it.",
                details: { errors: r.errors },
            });
        }
        const { token, expiresAt } = signPreviewToken(
            pricingPreviewSecret(),
            { revision: draft.revision, draftEpoch: draft.createdAt.getTime() },
            now,
        );
        return {
            token,
            expiresAt: expiresAt.toISOString(),
            revision: draft.revision,
        };
    }

    /** `GET /admin/pricing`: live, draft, versions, counts and usage. */
    async adminPricing(now: Date): Promise<AdminPricing> {
        const [rows, draftRow] = await Promise.all([
            prisma.pricingCatalogVersion.findMany({
                orderBy: { version: "desc" },
            }),
            prisma.pricingCatalogDraft.findUnique({
                where: { id: SHARED_DRAFT_ID },
            }),
        ]);
        const versions = rows.map((r) => ({
            row: r,
            catalog: this.parseStored(r.version, r.catalog),
        }));
        // The newest by number whose go-live has passed, as liveCatalogueVersion.
        const live =
            versions.find((v) => v.row.goLiveAt.getTime() <= now.getTime()) ??
            null;

        const draftCheck = draftRow ? validateCatalog(draftRow.catalog) : null;
        const draftCatalog = draftCheck?.ok ? draftCheck.catalog : null;
        const editingCatalog = draftCatalog ?? live?.catalog ?? null;

        const known = new Set<string>();
        for (const v of versions)
            for (const p of v.catalog.plans) known.add(p.id);
        for (const p of draftCatalog?.plans ?? []) known.add(p.id);
        const { businesses, measured, movingTo } =
            await this.impactService.read(known, now);

        const staffIds = new Set<string>();
        for (const v of versions) {
            if (v.row.publishedByUserId) staffIds.add(v.row.publishedByUserId);
        }
        if (draftRow?.updatedByUserId) staffIds.add(draftRow.updatedByUserId);
        const staff = await this.staffNames([...staffIds]);
        const nameOf = (id: string | null) =>
            id
                ? (staff.get(id) ?? { userId: id, name: null, email: null })
                : null;

        const onVersion = new Map<number, number>();
        for (const b of businesses) {
            if (b.version === null) continue;
            onVersion.set(b.version, (onVersion.get(b.version) ?? 0) + 1);
        }

        const adminVersions: AdminVersion[] = versions.map(
            ({ row, catalog }) => ({
                version: row.version,
                goLiveAt: row.goLiveAt.toISOString(),
                status:
                    row.goLiveAt.getTime() > now.getTime()
                        ? "scheduled"
                        : row.version === live?.row.version
                          ? "live"
                          : "earlier",
                policy: row.policy,
                note: row.note,
                changes: Array.isArray(row.changes)
                    ? row.changes.filter(
                          (c): c is string => typeof c === "string",
                      )
                    : [],
                publishedBy: nameOf(row.publishedByUserId),
                createdAt: row.createdAt.toISOString(),
                businesses: onVersion.get(row.version) ?? 0,
                moving: movingTo.get(row.version) ?? 0,
                catalog,
            }),
        );

        const draft: AdminDraft | null = draftRow
            ? {
                  catalog: draftRow.catalog,
                  revision: draftRow.revision,
                  baseVersion: draftRow.baseVersion,
                  createdAt: draftRow.createdAt.toISOString(),
                  updatedAt: draftRow.updatedAt.toISOString(),
                  updatedBy: nameOf(draftRow.updatedByUserId),
                  valid: draftCheck?.ok ?? false,
                  errors: draftCheck && !draftCheck.ok ? draftCheck.errors : [],
                  changes:
                      draftCatalog && live
                          ? diff(live.catalog, draftCatalog)
                          : [],
              }
            : null;

        const plans: AdminPlanCount[] = (editingCatalog?.plans ?? []).map(
            (p) => {
                const list = businesses.filter((b) => b.planId === p.id);
                return {
                    planId: p.id,
                    name: p.name,
                    retired: p.retired,
                    businesses: list.length,
                    olderVersion: list.filter(
                        (b) =>
                            b.version !== null &&
                            b.version !== live?.row.version,
                    ).length,
                };
            },
        );
        const usage: Record<string, ModuleUsage[]> = {};
        if (editingCatalog) {
            for (const p of editingCatalog.plans) {
                usage[p.id] = editingCatalog.modules.map((m) =>
                    moduleUsage(
                        editingCatalog,
                        p.id,
                        m.id,
                        businesses,
                        measured,
                    ),
                );
            }
        }

        return {
            now: now.toISOString(),
            liveVersion: live?.row.version ?? null,
            draft,
            versions: adminVersions,
            editing: draftCatalog ? "draft" : live ? "live" : null,
            plans,
            usage,
            businesses: { total: businesses.length, measured: [...measured] },
        };
    }

    /** `GET /admin/pricing/impact`: what publishing the draft would do. */
    async adminImpact(now: Date): Promise<AdminPricingImpact> {
        const draft = await prisma.pricingCatalogDraft.findUnique({
            where: { id: SHARED_DRAFT_ID },
        });
        if (!draft) throw new NotFoundException("There's no draft to check");
        const r = validateCatalog(draft.catalog);
        if (!r.ok) {
            throw new UnprocessableEntityException({
                message: "Fix the draft before checking what it changes.",
                details: { errors: r.errors },
            });
        }
        const live = await this.live(now);
        const impact = await this.impactService.impactOf(
            live?.catalog ?? nothingPublished(r.catalog),
            r.catalog,
            now,
        );
        return {
            revision: draft.revision,
            liveVersion: live?.version ?? null,
            impact,
        };
    }

    private async staffNames(ids: string[]): Promise<Map<string, StaffName>> {
        if (!ids.length) return new Map();
        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
        });
        return new Map(
            users.map((u) => [
                u.id,
                { userId: u.id, name: u.name, email: u.email },
            ]),
        );
    }
}
