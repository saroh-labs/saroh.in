import type { SearchPageCheck } from "./checks";
import { emailsIn, NOT_AVAILABLE } from "./checks";
import type { ToolPageData } from "./tool-schema";
import { hasTool } from "./tools/registry";

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 150;
const BRAND = " · Saroh";

/** The sample GSTIN the tools may show (sample data never real). */
export const TOOL_SAMPLE_GSTIN = "29AAAAA0000A1ZY";
const SAMPLE_UPI = "saroh-sample-upi-id@okaxis";

/** Every word a tool page's file holds, for the sample-data checks. */
function wordsOf(p: ToolPageData): string {
    return [
        p.name,
        p.line,
        p.title,
        p.description,
        p.h1,
        p.lead,
        p.phoneLead ?? "",
        ...(p.how ?? []),
        ...(p.howPhone ?? []),
        p.ctaTitle ?? "",
        p.ctaLine ?? "",
        ...p.questions.flatMap((q) => [q.question, ...q.answer]),
    ].join(" ");
}

/**
 * A tool page's "Checked before you publish" (#1253), and what the
 * package's tests hold every tool to. Reads the file, not the drawn tool:
 * the tool's own words and sample data are its component's, and its tests
 * check them.
 */
/** Saroh sends no WhatsApp, bills reach customers only through the
 * business's own email, and the website takes no orders (SITE_SHOP off). */
const TOOL_BAND_NOT_AVAILABLE = [
    /go(es)? out on whatsapp/,
    /\bsends? (it|them) to (them|the customer|each)/,
    /takes? orders/,
    /\b(your|a|the) shop\b/,
];

export function toolChecks(p: ToolPageData): SearchPageCheck[] {
    const out: SearchPageCheck[] = [];
    const add = (
        id: string,
        title: string,
        problems: string[],
        severity: SearchPageCheck["severity"] = "error",
    ) =>
        out.push({
            id,
            ok: problems.length === 0,
            title,
            detail: problems.join(" "),
            severity,
        });

    add("intro", "It has a headline and a line under it", [
        ...(p.h1.trim() ? [] : ["The h1 is empty."]),
        ...(p.lead.trim() ? [] : ["The lead is empty."]),
    ]);
    if (!p.inApp) {
        add(
            "component",
            "The tool itself is in the code",
            hasTool(p.slug)
                ? []
                : [
                      `No component is registered for ${p.slug} (src/tools/registry.ts).`,
                  ],
        );
        add(
            "how",
            "It says how it works",
            p.how?.length ? [] : ["Add `how` lines to the file."],
        );
        add(
            "faq",
            "It answers questions",
            p.questions.length ? [] : ["Add questions under the frontmatter."],
        );
        add(
            "cta",
            "It ends with what Saroh does for real",
            p.ctaTitle && p.ctaLine ? [] : ["Add ctaTitle and ctaLine."],
        );
        add(
            "browser-only",
            "It says the work stays in the browser",
            /browser|phone/i.test(`${p.lead} ${p.phoneLead ?? ""}`)
                ? []
                : [
                      "The lead should say it works in your browser and nothing is stored.",
                  ],
            "warning",
        );
    }

    // The closing band is the one place a tool page speaks for Saroh: it
    // may say only what Saroh does today (MARKETING_CLAIMS; 26 Oct, an
    // invoice band said bills "go out on WhatsApp").
    const band = `${p.ctaTitle ?? ""} ${p.ctaLine ?? ""}`.toLowerCase();
    add(
        "claims",
        "The closing band says only what Saroh does today",
        [...NOT_AVAILABLE, ...TOOL_BAND_NOT_AVAILABLE].flatMap((re) => {
            const m = re.exec(band);
            return m ? [`Says "${m[0]}", which Saroh doesn't do.`] : [];
        }),
    );

    const words = wordsOf(p);
    const emails = emailsIn(words).filter(
        (x) => !x.endsWith("@example.com") && x !== SAMPLE_UPI,
    );
    add(
        "sample-emails",
        "Sample emails are example.com",
        emails.map((e) => `${e} isn't a sample address.`),
    );
    const gstins = [
        ...words.matchAll(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]{3}\b/g),
    ]
        .map((m) => m[0])
        .filter((g) => g !== TOOL_SAMPLE_GSTIN);
    add(
        "sample-gstin",
        `GST numbers are the sample one (${TOOL_SAMPLE_GSTIN})`,
        gstins.map((g) => `${g} isn't the sample.`),
    );

    // Search words (DEC-143), warnings: the admin may still publish.
    const title = `${p.title}${BRAND}`;
    add(
        "seo-title",
        `The title is ${TITLE_MAX} characters or fewer with " · Saroh"`,
        title.length > TITLE_MAX ? [`"${title}" is ${title.length}.`] : [],
        "warning",
    );
    const desc: string[] = [];
    if (p.description.length > DESCRIPTION_MAX)
        desc.push(`It is ${p.description.length} characters.`);
    if (
        !p.description
            .toLowerCase()
            .slice(0, p.search.length + 12)
            .includes(p.search.toLowerCase())
    )
        desc.push(`It doesn't open with "${p.search}".`);
    add(
        "seo-description",
        `The description opens with the search and is ${DESCRIPTION_MAX} characters or fewer`,
        desc,
        "warning",
    );
    return out;
}
