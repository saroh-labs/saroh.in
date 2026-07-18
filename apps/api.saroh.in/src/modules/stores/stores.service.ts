import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrgRole } from "../../common/types/organization-context";
import { ORG_ROLES } from "../../common/types/organization-context";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import type { OrgAction } from "../organizations/organization-policy";
import { can } from "../organizations/organization-policy";

import type { CreateStoreDto, UpdateStoreDto } from "./dto";
import { slugify } from "./slug";

/** Staff roles allowed to mutate a store (VIEWER is read-only). */
const WRITE_ROLES = new Set(["ADMIN", "MANAGER", "EDITOR"]);

/** Narrow a raw DB role string to a known OrgRole (else null). */
function toOrgRole(role: string): OrgRole | null {
    return (ORG_ROLES as readonly string[]).includes(role)
        ? (role as OrgRole)
        : null;
}

/**
 * Store data layer — the single place the DB is touched for stores. Every
 * method takes an explicit `userId` (resolved from the Better Auth session by
 * the controller, never client input).
 *
 * Authorization (S1-006, ADR-001) runs on one of two paths, chosen per-Store by
 * the ORG_AUTHORIZATION feature flag (resolved against the Store's own
 * organizationId, default OFF):
 *
 *  - Flag OFF (legacy, unchanged): a StoreOwner has full access; a StoreMembers
 *    staffer can read, and can write only with a write-capable role
 *    (ADMIN/MANAGER/EDITOR — not VIEWER).
 *  - Flag ON (Organization path): the caller's `Membership` role for the
 *    Store's Organization is evaluated against the pure org policy
 *    (`can(role, action)`). Because legacy StoreMembers staff were NOT all
 *    migrated to Membership, the org path DUAL-READS: if the org policy does not
 *    grant access (no membership, or the role denies), it FALLS BACK to the
 *    legacy StoreOwner/StoreMembers check so no current user loses access during
 *    the transition. Access is granted if EITHER path grants it.
 *
 * Precedence when the flag is ON, for a given store operation → OrgAction:
 *   1. Store missing / soft-deleted            → NotFound (no existence leak).
 *   2. Store has a null organizationId         → reject (org-less guard below).
 *   3. Membership exists AND can(role, action) → ALLOW.
 *   4. Otherwise                               → legacy dual-read fallback.
 *   5. Legacy also denies                      → DENY.
 *
 * Store-op → OrgAction mapping: read (getForUser) → "store:read";
 * write (canWrite) → "store:write".
 */
@Injectable()
export class StoresService {
    constructor(private readonly featureFlags: FeatureFlagService) {}

    /** Stores the user owns or is a member of (newest first), non-deleted. */
    listForUser(userId: string) {
        return prisma.store.findMany({
            where: {
                deletedAt: null,
                OR: [
                    { owners: { some: { userId } } },
                    { members: { some: { userId } } },
                ],
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** The store if the user can access it; 404 otherwise (no existence leak). */
    async getForUser(storeId: string, userId: string) {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
        });
        if (!store) {
            throw new NotFoundException("Store not found");
        }

        if (!(await this.useOrgPath(store.organizationId))) {
            // LEGACY path — behavior unchanged from before S1-006.
            return this.getForUserLegacy(storeId, userId);
        }

        // ORG path. organizationId is non-null here (useOrgPath only returns
        // true for a resolvable org); assertStoreHasOrg re-checks defensively.
        this.assertStoreHasOrg(store.organizationId);
        if (await this.orgAllows(store.organizationId, userId, "store:read")) {
            return store;
        }
        // DUAL-READ fallback: legacy grant keeps un-migrated staff in.
        return this.getForUserLegacy(storeId, userId);
    }

    async isOwner(storeId: string, userId: string): Promise<boolean> {
        const owner = await prisma.storeOwner.findUnique({
            where: { storeId_userId: { storeId, userId } },
        });
        return Boolean(owner);
    }

    /** Owner, or a member with a write-capable role. */
    async canWrite(storeId: string, userId: string): Promise<boolean> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        // A missing/deleted store has no owners or members → not writable.
        if (!store) return false;

        if (!(await this.useOrgPath(store.organizationId))) {
            // LEGACY path — behavior unchanged from before S1-006.
            return this.canWriteLegacy(storeId, userId);
        }

        this.assertStoreHasOrg(store.organizationId);
        if (await this.orgAllows(store.organizationId, userId, "store:write")) {
            return true;
        }
        // DUAL-READ fallback to the legacy owner/member write check.
        return this.canWriteLegacy(storeId, userId);
    }

    // ------------------------------------------------------------------
    // Authorization internals
    // ------------------------------------------------------------------

    /**
     * Whether the ORG_AUTHORIZATION path is active for a Store. Resolved against
     * the Store's own organizationId (per-org override > global default > false).
     * A null organizationId can only reach the org path if the GLOBAL default is
     * flipped ON; that org-less case is then rejected by assertStoreHasOrg.
     */
    private useOrgPath(organizationId: string | null): Promise<boolean> {
        return this.featureFlags.isEnabled(
            FlagKey.ORG_AUTHORIZATION,
            organizationId ?? undefined,
        );
    }

    /**
     * Application-layer guard replacing the deferred NOT NULL DB constraint:
     * once ORG_AUTHORIZATION is on, a Store with no Organization cannot be
     * authorized and is a data-integrity error.
     *
     * TODO(S1): backfill every Store.organizationId and make the column NOT NULL
     * in schema.prisma, then this guard becomes unreachable and can be removed.
     */
    private assertStoreHasOrg(
        organizationId: string | null,
    ): asserts organizationId is string {
        if (!organizationId) {
            throw new ConflictException(
                "Store is not attached to an Organization; org authorization cannot be applied",
            );
        }
    }

    /** True if the caller's Organization membership role permits `action`. */
    private async orgAllows(
        organizationId: string,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { role: true },
        });
        if (!membership) return false;
        const role = toOrgRole(membership.role);
        return role !== null && can(role, action);
    }

    /** Original read authorization: owner OR member, else 404. */
    private async getForUserLegacy(storeId: string, userId: string) {
        const store = await prisma.store.findFirst({
            where: {
                id: storeId,
                deletedAt: null,
                OR: [
                    { owners: { some: { userId } } },
                    { members: { some: { userId } } },
                ],
            },
        });
        if (!store) {
            throw new NotFoundException("Store not found");
        }
        return store;
    }

    /** Original write authorization: owner OR write-capable member. */
    private async canWriteLegacy(
        storeId: string,
        userId: string,
    ): Promise<boolean> {
        if (await this.isOwner(storeId, userId)) return true;
        const member = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId, userId } },
            select: { role: true },
        });
        return Boolean(member && WRITE_ROLES.has(member.role));
    }

    /** Create a store and record the creator as OWNER, atomically. */
    async createForUser(userId: string, dto: CreateStoreDto) {
        const slug = slugify(dto.slug ?? dto.name);
        if (!slug) {
            throw new BadRequestException({
                message: "Could not derive a slug from the name",
                field: "slug",
            });
        }
        if (!(await this.isSlugAvailable(slug))) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }

        try {
            const store = await prisma.store.create({
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    // Nested create runs in one transaction → no orphan store.
                    owners: { create: { userId, role: "OWNER" } },
                },
            });
            return { id: store.id };
        } catch {
            // Unique-constraint backstop for a slug race between the check
            // above and the insert.
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Update a store's core fields — owner or a write-capable member. */
    async updateForUser(userId: string, storeId: string, dto: UpdateStoreDto) {
        if (!(await this.canWrite(storeId, userId))) {
            throw new NotFoundException("Store not found");
        }

        const slug = slugify(dto.slug);
        const current = await prisma.store.findUnique({
            where: { id: storeId },
            select: { slug: true },
        });
        if (
            current &&
            current.slug !== slug &&
            !(await this.isSlugAvailable(slug))
        ) {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }

        try {
            await prisma.store.update({
                where: { id: storeId },
                data: {
                    name: dto.name,
                    slug,
                    description: dto.description ?? null,
                    logo: dto.logo ?? null,
                },
            });
            return { id: storeId };
        } catch {
            throw new ConflictException({
                message: "That slug is already taken",
                field: "slug",
            });
        }
    }

    /** Store slugs are globally unique (Store.slug @unique). */
    private async isSlugAvailable(slug: string): Promise<boolean> {
        const existing = await prisma.store.findUnique({ where: { slug } });
        return !existing;
    }
}
