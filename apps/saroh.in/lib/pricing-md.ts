import type { Catalog } from "@saroh/pricing-catalog";

import { PRICING_COPY, PRICING_DESCRIPTION } from "@/content/pricing";

import type { PlanCardView } from "./pricing-model";
import { NOT_INCLUDED } from "./pricing-model";
import { pricingPageModel } from "./pricing-view";

/**
 * `/pricing.md` (#1187, R5): the pricing page as Markdown, for AI
 * assistants. Worded by `pricingPageModel`, the same model `/pricing` draws,
 * so the two say the same thing row for row: each plan's price before GST
 * (and its yearly price while the catalogue offers yearly), what it includes,
 * then the compare table. No price lives in this repo (KTD-10): with no
 * catalogue, or pricing not shown yet (DEC-136), the file lists no prices
 * and points at `/pricing`.
 */

/** A table cell: one line, with no pipe to break the row. */
const cell = (t: string) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ");

const priceLine = (p: PlanCardView) => `**${p.price}** ${p.per} (${p.sub})`;

/** The file's text, its links absolute on `base` (`SITE_URL`). */
export function pricingMarkdown(base: string, catalog: Catalog | null): string {
    const out: string[] = [
        "# Saroh pricing",
        "",
        `> ${PRICING_DESCRIPTION}`,
        "",
    ];
    if (!catalog) {
        out.push(
            `Saroh's plans and what they cost are on the pricing page: ${base}/pricing`,
        );
        return `${out.join("\n")}\n`;
    }

    const model = pricingPageModel(catalog);
    const monthly = model.views["month-excl"];
    const yearly = model.yearly ? model.views["year-excl"] : null;
    out.push(
        `${PRICING_COPY.intro} The same plans, drawn for people: ${base}/pricing`,
    );

    monthly.plans.forEach((plan, i) => {
        out.push("", `## ${plan.name}`, "");
        if (plan.tagline) out.push(plan.tagline, "");
        out.push(`- Monthly: ${priceLine(plan)}`);
        const year = yearly?.plans[i];
        if (year && plan.cta.paid) out.push(`- Yearly: ${priceLine(year)}`);
        if (plan.trial) out.push(`- ${plan.trial}`);
        out.push("");
        if (plan.lead) out.push(plan.lead, "");
        for (const line of plan.lines) out.push(`- ${line.t}`);
    });

    out.push("", "## Compare plans", "");
    out.push(`| | ${monthly.plans.map((p) => cell(p.name)).join(" | ")} |`);
    out.push(`|---|${monthly.plans.map(() => "---|").join("")}`);
    for (const row of model.rows) {
        if (row.kind === "group") {
            out.push(
                `| **${cell(row.label)}** |${monthly.plans.map(() => " |").join("")}`,
            );
            continue;
        }
        const label = row.soon ? `${row.label} (coming soon)` : row.label;
        const cells = row.cells.map((c) => cell(c.yes ? c.t : NOT_INCLUDED));
        out.push(`| ${cell(label)} | ${cells.join(" | ")} |`);
    }

    out.push("", monthly.footnote);
    if (yearly) out.push(yearly.footnote);
    return `${out.join("\n")}\n`;
}
