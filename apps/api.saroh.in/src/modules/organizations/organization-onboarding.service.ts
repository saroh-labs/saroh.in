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
        const slug = slugify(dto.name);
        if (!slug) {
            throw new BadRequestException(
                "Organization name must contain at least one alphanumeric character",
            );
        }

        const onboarded = await prisma.$transaction(async (tx) => {
            // Fail fast on a taken slug with a clear 409 rather than surfacing a
            // raw unique-constraint error; the check + create share the txn.
            const existing = await tx.organization.findUnique({
                where: { slug },
                select: { id: true },
            });
            if (existing) {
                throw new ConflictException(
                    `An organization with the slug "${slug}" already exists`,
                );
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
