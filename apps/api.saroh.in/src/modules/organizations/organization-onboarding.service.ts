import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma, startOnFreePlan } from "@saroh/database";

import { appBase } from "../../common/app-url";
import { sendWelcomeEmail } from "../../common/email";
import { ActivationEvents } from "../analytics/activation-events";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import {
    billingEmailRaceAsTaken,
    chosenBillingProfileInTx,
    firstBillingProfileInTx,
} from "../billing/billing-profiles.service";
import { FREE_PLAN_ID } from "../billing/catalogue-access.service";
import {
    addressProblem,
    addressTaken,
    MAX_ADDRESS_LENGTH,
} from "../sites/site-address";
import { recordManagerInTx } from "./account-manager";
import { businessTypeWrite } from "./business-type";
import { startingZone } from "./business-zone";
import type { OnboardOrganizationDto } from "./dto";
import { DEFAULT_ORGANIZATION_KIND } from "./organization-kind";
import { referringBusiness } from "./referral";
import { slugify } from "./slug";

/**
 * The address a name becomes when the merchant didn't choose one: its slug,
 * cut to the longest address a business can claim (DEC-071), without a
 * hyphen left dangling at the cut.
 */
function addressFromName(name: string): string {
    let address = slugify(name).slice(0, MAX_ADDRESS_LENGTH);
    while (address.endsWith("-")) address = address.slice(0, -1);
    return address;
}

/** The same promise, with a lost billing-email race read as its 409. */
function raceAsTaken<T>(made: Promise<T>): Promise<T> {
    return made.catch((error: unknown) => {
        throw billingEmailRaceAsTaken(error);
    });
}

/** What onboarding returns to the caller: the new org's identity. */
export interface OnboardedOrganization {
    id: string;
    slug: string;
}

/**
 * Organization onboarding (S1-004).
 *
 * Atomically stands up a new tenant: the {@link Organization}, an optional 1:1
 * {@link BusinessProfile}, and an OWNER {@link Membership} for the signed-up
 * user — all in ONE `prisma.$transaction`, so a failure anywhere leaves no
 * half-created org.
 *
 * Ownership is ACTOR-DERIVED: the OWNER is always the authenticated caller
 * (`userId`, passed by the controller from `@CurrentUser()`), never a value
 * from the request body. The DTO has no owner field at all.
 */
@Injectable()
export class OrganizationOnboardingService {
    private readonly logger = new Logger(OrganizationOnboardingService.name);

    constructor(
        private readonly audit: AuditService,
        @Optional() private readonly activation?: ActivationEvents,
    ) {}

    async onboard(
        userId: string,
        dto: OnboardOrganizationDto,
        /**
         * Who is setting it up, for the welcome email: the signed-in
         * caller, never a value from the body. Absent, none is sent.
         */
        owner?: { email: string },
    ): Promise<OnboardedOrganization> {
        /*
         * The address the business reserves: the one the merchant chose, or
         * the name's own form when they left it alone (which is all this ever
         * was before). Stored as the slug, and it is what the business's
         * first website is served at (`<address>.saroh.app`).
         */
        // Blank counts as not chosen, like absent: `??` alone would keep ""
        // and refuse it, where it should fall back to the name.
        const chosen =
            dto.address === undefined || dto.address === ""
                ? null
                : dto.address;
        const slug = chosen ?? addressFromName(dto.name);
        if (!slug) {
            throw new BadRequestException(
                "The name needs at least one letter or number.",
            );
        }
        const problem = addressProblem(slug);
        if (problem) {
            // A chosen address is the merchant's to fix; a derived one is the
            // name's, so the message lands on whichever field produced it.
            throw new BadRequestException({
                message:
                    chosen !== null
                        ? problem
                        : `${problem}. Choose an address below.`,
                details: { field: "address" },
            });
        }

        // What is being set up (DEC-070). An app from before it sends none,
        // and the business is a BUSINESS, as every business was.
        const kind = dto.kind ?? DEFAULT_ORGANIZATION_KIND;

        const referredBy = await this.referredBy(userId, dto.referralCode);

        const making = prisma.$transaction(async (tx) => {
            /*
             * Fail fast on a taken address with a clear 409 rather than a raw
             * unique-constraint error. "Taken" means another business
             * reserved it OR a website already lives there — a reservation
             * that only checked businesses could not be kept.
             */
            if (await addressTaken(tx, slug)) {
                throw new ConflictException({
                    message: `${slug}.saroh.app is taken. Try another address.`,
                    details: { field: "address" },
                });
            }

            // Who Saroh bills for it (DEC-167, R7), decided before anything
            // is written: one of the caller's profiles, or a new one made
            // here, or, for an owner with none yet, their first from the
            // business's details once it exists (below). An owner with
            // profiles who chose none is refused, naming the choice.
            const billingProfileId = await chosenBillingProfileInTx(
                tx,
                userId,
                {
                    billingProfileId: dto.billingProfileId,
                    newBillingProfile: dto.newBillingProfile,
                },
            );

            // Who referred it (DEC-156), written here and nowhere else: no
            // later write names these two columns, so it is never changed.
            const organization = await tx.organization.create({
                data: {
                    name: dto.name,
                    slug,
                    kind,
                    ...(billingProfileId ? { billingProfileId } : {}),
                    ...(referredBy
                        ? {
                              referredByOrganizationId: referredBy,
                              referredAt: new Date(),
                          }
                        : {}),
                },
                select: { id: true, slug: true, createdAt: true },
            });

            // Every business gets a profile, if only for its time zone
            // (UX-008): without one, server-rendered times read UTC.
            await tx.businessProfile.create({
                data: {
                    organizationId: organization.id,
                    ...this.buildProfileData(dto),
                    timezone: startingZone(
                        dto.profile?.timezone,
                        dto.profile?.country,
                    ),
                },
            });

            // Actor-derived ownership: the OWNER is the authenticated caller.
            await tx.membership.create({
                data: {
                    organizationId: organization.id,
                    userId,
                    role: "OWNER",
                },
            });

            // Who at Saroh brought it in (DEC-169): the `?am=` link, a
            // typed code, or the owner's email on a manager's lead from
            // before now. Under a savepoint: it never stops the setup.
            const manager = await recordManagerInTx(tx, {
                organizationId: organization.id,
                ownerUserId: userId,
                madeAt: organization.createdAt,
                claim: {
                    link: dto.managerLinkCode
                        ? {
                              code: dto.managerLinkCode,
                              setAt: dto.managerLinkSetAt,
                          }
                        : null,
                    code: dto.managerCode,
                },
            });

            // Every business starts on the catalogue's Free plan (OQ-2): a
            // subscription row on the live version, no provider. Nothing is
            // written where no version is live yet; the business then reads
            // the free floor until the Free-rows backfill gives it one.
            await startOnFreePlan(tx, organization.id, {
                planId: FREE_PLAN_ID,
            });

            // The owner's first business gets their first billing profile
            // from its details (DEC-167, R6), whose customer at Saroh's
            // billing provider is made by a job after the commit: never in
            // the way of signing up. A later business chose one above.
            if (!billingProfileId) {
                await firstBillingProfileInTx(tx, {
                    ownerUserId: userId,
                    organizationId: organization.id,
                });
            }

            this.logger.log(
                `Onboarded organization ${organization.id} (${organization.slug}) with OWNER ${userId}`,
            );

            return {
                id: organization.id,
                slug: organization.slug,
                managerSource: manager?.source ?? null,
            };
        });
        // A new profile whose email lost a race to the database's
        // one-email-per-owner index: the same 409 as asked, not a 500.
        const { managerSource, ...onboarded } = await raceAsTaken(making);

        // Emit the audit event AFTER the transaction commits, so we only record
        // an org that actually exists. `record` never throws (it swallows and
        // logs internally), so a failed audit write can't undo a committed
        // onboarding — see AuditService's tradeoff note.
        await this.audit.record({
            action: AuditAction.OrganizationOnboard,
            actorUserId: userId,
            organizationId: onboarded.id,
            targetType: "organization",
            targetId: onboarded.id,
            outcome: AuditOutcome.Success,
            metadata: {
                slug: onboarded.slug,
                kind,
                // How its account manager was proved, never who: the
                // link itself is the record (DEC-169).
                ...(managerSource ? { accountManager: managerSource } : {}),
            },
        });

        // t0 of the activation funnel (#176). Same placement and same tradeoff
        // as the audit write above: after the commit, and it swallows its own
        // errors so instrumentation can never undo a committed onboarding.
        await this.activation?.organizationCreated(onboarded.id);

        // The welcome email (UX audit, 10 Oct): once, here, to whoever set
        // the business up. Not awaited: a mail server's pause is not the
        // setup screen's, and a welcome that didn't leave undoes nothing.
        if (owner?.email) {
            void sendWelcomeEmail(owner.email, {
                businessName: dto.name,
                goal: dto.goal ?? null,
                openUrl: `${appBase()}/open/${onboarded.id}`,
                address: onboarded.slug,
            }).then(
                (outcome) => {
                    if (outcome === "failed") {
                        this.logger.warn(
                            `Welcome email for organization ${onboarded.id} did not send`,
                        );
                    }
                },
                () => undefined,
            );
        }

        return onboarded;
    }

    /**
     * The business that referred this one, or null (`referral.ts` holds the
     * rules). A read that fails records nobody rather than stop the setup:
     * WARN `referral_lookup_failed`, and any at all is worth a look, since
     * each is a referral that went unrecorded.
     */
    private async referredBy(
        userId: string,
        code: string | undefined,
    ): Promise<string | null> {
        try {
            return await referringBusiness({ code, userId });
        } catch (reason) {
            this.logger.warn(
                `referral_lookup_failed user=${userId} reason=${reason instanceof Error ? reason.name : "unknown"}`,
            );
            return null;
        }
    }

    /**
     * Whether an address can be reserved, and if not, why — for the setup
     * form's live check. Read-only; the create re-checks inside its own
     * transaction, so a race between this answer and the submit is caught
     * there, not trusted here.
     */
    async checkAddress(
        raw: string,
    ): Promise<{ address: string; available: boolean; reason?: string }> {
        const address = raw.trim().toLowerCase();
        const problem = addressProblem(address);
        if (problem) return { address, available: false, reason: problem };
        if (await addressTaken(prisma, address)) {
            return {
                address,
                available: false,
                reason: "Another business already has this address",
            };
        }
        return { address, available: true };
    }

    /**
     * Reduce the DTO's optional profile to the columns actually supplied
     * (the zone is decided by the caller). Empty when no profile was sent.
     */
    private buildProfileData(dto: OnboardOrganizationDto) {
        const profile = dto.profile;
        if (!profile) return {};

        const type = businessTypeWrite(profile.type) ?? undefined;
        return {
            legalName: profile.legalName,
            type,
            // Setup's "Is it registered?" (prelaunch): Registered sends no
            // type, so the answer is kept to ask for the real one before
            // the business goes live. Not registered is the `individual`
            // type, so it reads as not registered without being sent.
            legallyRegistered:
                profile.registered ??
                (type === "individual" ? false : undefined),
            country: profile.country,
            taxId: profile.taxId,
            contactEmail: profile.contactEmail,
            website: profile.website,
        };
    }
}
