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

import { TOOL_NAMES } from "./tool-names";

/** The free tools on saroh.in (the canonical host). */
export const TOOLS_URL = "https://www.saroh.in/tools";

/** The QR code maker on saroh.in. */
export const QR_MAKER_URL = `${TOOLS_URL}/qr-code-maker`;

/** Every email has the same subject. */
export const QR_MAKER_SUBJECT = "Your link back to the QR code maker";

/** Every email has the same words. */
export function qrMakerEmailText(): string {
    return [
        "Here's the link back to the QR code maker you used on saroh.in:",
        "",
        QR_MAKER_URL,
        "",
        "Your code was made in your browser, so we never received your link, logo or label, and they aren't in this email. Open the tool to make your code again or change it.",
        "",
        "You asked for this on saroh.in. We won't send you anything else unless you ask.",
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
export function toolEmail(slug?: string): { subject: string; text: string } {
    if (!slug || slug === "qr-code-maker") {
        return { subject: QR_MAKER_SUBJECT, text: qrMakerEmailText() };
    }
    const name = TOOL_NAMES[slug];
    if (!name) throw new Error(`no free tool "${slug}"`);
    return {
        subject: `${name}: your link back`,
        text: [
            "Here's the link back to the tool you used on saroh.in:",
            "",
            name,
            `${TOOLS_URL}/${slug}`,
            "",
            "What you typed stayed in your browser, so we never received it, and it isn't in this email. Open the tool to use it again.",
            "",
            "You asked for this on saroh.in. We won't send you anything else unless you ask.",
            "",
            "Saroh",
        ].join("\n"),
    };
}
