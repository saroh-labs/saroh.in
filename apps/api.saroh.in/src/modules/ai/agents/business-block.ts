import type { AiLanguage } from "@saroh/database";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import { DateTime } from "luxon";

import type { OrganizationContext } from "../../../common/types/organization-context";
import { businessTimezone } from "../../bookings/staff-availability";
import type { ModuleKey } from "../../capabilities/module-keys";
import { MODULE_BY_KEY } from "../../capabilities/module-registry";
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
    language: AiLanguage;
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
        `Currency: ${f.currency ?? "not set yet"}`,
        `Time zone: ${f.zone}`,
        `Today: ${today}`,
        `The person asking is: ${f.role}`,
        `Modules on: ${f.modulesOn.length ? f.modulesOn.join(", ") : "none"}`,
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
                language,
            });
        }),
    );
}
