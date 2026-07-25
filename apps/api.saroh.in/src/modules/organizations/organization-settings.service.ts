import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { UpdateOrganizationDto } from "./dto";
import { authorize } from "./organization-policy";

/** The org's editable identity: display name plus optional business profile. */
export interface OrganizationSettings {
    id: string;
    name: string;
    slug: string;
    profile: {
        legalName: string | null;
        type: string | null;
        country: string | null;
        taxId: string | null;
        contactEmail: string | null;
        website: string | null;
    } | null;
}

const PROFILE_FIELDS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
] as const;

type ProfileField = (typeof PROFILE_FIELDS)[number];
type ProfileData = Partial<Record<ProfileField, string | undefined>>;

/**
 * Reading and editing an Organization's own identity (name + BusinessProfile).
 *
 * Until now both were write-once at onboarding: there was no update path in the
 * API at all, so a typo in the legal name was permanent — and it is not cosmetic,
 * because `SitesService` reads `legalName` into published site content. This is
 * that missing path.
 *
 * Authorization is delegated to `organization-policy` (never an inline role
 * string): `org:settings:read` to read the profile — NOT the `org:read` floor,
 * since tax/legal identity is not MEMBER-visible — and `org:update` to change
 * anything. Both are OWNER/ADMIN.
 */
@Injectable()
export class OrganizationSettingsService {
    constructor(private readonly audit: AuditService) {}

    /** The org's current editable identity. OWNER/ADMIN only. */
    async get(ctx: OrganizationContext): Promise<OrganizationSettings> {
        authorize(ctx, "org:settings:read");
        return this.read(ctx.organizationId);
    }

    /**
     * Organizations where `userId` is the ONLY OWNER — i.e. the ones that would
     * be stranded if this account were deleted.
     *
     * A pre-flight for the account-deletion UI. The authoritative refusal lives
     * in `@saroh/auth`'s `beforeDelete` hook, but that only fires when the user
     * clicks the emailed confirmation link — telling someone "actually, no"
     * after they've committed is a poor way to explain a rule. This lets the UI
     * say it up front, while the hook remains the thing that cannot be bypassed.
     *
     * Self-scoped: it answers only for the authenticated caller, so it needs no
     * Organization context and leaks nothing about anyone else's tenancy.
     */
    async listSoleOwned(
        userId: string,
    ): Promise<{ id: string; name: string; slug: string }[]> {
        const ownerships = await prisma.membership.findMany({
            where: { userId, role: "OWNER" },
            select: {
                organizationId: true,
                organization: { select: { id: true, name: true, slug: true } },
            },
        });

        const soleOwned = [];
        for (const ownership of ownerships) {
            const otherOwners = await prisma.membership.count({
                where: {
                    organizationId: ownership.organizationId,
                    role: "OWNER",
                    userId: { not: userId },
                },
            });
            if (otherOwners === 0) {
                soleOwned.push(ownership.organization);
            }
        }
        return soleOwned;
    }

    /**
     * Apply a partial update to the org's name and/or business profile.
     *
     * The two writes share ONE transaction so a rename can never land without
     * its profile edit (or vice versa). The profile is upserted, because an org
     * onboarded with a name alone has no BusinessProfile row yet — that is the
     * common case for exactly the users who need to complete it later.
     */
    async update(
        ctx: OrganizationContext,
        dto: UpdateOrganizationDto,
    ): Promise<OrganizationSettings> {
        authorize(ctx, "org:update");

        const profileData = reduceProfile(dto.profile);
        const changed: string[] = [
            ...(dto.name !== undefined ? ["name"] : []),
            ...Object.keys(profileData),
        ];

        // Nothing to do — return current state rather than writing an empty
        // update and an audit row that records no change.
        if (changed.length === 0) {
            return this.read(ctx.organizationId);
        }

        const settings = await prisma.$transaction(async (tx) => {
            if (dto.name !== undefined) {
                await tx.organization.update({
                    where: { id: ctx.organizationId },
                    data: { name: dto.name },
                });
            }

            if (Object.keys(profileData).length > 0) {
                await tx.businessProfile.upsert({
                    where: { organizationId: ctx.organizationId },
                    create: {
                        organizationId: ctx.organizationId,
                        ...profileData,
                    },
                    update: profileData,
                });
            }

            const organization = await tx.organization.findUnique({
                where: { id: ctx.organizationId },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    businessProfile: {
                        select: {
                            legalName: true,
                            type: true,
                            country: true,
                            taxId: true,
                            contactEmail: true,
                            website: true,
                        },
                    },
                },
            });
            if (!organization) {
                throw new NotFoundException("Organization not found");
            }
            return organization;
        });

        // Field NAMES only, never values: the profile carries tax ids and
        // contact emails, and the audit stream must stay PII-free (S1-009).
        await this.audit.record({
            action: AuditAction.ProfileUpdate,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "organization",
            targetId: ctx.organizationId,
            outcome: AuditOutcome.Success,
            metadata: { fields: changed },
        });

        return {
            id: settings.id,
            name: settings.name,
            slug: settings.slug,
            profile: settings.businessProfile ?? null,
        };
    }

    private async read(organizationId: string): Promise<OrganizationSettings> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                businessProfile: {
                    select: {
                        legalName: true,
                        type: true,
                        country: true,
                        taxId: true,
                        contactEmail: true,
                        website: true,
                    },
                },
            },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }
        return {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            profile: organization.businessProfile ?? null,
        };
    }
}

/**
 * Keep only the profile keys the caller actually sent, so a PATCH of one field
 * never blanks the other five. An explicit empty string is preserved — that is
 * how the UI clears a field — while `undefined` (absent) is dropped.
 */
function reduceProfile(profile: ProfileData | undefined): ProfileData {
    if (!profile) return {};
    const data: ProfileData = {};
    for (const field of PROFILE_FIELDS) {
        if (profile[field] !== undefined) {
            data[field] = profile[field];
        }
    }
    return data;
}
