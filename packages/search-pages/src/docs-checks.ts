import { blockWords } from "./blocks/parse";
import type { SearchPageCheck } from "./check-list";
import { checkList } from "./check-list";
import { NOT_AVAILABLE } from "./claims";
import type { DocPage } from "./docs-load";
import { todayIst } from "./kinds/base-schema";
import { DOWNLOAD_FORMATS } from "./kinds/download-schema";

/** GST rates move at GST Council meetings, a few times a year: a check older than this may be out of date. */
export const GST_CHECKED_MAX_DAYS = 180;

/** Plain words: a sentence longer than this is hard to read on a phone. */
const SENTENCE_MAX_WORDS = 30;

const DAY_MS = 86_400_000;

/** Every word the page's file holds, as a reader meets it: a field a line, so no sentence runs from one field into the next. */
function wordsOf(p: DocPage): string {
    const common = [
        p.name,
        p.line,
        p.title,
        p.description,
        p.h1,
        p.author.name,
        p.author.role,
        p.band?.title ?? "",
        p.band?.line ?? "",
        ...p.questions.flatMap((q) => [q.question, ...q.answer]),
        blockWords(p.body),
    ];
    if (p.kind === "gst")
        return [
            ...common,
            p.topic,
            p.answer.map((x) => x.text).join(""),
            ...p.facts.flatMap((f) => [f.label, f.value, f.note]),
            p.table.title,
            ...p.table.head,
            ...p.table.rows.flat(),
            ...(p.table.foot ?? []),
            p.table.note ?? "",
            ...p.mistakes.flatMap((m) => [m.title, m.body]),
            p.differsFromSaroh ?? "",
            p.hubLabel ?? "",
        ].join("\n");
    if (p.kind === "guides")
        return [...common, p.lead, p.group, p.hero?.alt ?? ""].join("\n");
    return [
        ...common,
        p.lead,
        p.group,
        ...p.benefits,
        p.preview?.alt ?? "",
        p.gate?.title ?? "",
        p.gate?.line ?? "",
    ].join("\n");
}

/**
 * A GST page's, guide's or download's "Checked before you publish": what
 * admin lists, what holds Publish back, and what saroh.in's production
 * build leaves a live page out for. Reads the page's data, so it runs
 * without drawing it (no react-dom/server). `today` is YYYY-MM-DD.
 */
export function docPageChecks(
    p: DocPage,
    { today = todayIst() }: { today?: string } = {},
): SearchPageCheck[] {
    const { out, add } = checkList();
    const words = wordsOf(p);
    const lower = words.toLowerCase();
    const sentences = (t: string) => t.split(/[.!?]\s|\n/);

    add(
        "to-confirm",
        "Every fact is confirmed",
        p.toConfirm.map((x) => `To confirm: ${x}.`),
    );
    add(
        "placeholders",
        "No placeholders left",
        [...words.matchAll(/\[[^\]]*\]?/g)].map(
            (m) => `Placeholder left: ${m[0]}`,
        ),
    );
    // A ” opening a quote or a “ closing one (31 Oct review: the salon page's H2).
    add(
        "quotes",
        "Quote marks face the right way",
        [...words.matchAll(/(?:^|[\s([])”|“(?=$|[\s.,;:!?)\]])/gm)].map(
            (m) =>
                `"${words.slice(Math.max(0, m.index - 20), m.index + 20).trim()}" has a quote mark facing the wrong way: use “ to open and ” to close.`,
        ),
    );
    add(
        "plain-words",
        `Sentences are ${SENTENCE_MAX_WORDS} words or fewer`,
        sentences(words)
            .filter((s) => s.split(/\s+/).length > SENTENCE_MAX_WORDS)
            .map((s) => `"${s.slice(0, 60)}…" is too long.`),
        "warning",
    );
    // The repo is public: Saroh's prices and plans live in the database, never in a page.
    const price = sentences(lower).flatMap((s) =>
        /\b(free|grow|pro) plan\b/.test(s) ||
        (/\bsaroh\b/.test(s) &&
            /₹|\bplans?\b|\bpric(e|es|ing)\b|\bper month\b/.test(s))
            ? [`"${s.slice(0, 60)}…" names Saroh's price or plan.`]
            : [],
    );
    add("no-price", "Names no Saroh price or plan", price);
    add(
        "claims",
        "Says only what Saroh does today",
        NOT_AVAILABLE.flatMap((re) => {
            const m = re.exec(lower);
            return m ? [`Says "${m[0]}", which Saroh doesn't do.`] : [];
        }),
    );

    if (p.kind === "gst") {
        const age = Math.floor(
            (Date.parse(today) - Date.parse(p.checkedOn)) / DAY_MS,
        );
        add(
            "checked-on",
            `The facts were checked in the last ${GST_CHECKED_MAX_DAYS} days`,
            age > GST_CHECKED_MAX_DAYS
                ? [
                      `Checked on ${p.checkedOn}, ${age} days ago: check again and change checkedOn.`,
                  ]
                : [],
        );
    }
    if (p.kind === "downloads") {
        add(
            "files",
            `Every file is in content/downloads/files/${p.slug}/`,
            p.files.flatMap((f) => [
                ...(f.bytes === null ? [`${f.name} isn't there.`] : []),
                ...(f.name.endsWith(DOWNLOAD_FORMATS[f.format])
                    ? []
                    : [
                          `${f.name} isn't a ${f.format} file (${DOWNLOAD_FORMATS[f.format]}).`,
                      ]),
            ]),
        );
    }
    return out;
}
