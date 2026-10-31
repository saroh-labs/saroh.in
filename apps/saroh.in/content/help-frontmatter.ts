import { z } from "zod";

import { HELP_AREAS, HELP_GROUPS, HELP_PUBLISH_ON } from "./help";

/*
 * Kept out of `help.ts`, which the Help search and vote buttons import in the
 * browser: building this schema runs zod there, which is about 30 KB and
 * evaluates code from a string (blocked by the page's CSP). Only the build
 * reads frontmatter (`lib/help-docs.ts`).
 */

/* ── An article's frontmatter ───────────────────────────────────────── */

const text = z.string().trim().min(1);
const day = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "is not a day (YYYY-MM-DD)");
const slug = z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "is not a lowercase-hyphen slug");

const step = z
    .object({
        title: text,
        body: text,
        /**
         * The captured screenshot's key in `shots.captured.ts`, `help-…`
         * (`e2e/marketing-shots/shots.config.ts`). Required: a step without
         * its real screen fails the build (KTD-6).
         */
        shot: text,
        /** Under the picture; names the demo business it was taken in. */
        caption: text,
        /** Only where it's needed (design 2a). */
        tip: text.optional(),
        /**
         * The control the step names, which the picture rings in Saffron.
         * The ring's place comes from the capture (`mark` in the manifest),
         * so a step with a marker needs a shot captured with one.
         */
        marker: text.optional(),
    })
    .strict();

export const helpFrontmatter = z
    .object({
        title: text,
        slug,
        area: z.enum(HELP_AREAS),
        group: z.enum(HELP_GROUPS),
        /** The first paragraph: what this is and how long it takes. */
        intro: text,
        /** The meta and share description. */
        description: text.max(170),
        readMinutes: z.number().int().min(1).max(30),
        /** The day its words or shots last changed (R20). */
        updated: day,
        /** The day it goes live, in India (KTD-2). */
        publishOn: day.default(HELP_PUBLISH_ON),
        /** Its place in its group and area: lower first, then by title. */
        order: z.number().int().default(100),
        steps: z.array(step).min(1),
        /** Up to three articles to read next, by slug. */
        next: z.array(slug).max(3).default([]),
    })
    .strict();

export type HelpFrontmatter = z.infer<typeof helpFrontmatter>;
export type HelpStep = HelpFrontmatter["steps"][number];
