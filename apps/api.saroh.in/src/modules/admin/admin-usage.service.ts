import { Injectable } from "@nestjs/common";
import { Prisma, prisma } from "@saroh/database";

import { bytesToGb, STORED } from "../billing/metering";

export const USAGE_PAGE_SIZE = 25;
export const USAGE_MAX_PAGE_SIZE = 100;

export type StorageOrder = "most" | "least";

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
    async storage(query: StorageUsageQuery): Promise<StorageUsagePage> {
        const order: StorageOrder = query.order === "least" ? "least" : "most";
        const limit = clampLimit(query.limit);
        const page = clampPage(query.page);
        const direction = Prisma.raw(order === "least" ? "ASC" : "DESC");

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
                LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
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
        return {
            items: rows.map((row) => {
                const bytes = Number(row.bytes);
                return {
                    id: row.id,
                    name: row.name,
                    slug: row.slug,
                    lifecycleStatus: row.lifecycleStatus,
                    files: Number(row.files),
                    bytes,
                    gb: bytesToGb(bytes),
                };
            }),
            order,
            page,
            limit,
            total: Number(totals[0]?.total ?? 0),
            totalBytes,
            totalGb: bytesToGb(totalBytes),
        };
    }
}

function clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) return USAGE_PAGE_SIZE;
    return Math.min(USAGE_MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}

function clampPage(page?: number): number {
    if (page === undefined || !Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page));
}
