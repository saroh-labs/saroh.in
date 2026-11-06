/**
 * The one email the QR code maker sends (QR codes plan U9): plain text, in
 * OUR words only, with a link back to the tool.
 *
 * Anyone can type any email into the tool, so this is an email a stranger
 * can trigger (`docs/patterns/backend-integrations.md`; DEV_LEARNINGS "a
 * public tool that emails stranger-supplied text is a relay"). It carries
 * nothing a visitor chose, and it can't: the API never receives the link,
 * the logo or the label, which stay in the visitor's browser, and nothing
 * here takes an argument. So no files are attached either: the code is
 * downloaded in the page, and the email only says where the page is.
 */

import type { Edition } from "@saroh/edition";
import { editionProfile, hostsFor, siteUrlOf } from "@saroh/edition";

import { TOOL_NAMES } from "./tool-names";

/** The free tools on saroh.in (the canonical host). */
export const TOOLS_URL = "https://www.saroh.in/tools";

/** The QR code maker on saroh.in. */
export const QR_MAKER_URL = `${TOOLS_URL}/qr-code-maker`;

/**
 * The site a website's tools live on. Global's tools aren't India's, so its
 * email links to its hub (`tools`), never to a page that may not be there.
 */
const siteOf = (edition: Edition): { name: string; tools?: string } =>
    editionProfile(edition).toolPages === "hub"
        ? { name: siteName(edition), tools: `${siteUrlOf(edition)}/tools` }
        : { name: siteName(edition) };

/** "saroh.in", "saroh.tech": the site as people type it, no `www.`. */
const siteName = (edition: Edition) =>
    hostsFor(edition, "production").site.replace(/^www\./, "");

/** Every email has the same subject. */
export const QR_MAKER_SUBJECT = "Your link back to the QR code maker";

/** Every email has the same words. */
export function qrMakerEmailText(edition: Edition = "INDIA"): string {
    const { name, tools } = siteOf(edition);
    return [
        `Here's the link back to the QR code maker you used on ${name}:`,
        "",
        tools ?? QR_MAKER_URL,
        "",
        "Your code was made in your browser, so we never received your link, logo or label, and they aren't in this email. Open the tool to make your code again or change it.",
        "",
        `You asked for this on ${name}. We won't send you anything else unless you ask.`,
        "",
        "Saroh",
    ].join("\n");
}

/**
 * Every other free tool's email (#1253): the same shape, naming the tool.
 * The slug is one the DTO already held to {@link TOOL_NAMES}, and the name
 * and link come from that list, never the request, so this carries nothing
 * a visitor chose. No slug, or the QR code maker's, is the email above.
 */
export function toolEmail(
    slug?: string,
    edition: Edition = "INDIA",
): { subject: string; text: string } {
    if (!slug || slug === "qr-code-maker") {
        return { subject: QR_MAKER_SUBJECT, text: qrMakerEmailText(edition) };
    }
    const site = siteOf(edition);
    const name = TOOL_NAMES[slug];
    if (!name) throw new Error(`no free tool "${slug}"`);
    return {
        subject: `${name}: your link back`,
        text: [
            `Here's the link back to the tool you used on ${site.name}:`,
            "",
            name,
            site.tools ?? `${TOOLS_URL}/${slug}`,
            "",
            "What you typed stayed in your browser, so we never received it, and it isn't in this email. Open the tool to use it again.",
            "",
            `You asked for this on ${site.name}. We won't send you anything else unless you ask.`,
            "",
            "Saroh",
        ].join("\n"),
    };
}
