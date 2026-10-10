import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { MAX_STOREFRONTS_PER_BUSINESS } from "../organizations/business-limits";
import { assertMemberNotPaused } from "../organizations/member-paused";
import { assertMembersMayOpen } from "../organizations/organization-lifecycle.gate";
import type { OrgAction } from "../organizations/organization-policy";
import {
    isBuiltInRole,
    resolveCapabilities,
} from "../organizations/organization-policy";

import { NEW_STOREFRONT_TYPES } from "../orders/fulfilment";
import { businessCurrency } from "./currency";
import type { CreateStoreDto, UpdateStoreDto } from "./dto";

/**
 * Storefront roles allowed to change a store and take its orders (VIEWER is
 * read-only). Never money: that is the permissions' alone (DEC-106,
 * `moneyAllows`).
 */
const WRITE_ROLES = new Set(["ADMIN", "MANAGER", "EDITOR"]);

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
            throw new NotFoundException("Location not found");
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
        return (await this.writableOrganization(storeId, userId)) !== null;
    }

    /**
     * Write access AND the owning Organization, resolved in one pass.
     *
     * Returns `null` when the store is missing, deleted, or not writable by
     * this user. Returns `{ organizationId }` when it IS writable — where
     * `organizationId` may itself be null for a legacy org-less store, which is
     * why this is an object rather than a bare `string | null`: "not writable"
     * and "writable but has no org" are different answers and must not collapse.
     *
     * Commerce rows (Order, Customer, Product, Category, Inventory) carry a
     * NULLABLE `organizationId` that MUST be stamped on write. A NULL there is
     * invisible both to `WHERE "organizationId" = $1` (SQL three-valued logic)
     * and to the `org_isolation` RLS policy built on the same predicate, so the
     * row silently vanishes from the tenant that owns it (#173). Handing the id
     * back from the write guard makes that stamp hard to forget: the check a
     * caller must already perform yields the value it must already store.
     */
    async writableOrganization(
        storeId: string,
        userId: string,
    ): Promise<{ organizationId: string | null } | null> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        // A missing/deleted store has no owners or members → not writable.
        if (!store) return null;
        const writable = { organizationId: store.organizationId };

        if (!(await this.useOrgPath(store.organizationId))) {
            // LEGACY path — behavior unchanged from before S1-006.
            return (await this.canWriteLegacy(storeId, userId))
                ? writable
                : null;
        }

        this.assertStoreHasOrg(store.organizationId);
        if (await this.orgAllows(store.organizationId, userId, "store:write")) {
            return writable;
        }
        // DUAL-READ fallback to the legacy owner/member write check.
        return (await this.canWriteLegacy(storeId, userId)) ? writable : null;
    }

    /**
     * The store-scoped order writes (B16): the owning Organization when the
     * caller may take this order `action` here, `null` when not (or the
     * store is missing).
     *
     * On the organization path it is the caller's business role that
     * decides — `order:create`, `order:edit` or `order:refund`, never
     * `store:write`, which changes storefronts, not orders (matrix §3). A
     * storefront role that writes to this storefront (a `StoreOwner`, or a
     * storefront Admin, Manager or Editor) keeps taking and changing its
     * orders (DEC-048) — but never its money (DEC-106). A write that
     * records or takes a payment, or refunds or cancels (`money`, and every
     * `order:refund`), is asked of the permissions only: `moneyAllows`.
     */
    async orderWriteOrganization(
        storeId: string,
        userId: string,
        action: OrgAction,
        { money = false }: { money?: boolean } = {},
    ): Promise<{ organizationId: string | null } | null> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!store) return null;
        const writable = { organizationId: store.organizationId };

        if (money || action === "order:refund") {
            return (await this.moneyAllowsFor(
                storeId,
                store.organizationId,
                userId,
                action,
            ))
                ? writable
                : null;
        }

        if (!(await this.useOrgPath(store.organizationId))) {
            return (await this.canWriteLegacy(storeId, userId))
                ? writable
                : null;
        }

        this.assertStoreHasOrg(store.organizationId);
        if (await this.orgAllows(store.organizationId, userId, action)) {
            return writable;
        }
        return (await this.canWriteLegacy(storeId, userId)) ? writable : null;
    }

    /**
     * Whether the caller's membership in the store's business permits an
     * action beyond the store's own read/write — `order:read` or
     * `product-review:read` on a product page that shows orders and reviews.
     * Membership only: a legacy store grant says nothing about those areas.
     */
    async memberAllows(
        storeId: string,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!store?.organizationId) return false;
        return this.orgAllows(store.organizationId, userId, action);
    }

    /**
     * Whether this storefront's money is the caller's to see or take
     * (DEC-106, extending DEC-098 to storefronts): asked of the permissions
     * the caller's business role carries (ADR-008), and never of a
     * storefront role — no storefront Admin, Manager or Editor grants money
     * by its name. A storefront role that should take payments needs a
     * business role carrying the payment permission.
     *
     * With ORG_AUTHORIZATION off (the older per-store model, which has no
     * permissions to ask) the storefront's owner keeps it too; on the
     * organization path a `StoreOwner` row is no shortcut either.
     */
    async moneyAllows(
        storeId: string,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!store) return false;
        return this.moneyAllowsFor(
            storeId,
            store.organizationId,
            userId,
            action,
        );
    }

    private async moneyAllowsFor(
        storeId: string,
        organizationId: string | null,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        if (
            organizationId &&
            (await this.orgAllows(organizationId, userId, action))
        ) {
            return true;
        }
        if (await this.useOrgPath(organizationId)) return false;
        return this.isOwner(storeId, userId);
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

    /**
     * True if the caller's Organization membership role permits `action`.
     *
     * A team member past the plan's limit (#800) is refused here as they
     * are at the organization context: 403 `MEMBER_PAUSED`, before their
     * role is asked and before the legacy dual-read fallback, so a
     * storefront route that never builds the context neither lets them in
     * nor answers with a generic denial (`member-paused.ts`). The legacy
     * path (ORG_AUTHORIZATION off) never reads membership, and is unchanged.
     */
    private async orgAllows(
        organizationId: string,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        const membership = await prisma.membership.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: {
                id: true,
                role: true,
                extraActions: true,
                organization: { select: { lifecycleStatus: true } },
            },
        });
        if (!membership) return false;
        // A deleted business is closed to its people (#921), as at the
        // organization context.
        assertMembersMayOpen(membership.organization.lifecycleStatus);
        await assertMemberNotPaused(organizationId, membership);
        // Resolved from the business's own role, not from the role's name. A
        // role the business invented maps to MEMBER by name, and MEMBER's floor
        // includes `store:read` — so judging by name handed every invented role
        // the storefronts whether or not the owner ticked them.
        const stored = isBuiltInRole(membership.role)
            ? null
            : await prisma.organizationRole.findUnique({
                  where: {
                      organizationId_key: {
                          organizationId,
                          key: membership.role,
                      },
                  },
                  select: { actions: true },
              });
        // The person's own extras count too (F17).
        return resolveCapabilities(
            membership.role,
            stored?.actions,
            membership.extraActions,
        ).has(action);
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
            throw new NotFoundException("Location not found");
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

    /**
     * Create a store under an Organization and record the creator as OWNER,
     * atomically. `organizationId` is REQUIRED (Store.organizationId is NOT NULL
     * as of B5) and is proven by the caller (the org-scoped controller resolves
     * it from the request context, never the client body).
     *
     * Caps on the business's live storefronts at the product's ceiling (a
     * 409: upgrading would not help), checked before anything else. The
     * plan caps only places customers visit (owner, 8 Oct): a new
     * storefront is online until its kind says otherwise, so it is 0
     * locations, and the kind change is what's checked
     * (`StorefrontsService.update`) — by the catalogue's `locations` row
     * where it governs, else by the old `storefronts` floor (ADR-010,
     * `billing/legacy-location-floor.ts`).
     */
    async createForUser(
        userId: string,
        organizationId: string,
        dto: CreateStoreDto,
    ) {
        const existing = await prisma.store.count({
            where: { organizationId, deletedAt: null },
        });
        if (existing >= MAX_STOREFRONTS_PER_BUSINESS) {
            throw new ConflictException({
                message: `This business has ${existing} locations, as many as Saroh allows. Close one it no longer sells from to add another.`,
            });
        }
        // A business sells in one currency (DEC-030): a new storefront takes
        // the business's, rather than reading as the column default (USD)
        // until someone saves its settings.
        const currency = await businessCurrency(prisma, organizationId);
        // No slug: the storefront "Web address" is gone (DEC-069, L14). A
        // `slug` an older app still sends is ignored.
        const store = await prisma.store.create({
            data: {
                name: dto.name,
                description: dto.description ?? null,
                organization: { connect: { id: organizationId } },
                // Nested create runs in one transaction → no orphan store.
                owners: { create: { userId, role: "OWNER" } },
                // Its settings say what it offers from the start (B2a), the
                // same as a storefront with no settings row reads.
                ...(currency
                    ? {
                          settings: {
                              create: {
                                  currency,
                                  fulfilmentTypes: NEW_STOREFRONT_TYPES,
                              },
                          },
                      }
                    : {}),
            },
        });
        return { id: store.id };
    }

    /** Update a store's core fields — owner or a write-capable member. */
    async updateForUser(userId: string, storeId: string, dto: UpdateStoreDto) {
        if (!(await this.canWrite(storeId, userId))) {
            throw new NotFoundException("Location not found");
        }

        // `dto.slug` (an older app still sends it) is ignored: the slug
        // is no longer read or written (DEC-069, L14). A row keeps its own.
        await prisma.store.update({
            where: { id: storeId },
            data: {
                name: dto.name,
                description: dto.description ?? null,
                logo: dto.logo ?? null,
            },
        });
        return { id: storeId };
    }
}
