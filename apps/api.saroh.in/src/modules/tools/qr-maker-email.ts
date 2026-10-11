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

/** The tool on saroh.in (the canonical host). */
export const QR_MAKER_URL = "https://www.saroh.in/tools/qr-code-maker";

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
