import type { AiLanguage } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { moneyWordsWhole } from "../../../common/words-format";
import { businessTimezone } from "../../bookings/staff-availability";
import type { ModuleKey } from "../../capabilities/module-keys";
import { MODULE_BY_KEY } from "../../capabilities/module-registry";
import type { OrgAction } from "../../organizations/organization-actions";
import { allows } from "../../organizations/organization-policy";
import {
    tradeOtherRead,
    tradeRead,
} from "../../organizations/organization-trade";
import { businessCurrency } from "../../stores/currency";

/**
 * The facts an agent is told about the business (spec §2.2), after the
 * cache breakpoint because they differ per business and per day. Business
 * facts only: no customer's name or words ever go here.
 */
export interface BusinessFacts {
    name: string;
    trade: string | null;
    currency: string | null;
    zone: string;
    now: Date;
    role: string;
    modulesOn: string[];
    /** What their role lets them ask and have drafted, from {@link askableFor}. */
    canAsk: string[];
    canDraft: string[];
    language: AiLanguage;
}

/** What a role's actions let a person ask Ask AI about, in their words; the order is the order said. */
const ASKS: readonly [OrgAction, string][] = [
    ["booking:read", "bookings and who's booked"],
    ["service:read", "free times, services and opening hours"],
    ["order:read", "orders"],
    ["store:read", "products and stock"],
    ["pack:read", "class packs held"],
    ["contact:read", "customers"],
    ["lead:read", "enquiries"],
    ["invoice:read", "unpaid bills"],
    ["payment:read", "money that came in"],
];

const DRAFTS: readonly [OrgAction, string][] = [
    ["booking:write", "booking or moving a customer"],
    ["order:create", "taking an order"],
    ["order:stage", "moving an order on"],
    ["contact:write", "adding or changing a customer"],
    ["store:write", "adding or changing a product"],
    ["service:write", "adding or changing a service or its hours"],
];

/** The asks and drafts this person's live role allows, so a refusal can offer them instead. */
export function askableFor(ctx: OrganizationContext): {
    canAsk: string[];
    canDraft: string[];
} {
    const of = (list: readonly [OrgAction, string][]) =>
        list.filter(([a]) => allows(ctx, a)).map(([, words]) => words);
    return { canAsk: of(ASKS), canDraft: of(DRAFTS) };
}

const LANGUAGE_LINE: Record<AiLanguage, string> = {
    MATCH: "match the language and script the person writes in",
    ENGLISH: "English",
    HINGLISH:
        "Hinglish (Hindi in Latin letters, mixed with English as people speak)",
    HINDI: "Hindi in Devanagari",
};

export function formatBusinessBlock(f: BusinessFacts): string {
    const today = DateTime.fromJSDate(f.now, { zone: f.zone }).toFormat(
        "cccc, d LLL yyyy",
    );
    return [
        `Business: ${JSON.stringify(f.name)}`,
        `Kind of business: ${f.trade ?? "not said"}`,
        // The example comes from the currency, so a house rule never names one edition's format.
        `Currency: ${f.currency ? `${f.currency}, written like ${moneyWordsWhole(120000, f.currency)}` : "not set yet"}`,
        `Time zone: ${f.zone}`,
        `Today: ${today}`,
        `The person asking is: ${f.role}`,
        `Modules on: ${f.modulesOn.length ? f.modulesOn.join(", ") : "none"}`,
        `Their role lets them ask about: ${f.canAsk.length ? f.canAsk.join("; ") : "nothing yet"}`,
        `Their role lets you draft: ${f.canDraft.length ? f.canDraft.join("; ") : "nothing"}`,
        `Answer in: ${LANGUAGE_LINE[f.language]}`,
    ].join("\n");
}

/** {@link BusinessFacts} read as that business, then formatted. */
export function businessBlock(
    ctx: OrganizationContext,
    language: AiLanguage,
    now: Date,
): Promise<string> {
    const id = ctx.organizationId;
    return outsideOrgContext(() =>
        runInOrgContext(id, async () => {
            const [org, currency, zone, modules] = await Promise.all([
                prisma.organization.findUniqueOrThrow({
                    where: { id },
                    select: { name: true, trade: true, tradeOther: true },
                }),
                businessCurrency(prisma, id),
                businessTimezone(prisma, id),
                prisma.organizationModule.findMany({
                    where: { organizationId: id, status: "ENABLED" },
                    select: { moduleKey: true },
                }),
            ]);
            return formatBusinessBlock({
                name: org.name,
                trade:
                    tradeOtherRead(org.trade, org.tradeOther) ??
                    tradeRead(org.trade),
                currency,
                zone,
                now,
                role: ctx.roleKey ?? ctx.role,
                modulesOn: modules.map(
                    (m) =>
                        MODULE_BY_KEY.get(m.moduleKey as ModuleKey)?.label ??
                        m.moduleKey,
                ),
                ...askableFor(ctx),
                language,
            });
        }),
    );
}
