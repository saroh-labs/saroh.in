import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { liveCatalogueVersion, prisma } from "@saroh/database";
import type { AccessState, Catalog } from "@saroh/pricing-catalog";
import { validateCatalog } from "@saroh/pricing-catalog";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type { OverrideRow } from "../billing/catalogue-access";
import type {
    CatalogueAccess,
    CatalogueAccessService,
} from "../billing/catalogue-access.service";
import { OrganizationLifecycleStatus } from "./admin-access.service";
import { AdminPermission, AdminRole } from "./admin-permissions";

/**
 * A custom offer and its dry run (admin console U5, R5, #993). Offers are
 * gifts only (DEV_LEARNINGS "an override is a gift"): a plan until a date,
 * a custom price, one module granted, a higher limit, or a longer trial
 * (only while in a trial and not billed by a provider). Taking a module
 * away is not an offer: it is **Take away a module…**, a Platform owner's
 * alone, and refused for a module their paid plan includes.
 *
 * The dry run checks what the write would check and answers what the
 * business would see, read through `CatalogueAccessService.resolve` with
 * the override set as the write would leave it (`WhatIf`). It writes
 * nothing: no override, no ledger row, no job. A refusal is the same
 * exception, with the same words, the write throws.
 *
 * CROSS-TENANT READ: the one business in the path, behind the admin guards.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The furthest ahead an override's end date may be. */
export const MAX_END_DAYS = 5 * 366;
/** A raised limit lasts 1 to this many days (`AdminLifecycleService.raiseLimit`). */
export const RAISE_MAX_DAYS = 365;
/** A trial is extended by 1 to this many days (`AdminLifecycleService.trial`). */
export const TRIAL_MAX_DAYS = 90;

/** What the offer sheet gives. */
export const OFFER_KINDS = [
    "plan",
    "price",
    "module",
    "limit",
    "trial",
] as const;
/** What a dry run answers: every offer, and Take away a module…. */
export const PREVIEW_KINDS = [...OFFER_KINDS, "remove"] as const;
export type PreviewKind = (typeof PREVIEW_KINDS)[number];

/** One offer, as the operator has filled it in so far. */
export interface OfferDraft {
    kind: PreviewKind;
    /** `plan`: the catalogue plan id. */
    planKey?: string;
    /** `price`: a month, before GST. */
    pricePaise?: number;
    /** `module` / `remove`: the catalogue row; `limit`: the limit's key. */
    moduleKey?: string;
    /** `limit`: the new, higher limit. */
    value?: number;
    /** When it ends; for `trial`, the trial's new end. */
    expiresAt?: string;
}

/** One thing the business would see change. */
export type OfferChange =
    | { type: "plan"; from: string; to: string }
    | { type: "price"; fromPaise: number; toPaise: number }
    | {
          type: "module";
          moduleId: string;
          name: string;
          from: AccessState;
          to: AccessState;
      }
    | {
          type: "limit";
          key: string;
          name: string;
          from: number | null;
          to: number | null;
          per: string;
      }
    | { type: "trial"; from: string | null; to: string };

export interface OfferPreview {
    kind: PreviewKind;
    /** When it ends, as the write would set it; null lasts until removed. */
    endsAt: string | null;
    /** What it gives (or, for `remove`, takes), in the order to say it. */
    changes: OfferChange[];
    /** A plan offer: the plan it goes back to when it ends. */
    then: string | null;
    /** The module or limit's name, or the plan's, for the button's words. */
    subject: string | null;
    /**
     * A higher limit or a longer trial: the days its write takes
     * (`POST …/limits`, `POST …/trial`), so it ends when this says.
     */
    days: number | null;
}

const NEEDS_OVERRIDE = "Your access doesn't cover giving offers.";
const NEEDS_PUBLISH = "A custom price needs pricing:publish as well.";
const NEEDS_SUBSCRIPTION =
    "A higher limit or a longer trial needs subscription:override.";
export const ONLY_PLATFORM_OWNER = "Only a Platform owner takes a module away.";
export const NOT_ON_CATALOGUE =
    "This business isn't on a catalogue plan yet, so an override wouldn't apply. Put it on a plan first.";
export const NOTHING_CHANGES =
    "That changes nothing they see. They already have it, or the plan they pay for gives more.";

function holds(staff: PlatformAdminInfo, permission: AdminPermission) {
    return staff.permissions.includes(permission);
}

export function isPlatformOwner(staff: PlatformAdminInfo): boolean {
    return staff.roles.includes(AdminRole.PlatformOwner);
}

/** Why this operator may not give this kind; null when they may. */
export function accessWhy(
    staff: PlatformAdminInfo,
    kind: PreviewKind,
): string | null {
    switch (kind) {
        case "plan":
        case "module":
            return holds(staff, AdminPermission.PricingOverride)
                ? null
                : NEEDS_OVERRIDE;
        case "price":
            if (!holds(staff, AdminPermission.PricingOverride)) {
                return NEEDS_OVERRIDE;
            }
            return holds(staff, AdminPermission.PricingPublish)
                ? null
                : NEEDS_PUBLISH;
        case "limit":
        case "trial":
            return holds(staff, AdminPermission.SubscriptionOverride)
                ? null
                : NEEDS_SUBSCRIPTION;
        case "remove":
            return isPlatformOwner(staff) ? null : ONLY_PLATFORM_OWNER;
    }
}

/**
 * An override's end date: in the future and at most {@link MAX_END_DAYS}
 * away. Without one it lasts until removed, unless `required`.
 */
export function endDate(
    value: string | undefined,
    required: boolean,
    now: number = Date.now(),
): Date | null {
    if (!value) {
        if (required) throw new BadRequestException("Give an end date.");
        return null;
    }
    const at = new Date(value);
    if (Number.isNaN(at.getTime()) || at.getTime() <= now) {
        throw new BadRequestException("The end date must be in the future.");
    }
    if (at.getTime() > now + MAX_END_DAYS * DAY_MS) {
        throw new BadRequestException(
            "The end date must be within five years.",
        );
    }
    return at;
}

/** {@link endDate} for an offer that must end. */
export function requiredEndDate(
    value: string | undefined,
    now: number = Date.now(),
): Date {
    const at = endDate(value, true, now);
    if (!at) throw new BadRequestException("Give an end date.");
    return at;
}

/** The live version's snapshot, or null when none is live or it is invalid. */
export async function liveCatalog(): Promise<Catalog | null> {
    const row = await liveCatalogueVersion(prisma);
    if (!row) return null;
    const r = validateCatalog(row.catalog);
    return r.ok ? r.catalog : null;
}

/** Whole days from `from` to `to`, rounded up: a date "until" lasts the day. */
export function daysUntil(from: number, to: Date): number {
    return Math.ceil((to.getTime() - from) / DAY_MS);
}

export function hypothetical(
    organizationId: string,
    row: Pick<OverrideRow, "kind" | "key"> & Partial<OverrideRow>,
    now: Date,
): OverrideRow {
    return {
        id: `dry-run:${organizationId}`,
        moduleKey: null,
        value: null,
        planKey: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: now,
        ...row,
    };
}

/**
 * Whether the plan the business pays for, with the add-ons it bought,
 * includes a catalogue row: read with every override left out. Taking such
 * a row away would take what is paid for (an override is a gift).
 */
export async function paidPlanIncludes(
    access: CatalogueAccessService,
    organizationId: string,
    moduleIds: readonly string[],
    now: Date,
): Promise<Set<string>> {
    const own = await access.resolve(organizationId, now, { drop: () => true });
    if (own.source !== "catalogue") return new Set();
    const price =
        own.catalog.plans.find((p) => p.id === own.basePlanId)?.pricePaise ?? 0;
    if (price <= 0) return new Set();
    return new Set(
        own.modules
            .filter((m) => m.state === "on" && moduleIds.includes(m.moduleId))
            .map((m) => m.moduleId),
    );
}

/**
 * Take away a module…: a Platform owner's alone, refused for a row the
 * business's paid plan includes. The write (`setModuleOverride`, kind
 * `remove`) and its dry run both ask here.
 */
export async function assertMayTakeAway(
    access: CatalogueAccessService,
    staff: PlatformAdminInfo,
    organizationId: string,
    row: { id: string; name: string },
    now: Date = new Date(),
): Promise<void> {
    if (!isPlatformOwner(staff)) {
        throw new ForbiddenException(ONLY_PLATFORM_OWNER);
    }
    const paid = await paidPlanIncludes(access, organizationId, [row.id], now);
    if (paid.has(row.id)) {
        throw new ConflictException(
            `Their paid plan includes ${row.name}, so it can't be taken away. An override never takes away what they pay for.`,
        );
    }
}

export async function organizationOpen(organizationId: string) {
    const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { lifecycleStatus: true },
    });
    if (!organization) throw new NotFoundException("Organization not found");
    if (
        organization.lifecycleStatus ===
        OrganizationLifecycleStatus.DeletedRetained
    ) {
        throw new ConflictException("This business has been deleted.");
    }
}

export async function onCatalogue(
    access: CatalogueAccessService,
    organizationId: string,
    now: Date,
): Promise<CatalogueAccess> {
    const a = await access.resolve(organizationId, now);
    if (a.source !== "catalogue") throw new ConflictException(NOT_ON_CATALOGUE);
    return a;
}

export function catalogueRow(
    a: CatalogueAccess,
    moduleKey: string | undefined,
) {
    const row = a.catalog.modules.find((m) => m.id === moduleKey);
    if (!row) {
        throw new BadRequestException(
            `"${moduleKey ?? ""}" isn't a module in version ${a.version}.`,
        );
    }
    return row;
}
