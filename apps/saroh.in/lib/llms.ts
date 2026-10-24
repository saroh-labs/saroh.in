import { ABOUT } from "@/content/about";
import type { ChangelogEntry } from "@/content/changelog";
import { changelogHref, liveEntries } from "@/content/changelog";
import { CONTACT_PAGE } from "@/content/contact-page";
import { featureHref, featureList } from "@/content/features";
import type { HelpFrontmatter } from "@/content/help";
import { helpHref, liveArticles } from "@/content/help";
import { integrationHref, liveIntegrations } from "@/content/integrations";
import { PRICING_DESCRIPTION } from "@/content/pricing";
import type { PublishContext } from "@/content/resources";
import {
    linkShown,
    routeExists,
    shownLegal,
    shownResources,
    shownTools,
} from "@/content/resources";
import { solutionHref, solutionList } from "@/content/solutions";
import type { GalleryTemplate } from "@/content/templates";
import { galleryTemplates, templateHref } from "@/content/templates";
import type { LaunchMode } from "@/lib/links";
import { LAUNCH_MODE } from "@/lib/links";

/**
 * `/llms.txt` (Resources plan U7, llmstxt.org): the site's name, one line
 * on what Saroh is, About and Contact (DEC-137), Pricing and `/pricing.md`
 * once the launch switch is open (#1187; no price in this file), the feature pages and the
 * solution pages (each with the one sentence it gives a search engine), then the Resources and
 * legal pages shown now, each with a one-line description, Help's articles, the changelog's entries and
 * the gallery's templates under their page. It follows the same publish rule as the nav, the footer
 * and the sitemap (KTD-2): an unpublished page, or one whose route this
 * build lacks, is never listed, so the file never points at a 404.
 */

/** What Saroh is, in the file's quote line. */
export const LLMS_SUMMARY =
    "Saroh is the one place a small business in India sells, takes bookings, invoices and runs its website.";

/** The Help articles' fields the file names. */
export type LlmsArticle = Pick<
    HelpFrontmatter,
    "slug" | "title" | "description" | "area" | "group" | "order" | "publishOn"
>;

const line = (base: string, path: string, name: string, about: string) =>
    `- [${name}](${base}${path}): ${about}`;

/** The file's text at `ctx`, its links absolute on `base` (`SITE_URL`). */
export function llmsText(
    base: string,
    ctx: PublishContext,
    articles: readonly LlmsArticle[],
    entries: readonly ChangelogEntry[] = liveEntries(ctx),
    templates: readonly Pick<
        GalleryTemplate,
        "slug" | "name" | "description"
    >[] = galleryTemplates(),
    mode: LaunchMode = LAUNCH_MODE,
): string {
    const out: string[] = ["# Saroh", "", `> ${LLMS_SUMMARY}`];

    // Who makes Saroh and how to write to it (DEC-137): no publish date,
    // so only the build's routes decide.
    const company = [ABOUT, CONTACT_PAGE].filter((page) =>
        routeExists(page.href, ctx.routes),
    );
    if (company.length > 0) {
        out.push("", "## Saroh", "");
        for (const page of company) {
            out.push(line(base, page.href, page.name, page.line));
        }
    }

    // Pricing is published only once the launch switch is open (DEC-136):
    // before that /pricing redirects to the waitlist.
    if (mode === "open") {
        out.push(
            "",
            "## Pricing",
            "",
            line(base, "/pricing", "Pricing", PRICING_DESCRIPTION),
            line(
                base,
                "/pricing.md",
                "Pricing in Markdown",
                "Each plan's price before GST, its limits and what it includes, as plain text.",
            ),
        );
    }

    // What Saroh does and who it is for: every feature and solution page,
    // with the sentence it gives a search engine (`SearchWords`).
    const featurePages = featureList.filter((f) =>
        routeExists(featureHref(f.slug), ctx.routes),
    );
    if (featurePages.length > 0) {
        out.push("", "## Features", "");
        for (const f of featurePages) {
            out.push(line(base, featureHref(f.slug), f.name, f.seoDescription));
        }
    }
    const solutionPages = solutionList.filter((s) =>
        routeExists(solutionHref(s.slug), ctx.routes),
    );
    if (solutionPages.length > 0) {
        out.push("", "## Solutions", "");
        for (const s of solutionPages) {
            out.push(
                line(base, solutionHref(s.slug), s.longName, s.seoDescription),
            );
        }
    }

    const resources = shownResources(ctx);
    if (resources.length > 0) {
        out.push("", "## Resources", "");
        for (const page of resources) {
            out.push(line(base, page.href, page.name, page.line));
        }
    }

    const tools = shownTools(ctx);
    if (tools.length > 0) {
        out.push("", "## Tools", "");
        for (const page of tools) {
            out.push(line(base, page.href, page.name, page.line));
        }
    }

    const helpShown = resources.some((p) => p.id === "help");
    const help = helpShown
        ? liveArticles(articles, ctx).filter((a) =>
              linkShown(helpHref(a.slug), ctx),
          )
        : [];
    if (help.length > 0) {
        out.push("", "## Help articles", "");
        for (const a of help) {
            out.push(line(base, helpHref(a.slug), a.title, a.description));
        }
    }

    const integrations = resources.some((p) => p.id === "integrations")
        ? liveIntegrations.filter((i) =>
              linkShown(integrationHref(i.slug), ctx),
          )
        : [];
    if (integrations.length > 0) {
        out.push("", "## Integrations", "");
        for (const i of integrations) {
            out.push(line(base, integrationHref(i.slug), i.name, i.line));
        }
    }

    const changelog = resources.some((p) => p.id === "changelog")
        ? entries.filter((e) => linkShown(changelogHref(e.slug), ctx))
        : [];
    if (changelog.length > 0) {
        out.push("", "## Changelog", "");
        for (const e of changelog) {
            out.push(line(base, changelogHref(e.slug), e.title, e.description));
        }
    }

    const gallery = resources.some((p) => p.id === "templates")
        ? templates.filter((t) => linkShown(templateHref(t.slug), ctx))
        : [];
    if (gallery.length > 0) {
        out.push("", "## Templates", "");
        for (const t of gallery) {
            out.push(line(base, templateHref(t.slug), t.name, t.description));
        }
    }

    const legal = shownLegal(ctx);
    if (legal.length > 0) {
        out.push("", "## Legal", "");
        for (const page of legal) {
            out.push(line(base, page.href, page.name, page.line));
        }
    }

    return `${out.join("\n")}\n`;
}
