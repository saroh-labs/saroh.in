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
import { bpsToRate, isGstRate, rateToBps } from "../invoices/gst";
import { gstinProblem, stateCode, stateName } from "../invoices/gst-states";
import { prefixProblem } from "../invoices/numbering";
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
}

export interface TaxSettingsView {
    registered: boolean;
    /** A GST state code, e.g. "29", and its name. */
    state: string | null;
    stateName: string | null;
    invoicePrefix: string | null;
    /** The GST rate on delivery, in percent ("18"). */
    deliveryRate: string;
    deliverySac: string | null;
}

type TaxData = Partial<{
    gstRegistered: boolean;
    gstState: string | null;
    invoicePrefix: string | null;
    deliveryGstRate: string;
    deliverySacCode: string | null;
}>;

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
    deliveryGstRate: true,
    deliverySacCode: true,
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
    deliveryGstRate: { toString(): string };
    deliverySacCode: string | null;
}

function taxView(p: ProfileRow | null): TaxSettingsView {
    const bps = rateToBps(p?.deliveryGstRate ?? "18") ?? 1800;
    return {
        registered: p?.gstRegistered ?? false,
        state: p?.gstState ?? null,
        stateName: stateName(p?.gstState),
        invoicePrefix: p?.invoicePrefix ?? null,
        deliveryRate: bpsToRate(bps),
        deliverySac: p?.deliverySacCode ?? null,
    };
}

function splitProfile(p: ProfileRow | null) {
    if (!p) return { profile: null, tax: taxView(null) };
    const {
        gstRegistered: _r,
        gstState: _s,
        invoicePrefix: _p,
        deliveryGstRate: _d,
        deliverySacCode: _c,
        ...profile
    } = p;
    return { profile, tax: taxView(p) };
}

function taxError(message: string, field: string): never {
    throw new BadRequestException({ message, details: { field } });
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
        const taxData = await this.taxChanges(
            ctx.organizationId,
            dto.tax,
            profileData.taxId,
        );
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
            ...splitProfile(settings.businessProfile),
            tradingSince: await this.firstOrderAt(ctx.organizationId),
        };
    }

    /**
     * The GST settings a PATCH asks for, checked against what is stored
     * (ADR-008). Registering needs a GSTIN — the profile's tax ID, sent in the
     * same PATCH or already saved — in the register's shape, with its check
     * character, from the state chosen (or, with none chosen, its own). A
     * registered business cannot clear its GSTIN. The prefix keeps every
     * number within GST's 16 characters.
     */
    private async taxChanges(
        organizationId: string,
        tax: UpdateOrganizationDto["tax"],
        taxIdSent: string | undefined,
    ): Promise<TaxData> {
        if (!tax && taxIdSent === undefined) return {};
        const current = await prisma.businessProfile.findUnique({
            where: { organizationId },
            select: { gstRegistered: true, gstState: true, taxId: true },
        });
        const data: TaxData = {};

        let state = current?.gstState ?? null;
        if (tax?.state !== undefined) {
            if (tax.state === "") {
                state = null;
            } else {
                state = stateCode(tax.state);
                if (!state) taxError("That is not a state we know", "gstState");
            }
            data.gstState = state;
        }
        const registered = tax?.registered ?? current?.gstRegistered ?? false;
        if (tax?.registered !== undefined) data.gstRegistered = registered;

        const gstin = (taxIdSent ?? current?.taxId ?? "").trim().toUpperCase();
        if (registered) {
            if (!gstin) {
                taxError(
                    "A GST-registered business needs its GSTIN in Tax ID.",
                    "taxId",
                );
            }
            if (!state) {
                state = gstin.slice(0, 2);
                data.gstState = state;
            }
            const problem = gstinProblem(gstin, state);
            if (problem) taxError(problem, "taxId");
        }

        if (tax?.invoicePrefix !== undefined) {
            const prefix = tax.invoicePrefix.toUpperCase();
            if (prefix === "") {
                data.invoicePrefix = null;
            } else {
                const problem = prefixProblem(prefix);
                if (problem) taxError(problem, "invoicePrefix");
                data.invoicePrefix = prefix;
            }
        }
        if (tax?.deliveryRate !== undefined) {
            if (!isGstRate(tax.deliveryRate)) {
                taxError(
                    `${tax.deliveryRate}% is not a GST rate. Use 0, 0.25, 3, 5, 12, 18, 28 or 40.`,
                    "deliveryRate",
                );
            }
            data.deliveryGstRate = tax.deliveryRate;
        }
        if (tax?.deliverySac !== undefined) {
            data.deliverySacCode =
                tax.deliverySac === "" ? null : tax.deliverySac;
        }
        return data;
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
            ...splitProfile(organization.businessProfile),
            tradingSince: await this.firstOrderAt(organizationId),
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
