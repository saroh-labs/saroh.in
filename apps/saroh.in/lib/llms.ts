import type { ChangelogEntry } from "@/content/changelog";
import { changelogHref, liveEntries } from "@/content/changelog";
import type { HelpFrontmatter } from "@/content/help";
import { helpHref, liveArticles } from "@/content/help";
import { integrationHref, liveIntegrations } from "@/content/integrations";
import type { PublishContext } from "@/content/resources";
import { linkShown, shownLegal, shownResources } from "@/content/resources";
import type { GalleryTemplate } from "@/content/templates";
import { galleryTemplates, templateHref } from "@/content/templates";

/**
 * `/llms.txt` (Resources plan U7, llmstxt.org): the site's name, one line
 * on what Saroh is, then the Resources and legal pages shown now, each with
 * a one-line description, Help's articles, the changelog's entries and
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
): string {
    const out: string[] = ["# Saroh", "", `> ${LLMS_SUMMARY}`];

    const resources = shownResources(ctx);
    if (resources.length > 0) {
        out.push("", "## Resources", "");
        for (const page of resources) {
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
