import { z } from "zod";

import { baseFields, date, question, slug, text } from "./base-schema";

/**
 * A GST page's frontmatter (`content/gst/<slug>.mdx`, #1204, designs
 * project/gst/*): the facts as data, so the template draws them the same on
 * every page and tests can hold the rates to Saroh's own. The body is the
 * page's sections (`blocks/parse.ts`).
 */

export const GST_TABLE_KINDS = ["invoice", "compare", "simple"] as const;

const code = z
    .object({
        kind: z.enum(["HSN", "SAC"]),
        code: z.string().regex(/^\d{4,8}$/),
        /** What it covers: "hairdressing and barbers". */
        label: text,
        /** The GST rate in %, as this page states it. */
        rate: z.number().min(0).max(28),
    })
    .strict();

export const gstFrontmatterSchema = z
    .object({
        ...baseFields,
        /** A trade's page ("GST on salon services") or a concept ("CGST, SGST and IGST"). */
        type: z.enum(["trade", "concept"]),
        /** What the page is about, for the hub and the facts: "salon and beauty services". */
        topic: text,
        /** "In short: …", the answer box; **bold** and links allowed. */
        answer: text,
        codes: z.array(code).default([]),
        /** The facts strip: four label, value and note tiles. */
        facts: z
            .array(z.object({ label: text, value: text, note: text }).strict())
            .length(4),
        table: z
            .object({
                kind: z.enum(GST_TABLE_KINDS),
                title: text,
                head: z.array(text).min(2),
                rows: z.array(z.array(z.string())).min(1),
                /** The total row of an invoice. */
                foot: z.array(z.string()).optional(),
                note: text.optional(),
            })
            .strict(),
        /** Where the facts were checked; the first one is named on "Checked on". */
        sources: z
            .array(
                z
                    .object({
                        label: text,
                        href: z.string().regex(/^https:\/\/\S+$/),
                    })
                    .strict(),
            )
            .min(1),
        checkedOn: date,
        mistakes: z
            .array(z.object({ title: text, body: text }).strict())
            .min(1),
        /** Its place on the /gst hub, 1 first (the list board's order); left out, after the ranked ones. */
        rank: z.number().int().positive().optional(),
        /** The /for/ page of the same trade, linked when it is live. */
        forPage: slug.optional(),
        /** The small label over its /gst hub card ("Photographers"): a trade page must have one, since production carries only live /for/ pages (DEC-193, 1 Nov). */
        hubLabel: text.optional(),
        /** Where this page's rate or code differs from Saroh's own data, and why. */
        differsFromSaroh: text.optional(),
        questions: z.array(question).min(1),
    })
    .strict()
    .superRefine((fm, ctx) => {
        if (fm.type === "trade" && !fm.hubLabel)
            ctx.addIssue({
                code: "custom",
                path: ["hubLabel"],
                message: "a trade page needs its hub card's small label",
            });
        const n = fm.table.head.length;
        [...fm.table.rows, ...(fm.table.foot ? [fm.table.foot] : [])].forEach(
            (r, i) => {
                if (r.length !== n)
                    ctx.addIssue({
                        code: "custom",
                        path: [
                            "table",
                            i < fm.table.rows.length ? "rows" : "foot",
                        ],
                        message: `a row has ${r.length} cells, the head ${n}`,
                    });
            },
        );
    });

export type GstFrontmatter = z.infer<typeof gstFrontmatterSchema>;

/** A GST page's name on a card or in a list: "GST on <topic>" for a trade, or a basics page's own name. */
export const gstCardName = (
    p: Pick<GstFrontmatter, "type" | "topic" | "name">,
) => (p.type === "trade" ? `GST on ${p.topic}` : p.name);
