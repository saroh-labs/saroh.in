import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import type { BusinessAccess } from "../billing/catalogue-access.service";
import { CatalogueAccessService } from "../billing/catalogue-access.service";
import {
    BYTES_PER_GB,
    bytesToGb,
    meteredKeyOf,
    STORED,
} from "../billing/metering";

export const USAGE_PAGE_SIZE = 25;
export const USAGE_MAX_PAGE_SIZE = 100;

/** Most or least bytes, or the highest share of the plan's limit first. */
export type StorageOrder = "most" | "least" | "closest";

export interface StorageUsageQuery {
    order?: StorageOrder;
    /** 1-based. */
    page?: number;
    limit?: number;
}

export interface StorageUsageRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: string;
    /** Photos and videos uploaded and checked (`Media.status` READY). */
    files: number;
    bytes: number;
    /** As the plan's `storageGb` counts it: decimal GB, up to the hundredth. */
    gb: number;
    /**
     * The plan's storage limit in GB, as `CatalogueAccessService` resolves
     * it (plan, overrides, add-ons). Null when the plan has no cap on it,
     * leaves storage off, is off the catalogue, or couldn't be read.
     */
    limitGb: number | null;
    /** Bytes as a whole-number share of `limitGb`; null with no limit. */
    usedPercent: number | null;
}

export interface StorageUsagePage {
    items: StorageUsageRow[];
    order: StorageOrder;
    page: number;
    limit: number;
    /** Businesses on the instance, so the screen can say "page 2 of 7". */
    total: number;
    /** Every business's storage added up, in bytes and GB. */
    totalBytes: number;
    totalGb: number;
}

interface RawRow {
    id: string;
    name: string;
    slug: string;
    lifecycleStatus: string;
    files: bigint | number;
    bytes: bigint | number;
}

/**
 * Storage used by each business (#798) — a CROSS-TENANT READ.
 *
 * It reads every Organization's stored media with no Organization context,
 * so the `org_isolation` policies take their permissive branch; that is only
 * safe because its controller sits behind `@AdminRoutes()` and
 * `organization:read` (`docs/patterns/backend-auth-and-access.md`,
 * "Cross-tenant reads"). It returns a business's name, state and totals —
 * never a file, its name or who uploaded it.
 *
 * What counts is what the plan's `storageGb` counts (`billing/metering.ts`):
 * READY media only. A business with nothing stored is listed at 0, so
 * "least" reads as the businesses that have uploaded nothing.
 */
@Injectable()
export class AdminUsageService {
    private readonly logger = new Logger(AdminUsageService.name);

    constructor(
        @Optional()
        private readonly access: CatalogueAccessService = new CatalogueAccessService(),
    ) {}

    async storage(query: StorageUsageQuery): Promise<StorageUsagePage> {
        const order: StorageOrder =
            query.order === "least" || query.order === "closest"
                ? query.order
                : "most";
        const limit = clampLimit(query.limit);
        const page = clampPage(query.page);
        const direction = Prisma.raw(order === "least" ? "ASC" : "DESC");
        // "Closest" ranks by a limit only the resolver knows, so it reads
        // every business and pages after sorting.
        const paged = order !== "closest";

        const [rows, totals] = await Promise.all([
            prisma.$queryRaw<RawRow[]>(Prisma.sql`
                SELECT o."id", o."name", o."slug", o."lifecycleStatus",
                    COUNT(m."id") AS "files",
                    COALESCE(SUM(m."sizeBytes"), 0) AS "bytes"
                FROM "Organization" o
                LEFT JOIN "Media" m
                    ON m."organizationId" = o."id" AND m."status" = ${STORED}
                GROUP BY o."id"
                ORDER BY "bytes" ${direction}, o."name" ASC, o."id" ASC
                ${paged ? Prisma.sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}` : Prisma.empty}`),
            prisma.$queryRaw<
                { total: bigint | number; bytes: bigint | number }[]
            >(
                Prisma.sql`
                SELECT
                    (SELECT COUNT(*) FROM "Organization") AS "total",
                    (SELECT COALESCE(SUM("sizeBytes"), 0) FROM "Media"
                        WHERE "status" = ${STORED}) AS "bytes"`,
            ),
        ]);

        const totalBytes = Number(totals[0]?.bytes ?? 0);
        const items = await this.withLimits(rows);
        if (!paged) {
            items.sort(
                (a, b) =>
                    (b.usedPercent ?? -1) - (a.usedPercent ?? -1) ||
                    b.bytes - a.bytes ||
                    a.name.localeCompare(b.name) ||
                    a.id.localeCompare(b.id),
            );
        }
        return {
            items: paged
                ? items
                : items.slice((page - 1) * limit, page * limit),
            order,
            page,
            limit,
            total: Number(totals[0]?.total ?? 0),
            totalBytes,
            totalGb: bytesToGb(totalBytes),
        };
    }

    /**
     * Each row with its plan's storage limit. shortcut: one resolve per
     * business, ten at a time; "closest" resolves every business, so move
     * the limit into SQL if an instance grows past a few thousand.
     */
    private async withLimits(rows: RawRow[]): Promise<StorageUsageRow[]> {
        const out: StorageUsageRow[] = [];
        for (let i = 0; i < rows.length; i += 10) {
            out.push(
                ...(await Promise.all(
                    rows.slice(i, i + 10).map(async (row) => {
                        const bytes = Number(row.bytes);
                        const limitGb = await this.limitOf(row.id);
                        return {
                            id: row.id,
                            name: row.name,
                            slug: row.slug,
                            lifecycleStatus: row.lifecycleStatus,
                            files: Number(row.files),
                            bytes,
                            gb: bytesToGb(bytes),
                            limitGb,
                            usedPercent: usedPercent(bytes, limitGb),
                        };
                    }),
                )),
            );
        }
        return out;
    }

    private async limitOf(organizationId: string): Promise<number | null> {
        try {
            return storageLimitGb(await this.access.resolve(organizationId));
        } catch (err) {
            this.logger.warn(
                `admin_usage_limit_unread org=${organizationId} error=${err instanceof Error ? err.name : "unknown"}`,
            );
            return null;
        }
    }
}

/** The storage row's cap, when the plan has storage on with a cap. */
export function storageLimitGb(access: BusinessAccess): number | null {
    if (access.source !== "catalogue") return null;
    const row = access.modules.find(
        (m) => meteredKeyOf(m.moduleId) === "storageGb",
    );
    return row?.state === "on" ? row.limit : null;
}

/** Bytes as a whole-number percent of a GB limit; null with no limit. */
export function usedPercent(
    bytes: number,
    limitGb: number | null,
): number | null {
    if (limitGb === null || limitGb <= 0) return null;
    return Math.round((bytes / (limitGb * BYTES_PER_GB)) * 100);
}

function clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) return USAGE_PAGE_SIZE;
    return Math.min(USAGE_MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

function clampPage(page?: number): number {
    if (page === undefined || !Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page));
}
