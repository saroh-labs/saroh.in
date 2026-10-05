import type { FixKey, LinkReport } from "./link-report";
import { RIGHT_IMAGE, scoreLine, WHATSAPP_MAX_BYTES } from "./link-report";

/**
 * The emailed copy of the fix-it report (resources plan U2, KTD-5): plain
 * text, in OUR words only.
 *
 * Anyone can type any address and any email into the tool, so whatever the
 * email quotes from the checked page is text a stranger chose, sent from
 * Saroh's address to an inbox they picked: a spam and phishing relay with
 * our name on it. So the email carries nothing the page controls — no
 * title, description, site name, picture or canonical address, no
 * suggested tags with the page's values, and not even the domain in the
 * subject. It says how many apps look right, names the fixes from our own
 * fixed list, gives the size advice, and links to the tool, where the page
 * shows the details (`?url=` opens the same check). The link's address is
 * encoded into our own URL, never a link of its own.
 */

/** Where the report lives on saroh.in (the canonical host); `?url=` opens it again. */
export const TOOL_URL = "https://www.saroh.in/tools/link-preview";

/** Every email has the same subject. */
export const REPORT_SUBJECT = "Your link preview report";

/** Each fix's name, as the email words it: fixed text, keyed by the fix. */
const FIX_TITLES: Record<FixKey, string> = {
    title: "Add a title.",
    "google-title": "Give Google a page title.",
    description: "Add a description.",
    "google-description": "Give Google a description.",
    "image-missing": "Add a picture.",
    "image-broken": "Fix your picture's address.",
    "image-small": "Use a bigger picture.",
    "image-heavy": "Make your picture lighter.",
    "x-card": "Tell X to use a large card.",
};

export function reportText(
    report: Pick<LinkReport, "right" | "fixes">,
    /** The address as stored (origin and path); the link back opens the same check. */
    checkedUrl: string,
): string {
    const again = checkedUrl.replace(/^https:\/\//, "");
    const lines: string[] = [
        "Here's the link preview report you asked for on saroh.in.",
        "",
        scoreLine(report),
        "",
    ];
    if (report.fixes.length > 0) {
        lines.push(
            report.fixes.length === 1
                ? "The one thing to fix:"
                : `The ${report.fixes.length} things to fix:`,
            "",
        );
        report.fixes.forEach((fix, i) => {
            lines.push(`${i + 1}. ${FIX_TITLES[fix.key]}`);
        });
        lines.push("");
    }
    lines.push(
        `A share picture of ${RIGHT_IMAGE.width} × ${RIGHT_IMAGE.height} pixels, under ${WHATSAPP_MAX_BYTES / 1024} KB, works on all six apps.`,
        "",
        `The whole report, with the tags to copy: ${TOOL_URL}?url=${encodeURIComponent(again)}`,
        "",
        "Close to what each app shows today. Apps change their cards from time to time, and keep old ones for a while: Facebook's and LinkedIn's own tools can refresh them.",
        "",
        "You asked for this report on saroh.in. We won't send you anything else unless you ask.",
        "",
        "Saroh",
    );
    return lines.join("\n");
}
