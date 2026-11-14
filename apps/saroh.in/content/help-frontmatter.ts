import { z } from "zod";

import type { ReleaseSwitch } from "@saroh/marketing/feature-switches";
import { RELEASE_SWITCHES } from "@saroh/marketing/feature-switches";

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

/**
 * A drawn panel: another company's screen (Claude's connector form, a chat
 * in ChatGPT) that Saroh can't capture, drawn plainly in HTML by
 * `@saroh/marketing/drawn-panel` (plan 2026-11-13-002, U9). Its words are
 * readable text, never an image; its caption says it is a drawing.
 */
const panelField = z
    .object({ label: text, value: text, mono: z.boolean().default(false) })
    .strict();
const panel = z.discriminatedUnion("kind", [
    z
        .object({
            kind: z.literal("form"),
            /** Whose screen: "Claude". */
            app: text,
            /** The address bar's words. */
            address: text,
            title: text,
            fields: z.array(panelField).min(1),
            /** A ticked box under the fields ("I trust this app"). */
            check: text.optional(),
            button: text,
        })
        .strict(),
    z
        .object({
            kind: z.literal("chat"),
            app: text,
            address: text,
            ask: text,
            /** What the reply lists, as label and line. */
            rows: z
                .array(z.object({ label: text, value: text }).strict())
                .default([]),
            reply: text,
        })
        .strict(),
]);
export type HelpPanel = z.infer<typeof panel>;

/** One app's card on a step that lists apps instead of a picture. */
const appCard = z
    .object({
        /** Its anchor on the page (`#n8n`): Integrations links to it. */
        id: slug,
        name: text,
        how: text,
        /** A line to paste (`mcp.json`, a terminal command). */
        code: text.optional(),
        /** Who can add it: which accounts, who must allow it. */
        who: text.optional(),
    })
    .strict();

const step = z
    .object({
        title: text,
        body: text,
        /**
         * The captured screenshot's key in `shots.captured.ts`, `help-…`
         * (`e2e/marketing-shots/shots.config.ts`), for a Saroh screen. A
         * step has exactly one picture: `shot`, a drawn `panel` for another
         * company's screen, or `apps` cards in place of a picture.
         */
        shot: text.optional(),
        panel: panel.optional(),
        apps: z.array(appCard).min(1).optional(),
        /** Under the picture; names the demo business it was taken in. */
        caption: text.optional(),
        /** Only where it's needed (design 2a). */
        tip: text.optional(),
        /**
         * The control the step names, which the picture rings in Saffron.
         * The ring's place comes from the capture (`mark` in the manifest),
         * so a step with a marker needs a shot captured with one.
         */
        marker: text.optional(),
        /** Another anchor for the step (`#coding-tools`), beside `step-<n>`. */
        anchor: slug.optional(),
    })
    .strict()
    .superRefine((s, ctx) => {
        const pictures = [s.shot, s.panel, s.apps].filter(
            (p) => p !== undefined,
        ).length;
        if (pictures !== 1) {
            ctx.addIssue({
                code: "custom",
                message: "needs exactly one of shot, panel or apps",
            });
        }
        if (s.apps === undefined && s.caption === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["caption"],
                message: "a picture needs its caption",
            });
        }
        if (s.marker !== undefined && s.shot === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["marker"],
                message: "only a captured shot is ringed",
            });
        }
    });

/** One line of "If it doesn't work": what went wrong, and what to do. */
const trouble = z.object({ title: text, body: text }).strict();

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
        /** "If it doesn't work", under the steps; none by default. */
        troubles: z.array(trouble).default([]),
        /**
         * The release switch it waits for (`NEXT_PUBLIC_<FEATURE>`): off,
         * it is a 404 and linked nowhere, whatever its `publishOn`.
         */
        feature: z
            .enum(Object.keys(RELEASE_SWITCHES) as [ReleaseSwitch])
            .optional(),
    })
    .strict();

export type HelpFrontmatter = z.infer<typeof helpFrontmatter>;
export type HelpStep = HelpFrontmatter["steps"][number];
export type HelpTrouble = HelpFrontmatter["troubles"][number];
export type HelpAppCard = NonNullable<HelpStep["apps"]>[number];
