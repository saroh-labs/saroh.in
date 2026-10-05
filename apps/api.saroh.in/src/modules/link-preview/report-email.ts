import type { LinkFacts, LinkReport } from "./link-report";
import { scoreLine } from "./link-report";

/**
 * The emailed copy of the fix-it report (resources plan U2, KTD-5): plain
 * text, built only from what the API read on the page, in the page's words.
 */

/** Where the report lives on saroh.in; `?url=` opens it again. */
export const TOOL_URL = "https://www.saroh.in/tools/link-preview";

/** A page's own text, on one line and short, before it goes into an email. */
function oneLine(value: string, max = 120): string {
    const text = value.replace(/[\r\n\t]+/g, " ").trim();
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function reportSubject(facts: LinkFacts): string {
    return `Your link preview report for ${oneLine(facts.domain, 80)}`;
}

export function reportText(
    facts: LinkFacts,
    report: LinkReport,
    consent: boolean,
    /** The address as checked; the link back opens the same report. */
    checkedUrl: string,
): string {
    const again = checkedUrl.replace(/^https:\/\//, "");
    const lines: string[] = [
        `Here's how ${facts.domain} looks when someone shares it.`,
        "",
        scoreLine(report),
        "",
    ];
    if (report.fixes.length > 0) {
        lines.push(
            report.fixes.length === 1
                ? "Fix this one:"
                : `Fix these ${report.fixes.length}:`,
        );
        lines.push("");
        report.fixes.forEach((fix, i) => {
            lines.push(`${i + 1}. ${fix.title}`, `   ${fix.body}`, "");
        });
    }
    lines.push(
        "The tags to put in your page's <head>:",
        "",
        report.suggestedTags
            .split("\n")
            .map((line) => oneLine(line, 400))
            .join("\n"),
        "",
        `See it again: ${TOOL_URL}?url=${encodeURIComponent(again)}`,
        "",
        "Close to what each app shows today. Apps change their cards from time to time, and keep old ones for a while: Facebook's and LinkedIn's own tools can refresh them.",
        "",
        consent
            ? "You also asked for Saroh news, now and then. To stop it, write to hello@saroh.in."
            : "You asked for this report on saroh.in. We won't send you anything else unless you ask.",
        "",
        "Saroh",
    );
    return lines.join("\n");
}
