import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { parse as parseYaml } from "yaml";

import type {
    IntegrationFrontmatter,
    IntegrationSlug,
} from "@/content/integrations";
import { integrationFrontmatter } from "@/content/integrations";

/**
 * Reads a provider page's MDX (`content/integrations/<slug>.mdx`, KTD-1):
 * its YAML frontmatter, checked against `integrationFrontmatter` so a
 * missing or misspelt field fails the build with the file and field named,
 * and its body, compiled to a component. Server-only: the pages are built
 * at build time (`dynamicParams = false`), so nothing reads the files at
 * request time.
 */

const DIR = path.join(process.cwd(), "content", "integrations");

/** The file's text. */
export function integrationSource(slug: IntegrationSlug): string {
    return readFileSync(path.join(DIR, `${slug}.mdx`), "utf8");
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Splits a file into its checked frontmatter and its MDX body. */
export function splitIntegration(
    file: string,
    source: string,
): { frontmatter: IntegrationFrontmatter; body: string } {
    const match = FENCE.exec(source);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const parsed = integrationFrontmatter.safeParse(parseYaml(match[1]));
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(`${file}: frontmatter is wrong\n${lines.join("\n")}`);
    }
    return { frontmatter: parsed.data, body: source.slice(match[0].length) };
}

/** A compiled MDX body, as `evaluate` returns it. */
export type MdxBody = Awaited<ReturnType<typeof evaluate>>["default"];

export interface IntegrationDoc {
    frontmatter: IntegrationFrontmatter;
    Body: MdxBody;
}

/** One provider page, read and checked. Throws on a broken file. */
export async function loadIntegration(
    slug: IntegrationSlug,
): Promise<IntegrationDoc> {
    const file = `content/integrations/${slug}.mdx`;
    const { frontmatter, body } = splitIntegration(
        file,
        integrationSource(slug),
    );
    if (frontmatter.slug !== slug) {
        throw new Error(`${file}: slug says ${frontmatter.slug}`);
    }
    const { default: Body } = await evaluate(body, {
        ...runtime,
        baseUrl: import.meta.url,
    });
    return { frontmatter, Body };
}

/** Just the frontmatter, for metadata and share cards. */
export function integrationMeta(slug: IntegrationSlug): IntegrationFrontmatter {
    return splitIntegration(
        `content/integrations/${slug}.mdx`,
        integrationSource(slug),
    ).frontmatter;
}
