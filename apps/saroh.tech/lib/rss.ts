import type { ChangelogEntry } from "@/content/changelog";
import { changelogPath } from "@/content/changelog";
import { esc } from "@/lib/escape-xml";
import { site } from "@/site.config";

import { canonicalOf } from "./seo";

const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

/** RSS 2.0, newest first. */
export function changelogRss(entries: readonly ChangelogEntry[]): string {
    const items = entries.map((e) => {
        const url = canonicalOf(changelogPath(e));
        return `<item><title>${esc(e.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><pubDate>${rfc822(e.date)}</pubDate><description>${esc(e.summary)}</description><category>${e.tag}</category></item>`;
    });
    const built = entries[0]
        ? `<lastBuildDate>${rfc822(entries[0].date)}</lastBuildDate>`
        : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>What's new in ${site.name}</title><link>${canonicalOf("/changelog")}</link><description>Every change to ${site.name}, newest first.</description><language>en</language><atom:link href="${canonicalOf("/changelog/rss.xml")}" rel="self" type="application/rss+xml"/>${built}${items.join("")}</channel></rss>
`;
}
