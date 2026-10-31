import { renderToStaticMarkup } from "react-dom/server";

import type { SearchPageCheck } from "./check-list";
import { checkList } from "./check-list";
import { NOT_AVAILABLE } from "./claims";
import { AlsoSvg } from "./components/icons";
import {
    bigTile,
    HeroPicture,
    PRESETS,
    ProofCard,
    SAMPLE_GSTIN,
    smallKeys,
    SmallPicture,
} from "./components/parts";
import { SearchPage } from "./components/search-page";
import type { SearchPageData } from "./schema";

export { docPageChecks, GST_CHECKED_MAX_DAYS } from "./docs-checks";
export { NOT_AVAILABLE };
export type { SearchPageCheck };

/** Words that belong to one family and must not show on another family's page. */
export const FAMILY_WORDS: Record<SearchPageData["family"], string[]> = {
    Beauty: [
        "stylist",
        "salon",
        "blow-dry",
        "facial",
        "threading",
        "parlour",
        "manicure",
        "henna",
    ],
    Health: [
        "patient",
        "dentist",
        "dental",
        "doctor",
        "dr\\.",
        "root canal",
        "scaling",
    ],
    "Fitness and classes": [
        "yoga",
        "mats?",
        "prenatal",
        "vinyasa",
        "hatha",
        "asana",
    ],
    Learning: ["tuition", "syllabus", "exam"],
    "Shops and food": [
        "cakes?",
        "bake",
        "baked",
        "eggless",
        "brownies?",
        "bakery",
        "baker",
    ],
};

/** Words a shape's drawings (hero, tiles, quote, Also in Saroh) must not use. */
export const SHAPE_WORDS: Record<SearchPageData["shape"], string[]> = {
    appointments: ["batch(es)?", "class(es)?", "orders?", "cakes?", "stock"],
    classes: ["orders?", "cakes?", "stock", "deposit"],
    orders: [
        "batch(es)?",
        "class(es)?",
        "book(ing|ings)?",
        "deposit",
        "appointments?",
    ],
};

/** The ₹ a family's drawn prices sit within. */
export const PRICE_RANGE: Record<SearchPageData["family"], [number, number]> = {
    Beauty: [50, 30000],
    Health: [100, 60000],
    "Fitness and classes": [100, 60000],
    Learning: [100, 60000],
    "Shops and food": [30, 20000],
};

/** The app calls a note only some roles can read "Sensitive" (customer attention notes). */
const PRIVATE_NOTE = /\b(note private|private notes?)\b/;

const TITLE_MAX = 60;
const DESCRIPTION_MAX = 150;
const BRAND = " · Saroh";

/** A word without the punctuation around it, by index rather than an
 * end-anchored regex (CodeQL js/polynomial-redos). */
function trimToWord(w: string): string {
    const isWord = (c: string | undefined) => !!c && /\w/.test(c);
    let a = 0;
    let b = w.length;
    while (a < b && !isWord(w[a])) a++;
    while (b > a && !isWord(w[b - 1])) b--;
    return w.slice(a, b);
}

/** Every email-looking word, split on spaces first so no regex backtracks
 * over a long run of dots or dashes (CodeQL js/polynomial-redos). */
export function emailsIn(text: string): string[] {
    return text
        .split(/\s+/)
        .map(trimToWord)
        .filter((w) => /^[\w.-]+@[\w.-]+$/.test(w));
}

/** The words of rendered markup, as a reader meets them. */
export function textOf(html: string): string {
    // `[^<>]` keeps the tag match linear; &amp; goes last so "&amp;lt;"
    // reads "&lt;", not "<" (CodeQL js/polynomial-redos, js/double-escaping).
    return html
        .replace(/<[^<>]*>/g, " ")
        .replace(/&#x27;|&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

/** The page's pictures and the words inside them: what the shape words are held to. */
function drawingsText(p: SearchPageData): string {
    const big = bigTile(p);
    const T = p.scene.tiles;
    const words = [
        ...Object.values(T).flatMap((t) => [t.title, t.line, t.phoneLine]),
        p.scene.quote.text,
        p.scene.quote.caption,
    ];
    const html = renderToStaticMarkup(
        <>
            <HeroPicture scene={p.scene} />
            <ProofCard page={p} />
            {big.desk}
            {big.phone}
            {smallKeys(p).map((k) => (
                <SmallPicture key={k} k={k} p={p} />
            ))}
            {p.scene.also.map((a, i) => (
                <p key={a.title}>
                    <AlsoSvg
                        icon={a.icon ?? PRESETS[p.shape].also[i] ?? "pack"}
                    />{" "}
                    {a.title} {a.line}
                </p>
            ))}
        </>,
    );
    return `${textOf(html)} ${words.join(" ")}`;
}

const word = (w: string) => new RegExp(`(?<![\\w-])${w}(?![\\w-])`);

export function searchPageChecks(p: SearchPageData): SearchPageCheck[] {
    const page = `${textOf(renderToStaticMarkup(<SearchPage page={p} />))} ${p.title} ${p.description}`;
    const t = page.toLowerCase();
    const drawn = drawingsText(p);
    const dt = drawn.toLowerCase();
    const s = p.scene;
    const { out, add } = checkList();

    // Words from another trade.
    const leaks: string[] = [];
    for (const [fam, words] of Object.entries(FAMILY_WORDS)) {
        if (fam === p.family) continue;
        for (const w of words) {
            const m = word(w).exec(t);
            if (m) leaks.push(`"${m[0]}" belongs to ${fam}, not ${p.family}.`);
        }
    }
    add("family-words", `Only ${p.family} words`, leaks);

    const shapeLeaks = SHAPE_WORDS[p.shape].flatMap((w) => {
        const m = word(w).exec(dt);
        return m
            ? [
                  `"${m[0]}" makes no sense in the drawings of an ${p.shape} page.`,
              ]
            : [];
    });
    add(
        "shape-words",
        "The drawings fit the page's kind of business",
        shapeLeaks,
    );

    // Claims Saroh can't make.
    const claims = NOT_AVAILABLE.flatMap((re) => {
        const m = re.exec(t);
        return m ? [`Says "${m[0]}", which Saroh doesn't do.`] : [];
    });
    for (const m of t.matchAll(/autopay/g)) {
        if (
            !t
                .slice(Math.max(0, m.index - 150), m.index + 156)
                .includes("razorpay")
        ) {
            claims.push(`Autopay without "on your own Razorpay".`);
            break;
        }
    }
    add("claims", "Says only what Saroh does today", claims);

    const priv = PRIVATE_NOTE.exec(t);
    add(
        "sensitive-label",
        'Calls a note only some roles can read "sensitive", as the app does',
        priv ? [`Says "${priv[0]}"; the app's word is Sensitive.`] : [],
    );

    const holes = [...page.matchAll(/\[[^\]]*\]?/g)].map(
        (m) => `Placeholder left: ${m[0]}`,
    );
    add("placeholders", "No placeholders left", holes);

    // Sample data never real.
    const [lo, hi] = PRICE_RANGE[p.family];
    const prices = [...drawn.matchAll(/(?<!% )₹([\d,]+(?:\.\d\d)?)/g)].flatMap(
        (m) => {
            const v = Number((m[1] ?? "").replace(/,/g, ""));
            return v < lo || v > hi
                ? [`₹${m[1]} is outside ₹${lo}–₹${hi} for ${p.family}.`]
                : [];
        },
    );
    add("prices-range", "Drawn prices are realistic for the trade", prices);
    const emails = emailsIn(t).filter(
        (x) =>
            !x.endsWith("@example.com") && x !== "saroh-sample-upi-id@okaxis",
    );
    add(
        "sample-emails",
        "Sample emails are example.com",
        emails.map((e) => `${e} isn't a sample address.`),
    );
    const gstins = [...t.matchAll(/\b\d{2}[a-z]{5}\d{4}[a-z]\w{3}\b/g)]
        .map((m) => m[0])
        .filter((g) => g !== SAMPLE_GSTIN.toLowerCase());
    add(
        "sample-gstin",
        `GST numbers are the sample one (${SAMPLE_GSTIN})`,
        gstins.map((g) => `${g.toUpperCase()} isn't the sample.`),
    );
    add(
        "site-address",
        "The sample website is <name>.saroh.app",
        /^[a-z0-9-]+\.saroh\.app$/.test(s.site)
            ? []
            : [`${s.site} isn't a saroh.app address (no own domains).`],
    );

    // The bill, to the paisa.
    const b = s.bill;
    const paise = (x: number) => Math.round(x * 100);
    const taxable = b.lines.reduce((n, l) => n + paise(l.amount), 0);
    const math: string[] = [];
    if (taxable + paise(b.cgst) + paise(b.sgst) !== paise(b.total))
        math.push(`${taxable / 100} + ${b.cgst} + ${b.sgst} isn't ${b.total}.`);
    for (const half of [b.cgst, b.sgst]) {
        if (Math.abs(paise(half) - (taxable * b.rate) / 200) > 1)
            math.push(`${half} isn't ${b.rate / 2}% of ${taxable / 100}.`);
    }
    if (b.rate === 0 && (b.cgst !== 0 || b.sgst !== 0 || !b.noGst || b.gstin))
        math.push(
            "An exempt bill has no GST, a 'no GST' line, and no GST number.",
        );
    if (p.shape === "orders" && b.total !== s.orders?.list[0]?.total)
        math.push("The bill must be the selected order's.");
    add("bill-math", "The bill adds up to the paisa", math);
    const codes = b.lines
        .filter(
            (l) =>
                !/^(SAC \d{6}|HSN \d{4,8})$/.test(l.code) ||
                l.codeStatus !== "to-confirm",
        )
        .map((l) => `${l.name} needs a SAC or HSN code marked to-confirm.`);
    add(
        "bill-codes",
        "Each bill line has its SAC or HSN code, marked to confirm",
        codes,
    );

    // Words that must fit.
    const lead = p.phoneLead ?? p.lead;
    const n = lead.split(/\s+/).length;
    add(
        "phone-lead",
        "The phone's lead is 16 words or fewer",
        n > 16 ? [`It has ${n}; add or shorten phoneLead.`] : [],
    );
    add(
        "quote",
        "The quote is one of the trade's own",
        p.problems.some((x) => x.quote === s.quote.text)
            ? []
            : [`"${s.quote.text}" isn't in problems.`],
    );

    // The scene has what its shape draws.
    const fit: string[] = [];
    for (const k of [PRESETS[p.shape].big, ...smallKeys(p)])
        if (!(k in s.tiles)) fit.push(`tiles.${k} is missing.`);
    if (s.booking && s.staff?.length && !s.staff.includes(s.booking.staff))
        fit.push(`${s.booking.staff} isn't in staff.`);
    if (s.booking && s.booking.deposit !== "none" && !s.booking.depositBy)
        fit.push(
            "booking.depositBy is missing: the deposit tile shows who paid.",
        );
    if (s.pack && !(s.pack.left > 0 && s.pack.left <= s.pack.size))
        fit.push("pack.left must be between 1 and the pack's size.");
    if (s.orders && !s.orders.list[0]?.items)
        fit.push(
            "The selected order (the first) needs items, due, payLabel and detail.",
        );
    add("scene", "The sample business has everything its drawings show", fit);

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
