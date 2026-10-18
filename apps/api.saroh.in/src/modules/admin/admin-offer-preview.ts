import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import type {
    BusinessAccess,
    CatalogueAccessService,
    WhatIf,
} from "../billing/catalogue-access.service";
import { assertNotProviderManaged } from "./admin-lifecycle.service";
import type { OfferChange, OfferDraft, OfferPreview } from "./admin-offers";
import {
    accessWhy,
    assertMayTakeAway,
    catalogueRow,
    DAY_MS,
    daysUntil,
    endDate,
    hypothetical,
    liveCatalog,
    NOTHING_CHANGES,
    onCatalogue,
    organizationOpen,
    RAISE_MAX_DAYS,
    requiredEndDate,
    TRIAL_MAX_DAYS,
} from "./admin-offers";

/**
 * The dry run of a custom offer, or of Take away a module… (admin console
 * U5, R5): the rules in `admin-offers.ts`, then what the business would see,
 * read through `CatalogueAccessService.resolve` with the override set as
 * the write would leave it. It writes nothing: no override, no ledger row,
 * no job.
 *
 * CROSS-TENANT READ: the one business in the path, behind the admin guards.
 */

/** What differs between two reads of the same business, plan first. */
export function accessChanges(
    before: BusinessAccess,
    after: BusinessAccess,
    { price }: { price: boolean },
): OfferChange[] {
    const out: OfferChange[] = [];
    if (before.source === "catalogue" && after.source === "catalogue") {
        if (before.planId !== after.planId) {
            out.push({
                type: "plan",
                from: before.planName,
                to: after.planName,
            });
        }
        if (price && before.pricePaise !== after.pricePaise) {
            out.push({
                type: "price",
                fromPaise: before.pricePaise,
                toPaise: after.pricePaise,
            });
        }
        for (const now of after.modules) {
            const was = before.modules.find((m) => m.moduleId === now.moduleId);
            if (!was) continue;
            if (was.state !== now.state) {
                out.push({
                    type: "module",
                    moduleId: now.moduleId,
                    name: now.name,
                    from: was.state,
                    to: now.state,
                });
            } else if (now.state === "on" && was.limit !== now.limit) {
                out.push({
                    type: "limit",
                    key: now.moduleId,
                    name: now.name,
                    from: was.limit,
                    to: now.limit,
                    per: now.per,
                });
            }
        }
        return out;
    }
    // Off the catalogue only a raise applies: the numeric keys it lifts.
    for (const [key, value] of Object.entries(after.entitlements)) {
        const was = before.entitlements[key];
        if (
            typeof value === "number" &&
            typeof was === "number" &&
            was !== value
        ) {
            out.push({
                type: "limit",
                key,
                name: key,
                from: was,
                to: value,
                per: "",
            });
        }
    }
    return out;
}

/**
 * The dry run of one offer, or of Take away a module…: the checks its
 * write makes, then what the business would see. Writes nothing.
 */
export async function previewOffer(
    access: CatalogueAccessService,
    staff: PlatformAdminInfo,
    organizationId: string,
    draft: OfferDraft,
    now: Date = new Date(),
): Promise<OfferPreview> {
    const why = accessWhy(staff, draft.kind);
    if (why) throw new ForbiddenException(why);
    await organizationOpen(organizationId);
    const t = now.getTime();

    const result = await (async (): Promise<OfferPreview> => {
        switch (draft.kind) {
            case "plan": {
                const expiresAt = requiredEndDate(draft.expiresAt, t);
                const before = await access.resolve(organizationId, now);
                const catalog =
                    before.source === "catalogue"
                        ? before.catalog
                        : await liveCatalog();
                if (!catalog) {
                    throw new ConflictException(
                        "No catalogue version is live yet, so there is no plan to put it on.",
                    );
                }
                const plan = catalog.plans.find((p) => p.id === draft.planKey);
                if (!plan) {
                    throw new BadRequestException(
                        `"${draft.planKey ?? ""}" isn't a plan in the version this business is on.`,
                    );
                }
                const whatIf: WhatIf = {
                    add: [
                        hypothetical(
                            organizationId,
                            {
                                kind: "plan",
                                key: "plan",
                                planKey: plan.id,
                                expiresAt,
                            },
                            now,
                        ),
                    ],
                    drop: (r) => r.kind === "plan",
                };
                const after = await access.resolve(organizationId, now, whatIf);
                const later = await access.resolve(
                    organizationId,
                    new Date(expiresAt.getTime() + 1),
                    whatIf,
                );
                const changes =
                    before.source === "catalogue"
                        ? accessChanges(before, after, { price: false })
                        : after.source === "catalogue"
                          ? [
                                {
                                    type: "plan" as const,
                                    from: "the free basics",
                                    to: after.planName,
                                },
                            ]
                          : [];
                return {
                    kind: "plan",
                    endsAt: expiresAt.toISOString(),
                    changes,
                    then:
                        later.source === "catalogue"
                            ? later.planName
                            : "the free basics",
                    subject: plan.name,
                    days: null,
                };
            }
            case "price": {
                const expiresAt = endDate(draft.expiresAt, false, t);
                const paise = draft.pricePaise;
                if (
                    typeof paise !== "number" ||
                    !Number.isInteger(paise) ||
                    paise < 0
                ) {
                    throw new BadRequestException(
                        "A price is whole paise, 0 or more.",
                    );
                }
                const before = await onCatalogue(access, organizationId, now);
                const subscription = await prisma.subscription.findUnique({
                    where: { organizationId },
                    select: { provider: true },
                });
                assertNotProviderManaged(subscription);
                const after = await access.resolve(organizationId, now, {
                    add: [
                        hypothetical(
                            organizationId,
                            {
                                kind: "price",
                                key: "price",
                                value: paise,
                                expiresAt,
                            },
                            now,
                        ),
                    ],
                    drop: (r) => r.kind === "price",
                });
                return {
                    kind: "price",
                    endsAt: expiresAt?.toISOString() ?? null,
                    changes: accessChanges(before, after, { price: true }),
                    then: null,
                    subject: before.planName,
                    days: null,
                };
            }
            case "module":
            case "remove": {
                const expiresAt = endDate(draft.expiresAt, false, t);
                const before = await onCatalogue(access, organizationId, now);
                const row = catalogueRow(before, draft.moduleKey);
                const state = before.modules.find(
                    (m) => m.moduleId === row.id,
                )?.state;
                const give = draft.kind === "module";
                if (give && state === "on") {
                    throw new ConflictException(
                        `${row.name} is already on for them.`,
                    );
                }
                if (!give) {
                    if (state !== "on") {
                        throw new ConflictException(
                            `${row.name} is already off for them.`,
                        );
                    }
                    await assertMayTakeAway(
                        access,
                        staff,
                        organizationId,
                        row,
                        now,
                    );
                }
                const kind = give ? "grant" : "remove";
                const after = await access.resolve(organizationId, now, {
                    add: [
                        hypothetical(
                            organizationId,
                            { kind, key: row.id, moduleKey: row.id, expiresAt },
                            now,
                        ),
                    ],
                    drop: (r) =>
                        (r.kind === "grant" || r.kind === "remove") &&
                        r.moduleKey === row.id,
                });
                return {
                    kind: draft.kind,
                    endsAt: expiresAt?.toISOString() ?? null,
                    changes: accessChanges(before, after, { price: false }),
                    then: null,
                    subject: row.name,
                    days: null,
                };
            }
            case "limit": {
                const key = draft.moduleKey ?? "";
                const value = draft.value;
                const at = requiredEndDate(draft.expiresAt, t);
                const days = daysUntil(t, at);
                if (days > RAISE_MAX_DAYS) {
                    throw new BadRequestException(
                        `A raised limit lasts at most ${RAISE_MAX_DAYS} days.`,
                    );
                }
                const before = await access.resolve(organizationId, now);
                const current = before.planEntitlements[key];
                if (typeof current !== "number") {
                    throw new BadRequestException(
                        `"${key}" is not a limit this business's plan sets.`,
                    );
                }
                if (
                    typeof value !== "number" ||
                    !Number.isInteger(value) ||
                    value <= current
                ) {
                    throw new BadRequestException(
                        `The plan already allows ${current}; a raised limit must be higher.`,
                    );
                }
                const expiresAt = new Date(t + days * DAY_MS);
                const after = await access.resolve(organizationId, now, {
                    add: [
                        hypothetical(
                            organizationId,
                            { kind: "raise", key, value, expiresAt },
                            now,
                        ),
                    ],
                });
                const name =
                    before.source === "catalogue"
                        ? (before.catalog.modules.find((m) => m.id === key)
                              ?.name ?? key)
                        : key;
                return {
                    kind: "limit",
                    endsAt: expiresAt.toISOString(),
                    changes: accessChanges(before, after, { price: false }),
                    then: null,
                    subject: name,
                    days,
                };
            }
            case "trial": {
                const sub = await prisma.subscription.findUnique({
                    where: { organizationId },
                    select: {
                        status: true,
                        provider: true,
                        currentPeriodEnd: true,
                    },
                });
                assertNotProviderManaged(sub);
                if (sub?.status !== "TRIALING") {
                    throw new ConflictException(
                        "A longer trial is only for a business in a trial.",
                    );
                }
                const at = requiredEndDate(draft.expiresAt, t);
                const from =
                    sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > t
                        ? sub.currentPeriodEnd.getTime()
                        : t;
                const days = daysUntil(from, at);
                if (days < 1 || days > TRIAL_MAX_DAYS) {
                    throw new BadRequestException(
                        `A trial is made longer by 1 to ${TRIAL_MAX_DAYS} days.`,
                    );
                }
                const endsAt = new Date(from + days * DAY_MS);
                return {
                    kind: "trial",
                    endsAt: endsAt.toISOString(),
                    changes: [
                        {
                            type: "trial",
                            from: sub.currentPeriodEnd?.toISOString() ?? null,
                            to: endsAt.toISOString(),
                        },
                    ],
                    then: null,
                    subject: null,
                    days,
                };
            }
        }
    })();

    if (result.changes.length === 0) {
        throw new ConflictException(NOTHING_CHANGES);
    }
    return result;
}
