import type { DocKindId } from "../kinds";
import { DOC_KINDS } from "../kinds";
import { outlineOf, parseBlocks, parseInline } from "./blocks/parse";
import type { Block, Inline, OutlineItem } from "./blocks/types";
import { splitFile } from "./frontmatter";
import type { DownloadFrontmatter } from "./kinds/download-schema";
import { downloadFrontmatterSchema } from "./kinds/download-schema";
import type { GstFrontmatter } from "./kinds/gst-schema";
import { gstFrontmatterSchema } from "./kinds/gst-schema";
import type { GuideFrontmatter } from "./kinds/guide-schema";
import { guideFrontmatterSchema } from "./kinds/guide-schema";
import type { Question } from "./schema";
import type { UniqueEntry } from "./unique";
import { checkUnique } from "./unique";

/**
 * The GST pages, guides and downloads (the kind list, `kinds.js`), loaded
 * from a map of their files' words. A factory, not a module with the words
 * in it: admin hands it every page (`./docs-embedded`), a production build
 * of saroh.in only the live ones, so a draft's words never reach the site's
 * bundle (plan 2026-10-31-002, R3).
 */

/** Each kind's files' words, by slug. */
export type DocSources = Partial<Record<DocKindId, Record<string, string>>>;
/** Each download's files (`content/downloads/files/<slug>/`): name → size in bytes. */
export type DocFiles = Record<string, Record<string, number>>;

interface Parsed {
    path: string;
    /** The body's blocks, in order. */
    body: Block[];
    /** Its H2s, for OnThisPage. */
    outline: OutlineItem[];
    questions: Question[];
}

export type GstPage = Omit<GstFrontmatter, "questions" | "answer"> &
    Parsed & { kind: "gst"; answer: Inline[] };
export type GuidePage = Omit<GuideFrontmatter, "questions" | "readMinutes"> &
    Parsed & { kind: "guides"; readMinutes: number };
export type DownloadPage = Omit<DownloadFrontmatter, "questions" | "files"> &
    Parsed & {
        kind: "downloads";
        /** `bytes` is null when the file isn't in the folder (its check fails). */
        files: (DownloadFrontmatter["files"][number] & {
            bytes: number | null;
        })[];
    };
export type DocPage = GstPage | GuidePage | DownloadPage;

const WORDS_A_MINUTE = 200;

/** What every kind's frontmatter has that the loader reads. */
interface Common {
    slug: string;
    questions: { question: string; answer: string }[];
}

const questionsOf = (qs: readonly { question: string; answer: string }[]) =>
    qs.map((q) => ({ question: q.question, answer: [q.answer] }));

/** One file's words, checked: its frontmatter against its kind's schema, its body parsed. */
export function parseDocPage(
    kind: DocKindId,
    source: string,
    slug: string,
    files: DocFiles = {},
): DocPage {
    const file = `content/${kind}/${slug}.mdx`;
    const parsed = <T extends Common>(
        data: T,
        body: string,
        bodyLine: number,
    ): Parsed => {
        const blocks = parseBlocks(file, body, bodyLine);
        return {
            path: `/${kind}/${data.slug}`,
            body: blocks,
            outline: outlineOf(blocks),
            questions: questionsOf(data.questions),
        };
    };
    if (kind === "gst") {
        const { data, body, bodyLine } = splitFile(
            file,
            source,
            gstFrontmatterSchema,
        );
        return {
            ...data,
            ...parsed(data, body, bodyLine),
            kind,
            answer: parseInline(`${file}: answer`, data.answer),
        };
    }
    if (kind === "guides") {
        const { data, body, bodyLine } = splitFile(
            file,
            source,
            guideFrontmatterSchema,
        );
        const words = body.split(/\s+/).filter(Boolean).length;
        return {
            ...data,
            ...parsed(data, body, bodyLine),
            kind,
            readMinutes:
                data.readMinutes ??
                Math.max(1, Math.ceil(words / WORDS_A_MINUTE)),
        };
    }
    const { data, body, bodyLine } = splitFile(
        file,
        source,
        downloadFrontmatterSchema,
    );
    const have = files[data.slug] ?? {};
    return {
        ...data,
        ...parsed(data, body, bodyLine),
        kind,
        files: data.files.map((f) => ({ ...f, bytes: have[f.name] ?? null })),
    };
}

export interface DocsLoaderOptions {
    sources: DocSources;
    files?: DocFiles;
    /** The /for/ and tool pages, so no slug or search is shared across every kind. */
    others?: () => readonly UniqueEntry[];
    /**
     * The map holds only some pages (a production build's live ones): a
     * related pin to a page not in it is dropped rather than refused. The
     * full map's tests refuse a pin to a page that doesn't exist.
     */
    partial?: boolean;
}

export interface DocsLoader {
    /** Every page in the map, parsed once, by kind then slug; throws naming the file that's wrong. */
    all(): DocPage[];
    list(kind: "gst"): GstPage[];
    list(kind: "guides"): GuidePage[];
    list(kind: "downloads"): DownloadPage[];
    list(kind: DocKindId): DocPage[];
    load(kind: DocKindId, slug: string): DocPage | null;
}

export function createDocsLoader(opts: DocsLoaderOptions): DocsLoader {
    let cache: DocPage[] | null = null;
    const all = (): DocPage[] => {
        if (cache) return cache;
        const pages = DOC_KINDS.flatMap((k) =>
            Object.entries(opts.sources[k.id] ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([slug, src]) =>
                    parseDocPage(k.id, src, slug, opts.files),
                ),
        );
        checkUnique([...(opts.others?.() ?? []), ...pages]);
        for (const p of pages) {
            const dead = p.related.filter(
                (s) => !pages.some((o) => o.kind === p.kind && o.slug === s),
            );
            if (dead.length && !opts.partial)
                throw new Error(
                    `content/${p.kind}/${p.slug}.mdx: related names no ${p.kind} page "${dead.join('", "')}"`,
                );
            if (p.related.includes(p.slug))
                throw new Error(
                    `content/${p.kind}/${p.slug}.mdx: related names the page itself`,
                );
            p.related = p.related.filter((s) => !dead.includes(s));
        }
        cache = pages;
        return pages;
    };
    return {
        all,
        list: ((kind: DocKindId) =>
            all().filter((p) => p.kind === kind)) as DocsLoader["list"],
        load: (kind, slug) =>
            all().find((p) => p.kind === kind && p.slug === slug) ?? null,
    };
}
