import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { Edition } from "@saroh/edition";

import { isBootstrapAdmin } from "../../common/guards/platform-admin.guard";
import { getRequestContext } from "../../common/logging/request-context";
import { byBusinessIds, editionWhere } from "./admin-edition";
import type { AdminPermission } from "./admin-permissions";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const MAX_METADATA_BYTES = 16_384;
const MAX_METADATA_DEPTH = 20;
const SECRET_BEARING_KEY =
    /token|secret|credential|signature|payload|password|authorization/i;

export const AdminAuditOutcome = {
    Success: "SUCCESS",
    Failure: "FAILURE",
    Denied: "DENIED",
} as const;

export type AdminAuditOutcome =
    (typeof AdminAuditOutcome)[keyof typeof AdminAuditOutcome];

export interface AdminAuditInput {
    actorUserId: string;
    permission: AdminPermission;
    action: string;
    targetType: string;
    targetId?: string;
    organizationId?: string;
    reason?: string;
    outcome: AdminAuditOutcome;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
}

/** How the ledger names an actor with no staff grant (A1). */
export const NON_STAFF_ACTOR = "Non-staff account";

export interface AdminAuditListInput {
    cursor?: string;
    limit?: number;
    actorUserId?: string;
    organizationId?: string;
    action?: string;
    /** Part of the actor's name or email. */
    actor?: string;
    /** Part of the business's name. */
    business?: string;
}

export interface AdminAuditListItem {
    id: string;
    actorUserId: string;
    permission: string;
    action: string;
    targetType: string;
    targetId: string | null;
    organizationId: string | null;
    reason: string | null;
    outcome: string;
    correlationId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    sessionId: string | null;
    metadata: unknown;
    createdAt: Date;
    /** The actor's name, else email; null when the account is gone. */
    actorName: string | null;
    organizationName: string | null;
}

export interface AdminAuditPage {
    items: AdminAuditListItem[];
    nextCursor?: string;
}

type AdminAuditWriter = Pick<Prisma.TransactionClient, "adminAuditEvent">;

/**
 * Append-only, cross-tenant control-plane audit ledger.
 *
 * Mutations call `write` with their transaction client so an unaudited change
 * cannot commit. Reads call `recordRead`: an audit outage is reported but does
 * not replace a successful read response with an unrelated failure.
 */
@Injectable()
export class AdminAuditService {
    private readonly logger = new Logger(AdminAuditService.name);

    async write(tx: AdminAuditWriter, input: AdminAuditInput): Promise<void> {
        await tx.adminAuditEvent.create({
            data: createAdminAuditData(input),
        });
    }

    async recordRead(input: AdminAuditInput): Promise<void> {
        try {
            await prisma.adminAuditEvent.create({
                data: createAdminAuditData(input),
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : "unknown audit error";
            this.logger.error(
                `Failed to record admin read audit for ${input.action}: ${message}`,
            );
        }
    }

    /**
     * The ledger, newest first. Only staff are named or searched (A1, 21
     * Nov): a merchant refused at `/admin` shows as "Non-staff account", so
     * `audit:read` never turns into a lookup of merchants' names and
     * emails. `edition` keeps the rows to that console's businesses (and
     * rows of no business), as every other list does.
     */
    async list(
        input: AdminAuditListInput = {},
        edition: Edition | null = null,
    ): Promise<AdminAuditPage> {
        const limit = clampLimit(input.limit);
        // The ledger has no relations by design; names resolve to ids here.
        const actorIds = input.actor?.trim()
            ? (
                  await prisma.user.findMany({
                      where: {
                          platformAdmin: { isNot: null },
                          OR: [
                              {
                                  name: {
                                      contains: input.actor.trim(),
                                      mode: "insensitive",
                                  },
                              },
                              {
                                  email: {
                                      contains: input.actor.trim(),
                                      mode: "insensitive",
                                  },
                              },
                          ],
                      },
                      select: { id: true },
                      take: 100,
                  })
              ).map((u) => u.id)
            : null;
        const businessIds = input.business?.trim()
            ? (
                  await prisma.organization.findMany({
                      where: {
                          ...editionWhere(edition),
                          name: {
                              contains: input.business.trim(),
                              mode: "insensitive",
                          },
                      },
                      select: { id: true },
                      take: 100,
                  })
              ).map((o) => o.id)
            : null;
        const inEdition = await byBusinessIds(edition);
        const rows = await prisma.adminAuditEvent.findMany({
            where: {
                AND: [
                    input.actorUserId ? { actorUserId: input.actorUserId } : {},
                    input.organizationId
                        ? { organizationId: input.organizationId }
                        : {},
                    input.action ? { action: input.action } : {},
                    actorIds ? { actorUserId: { in: actorIds } } : {},
                    businessIds ? { organizationId: { in: businessIds } } : {},
                    inEdition,
                ],
            },
            ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
            take: limit + 1,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
                id: true,
                actorUserId: true,
                permission: true,
                action: true,
                targetType: true,
                targetId: true,
                organizationId: true,
                reason: true,
                outcome: true,
                correlationId: true,
                ipAddress: true,
                userAgent: true,
                sessionId: true,
                metadata: true,
                createdAt: true,
            },
        });

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const [users, orgs] = await Promise.all([
            prisma.user.findMany({
                where: {
                    id: { in: [...new Set(page.map((r) => r.actorUserId))] },
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    platformAdmin: { select: { id: true } },
                },
            }),
            prisma.organization.findMany({
                where: {
                    id: {
                        in: [
                            ...new Set(
                                page.flatMap((r) =>
                                    r.organizationId ? [r.organizationId] : [],
                                ),
                            ),
                        ],
                    },
                },
                select: { id: true, name: true },
            }),
        ]);
        const userName = new Map(
            users.map((u) => [
                u.id,
                u.platformAdmin || isBootstrapAdmin(u.email)
                    ? u.name?.trim()
                        ? u.name
                        : u.email
                    : NON_STAFF_ACTOR,
            ]),
        );
        const orgName = new Map(orgs.map((o) => [o.id, o.name]));
        const items = page.map((row) => ({
            ...row,
            actorName: userName.get(row.actorUserId) ?? null,
            organizationName: row.organizationId
                ? (orgName.get(row.organizationId) ?? null)
                : null,
        }));

        return {
            items,
            nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
        };
    }
}

export function createAdminAuditData(
    input: AdminAuditInput,
): Prisma.AdminAuditEventCreateInput {
    const metadata = input.metadata
        ? validateMetadata(input.metadata)
        : undefined;

    const request = getRequestContext();
    return {
        ipAddress: request?.ip,
        userAgent: request?.userAgent,
        sessionId: request?.sessionId,
        actorUserId: input.actorUserId,
        permission: input.permission,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        organizationId: input.organizationId,
        reason: input.reason,
        outcome: input.outcome,
        correlationId: request?.correlationId,
        idempotencyKey: input.idempotencyKey,
        metadata,
    };
}

function validateMetadata(
    metadata: Record<string, unknown>,
): Prisma.InputJsonValue {
    validateJsonValue(metadata, 0);

    const encoded = JSON.stringify(metadata);
    if (Buffer.byteLength(encoded, "utf8") > MAX_METADATA_BYTES) {
        throw new BadRequestException(
            `Admin audit metadata exceeds ${MAX_METADATA_BYTES} bytes`,
        );
    }

    return metadata as Prisma.InputJsonObject;
}

function validateJsonValue(value: unknown, depth: number): void {
    if (depth > MAX_METADATA_DEPTH) {
        throw new BadRequestException(
            "Admin audit metadata is too deeply nested",
        );
    }

    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
    ) {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            validateJsonValue(item, depth + 1);
        }
        return;
    }

    if (typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
            if (SECRET_BEARING_KEY.test(key)) {
                throw new BadRequestException(
                    `Admin audit metadata key "${key}" is prohibited`,
                );
            }
            validateJsonValue(child, depth + 1);
        }
        return;
    }

    throw new BadRequestException(
        "Admin audit metadata must be valid JSON data",
    );
}

function clampLimit(limit?: number): number {
    if (limit === undefined || !Number.isFinite(limit)) {
        return DEFAULT_PAGE_SIZE;
    }
    return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(limit)));
}
