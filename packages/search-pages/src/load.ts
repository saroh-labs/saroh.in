import { splitFile } from "./frontmatter";
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
import { checkUnique } from "./unique";

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

export const familySlug = (family: string) =>
    family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The /for/ pages' and tools' files, by slug: the full copy (`./embedded`) or a site's live-only one. */
export interface SearchPageSources {
    sources: Readonly<Record<string, string>>;
    toolSources: Readonly<Record<string, string>>;
}

export interface SearchPagesLoader {
    /** Every /for/ page in `sources`, parsed once; throws naming the file that's wrong. */
    allSearchPages: () => SearchPageData[];
    /** Every free tool in `toolSources` (#1253), parsed once. */
    allToolPages: () => ToolPageData[];
    /**
     * The manifest: every page the loader has, live or not (whether it's
     * live is the API's, DEC-193), /for/ pages first, then the tools;
     * `kind` narrows it.
     */
    listSearchPages: {
        (opts: { kind: "for" }): ForPageEntry[];
        (opts: { kind: "tools" }): ToolPageEntry[];
        (opts?: { kind?: SearchPageKind }): SearchPageEntry[];
    };
    /** One /for/ page, ready for `<SearchPage>`, or null when there is no such file. */
    loadSearchPage: (slug: string) => SearchPageData | null;
    /** One tool page, ready for `<ToolPage>`, or null when there is no such file. */
    loadToolPage: (slug: string) => ToolPageData | null;
}

/**
 * A loader over the given words, as `createDocsLoader` is for the GST
 * pages, guides and downloads: the package's root carries none, so a site
 * that builds from its own live-only copy ships no draft's words.
 */
export function createSearchPagesLoader({
    sources,
    toolSources,
}: SearchPageSources): SearchPagesLoader {
    let cache: SearchPageData[] | null = null;
    let toolCache: ToolPageData[] | null = null;
    let manifest: SearchPageEntry[] | null = null;

    function allSearchPages(): SearchPageData[] {
        if (cache) return cache;
        cache = Object.entries(sources)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slug, source]) =>
                parseSearchPage(`content/for/${slug}.mdx`, source),
            );
        return cache;
    }

    function allToolPages(): ToolPageData[] {
        if (toolCache) return toolCache;
        toolCache = Object.entries(toolSources)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slug, source]) =>
                parseToolPage(`content/tools/${slug}.mdx`, source),
            );
        return toolCache;
    }

    const forEntries = (): ForPageEntry[] =>
        allSearchPages().map((p) => ({
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

    const toolEntries = (): ToolPageEntry[] =>
        allToolPages().map((p) => ({
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

    function listSearchPages(
        opts: { kind?: SearchPageKind } = {},
    ): SearchPageEntry[] {
        if (!manifest) {
            manifest = [...forEntries(), ...toolEntries()];
            checkUnique(manifest);
        }
        return opts.kind
            ? manifest.filter((p) => p.kind === opts.kind)
            : manifest;
    }

    return {
        allSearchPages,
        allToolPages,
        listSearchPages:
            listSearchPages as SearchPagesLoader["listSearchPages"],
        loadSearchPage: (slug) =>
            allSearchPages().find((p) => p.slug === slug) ?? null,
        loadToolPage: (slug) =>
            allToolPages().find((p) => p.slug === slug) ?? null,
    };
}
