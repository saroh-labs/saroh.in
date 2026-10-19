import {
    ConflictException,
    HttpException,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
} from "@nestjs/common";
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
import { CheckoutService } from "./checkout.service";
import type { ProfileMove } from "./profile-switch";
import {
    pendingSwitchOf,
    profileMoveInTx,
    profileSwitchStateInTx,
} from "./profile-switch";
import type { CheckoutHandoff } from "./providers/billing-provider.port";

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
 * - **Choosing applies at once** while nothing more is charged at the
 *   provider. A business whose subscription renews is billed to its
 *   profile's customer until the period ends: the switch waits for the
 *   renewal, authorised now on the new profile (U6, `profile-switch.ts`),
 *   and the business keeps its profile until the renewal applies it.
 *   Choosing the profile it keeps again gives up a switch still waiting.
 *   A payment for a plan waiting to be authorised is refused
 *   (`checkout-waiting`).
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
    /**
     * A move to another profile at the renewal (U6): that profile's legal
     * name (whoever's it is), the date, and whether its payment is
     * authorised yet. Null when none is in play.
     */
    pendingSwitch: {
        legalName: string;
        at: string | null;
        authorised: boolean;
    } | null;
}

/** What choosing (or making and using) a profile did. */
export interface BillingProfileChosen extends BusinessBillingProfileView {
    /**
     * `applied`: billed to it from now; `scheduled`: from the renewal,
     * once the payment is authorised on it (`authorise`); `kept`: a switch
     * waiting for authorisation given up; `none`: nothing to do.
     */
    outcome: "applied" | "scheduled" | "kept" | "none";
    /** The payment to authorise on the new profile, for `scheduled`. */
    authorise: {
        at: string;
        legalName: string;
        /** Given once, here; Saroh doesn't keep it. */
        authorisationUrl: string | null;
        handoff: CheckoutHandoff | null;
    } | null;
}

export { CHECKOUT_WAITING, CHECKOUT_WAITING_MESSAGE } from "./profile-switch";

/** A paid business moved to a profile its provider hasn't linked (step 2). */
export const PROFILE_NOT_LINKED = "profile-not-linked";
export const PROFILE_NOT_LINKED_MESSAGE =
    "Razorpay hasn't linked this billing profile yet, so it can't take a paid business. Fix it and try again before moving a paid business here.";

@Injectable()
export class BusinessBillingProfileService {
    private readonly logger = new Logger(BusinessBillingProfileService.name);

    constructor(
        private readonly profiles: BillingProfilesService,
        private readonly checkouts: CheckoutService,
        @Optional() private readonly audit?: AuditService,
    ) {}

    /** Who Saroh bills for the business, and the caller's profiles. */
    async view(ctx: OrganizationContext): Promise<BusinessBillingProfileView> {
        authorize(ctx, "billing:manage");
        const [org, mine, state] = await Promise.all([
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
            profileSwitchStateInTx(prisma, ctx.organizationId),
        ]);
        if (!org) throw new NotFoundException("Business not found");
        const pending = pendingSwitchOf(state);
        const pendingSwitch = pending
            ? {
                  legalName: await legalNameOf(pending.billingProfileId),
                  at: pending.at?.toISOString() ?? null,
                  authorised: pending.authorised,
              }
            : null;
        const on = org.billingProfile;
        if (!on) {
            return {
                current: null,
                mine,
                businessesOnCurrent: null,
                pendingSwitch,
            };
        }
        if (on.ownerUserId !== ctx.userId) {
            return {
                current: { legalName: on.legalName, mine: false },
                mine,
                businessesOnCurrent: null,
                pendingSwitch,
            };
        }
        const own =
            mine.find((p) => p.id === on.id) ??
            (await this.profiles.get(ctx.userId, on.id));
        return {
            current: { ...own, mine: true },
            mine,
            businessesOnCurrent: own.businesses,
            pendingSwitch,
        };
    }

    /**
     * Bill the business to one of the caller's profiles (anyone else's is
     * a 404, as if it didn't exist), or keep the one it is billed to now.
     * At once when nothing more is charged at the provider; a business
     * whose plan renews moves at the renewal, once the payment is
     * authorised on the new profile (`authorise`).
     */
    async choose(
        ctx: OrganizationContext,
        billingProfileId: string,
        now: Date = new Date(),
        options: { linkedForRenewal?: boolean } = {},
    ): Promise<BillingProfileChosen> {
        authorize(ctx, "billing:manage");
        const move = await prisma.$transaction(async (tx) => {
            const org = await tx.organization.findUnique({
                where: { id: ctx.organizationId },
                select: { billingProfileId: true },
            });
            if (!org) throw new NotFoundException("Business not found");
            // Its own profile may be kept whoever's it is; any other must
            // be the caller's.
            if (org.billingProfileId !== billingProfileId) {
                const mine = await tx.billingProfile.findFirst({
                    where: { id: billingProfileId, ownerUserId: ctx.userId },
                    select: { id: true },
                });
                if (!mine) throw profileNotFound();
            }
            const decided = await profileMoveInTx(
                tx,
                ctx.organizationId,
                billingProfileId,
                now,
            );
            // From the account's Billing profiles (step 2): a paid business
            // moves only to a profile its provider has a customer for, so
            // the payment to authorise names it. Nothing was written yet
            // for a move at the renewal, so refusing here changes nothing.
            if (options.linkedForRenewal && decided.kind === "schedule") {
                const to = await tx.billingProfile.findUnique({
                    where: { id: billingProfileId },
                    select: { providerCustomerId: true },
                });
                if (!to?.providerCustomerId) {
                    throw new ConflictException({
                        message: PROFILE_NOT_LINKED_MESSAGE,
                        details: {
                            field: "billingProfile",
                            code: PROFILE_NOT_LINKED,
                        },
                    });
                }
            }
            return decided;
        });
        return this.settle(ctx, move, billingProfileId, "chosen", now);
    }

    /**
     * A new profile for the caller, made from Plan & billing; with `use`,
     * the business is moved to it as `choose` would (or neither, so a
     * refusal leaves no profile behind). A switch at the renewal that
     * can't be started at the provider leaves the profile made, and says
     * why in `notMoved`: it can be chosen again.
     */
    async create(
        ctx: OrganizationContext,
        input: BillingProfileInput,
        use: boolean,
        now: Date = new Date(),
    ): Promise<
        BillingProfileChosen & { created: string; notMoved: string | null }
    > {
        authorize(ctx, "billing:manage");
        let made: { id: string; move: ProfileMove | null };
        try {
            made = await prisma.$transaction(async (tx) => {
                const org = await tx.organization.findUnique({
                    where: { id: ctx.organizationId },
                    select: { id: true },
                });
                if (!org) throw new NotFoundException("Business not found");
                const profile = await createBillingProfileInTx(
                    tx,
                    ctx.userId,
                    input,
                );
                const move = use
                    ? await profileMoveInTx(
                          tx,
                          ctx.organizationId,
                          profile.id,
                          now,
                      )
                    : null;
                return { id: profile.id, move };
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
        if (!made.move) {
            return {
                ...(await this.view(ctx)),
                outcome: "none",
                authorise: null,
                created: made.id,
                notMoved: null,
            };
        }
        try {
            const chosen = await this.settle(
                ctx,
                made.move,
                made.id,
                "created",
                now,
            );
            return { ...chosen, created: made.id, notMoved: null };
        } catch (error) {
            if (!(error instanceof HttpException)) throw error;
            return {
                ...(await this.view(ctx)),
                outcome: "none",
                authorise: null,
                created: made.id,
                notMoved: refusalMessage(error),
            };
        }
    }

    /** Carry out what `profileMoveInTx` decided, and say it. */
    private async settle(
        ctx: OrganizationContext,
        move: ProfileMove,
        to: string,
        via: "chosen" | "created",
        now: Date,
    ): Promise<BillingProfileChosen> {
        const said = async (
            outcome: BillingProfileChosen["outcome"],
            authorise: BillingProfileChosen["authorise"] = null,
        ): Promise<BillingProfileChosen> => ({
            ...(await this.view(ctx)),
            outcome,
            authorise,
        });
        switch (move.kind) {
            case "none":
                return said("none");
            case "applied":
                await this.recordChosen(ctx, move.from, to, via);
                return said("applied");
            case "kept":
                // The business stays where it is; the switch is gone.
                await this.recordChosen(
                    ctx,
                    move.dropped,
                    to,
                    "switch-given-up",
                );
                return said("kept");
            case "schedule": {
                const started = await this.checkouts.startProfileSwitch(
                    ctx,
                    {
                        billingProfileId: to,
                        plan: move.plan,
                        startAt: move.startAt,
                    },
                    now,
                );
                await this.recordChosen(
                    ctx,
                    move.from,
                    to,
                    `${via}-at-renewal`,
                    move.startAt,
                );
                return said("scheduled", {
                    at: move.startAt.toISOString(),
                    legalName: await legalNameOf(to),
                    authorisationUrl: started.authorisationUrl,
                    handoff: started.handoff,
                });
            }
        }
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
        via:
            | "chosen"
            | "created"
            | "switch-given-up"
            | "chosen-at-renewal"
            | "created-at-renewal",
        at?: Date,
    ): Promise<void> {
        this.logger.log(
            `billing_profile_chosen org=${ctx.organizationId} from=${from ?? "none"} to=${to} via=${via}`,
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
            metadata: at
                ? { from, to, via, at: at.toISOString() }
                : { from, to, via },
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

/** A profile's legal name, whoever's it is: what a switch names. */
async function legalNameOf(billingProfileId: string): Promise<string> {
    const p = await prisma.billingProfile.findUnique({
        where: { id: billingProfileId },
        select: { legalName: true },
    });
    return p?.legalName ?? "";
}

/** A refusal's words, as the API sends them. */
function refusalMessage(error: HttpException): string {
    const body = error.getResponse();
    if (typeof body === "string") return body;
    const message = (body as { message?: unknown }).message;
    return typeof message === "string" ? message : error.message;
}
