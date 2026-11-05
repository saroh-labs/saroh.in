import { z } from "zod";

/**
 * What every GST page, guide and download file has at the top
 * (`content/<kind>/<slug>.mdx`). Each kind's schema adds its own fields and
 * is `.strict()`, so a misspelt field is an error, not a silent default.
 */

export const text = z.string().trim().min(1);
export const slug = z.string().regex(/^[a-z0-9-]+$/);

/** Today in India, where the pages are written: a date written today is never "in the future". */
export const todayIst = () =>
    new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

/** A real calendar date (no 30 February), not after today. */
export const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "a date is YYYY-MM-DD")
    .refine((s) => {
        const d = new Date(`${s}T00:00:00Z`);
        return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
    }, "isn't a real date")
    .refine((s) => s <= todayIst(), "is in the future");

/** A picture: where it is and what it shows. */
export const figure = z
    .object({ src: z.string().regex(/^(https:\/\/|\/)\S+$/), alt: text })
    .strict();

export const question = z.object({ question: text, answer: text }).strict();

export const baseFields = {
    slug,
    /** The breadcrumb's, the hub card's and the menus' name. */
    name: text,
    /** The hub card's one line. */
    line: text,
    /** The one search this page answers; no two pages of any kind share one. */
    search: text,
    /** The <title> before " · Saroh". */
    title: text,
    description: text,
    h1: text,
    /** The sitemap date and "Last updated": change it with the words. */
    updated: date,
    author: z.object({ name: text, role: text }).strict(),
    /** Pages of the same kind to show in Related first, by slug. */
    related: z.array(slug).max(3).default([]),
    questions: z.array(question).default([]),
    /** The closing band's heading and line; left out, the template's own for the kind. */
    band: z.object({ title: text, line: text }).strict().optional(),
    /** Facts still to check; a page can't go live while any is left. */
    toConfirm: z.array(text).default([]),
};
