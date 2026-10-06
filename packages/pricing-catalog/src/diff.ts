import { formatInr } from "./price";
import type { Catalog } from "./schema";
import { cellOf } from "./schema";

const PRICING_WORDS = {
    show: "shown",
    soon: "coming soon",
    hidden: "hidden",
} as const;

/**
 * What changed between two catalogues, in words. This is the change log a
 * version keeps and the publish dialog shows, so the wording follows the
 * design's prototype (`saroh-catalog.js` `diff` plus the admin screen's
 * offers diff) exactly; only amounts are paise formatted as rupees.
 */
export function diff(a: Catalog, b: Catalog): string[] {
    const out: string[] = [];
    const planName = (c: Catalog, id: string) =>
        c.plans.find((p) => p.id === id)?.name ?? id;

    for (const p of b.plans) {
        const o = a.plans.find((x) => x.id === p.id);
        if (!o) {
            out.push(`New plan: ${p.name} at ${formatInr(p.pricePaise)}`);
            continue;
        }
        if (o.name !== p.name) out.push(`${o.name} renamed to ${p.name}`);
        if (o.pricePaise !== p.pricePaise) {
            out.push(
                `${p.name}: ${formatInr(o.pricePaise)} → ${formatInr(p.pricePaise)} a month`,
            );
        }
        if (!o.retired && p.retired) {
            out.push(`${p.name} retired: no new businesses can choose it`);
        }
        if (o.retired && !p.retired) out.push(`${p.name} offered again`);
        if (
            o.tagline !== p.tagline ||
            o.cta !== p.cta ||
            o.featured !== p.featured
        ) {
            out.push(`${p.name}: card wording or highlight changed`);
        }
    }
    const aIds = a.plans.map((p) => p.id).join();
    const bKept = b.plans
        .map((p) => p.id)
        .filter((id) => a.plans.some((x) => x.id === id))
        .join();
    if (aIds !== bKept) out.push("Plans reordered");

    for (const m of b.modules) {
        const o = a.modules.find((x) => x.id === m.id);
        if (!o) {
            const where =
                m.pricing === "soon"
                    ? " (coming soon)"
                    : m.pricing === "hidden"
                      ? " (not on the pricing page)"
                      : "";
            out.push(`New module: ${m.name}${where}`);
            continue;
        }
        if (o.name !== m.name) out.push(`${o.name} renamed to ${m.name}`);
        if (o.pricing !== m.pricing) {
            out.push(`${m.name}: pricing page ${PRICING_WORDS[m.pricing]}`);
        }
        if (o.group !== m.group) {
            const g = b.groups.find((x) => x.id === m.group)?.name ?? m.group;
            out.push(`${m.name} moved to ${g}`);
        }
        for (const p of b.plans) {
            const x = cellOf(o, p.id);
            const y = cellOf(m, p.id);
            if (x.inc !== y.inc) {
                out.push(
                    `${m.name}${y.inc ? " added to " : " removed from "}${planName(b, p.id)}`,
                );
            } else if (
                x.inc &&
                y.inc &&
                (x.text !== y.text || x.limit !== y.limit || x.per !== y.per)
            ) {
                out.push(
                    `${m.name} on ${planName(b, p.id)}: ${x.text || "—"} → ${y.text || "—"}`,
                );
            } else if (x.inc && y.inc && x.soft !== y.soft) {
                out.push(
                    `${m.name} on ${planName(b, p.id)}: ${y.soft ? "a soft cap, never refused" : "a hard cap"}`,
                );
            } else if (!x.inc && !y.inc && x.off !== y.off) {
                out.push(
                    `${m.name} on ${planName(b, p.id)}: ${y.off === "hidden" ? "hidden" : "shown locked"} in the dashboard`,
                );
            }
        }
    }
    for (const m of a.modules) {
        if (!b.modules.some((x) => x.id === m.id)) {
            out.push(`Module removed: ${m.name}`);
        }
    }
    const order = (c: Catalog) =>
        c.modules
            .map((m) => m.id)
            .filter(
                (id) =>
                    a.modules.some((x) => x.id === id) &&
                    b.modules.some((x) => x.id === id),
            )
            .join();
    if (order(a) !== order(b)) out.push("Rows reordered on the pricing page");

    return out.concat(offersDiff(a, b));
}

/** The Offers tab's part of the change log: yearly, GST display, trials, add-ons. */
function offersDiff(a: Catalog, b: Catalog): string[] {
    const out: string[] = [];
    const ya = a.yearly;
    const yb = b.yearly;
    if (ya.on !== yb.on) {
        out.push(
            yb.on
                ? `Yearly billing on: pay for ${yb.paid} months, get 12`
                : "Yearly billing off",
        );
    } else if (yb.on && ya.paid !== yb.paid) {
        out.push(`Yearly billing: pay for ${ya.paid} → ${yb.paid} months`);
    }
    if (a.gst.show !== b.gst.show) {
        out.push(
            `Pricing page shows prices ${b.gst.show === "incl" ? "with" : "without"} GST first`,
        );
    }
    for (const p of b.plans) {
        const o = a.plans.find((x) => x.id === p.id);
        if (!o) continue;
        const ta = o.trial ?? { on: false, days: 0 };
        const tb = p.trial ?? { on: false, days: 0 };
        if (ta.on !== tb.on) {
            out.push(
                `${p.name}: ${tb.on ? `${tb.days}-day free trial on` : "free trial off"}`,
            );
        } else if (tb.on && ta.days !== tb.days) {
            out.push(`${p.name} trial: ${ta.days} → ${tb.days} days`);
        }
    }
    for (const x of b.addons) {
        const o = a.addons.find((y) => y.id === x.id);
        if (!o) out.push(`New add-on: ${x.name}`);
        else if (JSON.stringify(o) !== JSON.stringify(x)) {
            out.push(`Add-on changed: ${x.name}`);
        }
    }
    for (const x of a.addons) {
        if (!b.addons.some((y) => y.id === x.id)) {
            out.push(`Add-on removed: ${x.name}`);
        }
    }
    return out;
}
