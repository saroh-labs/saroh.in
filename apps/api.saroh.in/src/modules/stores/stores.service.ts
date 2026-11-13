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
import { isLocationScoped } from "../orders/order-location";
import { businessCurrency } from "./currency";
import type { CreateStoreDto, UpdateStoreDto } from "./dto";
import type { LogoPatch } from "./location-logo";

/**
 * Storefront roles allowed to change a store and take its orders (VIEWER is
 * read-only). Never money: that is the permissions' alone (DEC-106,
 * `moneyAllows`).
 */
const WRITE_ROLES = new Set(["ADMIN", "MANAGER", "EDITOR"]);

/**
 * What the caller may do at one location, as its read says it (UX audit,
 * 10 Oct 2026). The app showed all four location roles the same read-only
 * screens because it had no way to ask. Each answer is the guard's own
 * (`StoresService.abilities`), so a screen never offers what the write
 * would refuse, nor hides what it would take.
 */
export interface LocationAbilities {
    /** Rename it, describe it, change its logo (`PUT stores/:id`). */
    edit: boolean;
    /** Take a new order here, with nothing paid yet. */
    takeOrders: boolean;
    /** Take the money with a new order: the permissions' alone (DEC-106). */
    takePayments: boolean;
    /** Change an order's status here, never its payment. */
    changeOrders: boolean;
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
 *  - Flag ON (Organization path): the caller's resolved permissions in the
 *    Store's Organization (their role's row plus their extras) decide, and
 *    nothing else. **The business role always wins over a storefront role**
 *    (owner, 12 Nov 2026, amending DEC-048): a `StoreOwner` row or a
 *    storefront Admin, Manager or Editor role never allows what the
 *    business permissions deny. The old dual-read fallback to the
 *    storefront roster is gone; every storefront person is on the team
 *    since F16, so it only ever widened. Storefront roles and their rows
 *    are kept (owner: their future is decided later).
 *
 * Precedence when the flag is ON, for a given store operation → OrgAction:
 *   1. Store missing / soft-deleted            → NotFound (no existence leak).
 *   2. Store has a null organizationId         → reject (org-less guard below).
 *   3. Membership exists AND its permissions hold the action → ALLOW.
 *   4. Otherwise                               → DENY.
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
        // The business role wins: a storefront role doesn't open it.
        throw new NotFoundException("Location not found");
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
        // The business role wins (amending DEC-048): no storefront fallback.
        return (await this.orgAllows(
            store.organizationId,
            userId,
            "store:write",
        ))
            ? writable
            : null;
    }

    /**
     * The store-scoped order writes (B16): the owning Organization when the
     * caller may take this order `action` here, `null` when not (or the
     * store is missing).
     *
     * On the organization path it is the caller's business role that
     * decides — `order:create`, `order:edit` or `order:refund`, never
     * `store:write`, which changes storefronts, not orders (matrix §3). A
     * storefront role adds nothing on this path (the business role wins,
     * owner 12 Nov 2026, amending DEC-048); with ORG_AUTHORIZATION off a
     * `StoreOwner` or a storefront Admin, Manager or Editor still takes and
     * changes its orders, never its money (DEC-106). A write that
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
        // The business role wins (amending DEC-048): no storefront fallback.
        // A location's team, at a storefront they work on only (DEC-074).
        return (await this.orgAllows(store.organizationId, userId, action, {
            storeId,
        }))
            ? writable
            : null;
    }

    /**
     * What the caller may do at this location, for its read to say.
     *
     * Not a second policy: each answer is asked of the very function the
     * write's guard asks (`canWrite` for `PUT stores/:id`,
     * `orderWriteOrganization` for the store-scoped order writes, with
     * `money` as `OrdersService.create` passes it). A rule changed there
     * changes here in the same commit, and the two cannot disagree.
     */
    async abilities(
        storeId: string,
        userId: string,
    ): Promise<LocationAbilities> {
        const may = async (
            action: OrgAction,
            options?: { money?: boolean },
        ): Promise<boolean> =>
            (await this.orderWriteOrganization(
                storeId,
                userId,
                action,
                options,
            )) !== null;
        const [edit, takeOrders, takePayments, changeOrders] =
            await Promise.all([
                this.canWrite(storeId, userId),
                may("order:create"),
                may("order:create", { money: true }),
                may("order:edit"),
            ]);
        return { edit, takeOrders, takePayments, changeOrders };
    }

    /**
     * A storefront write the business role decides by `action` — a
     * customer's details ask `contact:write`, never `store:write`. With
     * ORG_AUTHORIZATION off (no permissions to ask) the storefront's owner or
     * a write-capable member keeps it, as before. The same rule as an order
     * write without money: `orderWriteOrganization`.
     */
    async writeAllows(
        storeId: string,
        userId: string,
        action: OrgAction,
    ): Promise<boolean> {
        return (
            (await this.orderWriteOrganization(storeId, userId, action)) !==
            null
        );
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
        return this.orgAllows(store.organizationId, userId, action, {
            storeId,
        });
    }

    /**
     * The caller's role key in the storefront's business, or null: for the
     * storefront routes that narrow a location's team (DEC-074,
     * `orders/order-location.ts`) beyond what an action says.
     */
    async roleKeyAt(storeId: string, userId: string): Promise<string | null> {
        const store = await prisma.store.findFirst({
            where: { id: storeId, deletedAt: null },
            select: { organizationId: true },
        });
        if (!store?.organizationId) return null;
        const membership = await prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: store.organizationId,
                    userId,
                },
            },
            select: { role: true },
        });
        return membership?.role ?? null;
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
            (await this.orgAllows(organizationId, userId, action, { storeId }))
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
     * role is asked, so a
     * storefront route that never builds the context neither lets them in
     * nor answers with a generic denial (`member-paused.ts`). The legacy
     * path (ORG_AUTHORIZATION off) never reads membership, and is unchanged.
     *
     * `at` narrows an order action — money included — to one storefront for
     * a location's team (DEC-074, `orders/order-location.ts`): only one
     * they work on.
     */
    private async orgAllows(
        organizationId: string,
        userId: string,
        action: OrgAction,
        at?: { storeId: string },
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
        const holds = resolveCapabilities(
            membership.role,
            stored?.actions,
            membership.extraActions,
        ).has(action);
        if (
            !holds ||
            !at ||
            !action.startsWith("order:") ||
            !isLocationScoped(membership.role)
        ) {
            return holds;
        }
        const works = await prisma.storeMembers.findUnique({
            where: { storeId_userId: { storeId: at.storeId, userId } },
            select: { id: true },
        });
        return works !== null;
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

    /**
     * Update a store's core fields — owner or a write-capable member. Its
     * logo changes only with a `logo` patch, which `LocationLogoService`
     * works out from the save (DEC-123); without one it stays as it is.
     */
    async updateForUser(
        userId: string,
        storeId: string,
        dto: UpdateStoreDto,
        logo: LogoPatch | null = null,
    ) {
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
                ...(logo ?? {}),
            },
        });
        return { id: storeId };
    }
}
