import { z } from "zod";

import { untrustedText } from "./core";

/**
 * The MCP website tools (plan 2026-11-10-001, U11). Every write changes the
 * draft only and answers with `links`: a preview of the draft and the
 * editor. Text that sits on the site (page titles, section content) comes
 * back as {@link untrustedText}.
 */

const id = (what: string) =>
    z.string().min(1).max(64).describe(`The ${what} from an earlier result.`);
const siteId = id("site_id");
const pageId = id("page_id");
const sectionKey = z
    .string()
    .min(1)
    .max(64)
    .describe("The section's section_key from get_page.");
const pagePath = z
    .string()
    .max(200)
    .regex(
        /^(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/,
        "A path like /about: lowercase letters, numbers and hyphens.",
    );
const content = z
    .record(z.string(), z.unknown())
    .describe("The section's fields, as list_section_types shows them.");

/** The draft's preview (anyone with it can look) and the editor. */
export const siteLinks = z.object({
    preview_url: z.string().nullable(),
    editor_url: z.string(),
});

const pageRef = z.object({
    page_id: z.string(),
    title: untrustedText,
    path: z.string(),
    is_home: z.boolean(),
    hidden: z.boolean(),
    in_menu: z.boolean(),
    kind: z.string(),
});

export const getSiteTool = {
    input: z
        .object({
            site_id: siteId
                .optional()
                .describe("Leave out when the business has one website."),
        })
        .strict(),
    output: z.object({
        site_id: z.string(),
        name: untrustedText,
        published: z.boolean(),
        live_url: z.string().nullable(),
        editor_url: z.string(),
        publish_needs_approval: z.boolean(),
        unpublished_changes: z.object({
            sections: z.number().nullable(),
            settings: z.array(z.string()),
        }),
        pages: z.array(pageRef),
        style: z.record(z.string(), z.unknown()),
        navigation: z.array(
            z.object({ page_id: z.string(), label: untrustedText.nullable() }),
        ),
        footer: untrustedText.nullable(),
    }),
};

export const listTemplatesTool = {
    input: z
        .object({
            cursor: z.string().max(200).optional(),
        })
        .strict(),
    output: z.object({
        templates: z.array(
            z.object({
                template_id: z.string(),
                name: z.string(),
                description: z.string().nullable(),
                for_kinds: z.array(z.string()),
                pages: z.array(z.string()),
                colourway_ids: z.array(z.string()),
                /** For this business first: its trade's, or its kind's (DEC-216). */
                suggested: z.boolean(),
                /** Why it sits where it does; null for a plain suggestion. */
                why: z.string().nullable(),
                /** Opens it in Saroh on this business, previewing the business's own site in it; null while templates aren't chosen. */
                preview_url: z.string().nullable(),
                /** Its card picture; null for a template without one. */
                picture_url: z.string().nullable(),
            }),
        ),
        next_cursor: z.string().nullable(),
        /** The business's trade (DEC-216); null when never said. */
        trade: z.string().nullable(),
        /** The trade typed beside Other ("Bakery"); null unless trade is other. */
        trade_other: z.string().nullable(),
        /** False while templates aren't chosen yet: a new site starts from the default. */
        template_choice: z.boolean(),
    }),
};

export const listSectionTypesTool = {
    input: z
        .object({
            type: z
                .string()
                .max(40)
                .optional()
                .describe(
                    "One section type, to get its full field schema and an example.",
                ),
        })
        .strict(),
    output: z.object({
        types: z.array(
            z.object({
                type: z.string(),
                label: z.string(),
                description: z.string(),
                variants: z.array(z.string()),
            }),
        ),
        schema: z.record(z.string(), z.unknown()).nullable(),
        example: z.record(z.string(), z.unknown()).nullable(),
    }),
};

const sectionView = z.object({
    section_key: z.string(),
    type: z.string(),
    hidden: z.boolean(),
    /** The fields as JSON text; null when cut for size. */
    content: untrustedText.nullable(),
});

export const getPageTool = {
    input: z
        .object({
            site_id: siteId,
            page_id: pageId,
            section_key: sectionKey
                .optional()
                .describe("Only this section, in full."),
        })
        .strict(),
    output: z.object({
        page_id: z.string(),
        title: untrustedText,
        path: z.string(),
        sections: z.array(sectionView),
        cut_for_size: z.boolean(),
    }),
};

export const createSiteFromTemplateTool = {
    input: z
        .object({
            name: z.string().trim().min(1).max(120),
            template_id: z
                .string()
                .max(120)
                .optional()
                .describe(
                    "From list_templates; the business's default when left out, or while templates aren't chosen yet.",
                ),
            colourway_id: z.string().max(60).optional(),
            subdomain: z
                .string()
                .max(63)
                .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
                .optional()
                .describe(
                    "The web address's first part; the business's own when left out.",
                ),
        })
        .strict(),
    output: z.object({ job_id: z.string() }),
};

/** What every page or section write answers with. */
const pageWrite = z.object({
    site_id: z.string(),
    page_id: z.string(),
    changed: z.array(z.string()),
    links: siteLinks,
});

export const addPageTool = {
    input: z
        .object({
            site_id: siteId,
            title: z.string().trim().min(1).max(200),
            path: pagePath,
            in_menu: z.boolean().optional(),
        })
        .strict(),
    output: pageWrite,
};

export const updatePageTool = {
    input: z
        .object({
            site_id: siteId,
            page_id: pageId,
            title: z.string().trim().min(1).max(200).optional(),
            path: pagePath.optional(),
            hidden: z.boolean().optional(),
            in_menu: z.boolean().optional(),
        })
        .strict(),
    output: pageWrite,
};

const position = z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("0 is the top of the page; left out, the bottom.");

export const sectionOp = z.discriminatedUnion("op", [
    z
        .object({
            op: z.literal("add"),
            type: z.string().max(40),
            content,
            position: position.optional(),
        })
        .strict(),
    z
        .object({
            op: z.literal("update"),
            section_key: sectionKey,
            content: content
                .optional()
                .describe(
                    "Only the fields to change; the rest keep their value.",
                ),
            hidden: z.boolean().optional(),
        })
        .strict(),
    z
        .object({
            op: z.literal("move"),
            section_key: sectionKey,
            position,
        })
        .strict(),
]);

export const editPageTool = {
    input: z
        .object({
            site_id: siteId,
            page_id: pageId,
            ops: z.array(sectionOp).min(1).max(20),
        })
        .strict(),
    output: pageWrite,
};

export const removeSectionTool = {
    input: z
        .object({ site_id: siteId, page_id: pageId, section_key: sectionKey })
        .strict(),
    output: pageWrite,
};

export const deletePageTool = {
    input: z.object({ site_id: siteId, page_id: pageId }).strict(),
    output: z.object({
        site_id: z.string(),
        changed: z.array(z.string()),
        links: siteLinks,
    }),
};

export const updateSiteSettingsTool = {
    input: z
        .object({
            site_id: siteId,
            style: z
                .record(z.string(), z.unknown())
                .optional()
                .describe(
                    "Style fields to change, as get_site shows them; colours and scalars merge.",
                ),
            navigation: z
                .array(
                    z
                        .object({
                            page_id: pageId,
                            label: z.string().max(60).optional(),
                        })
                        .strict(),
                )
                .max(12)
                .optional()
                .describe("The whole menu, in order; [] clears it."),
            footer: z
                .object({
                    text: z
                        .string()
                        .max(10_000)
                        .describe("Markdown; empty removes the footer."),
                    layout: z.enum(["centre", "left"]).optional(),
                })
                .strict()
                .optional(),
        })
        .strict(),
    output: z.object({
        site_id: z.string(),
        changed: z.array(z.string()),
        links: siteLinks,
    }),
};

export const uploadImageTool = {
    input: z
        .object({
            url: z
                .string()
                .max(400)
                .describe(
                    "A public https address of a JPG, PNG, WebP, GIF or AVIF.",
                ),
            name: z.string().trim().min(1).max(120).optional(),
        })
        .strict(),
    output: z.object({
        media_id: z.string(),
        image_url: z.string().nullable(),
        bytes: z.number(),
    }),
};

const publishChanged = z
    .array(z.string())
    .describe(
        'What goes live: section changes, site settings changed, or "first publish: the whole site".',
    );

const publishWill = z.enum(["go_live", "go_to_reviewers"]);

export const previewPublishTool = {
    input: z.object({ site_id: siteId }).strict(),
    output: z.object({
        site_id: z.string(),
        will: publishWill,
        changed: publishChanged,
        preview_url: z.string().nullable(),
        editor_url: z.string(),
        request_id: z
            .string()
            .describe(
                "This publish request, for get_publish_request. It publishes nothing by itself.",
            ),
        confirm_url: z
            .string()
            .describe(
                "Where the person publishes, in Saroh. Show it to them; only they can publish.",
            ),
        expires_at: z.string(),
    }),
};

export const getPublishRequestTool = {
    input: z
        .object({
            site_id: siteId,
            request_id: z
                .string()
                .min(1)
                .max(64)
                .describe("The request_id from preview_publish."),
        })
        .strict(),
    output: z.object({
        site_id: z.string(),
        status: z.enum([
            "waiting",
            "published",
            "sent_for_approval",
            "declined",
            "expired",
        ]),
        will: publishWill,
        confirm_url: z.string().nullable(),
        live_url: z.string().nullable(),
        expires_at: z.string(),
        answered_at: z.string().nullable(),
    }),
};

export const restoreSiteDraftTool = {
    input: z
        .object({
            site_id: siteId,
            confirm_outside_changes: z
                .boolean()
                .optional()
                .describe(
                    "Set true only after the person agreed to lose changes made outside this conversation.",
                ),
        })
        .strict(),
    output: z.object({
        site_id: z.string(),
        restored_to: z.string(),
        changed: z.array(z.string()),
        links: siteLinks,
    }),
};
