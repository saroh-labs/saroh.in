import {
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { authorize } from "../organizations/organization-policy";
import type {
    BillingProfileInput,
    BillingProfileView,
} from "./billing-profiles.service";
import {
    billingEmailRaceAsTaken,
    BillingProfilesService,
    createBillingProfileInTx,
} from "./billing-profiles.service";

/**
 * A business's billing profile as its Plan & billing shows it (DEC-167,
 * R8, R9, U5): who Saroh bills for this business, the owner's other
 * profiles to pick from, a new one made in place, and an edit that says
 * first how many businesses it changes.
 *
 * - **Owner only, reads included** (R2, AE6): every call asks
 *   `billing:manage` before it reads anything. An Admin holds
 *   `billing:read` and still reads the plan, never a profile.
 * - **Another owner's profile** on this business (several owners may hold
 *   one) is named, never shown: its legal name only. Theirs to edit; this
 *   owner may bill the business to one of their own instead.
 * - **Choosing applies at once** while the business pays nothing at the
 *   provider. A business with a live paid subscription is billed to its
 *   profile's customer until the period ends: a switch then waits for the
 *   renewal (U6), and until that lands this refuses with
 *   `switch-at-renewal`. A payment waiting to be authorised is on the
 *   current profile's customer too, so it is refused while one is open.
 */

/** The profile on the business: in full when it is the caller's. */
export type CurrentBillingProfile =
    (BillingProfileView & { mine: true }) | { legalName: string; mine: false };

export interface BusinessBillingProfileView {
    /** Null: the business has none yet ("Choose who Saroh bills"). */
    current: CurrentBillingProfile | null;
    /** The caller's own profiles, oldest first. */
    mine: BillingProfileView[];
    /** Businesses billed to the current profile, when it is the caller's. */
    businessesOnCurrent: number | null;
}

/** The refusal's code for a paid business, until U6's switch lands. */
export const SWITCH_AT_RENEWAL = "switch-at-renewal";
export const SWITCH_AT_RENEWAL_MESSAGE =
    "You can move a paid plan to another billing profile at its next renewal.";
export const CHECKOUT_WAITING = "checkout-waiting";
export const CHECKOUT_WAITING_MESSAGE =
    "A payment is waiting under this billing profile. Finish it or let it lapse, then choose another.";

type Tx = Prisma.TransactionClient;

function refuseSwitch(code: string, message: string): never {
    throw new ConflictException({
        message,
        details: { field: "billingProfile", code },
    });
}

/**
 * Refused when the business may not be moved to another profile now: a
 * live subscription at the provider (paid, billed to the current
 * profile's customer), or a checkout waiting for authorisation.
 */
async function assertMayChooseNow(
    tx: Pick<Tx, "subscription" | "billingCheckout">,
    organizationId: string,
): Promise<void> {
    const [subscription, waiting] = await Promise.all([
        tx.subscription.findUnique({
            where: { organizationId },
            select: { status: true, providerSubscriptionId: true },
        }),
        tx.billingCheckout.findFirst({
            where: {
                organizationId,
                status: { in: ["OPEN", "SCHEDULED"] },
            },
            select: { id: true },
        }),
    ]);
    if (
        subscription &&
        subscription.status !== "CANCELLED" &&
        subscription.providerSubscriptionId
    ) {
        refuseSwitch(SWITCH_AT_RENEWAL, SWITCH_AT_RENEWAL_MESSAGE);
    }
    if (waiting) refuseSwitch(CHECKOUT_WAITING, CHECKOUT_WAITING_MESSAGE);
}

@Injectable()
export class BusinessBillingProfileService {
    private readonly logger = new Logger(BusinessBillingProfileService.name);

    constructor(
        private readonly profiles: BillingProfilesService,
        @Optional() private readonly audit?: AuditService,
    ) {}

    /** Who Saroh bills for the business, and the caller's profiles. */
    async view(ctx: OrganizationContext): Promise<BusinessBillingProfileView> {
        authorize(ctx, "billing:manage");
        const [org, mine] = await Promise.all([
            prisma.organization.findUnique({
                where: { id: ctx.organizationId },
                select: {
                    billingProfile: {
                        select: {
                            id: true,
                            ownerUserId: true,
                            legalName: true,
                        },
                    },
                },
            }),
            this.profiles.listMine(ctx.userId),
        ]);
        if (!org) throw new NotFoundException("Business not found");
        const on = org.billingProfile;
        if (!on) return { current: null, mine, businessesOnCurrent: null };
        if (on.ownerUserId !== ctx.userId) {
            return {
                current: { legalName: on.legalName, mine: false },
                mine,
                businessesOnCurrent: null,
            };
        }
        const own =
            mine.find((p) => p.id === on.id) ??
            (await this.profiles.get(ctx.userId, on.id));
        return {
            current: { ...own, mine: true },
            mine,
            businessesOnCurrent: own.businesses,
        };
    }

    /**
     * Bill the business to one of the caller's profiles. Anyone else's is
     * a 404, as if it didn't exist. Applied at once on a business with no
     * paid plan at the provider; a paid one is the 409 above.
     */
    async choose(
        ctx: OrganizationContext,
        billingProfileId: string,
    ): Promise<BusinessBillingProfileView> {
        authorize(ctx, "billing:manage");
        const from = await prisma.$transaction(async (tx) => {
            const mine = await tx.billingProfile.findFirst({
                where: { id: billingProfileId, ownerUserId: ctx.userId },
                select: { id: true },
            });
            if (!mine) throw profileNotFound();
            const org = await tx.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { billingProfileId: true },
            });
            if (!org) throw new NotFoundException("Business not found");
            // Already its profile: nothing to do, nothing to refuse.
            if (org.billingProfileId === mine.id) return undefined;
            await assertMayChooseNow(tx, ctx.organizationId);
            await tx.organization.update({
                where: { id: ctx.organizationId },
                data: { billingProfileId: mine.id },
            });
            return org.billingProfileId;
        });
        if (from !== undefined) {
            await this.recordChosen(ctx, from, billingProfileId, "chosen");
        }
        return this.view(ctx);
    }

    /**
     * A new profile for the caller, made from Plan & billing; with `use`,
     * the business is billed to it in the same transaction (or neither, so
     * a paid business's refusal leaves no profile behind).
     */
    async create(
        ctx: OrganizationContext,
        input: BillingProfileInput,
        use: boolean,
    ): Promise<BusinessBillingProfileView & { created: string }> {
        authorize(ctx, "billing:manage");
        let made: { id: string; from: string | null };
        try {
            made = await prisma.$transaction(async (tx) => {
                const org = await tx.organization.findUnique({
                    where: { id: ctx.organizationId },
                    select: { billingProfileId: true },
                });
                if (!org) throw new NotFoundException("Business not found");
                if (use) await assertMayChooseNow(tx, ctx.organizationId);
                const profile = await createBillingProfileInTx(
                    tx,
                    ctx.userId,
                    input,
                );
                if (use) {
                    await tx.organization.update({
                        where: { id: ctx.organizationId },
                        data: { billingProfileId: profile.id },
                    });
                }
                return { id: profile.id, from: org.billingProfileId };
            });
        } catch (error) {
            throw billingEmailRaceAsTaken(error);
        }
        this.logger.log(
            `billing_profile_created profile=${made.id} owner=${ctx.userId} org=${ctx.organizationId} used=${use}`,
        );
        await this.audit?.record({
            action: AuditAction.BillingProfileCreate,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "billing_profile",
            targetId: made.id,
            outcome: AuditOutcome.Success,
            metadata: { fields: sentFields(input), used: use },
        });
        if (use) await this.recordChosen(ctx, made.from, made.id, "created");
        return { ...(await this.view(ctx)), created: made.id };
    }

    /**
     * Change one of the caller's profiles (anyone else's is a 404). It
     * applies to every business on it from its next invoice; `businesses`
     * says how many, as the app said before saving (R9, AE3).
     */
    async update(
        ctx: OrganizationContext,
        billingProfileId: string,
        input: BillingProfileInput,
    ): Promise<{ profile: BillingProfileView; businesses: number }> {
        authorize(ctx, "billing:manage");
        const saved = await this.profiles.update(
            ctx.userId,
            billingProfileId,
            input,
        );
        await this.audit?.record({
            action: AuditAction.BillingProfileUpdate,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "billing_profile",
            targetId: billingProfileId,
            outcome: AuditOutcome.Success,
            // Which parts, never a value; and how many businesses it bills.
            metadata: {
                fields: sentFields(input),
                businesses: saved.businesses,
            },
        });
        return saved;
    }

    private async recordChosen(
        ctx: OrganizationContext,
        from: string | null,
        to: string,
        via: "chosen" | "created",
    ): Promise<void> {
        this.logger.log(
            `billing_profile_chosen org=${ctx.organizationId} from=${from ?? "none"} to=${to}`,
        );
        await this.audit?.record({
            action: AuditAction.BillingProfileChoose,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "organization",
            targetId: ctx.organizationId,
            outcome: AuditOutcome.Success,
            // Ids only: a profile's details are its owner's (R2).
            metadata: { from, to, via },
        });
    }
}

/** The fields a save was sent, by name. */
function sentFields(input: BillingProfileInput): string[] {
    return Object.entries(input)
        .filter(([, v]) => v !== undefined)
        .map(([k]) => k);
}

function profileNotFound(): NotFoundException {
    return new NotFoundException({
        message: "That billing profile isn't one of yours. Choose another.",
        details: { field: "billingProfile" },
    });
}
