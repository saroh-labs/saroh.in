import { z } from "zod";

import { baseFields, date, figure, text } from "./base-schema";

/**
 * A guide's frontmatter (`content/guides/<slug>.mdx`, #1205, designs
 * project/guides/*): general business know-how, never a Saroh how-to (that
 * is Help, which a guide links to). The body is the guide (`blocks/parse.ts`).
 */

/** The /guides hub's trade filters (`/guides?for=salons`). */
export const GUIDE_TRADES = [
    "salons",
    "gyms-and-studios",
    "clinics",
    "shops",
] as const;

export const guideFrontmatterSchema = z
    .object({
        ...baseFields,
        lead: text,
        published: date,
        /** Left out, it is worked out from the body's words. */
        readMinutes: z.number().int().positive().optional(),
        /** The hub section it is listed under: "Bookings and no-shows". */
        group: text,
        trades: z.array(z.enum(GUIDE_TRADES)).default([]),
        hero: figure.optional(),
    })
    .strict()
    .superRefine((fm, ctx) => {
        if (fm.published > fm.updated)
            ctx.addIssue({
                code: "custom",
                path: ["updated"],
                message: "is before published",
            });
    });

export type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;
