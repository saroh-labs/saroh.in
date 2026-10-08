import type {
    ContractVersion,
    SectionContractError,
    SectionType,
} from "@saroh/block-contract";
import { parseSectionContent, repeatedAnchor } from "@saroh/block-contract";

import type { TemplateContext, TemplateManifest } from "./manifest";
import { resolveContent } from "./manifest";

/**
 * A single section, resolved and validated, ready to persist as a `Section`.
 * `content` is the NORMALIZED output of the section contract (defaults applied).
 */
export interface InstantiatedSection {
    type: SectionType;
    contractVersion: ContractVersion;
    /** Persisted `order` — assigned from the section's position in its page. */
    order: number;
    /** Contract-normalized content (never the raw literal/builder output). */
    content: unknown;
}

/** A page, resolved and validated, ready to persist as a `Page` + `PageVersion`. */
export interface InstantiatedPage {
    path: string;
    title: string;
    isHome: boolean;
    /**
     * In the site's menu (UX-070); the menu keeps page order. Unsaid, the
     * site write puts every page but the home page there.
     */
    inMenu?: boolean;
    sections: InstantiatedSection[];
}

/**
 * The full result of instantiating a template: a plain data structure ready to
 * become Pages + PageVersions + Sections. DB-free by construction.
 */
export interface InstantiatedTemplate {
    pages: InstantiatedPage[];
}

/**
 * Thrown when a template produces a section that fails its `@saroh/block-contract`
 * contract. Carries enough locating info (page path + section index) plus the
 * underlying typed {@link SectionContractError} to make the offending manifest
 * obvious. This is the guarantee that a template can never emit an invalid page.
 */
export class TemplateInstantiationError extends Error {
    readonly templateId: string;
    readonly templateVersion: number;
    readonly pagePath: string;
    readonly sectionIndex: number;
    readonly contractError: SectionContractError;

    constructor(args: {
        templateId: string;
        templateVersion: number;
        pagePath: string;
        sectionIndex: number;
        contractError: SectionContractError;
    }) {
        super(
            `Template "${args.templateId}" v${args.templateVersion} produced an invalid ` +
                `section at ${args.pagePath}[${args.sectionIndex}] ` +
                `(${args.contractError.type} v${args.contractError.version}): ` +
                args.contractError.message,
        );
        this.name = "TemplateInstantiationError";
        this.templateId = args.templateId;
        this.templateVersion = args.templateVersion;
        this.pagePath = args.pagePath;
        this.sectionIndex = args.sectionIndex;
        this.contractError = args.contractError;
    }
}

/**
 * Resolve a template manifest against a business profile into a plain,
 * ready-to-persist structure of pages and ordered sections.
 *
 * For every section it:
 *   1. resolves the content builder/literal against `context`,
 *   2. validates + normalizes the result through
 *      `parseSectionContent(type, version, content)`, and
 *   3. stores the NORMALIZED content with an `order` from its array position.
 *
 * A page or section whose `when` says no for this context is left out
 * first (the home page always stays), and `order` counts only the sections
 * laid down.
 *
 * Throws {@link TemplateInstantiationError} on the first section that fails its
 * contract — so a caller that gets a result back is guaranteed every section is
 * contract-valid.
 */
export function instantiateTemplate(
    template: TemplateManifest,
    context: TemplateContext,
): InstantiatedTemplate {
    const laidDown = template.pages.filter(
        (page) => page.isHome === true || !page.when || page.when(context),
    );
    const pages: InstantiatedPage[] = laidDown.map((page) => {
        const included = page.sections.flatMap((section, sectionIndex) =>
            !section.when || section.when(context)
                ? [{ section, sectionIndex }]
                : [],
        );
        const sections: InstantiatedSection[] = included.map(
            ({ section, sectionIndex }, order) => {
                const resolved = resolveContent(section.content, context);
                const result = parseSectionContent(
                    section.type,
                    section.contractVersion,
                    resolved,
                );

                if (!result.success) {
                    throw new TemplateInstantiationError({
                        templateId: template.id,
                        templateVersion: template.version,
                        pagePath: page.path,
                        sectionIndex,
                        contractError: result.error,
                    });
                }

                return {
                    type: section.type,
                    contractVersion: section.contractVersion,
                    order,
                    content: result.data,
                };
            },
        );

        // An anchor is an element id on its page: a template that repeats
        // one is a mistake in the manifest, refused like an invalid section.
        const repeated = repeatedAnchor(sections);
        if (repeated) {
            const at = included[repeated.index];
            throw new TemplateInstantiationError({
                templateId: template.id,
                templateVersion: template.version,
                pagePath: page.path,
                sectionIndex: at.sectionIndex,
                contractError: {
                    code: "INVALID_CONTENT",
                    type: at.section.type,
                    version: at.section.contractVersion,
                    issues: [
                        {
                            code: "custom",
                            path: ["anchor"],
                            message: `"${repeated.anchor}" is already another section's link name on this page`,
                        },
                    ],
                    message: `"${repeated.anchor}" is already another section's link name on this page`,
                },
            });
        }

        return {
            path: page.path,
            title: page.title,
            isHome: page.isHome ?? false,
            ...(page.inMenu === undefined ? {} : { inMenu: page.inMenu }),
            sections,
        };
    });

    return { pages };
}
