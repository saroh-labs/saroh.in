import type { PaymentWebhookProvider } from "@saroh/integrations";
import {
    PAYMENT_WEBHOOK_PROVIDERS,
    WEBHOOK_EVENTS,
    webhookPath,
} from "@saroh/integrations";

import type { HelpFrontmatter } from "./help";
import { HELP_AREAS, HELP_GROUPS, namesPriceOrLimit } from "./help";
import type { IntegrationFrontmatter } from "./integrations";
import { API_ORIGIN, PLACEHOLDER_BUSINESS_ID } from "./integrations";
import type { FaqItem, Feature, Solution } from "./types";
import { FEATURE_SLUGS, SOLUTION_SLUGS } from "./types";

/**
 * Every broken cross-link in the content model, as readable lines: a page
 * without its words, a shot key missing from the manifest, a "Works with"
 * card or "Used by" chip naming a page that does not exist. Empty means
 * sound. `content.test.ts` runs it on the real content and on broken copies,
 * so the check itself is pinned.
 */
export function contentErrors({
    features,
    solutions,
    shots,
    faqs,
}: {
    features: Partial<Record<string, Feature>>;
    solutions: Partial<Record<string, Solution>>;
    shots: Record<string, unknown>;
    faqs: Record<string, FaqItem>;
}): string[] {
    const errors: string[] = [];
    const isFeature = (s: string) => s in features;
    const isSolution = (s: string) => s in solutions;
    const hasShot = (k: string) => k in shots;

    for (const slug of FEATURE_SLUGS) {
        const f = features[slug];
        if (!f) {
            errors.push(`feature ${slug}: missing`);
            continue;
        }
        if (!f.headline.trim()) errors.push(`feature ${slug}: no headline`);
        if (!f.sub.trim()) errors.push(`feature ${slug}: no sub`);
        if (!f.steps.length) errors.push(`feature ${slug}: no steps`);
        for (const ref of [f.hero, ...f.steps]) {
            if (!hasShot(ref.shot)) {
                errors.push(
                    `feature ${slug}: shot ${ref.shot} not in shots.ts`,
                );
            }
        }
        for (const other of f.worksWith) {
            if (!isFeature(other)) {
                errors.push(`feature ${slug}: works with missing ${other}`);
            }
        }
        for (const s of f.usedBy) {
            if (!isSolution(s)) {
                errors.push(`feature ${slug}: used by missing ${s}`);
            }
        }
    }
    for (const slug of SOLUTION_SLUGS) {
        const s = solutions[slug];
        if (!s) {
            errors.push(`solution ${slug}: missing`);
            continue;
        }
        if (!s.headline.trim()) errors.push(`solution ${slug}: no headline`);
        if (!s.sub.trim()) errors.push(`solution ${slug}: no sub`);
        if (!s.segments.length) errors.push(`solution ${slug}: no segments`);
        for (const ref of [s.hero, ...s.segments]) {
            if (!hasShot(ref.shot)) {
                errors.push(
                    `solution ${slug}: shot ${ref.shot} not in shots.ts`,
                );
            }
        }
        for (const seg of s.segments) {
            if (!isFeature(seg.feature)) {
                errors.push(
                    `solution ${slug}: segment names missing ${seg.feature}`,
                );
            }
        }
        if (!(s.faq in faqs)) {
            errors.push(`solution ${slug}: question ${s.faq} not in faq.ts`);
        }
    }
    return errors;
}

/**
 * Every way an integration page can drift from the code or link wrongly
 * (Resources plan U3, audit R4), as readable lines; empty means sound.
 * `integrations.test.ts` runs it on the real pages and on broken copies.
 *
 * - each live card has a page, and each page says it is that card's;
 * - a payments page's webhook path is the API's own (`webhookPath` from
 *   `@saroh/integrations`, which `webhook-setup.ts` builds the address
 *   with), and every webhook address written anywhere in the file is it;
 * - its events are the API's `WEBHOOK_EVENTS`, and the step that lists
 *   them lists the same;
 * - no page links to itself, and no planned row carries a link.
 */
export function integrationErrors({
    live,
    planned,
    pages,
}: {
    live: readonly { slug: string; name: string }[];
    planned: readonly object[];
    pages: Partial<
        Record<string, { frontmatter: IntegrationFrontmatter; source: string }>
    >;
}): string[] {
    const errors: string[] = [];
    for (const card of live) {
        const page = pages[card.slug];
        if (!page) {
            errors.push(`integration ${card.slug}: no page`);
            continue;
        }
        const fm = page.frontmatter;
        const at = `integration ${card.slug}`;
        if (fm.slug !== card.slug) errors.push(`${at}: slug says ${fm.slug}`);
        for (const link of fm.links) {
            if (link.href === `/integrations/${card.slug}`) {
                errors.push(`${at}: links to itself`);
            }
        }
        const provider = card.slug.toUpperCase();
        if (!isPaymentWebhookProvider(provider)) continue;
        const path = webhookPath(provider, PLACEHOLDER_BUSINESS_ID);
        if (fm.webhookPath !== path) {
            errors.push(`${at}: webhook path ${fm.webhookPath} is not ${path}`);
        }
        const written = page.source.match(/\/public\/webhooks\/[^\s"'`,)]*/g);
        for (const found of written ?? []) {
            if (found !== path) {
                errors.push(`${at}: writes webhook path ${found}`);
            }
        }
        const urls = page.source.match(
            /https?:\/\/[^\s"'`,)]*\/webhooks\/[^\s"'`,)]*/g,
        );
        for (const url of urls ?? []) {
            if (url !== `${API_ORIGIN}${path}`) {
                errors.push(`${at}: writes webhook address ${url}`);
            }
        }
        const events = WEBHOOK_EVENTS[provider];
        if ((fm.events ?? []).join(",") !== events.join(",")) {
            errors.push(`${at}: events are not ${events.join(", ")}`);
        }
        for (const step of fm.steps) {
            for (const row of step.rows) {
                if (row.label !== "Tick these events") continue;
                if (row.value !== events.join(", ")) {
                    errors.push(
                        `${at}: step "${step.title}" lists other events`,
                    );
                }
            }
        }
    }
    for (const row of planned) {
        if ("href" in row) {
            errors.push(`planned ${(row as { name?: string }).name}: links`);
        }
    }
    return errors;
}

function isPaymentWebhookProvider(
    value: string,
): value is PaymentWebhookProvider {
    return (PAYMENT_WEBHOOK_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Every way a Help article can be wrong (Resources plan U5, KTD-6, R17,
 * DEC-078), as readable lines; empty means sound. `lib/help-docs.ts` throws
 * on any, so the build fails; `help.test.ts` runs it on the real articles
 * and on broken copies.
 *
 * - each step has its real screenshot: a key captured in
 *   `shots.captured.ts`, with a `mark` there if the step names a marker;
 * - an area and a group the design has;
 * - a Next link names an article that exists, isn't itself, and is
 *   published no later than this one (so it never links to a 404);
 * - no text names a price, a plan limit or a plan (`namesPriceOrLimit`);
 * - slugs are unique.
 */
export function helpErrors({
    articles,
    captured,
}: {
    articles: readonly HelpFrontmatter[];
    captured: Partial<Record<string, { src: string; mark?: object }>>;
}): string[] {
    const errors: string[] = [];
    const bySlug = new Map<string, HelpFrontmatter>();
    for (const a of articles) {
        if (bySlug.has(a.slug)) errors.push(`help ${a.slug}: two articles`);
        bySlug.set(a.slug, a);
    }
    for (const a of articles) {
        const at = `help ${a.slug}`;
        if (!(HELP_AREAS as readonly string[]).includes(a.area)) {
            errors.push(`${at}: unknown area ${a.area}`);
        }
        if (!(HELP_GROUPS as readonly string[]).includes(a.group)) {
            errors.push(`${at}: unknown group ${a.group}`);
        }
        a.steps.forEach((step, i) => {
            const shot = captured[step.shot];
            if (!shot) {
                errors.push(
                    `${at}: step ${i + 1} has no screenshot (${step.shot} is not captured)`,
                );
            } else if (step.marker && !shot.mark) {
                errors.push(
                    `${at}: step ${i + 1} marks "${step.marker}" but ${step.shot} was captured without a mark`,
                );
            }
        });
        for (const slug of a.next) {
            const target = bySlug.get(slug);
            if (slug === a.slug) errors.push(`${at}: next links to itself`);
            else if (!target) errors.push(`${at}: next ${slug} is missing`);
            else if (target.publishOn > a.publishOn) {
                errors.push(
                    `${at}: next ${slug} publishes ${target.publishOn}, after this one`,
                );
            }
        }
        const texts = [
            a.title,
            a.intro,
            a.description,
            ...a.steps.flatMap((s) => [
                s.title,
                s.body,
                s.caption,
                s.tip ?? "",
            ]),
        ];
        for (const t of texts) {
            const found = namesPriceOrLimit(t);
            if (found)
                errors.push(`${at}: names a price or limit ("${found}")`);
        }
    }
    return errors;
}
