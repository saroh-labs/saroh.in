import {
    ConflictException,
    HttpException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { OrganizationContextService } from "../organizations/organization-context.service";
import { assertWorkspaceWrite } from "../organizations/organization-lifecycle.gate";
import {
    BILLING_PROFILE_SYNC_TYPE,
    enqueueBillingProfileSync,
} from "./billing-profile-sync";
import type {
    BillingProfileInput,
    BillingProfileView,
} from "./billing-profiles.service";
import { BillingProfilesService } from "./billing-profiles.service";
import type { BillingProfileChosen } from "./business-billing-profile.service";
import { BusinessBillingProfileService } from "./business-billing-profile.service";
import { billedByProvider } from "./change-timing";
import { pendingSwitchOf, profileSwitchStateInTx } from "./profile-switch";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import { BILLING_PROVIDER_FACTORY } from "./providers/billing-provider.port";

/**
 * An owner's billing profiles at the account level (DEC-167 step 2, #1015):
 * accounts.saroh.in's Billing profiles, with no business in the way.
 *
 * - **Only the owner**: every read and write is filtered by the signed-in
 *   user. Another person's profile is a 404, as if it didn't exist; a
 *   business the caller doesn't own (an OWNER membership) is a 404 too.
 *   Ids from the request are never trusted on their own.
 * - **Across businesses**: an owner's memberships, businesses, plans and
 *   invoices are read with `outsideOrgContext` (DEV_LEARNINGS, 18 Oct:
 *   a read that spans businesses never runs inside one's RLS context).
 * - **A move is the business's own choice** (`BusinessBillingProfileService
 *   .choose`), run in that business's context as its Plan & billing would:
 *   a free business moves now, a paid one at its renewal, and a paid one
 *   only to a profile the provider has linked. Jobs queued there carry the
 *   business's id.
 * - **Remove** only a profile nothing points at: no business billed to it
 *   and no payment waiting or authorised on it (a move to it). Invoices
 *   already issued keep its details: they hold a snapshot, not a link.
 */

/** Where the profile stands at the billing provider. */
export type ProfileSyncState = "linked" | "linking" | "failed" | "off";

/** A business a profile pays for, as its owner's account shows it. */
export interface ProfileBusiness {
    id: string;
    name: string;
    /** The caller owns it, so may move it. */
    owner: boolean;
    /** Null when it has no plan yet. */
    plan: { name: string; cycle: string } | null;
    /** Charged through the provider, so a move waits for the renewal. */
    paid: boolean;
    /** The next charge, for a paid business that renews. */
    nextChargeAt: string | null;
    /** A move to another profile at the renewal, if one is in play. */
    pendingMove: {
        toProfileId: string;
        toLegalName: string;
        at: string | null;
        authorised: boolean;
    } | null;
}

/** One of the caller's profiles, with what it pays for and its state. */
export interface AccountProfileView extends BillingProfileView {
    sync: ProfileSyncState;
    payingFor: ProfileBusiness[];
    /** The caller's businesses moving to it at their renewal. */
    movingIn: { organizationId: string; name: string; at: string | null }[];
}

export interface AccountProfileInvoice {
    id: string;
    number: string;
    organizationId: string;
    businessName: string;
    issuedAt: string;
    currency: string;
    totalPaise: number;
    /**
     * The business's own invoice PDF route, when the caller still owns
     * the business (`GET organizations/:id/billing/invoices/:id/pdf`).
     */
    pdfPath: string | null;
}

export interface AccountProfileDetail extends AccountProfileView {
    invoices: AccountProfileInvoice[];
    invoiceCount: number;
    /** Null when it can be removed; else why not, in words. */
    removeBlockedBy: string | null;
}

/** A business the caller owns, wherever it is billed (for Add and Move). */
export interface OwnedBusiness extends ProfileBusiness {
    billingProfileId: string | null;
}

/** The recent invoices a profile's page shows; "Show all" asks for more. */
export const RECENT_INVOICES = 5;
const ALL_INVOICES = 120;

export const NO_MOVE_WAITING = "No move is waiting for this business.";
export const MOVE_AUTHORISED =
    "This move is authorised already. To stay on this profile, move the business back to it.";

@Injectable()
export class BillingProfilesAccountService {
    private readonly logger = new Logger(BillingProfilesAccountService.name);

    constructor(
        private readonly profiles: BillingProfilesService,
        private readonly business: BusinessBillingProfileService,
        private readonly contexts: OrganizationContextService,
        @Optional()
        @Inject(BILLING_PROVIDER_FACTORY)
        private readonly providers?: BillingProviderFactory,
    ) {}

    // ── Reads ───────────────────────────────────────────────────────────

    /** The caller's profiles, oldest first, each with what it pays for. */
    async list(userId: string): Promise<AccountProfileView[]> {
        const mine = await this.profiles.listMine(userId);
        if (mine.length === 0) return [];
        const [businesses, states] = await Promise.all([
            this.businessesOn(
                userId,
                mine.map((p) => p.id),
            ),
            this.syncStates(mine.map((p) => p.id)),
        ]);
        return mine.map((p) => this.withBusinesses(p, businesses, states));
    }

    /** One of the caller's profiles in full, with its recent invoices. */
    async detail(
        userId: string,
        id: string,
        all = false,
    ): Promise<AccountProfileDetail> {
        const profile = await this.profiles.get(userId, id);
        const [businesses, states, invoices, waiting] = await Promise.all([
            this.businessesOn(userId, [id]),
            this.syncStates([id]),
            this.invoicesOf(userId, id, all ? ALL_INVOICES : RECENT_INVOICES),
            outsideOrgContext(() =>
                prisma.billingCheckout.count({
                    where: {
                        billingProfileId: id,
                        status: { in: ["OPEN", "SCHEDULED"] },
                    },
                }),
            ),
        ]);
        const view = this.withBusinesses(profile, businesses, states);
        return {
            ...view,
            ...invoices,
            removeBlockedBy: removeBlockedBy(view.businesses, waiting),
        };
    }

    /** Every business the caller owns, wherever it is billed. */
    async ownedBusinesses(userId: string): Promise<OwnedBusiness[]> {
        const owned = await outsideOrgContext(() =>
            prisma.membership.findMany({
                where: {
                    userId,
                    role: "OWNER",
                    organization: { deletedRetainedAt: null },
                },
                select: { organizationId: true },
            }),
        );
        const ids = owned.map((m) => m.organizationId);
        if (ids.length === 0) return [];
        const rows = await this.describe(userId, { id: { in: ids } });
        return rows.sort((a, b) => a.name.localeCompare(b.name));
    }

    // ── Writes ──────────────────────────────────────────────────────────

    /** A new profile; with `organizationId`, that business is moved to it. */
    async create(
        userId: string,
        input: BillingProfileInput,
        organizationId?: string,
        now: Date = new Date(),
    ): Promise<{
        profile: AccountProfileDetail;
        moved: BillingProfileChosen["outcome"] | null;
        notMoved: string | null;
    }> {
        // The business is checked first, so a refusal leaves nothing made.
        if (organizationId) await this.ownerContext(userId, organizationId);
        const made = await this.profiles.create(userId, input);
        let moved: BillingProfileChosen["outcome"] | null = null;
        let notMoved: string | null = null;
        if (organizationId) {
            try {
                moved = (await this.move(userId, made.id, organizationId, now))
                    .outcome;
            } catch (error) {
                if (!(error instanceof HttpException)) throw error;
                notMoved = refusalMessage(error);
            }
        }
        return { profile: await this.detail(userId, made.id), moved, notMoved };
    }

    /** Change one of the caller's profiles (step 1's rules). */
    async update(
        userId: string,
        id: string,
        input: BillingProfileInput,
    ): Promise<{ profile: AccountProfileDetail; businesses: number }> {
        const saved = await this.profiles.update(userId, id, input);
        return {
            profile: await this.detail(userId, id),
            businesses: saved.businesses,
        };
    }

    /**
     * Bill one of the caller's businesses to one of their profiles: now on
     * a free plan, at the renewal on a paid one (and then only to a linked
     * profile). The business's own choice, run in its context.
     */
    async move(
        userId: string,
        id: string,
        organizationId: string,
        now: Date = new Date(),
    ): Promise<BillingProfileChosen> {
        await this.profiles.get(userId, id);
        const ctx = await this.ownerContext(userId, organizationId);
        await assertWorkspaceWrite(organizationId, "new");
        const chosen = await runInOrgContext(organizationId, () =>
            this.business.choose(ctx, id, now, { linkedForRenewal: true }),
        );
        this.logger.log(
            `billing_profile_account_move profile=${id} org=${organizationId} outcome=${chosen.outcome}`,
        );
        return chosen;
    }

    /**
     * Give up a move waiting for authorisation, for a business billed to
     * this profile: it stays where it is. An authorised one is a move back.
     */
    async cancelPending(
        userId: string,
        id: string,
        organizationId: string,
        now: Date = new Date(),
    ): Promise<BillingProfileChosen> {
        await this.profiles.get(userId, id);
        const ctx = await this.ownerContext(userId, organizationId);
        const state = await runInOrgContext(organizationId, () =>
            profileSwitchStateInTx(prisma, organizationId),
        );
        if (state.current !== id) throw businessNotFound();
        const pending = pendingSwitchOf(state);
        if (!pending) throw new ConflictException(NO_MOVE_WAITING);
        if (pending.authorised) throw new ConflictException(MOVE_AUTHORISED);
        await assertWorkspaceWrite(organizationId, "new");
        return runInOrgContext(organizationId, () =>
            this.business.choose(ctx, id, now),
        );
    }

    /** Delete one of the caller's profiles that nothing points at. */
    async remove(userId: string, id: string): Promise<{ removed: true }> {
        await prisma.$transaction(async (tx) => {
            const profile = await tx.billingProfile.findFirst({
                where: { id, ownerUserId: userId },
                select: {
                    id: true,
                    _count: {
                        select: {
                            organizations: {
                                where: { deletedRetainedAt: null },
                            },
                        },
                    },
                },
            });
            if (!profile)
                throw new NotFoundException("Billing profile not found");
            const waiting = await tx.billingCheckout.count({
                where: {
                    billingProfileId: id,
                    status: { in: ["OPEN", "SCHEDULED"] },
                },
            });
            const blocked = removeBlockedBy(
                profile._count.organizations,
                waiting,
            );
            if (blocked) {
                throw new ConflictException({
                    message: blocked,
                    details: { code: "profile-in-use" },
                });
            }
            // A business deleted but kept for its retention period lets go
            // of it (the foreign key sets null); its invoices keep theirs.
            await tx.billingProfile.delete({ where: { id } });
        });
        this.logger.log(
            `billing_profile_removed profile=${id} owner=${userId}`,
        );
        return { removed: true };
    }

    /** Ask the provider again: one waiting sync, queued now. */
    async retrySync(
        userId: string,
        id: string,
    ): Promise<{ sync: ProfileSyncState; queued: boolean }> {
        await this.profiles.get(userId, id);
        const queued = await prisma.$transaction(async (tx) => {
            const before = await tx.job.count({
                where: syncJobWhere([id]),
            });
            await enqueueBillingProfileSync(tx, id);
            return before === 0;
        });
        const states = await this.syncStates([id]);
        return { sync: states.get(id) ?? "linking", queued };
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /** The caller's context in a business they own; else a 404. */
    private async ownerContext(
        userId: string,
        organizationId: string,
    ): Promise<OrganizationContext> {
        const membership = await outsideOrgContext(() =>
            prisma.membership.findUnique({
                where: { organizationId_userId: { organizationId, userId } },
                select: {
                    role: true,
                    organization: { select: { deletedRetainedAt: true } },
                },
            }),
        );
        if (
            membership?.role !== "OWNER" ||
            membership.organization.deletedRetainedAt
        ) {
            throw businessNotFound();
        }
        return this.contexts.resolve(userId, organizationId);
    }

    /** The businesses billed to these profiles (or moving to them). */
    private async businessesOn(
        userId: string,
        profileIds: string[],
    ): Promise<OwnedBusiness[]> {
        const on = await this.describe(userId, {
            billingProfileId: { in: profileIds },
        });
        // The caller's businesses moving to one of these at the renewal.
        const owned = await this.ownedBusinesses(userId);
        const known = new Set(on.map((b) => b.id));
        const moving = owned.filter(
            (b) =>
                !known.has(b.id) &&
                b.pendingMove &&
                profileIds.includes(b.pendingMove.toProfileId),
        );
        return [...on, ...moving];
    }

    /** Businesses matching `where`, with their plan and any move. */
    private async describe(
        userId: string,
        where: { id?: { in: string[] }; billingProfileId?: { in: string[] } },
    ): Promise<OwnedBusiness[]> {
        const rows = await outsideOrgContext(() =>
            prisma.organization.findMany({
                where: { ...where, deletedRetainedAt: null },
                orderBy: [{ name: "asc" }, { id: "asc" }],
                select: {
                    id: true,
                    name: true,
                    billingProfileId: true,
                    memberships: {
                        where: { userId },
                        select: { role: true },
                    },
                    subscription: { include: { plan: true } },
                },
            }),
        );
        const now = new Date();
        return Promise.all(
            rows.map(async (row) => {
                const sub = row.subscription;
                const paid = Boolean(
                    sub && billedByProvider(sub) && !sub.cancelAtPeriodEnd,
                );
                const state = await outsideOrgContext(() =>
                    profileSwitchStateInTx(prisma, row.id),
                );
                const pending = pendingSwitchOf(state);
                return {
                    id: row.id,
                    name: row.name,
                    billingProfileId: row.billingProfileId,
                    owner: row.memberships.some((m) => m.role === "OWNER"),
                    plan: sub
                        ? { name: sub.plan.name, cycle: sub.billingCycle }
                        : null,
                    paid,
                    nextChargeAt:
                        paid &&
                        sub?.currentPeriodEnd &&
                        sub.currentPeriodEnd > now
                            ? sub.currentPeriodEnd.toISOString()
                            : null,
                    pendingMove: pending
                        ? {
                              toProfileId: pending.billingProfileId,
                              toLegalName: await legalNameOf(
                                  pending.billingProfileId,
                              ),
                              at: pending.at?.toISOString() ?? null,
                              authorised: pending.authorised,
                          }
                        : null,
                };
            }),
        );
    }

    private withBusinesses(
        profile: BillingProfileView,
        businesses: OwnedBusiness[],
        states: Map<string, ProfileSyncState>,
    ): AccountProfileView {
        const payingFor = businesses
            .filter((b) => b.billingProfileId === profile.id)
            .map(({ billingProfileId: _on, ...b }) => b);
        const movingIn = businesses
            .filter(
                (b) =>
                    b.billingProfileId !== profile.id &&
                    b.pendingMove?.toProfileId === profile.id,
            )
            .map((b) => ({
                organizationId: b.id,
                name: b.name,
                at: b.pendingMove?.at ?? null,
            }));
        return {
            ...profile,
            sync: states.get(profile.id) ?? "linking",
            payingFor,
            movingIn,
        };
    }

    /**
     * Linked once the provider has a customer; linking while a sync waits
     * (or before the first has said anything); failed once one was refused;
     * off where the provider isn't set up here (local, CI).
     */
    private async syncStates(
        ids: string[],
    ): Promise<Map<string, ProfileSyncState>> {
        const [rows, jobs] = await Promise.all([
            prisma.billingProfile.findMany({
                where: { id: { in: ids } },
                select: {
                    id: true,
                    providerCustomerId: true,
                    lastError: true,
                },
            }),
            outsideOrgContext(() =>
                prisma.job.findMany({
                    where: syncJobWhere(ids),
                    select: { payload: true },
                }),
            ),
        ]);
        const waiting = new Set(
            jobs.map(
                (j) =>
                    (j.payload as { billingProfileId?: string })
                        .billingProfileId,
            ),
        );
        const configured = this.providerConfigured();
        return new Map(
            rows.map((r) => {
                const state: ProfileSyncState = r.providerCustomerId
                    ? "linked"
                    : waiting.has(r.id)
                      ? "linking"
                      : r.lastError
                        ? "failed"
                        : configured
                          ? "linking"
                          : "off";
                return [r.id, state];
            }),
        );
    }

    private providerConfigured(): boolean {
        try {
            return (
                this.providers
                    ?.get(CATALOGUE_BILLING_PROVIDER)
                    .customers?.configured() ?? false
            );
        } catch {
            return false;
        }
    }

    private async invoicesOf(
        userId: string,
        billingProfileId: string,
        take: number,
    ): Promise<{ invoices: AccountProfileInvoice[]; invoiceCount: number }> {
        const [rows, invoiceCount, owned] = await outsideOrgContext(() =>
            Promise.all([
                prisma.sarohInvoice.findMany({
                    where: { billingProfileId },
                    orderBy: [{ issuedAt: "desc" }, { number: "desc" }],
                    take,
                    select: {
                        id: true,
                        number: true,
                        organizationId: true,
                        issuedAt: true,
                        currency: true,
                        totalPaise: true,
                        organization: { select: { name: true } },
                    },
                }),
                prisma.sarohInvoice.count({ where: { billingProfileId } }),
                prisma.membership.findMany({
                    where: { userId, role: "OWNER" },
                    select: { organizationId: true },
                }),
            ]),
        );
        const mine = new Set(owned.map((m) => m.organizationId));
        return {
            invoiceCount,
            invoices: rows.map((r) => ({
                id: r.id,
                number: r.number,
                organizationId: r.organizationId,
                businessName: r.organization.name,
                issuedAt: r.issuedAt.toISOString(),
                currency: r.currency,
                totalPaise: r.totalPaise,
                pdfPath: mine.has(r.organizationId)
                    ? `/organizations/${encodeURIComponent(r.organizationId)}/billing/invoices/${encodeURIComponent(r.id)}/pdf`
                    : null,
            })),
        };
    }
}

/** Why a profile can't be removed yet, in the owner's words; null: it can. */
export function removeBlockedBy(
    businesses: number,
    paymentsWaiting: number,
): string | null {
    if (businesses > 1) {
        return `Move its ${businesses} businesses to another profile first.`;
    }
    if (businesses === 1) {
        return "Move its business to another profile first.";
    }
    if (paymentsWaiting > 0) {
        return "A business is moving to it. Cancel that move first.";
    }
    return null;
}

function syncJobWhere(ids: string[]) {
    return {
        type: BILLING_PROFILE_SYNC_TYPE,
        status: "PENDING",
        OR: ids.map((id) => ({
            payload: { path: ["billingProfileId"], equals: id },
        })),
    };
}

function businessNotFound(): NotFoundException {
    return new NotFoundException({
        message: "That business isn't one you own.",
        details: { field: "organizationId" },
    });
}

async function legalNameOf(billingProfileId: string): Promise<string> {
    const p = await prisma.billingProfile.findUnique({
        where: { id: billingProfileId },
        select: { legalName: true },
    });
    return p?.legalName ?? "";
}

function refusalMessage(error: HttpException): string {
    const body = error.getResponse();
    if (typeof body === "string") return body;
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" ? message : error.message;
}
