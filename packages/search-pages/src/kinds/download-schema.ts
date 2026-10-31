import { z } from "zod";

import { baseFields, figure, text } from "./base-schema";

/**
 * A download's frontmatter (`content/downloads/<slug>.mdx`, #1206, designs
 * project/downloads/*). Its files sit beside it in
 * `content/downloads/files/<slug>/`; each file's size is read from the file
 * itself when the words are embedded, never written by hand.
 */

/** Each format and the file ending it must have. */
export const DOWNLOAD_FORMATS = {
    Excel: ".xlsx",
    Word: ".docx",
    PDF: ".pdf",
    CSV: ".csv",
} as const satisfies Record<string, string>;
const FORMATS = [
    "Excel",
    "Word",
    "PDF",
    "CSV",
] as const satisfies readonly (keyof typeof DOWNLOAD_FORMATS)[];

export const downloadFrontmatterSchema = z
    .object({
        ...baseFields,
        lead: text,
        /** The hub section it is listed under: "Bills and invoices". */
        group: text,
        /** The ticks under the lead: "Excel with the tax worked out for you". */
        benefits: z.array(text).min(1).max(4),
        files: z
            .array(
                z
                    .object({
                        name: z.string().regex(/^[a-z0-9-]+\.[a-z]+$/),
                        format: z.enum(FORMATS),
                    })
                    .strict(),
            )
            .min(1),
        preview: figure.optional(),
        /** The gate's heading and line, where the page says it differently. */
        gate: z.object({ title: text, line: text }).strict().optional(),
    })
    .strict();

export type DownloadFrontmatter = z.infer<typeof downloadFrontmatterSchema>;
