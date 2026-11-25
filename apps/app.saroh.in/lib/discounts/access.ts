import "server-only";

import { canOrUnknown } from "@/lib/access/require-can";
import { moduleAccess } from "@/lib/modules/guard";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import type { ServerRead } from "@/lib/query/route";

import { loadReachOptions } from "./options";
import type { DiscountAsk, DiscountView } from "./queries";
import { discountRead, discountsListRead } from "./queries";
import type { Discount } from "./service";
import { getDiscount, listDiscounts } from "./service";

/**
 * Discount codes' reads on the server (DEC-259): what `/api/discounts` and
 * `/api/discounts/[discountId]` answer with. Their
 * gate is the section's (Sell reachable, as the layout's `ModuleGate`);
 * the API checks `discount:read`, a 403 the route passes on.
 */
export async function mayReadDiscounts(): Promise<boolean> {
    const access = await moduleAccess("COMMERCE");
    return access.state === "available" || access.state === "unknown";
}

/** Only what the screens draw of a code. */
function shown(d: Discount): Discount {
    return {
        id: d.id,
        code: d.code,
        description: d.description,
        kind: d.kind,
        percent: d.percent,
        amount: d.amount,
        currency: d.currency,
        appliesTo: d.appliesTo,
        targets: d.targets.map((t) => ({ id: t.id, name: t.name })),
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        usageLimit: d.usageLimit,
        used: d.used,
        state: d.state,
    };
}

type NoAsk = Parameters<typeof discountsListRead.options>[1];

async function readList(): Promise<Discount[]> {
    return (await listDiscounts()).map(shown);
}

/**
 * One code; null (a 404): no such code in this business. The form's
 * choices are read only for `discount:write`, what the API asks of a save.
 */
async function readDiscount({
    discountId,
}: DiscountAsk): Promise<DiscountView | null> {
    const [discount, organization] = await Promise.all([
        getDiscount(discountId),
        activeOrganizationOnce(),
    ]);
    if (!discount) return null;
    const reach = canOrUnknown(organization, "discount:write")
        ? await loadReachOptions()
        : null;
    return { discount: shown(discount), reach };
}

export const discountsListServer: ServerRead<NoAsk, Discount[]> = {
    read: discountsListRead,
    service: readList,
};

export const discountServer: ServerRead<DiscountAsk, DiscountView> = {
    read: discountRead,
    service: readDiscount,
};
