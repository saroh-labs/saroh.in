import { z } from "zod";

/**
 * A free tool's frontmatter (`content/tools/<slug>.mdx`, #1253): the words
 * around the tool. The tool itself is a client component in
 * `src/tools/<slug>/`, registered in `src/tools/registry.ts`; the MDX body
 * is its questions, as on a /for/ page (`## question`, then the answer).
 *
 * The two tools that were on saroh.in before publish control
 * (`/tools/link-preview`, `/tools/qr-code-maker`) keep their own pages in
 * the app: `inApp: true`, no component here, and only the words the
 * admin's Overview and Words view read (`how`, the closing band and the
 * questions may be left out).
 */

const text = z.string().trim().min(1);

/** The /tools hub's sections, in its order (design Hub.dc.html). */
export const TOOL_GROUPS = [
    "Billing and GST",
    "Money",
    "QR codes",
    "Print and share",
    "WhatsApp and policies",
] as const;

export const toolFrontmatterSchema = z
    .object({
        slug: z.string().regex(/^[a-z0-9-]+$/),
        /** The breadcrumb's, the hub's and the menus' name. */
        name: text,
        /** The hub section it is listed under. */
        group: z.enum(TOOL_GROUPS),
        /** The hub card's and the menus' one line. */
        line: text,
        /** The one search this page answers; no two pages share one (with /for/ too). */
        search: text,
        /** The <title> before " · Saroh". */
        title: text,
        description: text,
        /** The sitemap date: change it with the words. */
        updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        h1: text,
        lead: text,
        /** The phone's lead, when the desk's is too long for it. */
        phoneLead: text.optional(),
        /** "How it works out" on a calculator; a maker may say "How it works". */
        howTitle: text.default("How it works out"),
        /** The working, a line each: formulas in monospace, or `howSteps` as a numbered list. */
        how: z.array(text).min(1).optional(),
        /** The phone's lines, when the desk's are too wide for 390px. */
        howPhone: z.array(text).min(1).optional(),
        /** Draw `how` as numbered steps in the body font rather than as formulas. */
        howSteps: z.boolean().optional(),
        /** The closing band: what Saroh does for real, and the module that does it. */
        ctaTitle: text.optional(),
        ctaLine: text.optional(),
        /** The tool has its own page in apps/saroh.in, not a component here. */
        inApp: z.boolean().optional(),
    })
    .strict();

export type ToolFrontmatter = z.infer<typeof toolFrontmatterSchema>;
export type ToolGroup = (typeof TOOL_GROUPS)[number];

/** One tool page, ready to draw: its frontmatter and its questions (none on an `inApp` tool without any). */
export interface ToolPageData extends ToolFrontmatter {
    path: `/tools/${string}`;
    /** As a /for/ page's `Question` (not imported: schema.ts imports this file). */
    questions: { question: string; answer: string[] }[];
}
