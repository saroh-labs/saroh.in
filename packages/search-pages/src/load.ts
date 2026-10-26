import { parse as parseYaml } from "yaml";

import { SOURCES, TOOL_SOURCES } from "./content.gen";
import type {
    ForPageEntry,
    Question,
    SearchPageData,
    SearchPageEntry,
    SearchPageKind,
    ToolPageEntry,
} from "./schema";
import { frontmatterSchema } from "./schema";
import type { ToolPageData } from "./tool-schema";
import { toolFrontmatterSchema } from "./tool-schema";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * The questions under the frontmatter: `## question`, then the answer's
 * paragraphs. Only that: an answer is plain words, so a heading of another
 * level, a list, a quote, a link or JSX in the body is an error rather than
 * something drawn differently from the page's own questions.
 */
export function parseQuestions(
    file: string,
    body: string,
    optional = false,
): Question[] {
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
    if (!questions.length && !optional)
        throw new Error(`${file}: no questions`);
    for (const q of questions) {
        if (!q.answer.length)
            throw new Error(`${file}: "${q.question}" has no answer`);
    }
    return questions;
}

/** A file's frontmatter checked against `schema` (its slug must be the file's name), and the body under it. */
function splitFile<T extends { slug: string }>(
    file: string,
    source: string,
    schema: {
        safeParse: (v: unknown) =>
            | { success: true; data: T }
            | {
                  success: false;
                  error: {
                      issues: { path: PropertyKey[]; message: string }[];
                  };
              };
    },
): { data: T; body: string } {
    const match = FENCE.exec(source);
    if (!match) throw new Error(`${file}: no frontmatter`);
    const parsed = schema.safeParse(parseYaml(match[1] ?? ""));
    if (!parsed.success) {
        const lines = parsed.error.issues.map(
            (i) =>
                `  ${i.path.map(String).join(".") || "(root)"}: ${i.message}`,
        );
        throw new Error(`${file}: frontmatter is wrong\n${lines.join("\n")}`);
    }
    const name = file.replace(/^.*\//, "").replace(/\.mdx$/, "");
    if (parsed.data.slug !== name)
        throw new Error(`${file}: slug says ${parsed.data.slug}`);
    return { data: parsed.data, body: source.slice(match[0].length) };
}

/** One file's text, checked: its frontmatter against the schema, its questions. */
export function parseSearchPage(file: string, source: string): SearchPageData {
    const { data, body } = splitFile(file, source, frontmatterSchema);
    return {
        ...data,
        path: `/for/${data.slug}`,
        questions: parseQuestions(file, body),
    };
}

/** One tool's file, checked; an `inApp` tool may have no questions. */
export function parseToolPage(file: string, source: string): ToolPageData {
    const { data, body } = splitFile(file, source, toolFrontmatterSchema);
    return {
        ...data,
        path: `/tools/${data.slug}`,
        questions: parseQuestions(file, body, data.inApp === true),
    };
}

let cache: SearchPageData[] | null = null;
let toolCache: ToolPageData[] | null = null;

/** Every /for/ page in the code, parsed once; throws naming the file that's wrong. */
export function allSearchPages(): SearchPageData[] {
    if (cache) return cache;
    cache = Object.entries(SOURCES)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, source]) =>
            parseSearchPage(`content/for/${slug}.mdx`, source),
        );
    return cache;
}

/** Every free tool in the code (#1253), parsed once. */
export function allToolPages(): ToolPageData[] {
    if (toolCache) return toolCache;
    toolCache = Object.entries(TOOL_SOURCES)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([slug, source]) =>
            parseToolPage(`content/tools/${slug}.mdx`, source),
        );
    return toolCache;
}

export const familySlug = (family: string) =>
    family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * Pages of every kind must not share a slug (the admin's detail address is
 * `/search-pages/<slug>`) nor a search (two pages would compete for it).
 */
function checkUnique(entries: readonly SearchPageEntry[]): void {
    const slugs = new Map<string, string>();
    const searches = new Map<string, string>();
    for (const p of entries) {
        const otherSlug = slugs.get(p.slug);
        if (otherSlug)
            throw new Error(
                `${p.path} and ${otherSlug} share the slug "${p.slug}"`,
            );
        slugs.set(p.slug, p.path);
        const key = p.search.toLowerCase();
        const other = searches.get(key);
        if (other)
            throw new Error(`${p.path} and ${other} both answer "${p.search}"`);
        searches.set(key, p.path);
    }
}

function forEntries(): ForPageEntry[] {
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

function toolEntries(): ToolPageEntry[] {
    return allToolPages().map((p) => ({
        path: p.path,
        slug: p.slug,
        kind: "tools",
        name: p.name,
        group: p.group,
        line: p.line,
        inApp: p.inApp === true,
        search: p.search,
        title: p.title,
        description: p.description,
        updated: p.updated,
    }));
}

let manifest: SearchPageEntry[] | null = null;

/**
 * The manifest: every page in the code, live or not (whether it's live is
 * the API's, DEC-193), /for/ pages first, then the tools; `kind` narrows it.
 */
export function listSearchPages(opts: { kind: "for" }): ForPageEntry[];
export function listSearchPages(opts: { kind: "tools" }): ToolPageEntry[];
export function listSearchPages(opts?: {
    kind?: SearchPageKind;
}): SearchPageEntry[];
export function listSearchPages(
    opts: { kind?: SearchPageKind } = {},
): SearchPageEntry[] {
    if (!manifest) {
        manifest = [...forEntries(), ...toolEntries()];
        checkUnique(manifest);
    }
    return opts.kind ? manifest.filter((p) => p.kind === opts.kind) : manifest;
}

/** One /for/ page, ready for `<SearchPage>`, or null when there is no such file. */
export function loadSearchPage(slug: string): SearchPageData | null {
    return allSearchPages().find((p) => p.slug === slug) ?? null;
}

/** One tool page, ready for `<ToolPage>`, or null when there is no such file. */
export function loadToolPage(slug: string): ToolPageData | null {
    return allToolPages().find((p) => p.slug === slug) ?? null;
}
