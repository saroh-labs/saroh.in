import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { evaluate } from "@mdx-js/mdx";
import * as runtime from "react/jsx-runtime";
import { parse as parseYaml } from "yaml";

import type { HelpFrontmatter } from "@/content/help";
import { helpFrontmatter } from "@/content/help";
import { CAPTURED } from "@/content/shots.captured";
import { helpErrors } from "@/content/validate";

import type { MdxBody } from "./integration-docs";

/**
 * Reads the Help articles (`content/help/<slug>.mdx`, Resources plan U5,
 * KTD-1): each file's YAML frontmatter, checked against `helpFrontmatter`,
 * then the whole set against `helpErrors` (a step without its captured
 * screenshot, a Next link to a missing or later article, a price or a plan
 * limit). Any of it throws, naming the file, so the build fails rather than
 * publish a wrong article. Server-only: the pages are built at build time.
 */

const DIR = path.join(process.cwd(), "content", "help");
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface HelpFile {
    frontmatter: HelpFrontmatter;
    /** The MDX under the frontmatter: prose before the steps, often empty. */
    body: string;
}

/** Splits one file into its checked frontmatter and its MDX body. */
export function parseHelpFile(file: string, source: string): HelpFile {
    const match = FENCE.exec(source);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const parsed = helpFrontmatter.safeParse(parseYaml(match[1]));
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(`${file}: frontmatter is wrong\n${lines.join("\n")}`);
    }
    const name = path.basename(file, ".mdx");
    if (parsed.data.slug !== name) {
        throw new Error(`${file}: slug says ${parsed.data.slug}`);
    }
    return { frontmatter: parsed.data, body: source.slice(match[0].length) };
}

let cache: HelpFile[] | null = null;

/** Every article on disk, published or not, checked as a set. */
export function helpFiles(dir: string = DIR): HelpFile[] {
    if (dir === DIR && cache) return cache;
    const files = readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .sort()
        .map((f) =>
            parseHelpFile(
                `content/help/${f}`,
                readFileSync(path.join(dir, f), "utf8"),
            ),
        );
    const errors = helpErrors({
        articles: files.map((f) => f.frontmatter),
        captured: CAPTURED,
    });
    if (errors.length > 0) {
        throw new Error(`Help articles are wrong:\n  ${errors.join("\n  ")}`);
    }
    if (dir === DIR) cache = files;
    return files;
}

/** Every article's frontmatter, published or not. */
export function helpArticles(): HelpFrontmatter[] {
    return helpFiles().map((f) => f.frontmatter);
}

export interface HelpDoc {
    frontmatter: HelpFrontmatter;
    /** The compiled body, or null when the file has none. */
    Body: MdxBody | null;
}

/** One article with its body compiled, or null when there is no such file. */
export async function loadHelpArticle(slug: string): Promise<HelpDoc | null> {
    const file = helpFiles().find((f) => f.frontmatter.slug === slug);
    if (!file) return null;
    if (!file.body.trim()) return { frontmatter: file.frontmatter, Body: null };
    const { default: Body } = await evaluate(file.body, {
        ...runtime,
        baseUrl: import.meta.url,
    });
    return { frontmatter: file.frontmatter, Body };
}
