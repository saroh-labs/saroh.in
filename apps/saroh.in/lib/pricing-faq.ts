import type { Catalog } from "@saroh/pricing-catalog";
import {
    autopayCharges,
    chargedYearlyPaise,
    formatInr,
    GST_PERCENT,
    NO_REFUNDS_LINE,
    offeredPlans,
    PRICE_NOTICE_DAYS,
    regularYearlyPaise,
} from "@saroh/pricing-catalog";

import type { PlanOffer } from "@saroh/marketing/pricing-model";
import { pastAllowanceNotes } from "@saroh/marketing/pricing-usage";
import { withoutSwitchedOff } from "@saroh/marketing/pricing-view";

import { featuresOff } from "./feature-switches";
import { PRICING_SITE } from "./pricing-view";

export interface PricingQuestion {
    q: string;
    a: string;
}

/**
 * "Questions about paying" on /pricing (the 22 Nov boards). Every figure
 * is the catalogue's or the offers' (`GET /public/pricing`); a question
 * whose subject the catalogue doesn't have (no launch offer, no yearly)
 * is left out. The FAQ structured data reads the same list.
 */
export function pricingQuestions(
    whole: Catalog,
    offers: readonly PlanOffer[] = [],
    off: readonly string[] = featuresOff(),
): PricingQuestion[] {
    const catalog = withoutSwitchedOff(whole, off);
    const paid = offeredPlans(catalog).filter((p) => p.pricePaise > 0);
    const money = formatInr;
    const items: PricingQuestion[] = [];
    const yearOffer = paid.some((p) => p.yearlyOfferPaise !== undefined);

    const launch = paid.flatMap((p) => {
        const o = offers.find((x) => x.planId === p.id && x.discountPaise > 0);
        if (!o) return [];
        const now = money(
            p.pricePaise - Math.min(o.discountPaise, p.pricePaise),
        );
        const first =
            o.months === 1 ? "first month" : `first ${o.months} months`;
        return [
            {
                ends: o.endsAt,
                line: `${p.name} is ${now} + GST a month for your ${first}, then ${money(p.pricePaise)} + GST.`,
            },
        ];
    });
    if (launch.length) {
        const ends = launch
            .map((l) => l.ends)
            .filter((e): e is string => !!e)
            .sort()[0];
        const before =
            ends && PRICING_SITE.date
                ? ` before ${PRICING_SITE.date(ends)}`
                : "";
        items.push({
            q: "How does the launch offer work?",
            a: [
                `Start a paid plan${before} and you pay less at first.`,
                ...launch.map((l) => l.line),
                "It's taken off at checkout, with no code to enter.",
                yearOffer
                    ? "A yearly plan has its own offer price, so the launch offer doesn't come off it."
                    : "",
            ]
                .filter(Boolean)
                .join(" "),
        });
    }

    items.push({
        q: "How is GST charged?",
        a: `Use the switch above the plans to see prices before or with GST. ${GST_PERCENT}% GST is added at checkout and shown on its own line of your tax invoice.`,
    });

    if (paid.length) {
        items.push({
            q: "What happens if I go past my plan?",
            a: [
                "We let you know as you near your plan's allowance, and nothing you already have is deleted.",
                ...pastAllowanceNotes(catalog),
            ].join(" "),
        });
    }

    if (catalog.yearly.on && paid.length) {
        const years = paid.map((p) => {
            const charged = money(chargedYearlyPaise(catalog, p));
            return p.yearlyOfferPaise !== undefined
                ? `${p.name} is ${charged} + GST for the year, paid once, instead of the regular ${money(regularYearlyPaise(catalog, p))}.`
                : `${p.name} is ${charged} + GST for the year, paid once.`;
        });
        items.push({
            q: "Can I pay yearly?",
            a: `Yes, on ${paid.map((p) => p.name).join(" and ")}. ${years.join(" ")} ${NO_REFUNDS_LINE}`,
        });
    }

    if (paid.length) {
        items.push({
            q: "How does paying work?",
            a: [
                `Monthly: you approve autopay once, and it covers your next ${autopayCharges(catalog)} monthly charges. Before it runs out, we ask you to approve the next one.`,
                catalog.yearly.on
                    ? "Yearly: one payment for the year, no autopay."
                    : "",
                `If a price ever changes, we tell you at least ${PRICE_NOTICE_DAYS} days before.`,
            ]
                .filter(Boolean)
                .join(" "),
        });
        items.push({
            q: "Can I cancel or move down?",
            a: `Yes, any time, in Settings › Plan and billing. Your records stay. ${NO_REFUNDS_LINE}`,
        });
    }
    return items;
}
