import { z } from "zod";

import type { ToolGroup } from "./tool-schema";

/**
 * A /for/ page's frontmatter (`content/for/<slug>.mdx`): its words at the
 * top, the sample business its drawings show under `scene`. The questions
 * are the MDX body (`## question`, then the answer).
 *
 * The schema holds what is structural (fields, list lengths, the icon
 * keys); what is about the words or the numbers (a word from another
 * trade, the bill's sum, a claim Saroh can't make) is `searchPageChecks`.
 */

const text = z.string().trim().min(1);
const tone = z.enum(["paid", "amb", "grey"]);
const pill = z.object({ tone, text });

export const SHAPES = ["appointments", "classes", "orders"] as const;
export const FAMILIES = [
    "Beauty",
    "Health",
    "Fitness and classes",
    "Learning",
    "Shops and food",
] as const;
export const CHIP_ICONS = ["cal", "ok", "bill", "person"] as const;
export const ALSO_ICONS = [
    "pack",
    "clock",
    "link",
    "shield",
    "calendar",
    "noshow",
    "list",
    "video",
    "printer",
    "truck",
    "bill",
    "person",
    "layers",
    "lock",
] as const;

const tile = z.object({ title: text, line: text, phoneLine: text });
const time = z.object({
    time: text,
    picked: z.boolean().optional(),
    taken: z.boolean().optional(),
});

const chip = z.object({
    icon: z.enum(CHIP_ICONS),
    title: text,
    sub: text.optional(),
    phoneSub: text.optional(),
    pill: text.optional(),
});

const item = z.object({
    name: text,
    short: text,
    len: text,
    price: z.number().positive(),
    /** Appointments: who does it ("with Priya or Anjali"). */
    who: text.optional(),
    /** Classes: its start time, teacher and places line ("" when not nearly full). */
    time: text.optional(),
    teacher: text.optional(),
    places: z.string().optional(),
});

const billLine = z.object({
    name: text,
    short: text.optional(),
    code: z.string(),
    codeStatus: z.string(),
    amount: z.number(),
});

const order = z.object({
    no: z.number().int(),
    name: text,
    what: text,
    how: text,
    stage: pill,
    total: z.number().positive(),
    note: text,
    items: text.optional(),
    due: text.optional(),
    payLabel: text.optional(),
    detail: text.optional(),
});

export const sceneSchema = z.object({
    business: text,
    site: text,
    day: text,
    /** Where the rest is paid, in the booking panel's foot ("salon", "clinic"). */
    place: text.optional(),
    heroAlt: text,
    hero: z.object({
        title: text,
        count: text,
        highlight: z.number().int().min(0).max(3),
        rows: z
            .array(z.object({ time: text, name: text, right: text }))
            .length(4),
    }),
    chips: z.array(chip).length(4),
    /** The phone's one proof card, when not drawn from the first chip. */
    proof: z
        .object({
            icon: z.enum(CHIP_ICONS),
            title: text,
            sub: text,
            pill: text.optional(),
        })
        .optional(),
    /** The phone carousel's labels, where a trade says it differently. */
    labels: z.record(z.string(), text).optional(),
    staff: z.array(text).optional(),
    items: z.array(item).length(3),
    booking: z
        .object({
            item: z.number().int().min(0).max(2),
            staff: z.string(),
            time: text,
            deposit: z.enum(["none", "quarter", "half", "full"]),
            /** Who paid it, on the deposit tile; not drawn when `deposit` is none. */
            depositBy: text.optional(),
            times: z.array(time).length(10),
            phoneTimes: z.array(time).length(8),
        })
        .optional(),
    timetable: z
        .object({
            item: z.number().int().min(0).max(2),
            days: z.array(text).min(1),
            dayTab: text,
        })
        .optional(),
    pack: z
        .object({
            name: text,
            size: z.number().int().positive(),
            left: z.number().int(),
            price: z.number().positive(),
        })
        .optional(),
    orders: z
        .object({ count: text, foot: text, list: z.array(order).length(5) })
        .optional(),
    stock: z
        .object({
            made: z.object({
                name: text,
                short: text,
                sizes: z
                    .array(z.object({ size: text, price: z.number() }))
                    .min(1),
            }),
            counted: z.object({
                name: text,
                short: text,
                sub: text,
                price: z.number(),
                baked: z.number().int().optional(),
                line: text.optional(),
                left: z.number().int(),
            }),
        })
        .optional(),
    today: z
        .array(z.object({ time: text, name: text, who: text, status: pill }))
        .length(3)
        .optional(),
    customer: z.object({
        name: text,
        initials: text,
        stats: z.array(text).min(1),
        tag: text,
        note: text,
        noteBy: text,
    }),
    bill: z.object({
        no: z.number().int(),
        status: pill,
        gstin: z.boolean(),
        showCodes: z.boolean(),
        rate: z.number().min(0),
        noGst: text.optional(),
        lines: z.array(billLine).min(1),
        cgst: z.number(),
        sgst: z.number(),
        total: z.number(),
        foot: text.nullable().optional(),
    }),
    tiles: z.record(z.string(), tile),
    quote: z.object({ text, caption: text }),
    also: z
        .array(
            z.object({
                title: text,
                line: text,
                icon: z.enum(ALSO_ICONS).optional(),
            }),
        )
        .length(6),
});

export const frontmatterSchema = z
    .object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        name: text,
        /** "salons", in "Pricing for salons". */
        plural: text,
        /** The trade's name in the setup's "Pick … when you start". */
        pickAs: text,
        family: z.enum(FAMILIES),
        /** The one search this page answers; no two pages share one. */
        search: text,
        /** The <title> before " · Saroh". */
        title: text,
        description: text,
        /** The sitemap date: change it with the words. */
        updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        shape: z.enum(SHAPES),
        h1: text,
        lead: text,
        phoneLead: text.optional(),
        demo: text.optional(),
        problemsTitle: text,
        problems: z
            .array(
                z.object({
                    quote: text,
                    area: text.optional(),
                    title: text.optional(),
                    body: text.optional(),
                    link: text.optional(),
                }),
            )
            .min(1),
        starter: z.object({ title: text, line: text }).optional(),
        services: z.array(z.object({ name: text, detail: text })).min(1),
        related: z
            .array(
                z.object({
                    name: text,
                    slug: z.string().regex(/^[a-z0-9-]+$/),
                }),
            )
            .min(1),
        ctaTitle: text,
        scene: sceneSchema,
    })
    .strict()
    .superRefine((fm, ctx) => {
        const need: Record<(typeof SHAPES)[number], (keyof typeof fm.scene)[]> =
            {
                appointments: ["staff", "place", "booking", "today"],
                classes: ["timetable", "pack", "today"],
                orders: ["orders", "stock"],
            };
        for (const k of need[fm.shape]) {
            if (fm.scene[k] === undefined) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["scene", k],
                    message: `an ${fm.shape} page needs scene.${k}`,
                });
            }
        }
    });

export type Frontmatter = z.infer<typeof frontmatterSchema>;
export type Scene = Frontmatter["scene"];
export type Shape = Frontmatter["shape"];
export type Family = Frontmatter["family"];
export type ChipIcon = (typeof CHIP_ICONS)[number];
export type AlsoIcon = (typeof ALSO_ICONS)[number];

export interface Question {
    question: string;
    /** The answer's paragraphs, as written. */
    answer: string[];
}

/** One page, ready to draw: its frontmatter and its questions. */
export interface SearchPageData extends Frontmatter {
    path: `/for/${string}`;
    questions: Question[];
}

/** What every row of `listSearchPages()` has, whatever its kind. */
interface EntryBase {
    slug: string;
    name: string;
    search: string;
    title: string;
    description: string;
    updated: string;
}

/** A /for/ row of `listSearchPages()`: what the site's lists, sitemap and the admin need. */
export interface ForPageEntry extends EntryBase {
    path: `/for/${string}`;
    kind: "for";
    family: Family;
    familySlug: string;
}

/** A /tools/ row of `listSearchPages()` (#1253). */
export interface ToolPageEntry extends EntryBase {
    path: `/tools/${string}`;
    kind: "tools";
    group: ToolGroup;
    /** The hub card's and the menus' line. */
    line: string;
    /** It has its own page in apps/saroh.in, not a component in this package. */
    inApp: boolean;
}

/** One row of the manifest: every page in the code, of either kind. */
export type SearchPageEntry = ForPageEntry | ToolPageEntry;
export type SearchPageKind = SearchPageEntry["kind"];
