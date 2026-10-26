import { parse as parseYaml } from "yaml";

import { SOURCES } from "./content.gen";
import type { Question, SearchPageData, SearchPageEntry } from "./schema";
import { frontmatterSchema } from "./schema";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * The questions under the frontmatter: `## question`, then the answer's
 * paragraphs. Only that: an answer is plain words, so a heading of another
 * level, a list, a quote, a link or JSX in the body is an error rather than
 * something drawn differently from the page's own questions.
 */
export function parseQuestions(file: string, body: string): Question[] {
    const questions: Question[] = [];
    let para: string[] = [];
    const flush = () => {
        if (!para.length) return;
        const q = questions.at(-1);
        if (!q)
            throw new Error(`${file}: words before the first "## question"`);
        q.answer.push(para.join(" "));
        para = [];
    };
    for (const raw of body.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        if (line.startsWith("## ")) {
            flush();
            questions.push({ question: line.slice(3).trim(), answer: [] });
            continue;
        }
        if (
            /^(#|[-*+>|<{`]|\d+\.\s|import\s|export\s)/.test(line) ||
            /[[\]<>{}*_`]/.test(line)
        ) {
            throw new Error(
                `${file}: an answer is plain words, not "${line.slice(0, 40)}"`,
            );
        }
        para.push(line);
    }
    flush();
    if (!questions.length) throw new Error(`${file}: no questions`);
    for (const q of questions) {
        if (!q.answer.length)
            throw new Error(`${file}: "${q.question}" has no answer`);
    }
    return questions;
}

/** One file's text, checked: its frontmatter against the schema, its questions. */
export function parseSearchPage(file: string, source: string): SearchPageData {
    const match = FENCE.exec(source);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const parsed = frontmatterSchema.safeParse(parseYaml(match[1] ?? ""));
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(`${file}: frontmatter is wrong\n${lines.join("\n")}`);
    }
    const name = file.replace(/^.*\//, "").replace(/\.mdx$/, "");
    if (parsed.data.slug !== name)
        throw new Error(`${file}: slug says ${parsed.data.slug}`);
    return {
        ...parsed.data,
        path: `/for/${parsed.data.slug}`,
        questions: parseQuestions(file, source.slice(match[0].length)),
    };
}

let cache: SearchPageData[] | null = null;

/** Every page in the code, parsed once; throws naming the file that's wrong. */
export function allSearchPages(): SearchPageData[] {
    if (cache) return cache;
    const pages = Object.entries(SOURCES)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, source]) =>
            parseSearchPage(`content/for/${slug}.mdx`, source),
        );
    const seen = new Map<string, string>();
    for (const p of pages) {
        const key = p.search.toLowerCase();
        const other = seen.get(key);
        if (other)
            throw new Error(
                `/for/${p.slug} and /for/${other} both answer "${p.search}"`,
            );
        seen.set(key, p.slug);
    }
    cache = pages;
    return pages;
}

export const familySlug = (family: string) =>
    family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The manifest: every page in the code, live or not (whether it's live is the API's, DEC-193). */
export function listSearchPages(): SearchPageEntry[] {
    return allSearchPages().map((p) => ({
        path: p.path,
        slug: p.slug,
        kind: "for",
        name: p.name,
        family: p.family,
        familySlug: familySlug(p.family),
        search: p.search,
        title: p.title,
        description: p.description,
        updated: p.updated,
    }));
}

/** One page, ready for `<SearchPage>`, or null when there is no such file. */
export function loadSearchPage(slug: string): SearchPageData | null {
    return allSearchPages().find((p) => p.slug === slug) ?? null;
}
