import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { ActivationEvents } from "../analytics/activation-events";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { addressProblem, addressTaken } from "../sites/site-address";
import type { OnboardOrganizationDto } from "./dto";
import { slugify } from "./slug";

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
    ): Promise<OnboardedOrganization> {
        /*
         * The address the business reserves: the one the merchant chose, or
         * the name's own form when they left it alone (which is all this ever
         * was before). Stored as the slug, and it is what the business's
         * first website is served at (`<address>.saroh.app`).
         */
        const chosen = dto.address ? dto.address : null;
        const slug = chosen ?? slugify(dto.name).slice(0, 63);
        if (!slug) {
            throw new BadRequestException(
                "Organization name must contain at least one alphanumeric character",
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
                        : `${problem} — choose an address below`,
                details: { field: "address" },
            });
        }

        const onboarded = await prisma.$transaction(async (tx) => {
            /*
             * Fail fast on a taken address with a clear 409 rather than a raw
             * unique-constraint error. "Taken" means another business
             * reserved it OR a website already lives there — a reservation
             * that only checked businesses could not be kept.
             */
            if (await addressTaken(tx, slug)) {
                throw new ConflictException({
                    message: `${slug}.saroh.app is taken — try another address`,
                    details: { field: "address" },
                });
            }

            const organization = await tx.organization.create({
                data: { name: dto.name, slug },
                select: { id: true, slug: true },
            });

            const profileData = this.buildProfileData(dto);
            if (profileData) {
                await tx.businessProfile.create({
                    data: { organizationId: organization.id, ...profileData },
                });
            }

            // Actor-derived ownership: the OWNER is the authenticated caller.
            await tx.membership.create({
                data: {
                    organizationId: organization.id,
                    userId,
                    role: "OWNER",
                },
            });

            this.logger.log(
                `Onboarded organization ${organization.id} (${organization.slug}) with OWNER ${userId}`,
            );

            return { id: organization.id, slug: organization.slug };
        });

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
            metadata: { slug: onboarded.slug },
        });

        // t0 of the activation funnel (#176). Same placement and same tradeoff
        // as the audit write above: after the commit, and it swallows its own
        // errors so instrumentation can never undo a committed onboarding.
        await this.activation?.organizationCreated(onboarded.id);

        return onboarded;
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
     * Reduce the DTO's optional profile to the columns actually supplied.
     * Returns `null` when no profile (or an empty one) was sent, so we skip the
     * BusinessProfile row entirely rather than persisting an all-null record.
     */
    private buildProfileData(dto: OnboardOrganizationDto) {
        const profile = dto.profile;
        if (!profile) {
            return null;
        }

        const data = {
            legalName: profile.legalName,
            type: profile.type,
            country: profile.country,
            taxId: profile.taxId,
            contactEmail: profile.contactEmail,
            website: profile.website,
        };

        const hasAnyField = Object.values(data).some(
            (value) => value !== undefined,
        );
        return hasAnyField ? data : null;
    }
}
