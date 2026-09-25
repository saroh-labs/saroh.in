import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { IANAZone } from "luxon";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import type { NumberRestart } from "../invoices/numbering";
import { invoiceSeriesKeys } from "../invoices/numbering";
import { MediaService } from "../media/media.service";
import { logoProblem } from "./business-logo";
import type {
    RegisteredAddressView,
    TaxSettingsView,
} from "./business-tax-settings";
import {
    addressView,
    TAX_CURRENT_SELECT,
    taxChanges,
    taxView,
    touchesTax,
} from "./business-tax-settings";
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
    /**
     * When the business first sold something: the earliest order on record,
     * ISO. Derived, never typed — `null` until the first order.
     */
    tradingSince: string | null;
    /** GST (ADR-008). The GSTIN is `profile.taxId`. */
    tax: TaxSettingsView;
    /**
     * The registered address printed on invoices. Its state is the GST
     * state (`tax.state`) — one field, registered or not.
     */
    registeredAddress: RegisteredAddressView;
    /**
     * The logo printed at the top of invoices and receipts, where it is
     * served from and the library object it is; null until one is set.
     */
    logo: { url: string; mediaId: string | null } | null;
}

/** What the settings read selects from the profile. */
const PROFILE_SELECT = {
    legalName: true,
    type: true,
    country: true,
    taxId: true,
    contactEmail: true,
    website: true,
    timezone: true,
    gstRegistered: true,
    gstState: true,
    invoicePrefix: true,
    invoiceNumberFormat: true,
    deliveryGstRate: true,
    deliverySacCode: true,
    logoMediaId: true,
    logoUrl: true,
    addressLine1: true,
    addressLine2: true,
    city: true,
    postalCode: true,
} as const;

interface ProfileRow {
    legalName: string | null;
    type: string | null;
    country: string | null;
    taxId: string | null;
    contactEmail: string | null;
    website: string | null;
    timezone: string | null;
    gstRegistered: boolean;
    gstState: string | null;
    invoicePrefix: string | null;
    invoiceNumberFormat: unknown;
    deliveryGstRate: { toString(): string };
    deliverySacCode: string | null;
    logoMediaId: string | null;
    logoUrl: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
}

function splitProfile(
    p: ProfileRow | null,
    counters?: Record<NumberRestart, number>,
) {
    if (!p) {
        return {
            profile: null,
            tax: taxView(null, counters),
            registeredAddress: addressView(null),
            logo: null,
        };
    }
    const {
        gstRegistered: _r,
        gstState: _s,
        invoicePrefix: _p,
        invoiceNumberFormat: _n,
        deliveryGstRate: _d,
        deliverySacCode: _c,
        logoMediaId,
        logoUrl,
        addressLine1: _a1,
        addressLine2: _a2,
        city: _ci,
        postalCode: _pc,
        ...profile
    } = p;
    return {
        profile,
        tax: taxView(p, counters),
        registeredAddress: addressView(p),
        logo: logoUrl ? { url: logoUrl, mediaId: logoMediaId ?? null } : null,
    };
}

const PROFILE_FIELDS = [
    "legalName",
    "type",
    "country",
    "taxId",
    "contactEmail",
    "website",
    "timezone",
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
    constructor(
        private readonly audit: AuditService,
        private readonly media: MediaService,
    ) {}

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
        if (
            // "" clears it, the way the form clears any field.
            profileData.timezone &&
            !IANAZone.isValidZone(profileData.timezone)
        ) {
            throw new BadRequestException({
                message: "That timezone is not one we know",
                details: { field: "timezone" },
            });
        }
        const taxSent = {
            tax: dto.tax,
            taxId: profileData.taxId,
            country: profileData.country,
            address: dto.registeredAddress,
        };
        const taxData = touchesTax(taxSent)
            ? taxChanges(
                  await prisma.businessProfile.findUnique({
                      where: { organizationId: ctx.organizationId },
                      select: TAX_CURRENT_SELECT,
                  }),
                  taxSent,
              )
            : {};
        const changed: string[] = [
            ...(dto.name !== undefined ? ["name"] : []),
            ...Object.keys(profileData),
            ...Object.keys(taxData),
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

            const written = { ...profileData, ...taxData };
            if (Object.keys(written).length > 0) {
                await tx.businessProfile.upsert({
                    where: { organizationId: ctx.organizationId },
                    create: {
                        organizationId: ctx.organizationId,
                        ...written,
                    },
                    update: written,
                });
            }

            const organization = await tx.organization.findUnique({
                where: { id: ctx.organizationId },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    businessProfile: { select: PROFILE_SELECT },
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
            ...splitProfile(
                settings.businessProfile,
                await this.counters(
                    ctx.organizationId,
                    settings.businessProfile,
                ),
            ),
            tradingSince: await this.firstOrderAt(ctx.organizationId),
        };
    }

    /**
     * Set the business logo to a library object the business uploaded
     * (`org:update`). It must be READY, this business's, and a logo's type
     * and size ({@link logoProblem}); its address is taken now, as a product
     * photo's is. Replacing leaves the old image in the library.
     */
    async setLogo(
        ctx: OrganizationContext,
        mediaId: string,
    ): Promise<OrganizationSettings> {
        authorize(ctx, "org:update");
        const media = await this.media.readyObject(ctx.organizationId, mediaId);
        const problem = logoProblem(media);
        if (problem) {
            throw new BadRequestException({
                message: problem,
                details: { field: "logo" },
            });
        }
        if (!media.url) {
            throw new BadRequestException({
                message:
                    "Uploaded, but storage is not set up to serve images yet, so the logo cannot print.",
                details: { field: "logo" },
            });
        }
        const data = { logoMediaId: media.id, logoUrl: media.url };
        await prisma.businessProfile.upsert({
            where: { organizationId: ctx.organizationId },
            create: { organizationId: ctx.organizationId, ...data },
            update: data,
        });
        await this.recordLogo(ctx);
        return this.read(ctx.organizationId);
    }

    /**
     * Take the logo off (`org:update`). The image stays in the library;
     * paper printed from now on carries the name alone.
     */
    async removeLogo(ctx: OrganizationContext): Promise<OrganizationSettings> {
        authorize(ctx, "org:update");
        const { count } = await prisma.businessProfile.updateMany({
            where: {
                organizationId: ctx.organizationId,
                logoUrl: { not: null },
            },
            data: { logoMediaId: null, logoUrl: null },
        });
        if (count > 0) await this.recordLogo(ctx);
        return this.read(ctx.organizationId);
    }

    private recordLogo(ctx: OrganizationContext) {
        return this.audit.record({
            action: AuditAction.ProfileUpdate,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "organization",
            targetId: ctx.organizationId,
            outcome: AuditOutcome.Success,
            metadata: { fields: ["logo"] },
        });
    }

    private async read(organizationId: string): Promise<OrganizationSettings> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                businessProfile: { select: PROFILE_SELECT },
            },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }
        return {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            ...splitProfile(
                organization.businessProfile,
                await this.counters(
                    organizationId,
                    organization.businessProfile,
                ),
            ),
            tradingSince: await this.firstOrderAt(organizationId),
        };
    }

    /**
     * Where the business's invoice series stand now, for each way of
     * restarting — this financial year's, this month's and the running
     * counter's last number — so the Tax card can say what the next invoice
     * will be called, in the stored format or one being tried.
     */
    private async counters(
        organizationId: string,
        p: Pick<ProfileRow, "invoicePrefix" | "timezone"> | null,
    ): Promise<Record<NumberRestart, number>> {
        const keys = invoiceSeriesKeys(
            p?.invoicePrefix ?? null,
            new Date(),
            p?.timezone,
        );
        const rows = await prisma.invoiceSequence.findMany({
            where: { organizationId, series: { in: Object.values(keys) } },
            select: { series: true, lastNumber: true },
        });
        const last = (key: string) =>
            rows.find((r) => r.series === key)?.lastNumber ?? 0;
        return {
            FY: last(keys.FY),
            MONTH: last(keys.MONTH),
            NEVER: last(keys.NEVER),
        };
    }

    /** The earliest order in the business, across every storefront. */
    private async firstOrderAt(organizationId: string): Promise<string | null> {
        const first = await prisma.order.findFirst({
            where: { organizationId },
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
        });
        return first?.createdAt.toISOString() ?? null;
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
