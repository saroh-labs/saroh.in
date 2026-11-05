import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DocPage } from "@saroh/search-pages/docs";
import { embeddedDocs } from "@saroh/search-pages/docs-embedded";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordDocs } from "./build-state.config.js";
import {
    heldWarning,
    LINKS_LIVE,
    planDocs,
    searchPagesLive,
    writeDocs,
    writeSearchContent,
} from "./docs-content.config";

const TODAY = "2026-10-31";
const pages = embeddedDocs.all();
const GST = "/gst/salon-and-beauty-services";
const GUIDE = "/guides/when-you-need-a-gst-invoice"; // still waits for a CA check
const DOWNLOAD = "/downloads/customer-list-template";

/** The code's pages with every fact confirmed, so their checks pass. */
const confirmed: DocPage[] = pages.map((p) => ({ ...p, toConfirm: [] }));

let dir: string;
let at: { genFile: string; downloadsDir: string };
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "docs-content-"));
    at = {
        genFile: path.join(dir, "docs-content.gen.ts"),
        downloadsDir: path.join(dir, "downloads"),
    };
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const gen = () => fs.readFileSync(at.genFile, "utf8");
const downloads = () =>
    fs.existsSync(at.downloadsDir) ? fs.readdirSync(at.downloadsDir) : [];
const live = (...paths: string[]) => ({ preview: false, live: paths });

describe("planDocs + writeDocs (plan 2026-10-31-002, U3)", () => {
    it("production: only the live page's words, no draft's files", () => {
        const plan = planDocs(live(GST, "/for/salons"), confirmed, {
            production: true,
            today: TODAY,
        });
        expect(plan).toEqual({ all: false, built: [GST], held: [] });
        writeDocs(plan, at);
        expect(gen()).toContain('"salon-and-beauty-services"');
        expect(gen()).not.toContain("when-you-need-a-gst-invoice");
        expect(gen()).not.toContain("customer-list-template");
        expect(gen()).toContain("export const DOC_PARTIAL: boolean = true;");
        expect(downloads()).toEqual([]);
    });

    it("production: a live download's files and preview are copied, and only its", () => {
        writeDocs(
            planDocs(live(DOWNLOAD), confirmed, {
                production: true,
                today: TODAY,
            }),
            at,
        );
        expect(downloads()).toEqual(["customer-list-template"]);
        expect(
            fs.readdirSync(
                path.join(at.downloadsDir, "customer-list-template"),
            ),
        ).toEqual([
            "customer-list.csv",
            "customer-list.xlsx",
            "preview-1280.webp",
            "preview-640.webp",
            "preview-960.webp",
            "preview.webp",
        ]);
        expect(gen()).toContain('"customer-list.csv": 213');
    });

    it("a preview: every page, files for all, nothing held", () => {
        const plan = planDocs({ preview: true, live: [] }, pages, {
            production: false,
            today: TODAY,
        });
        expect(plan.all).toBe(true);
        expect(plan.built).toEqual(pages.map((p) => p.path));
        writeDocs(plan, at);
        for (const slug of pages.map((p) => p.slug))
            expect(gen()).toContain(`"${slug}"`);
        expect(gen()).toContain("export const DOC_PARTIAL: boolean = false;");
        expect(downloads()).toEqual([
            "appointment-book",
            "bill-of-supply-format",
            "customer-list-template",
            "gst-invoice-format",
            "receipt-format",
            "salon-rate-card",
        ]);
    });

    it("production with no live page: an empty map, no files, and it still builds", () => {
        const plan = planDocs(live(), confirmed, {
            production: true,
            today: TODAY,
        });
        expect(plan).toEqual({ all: false, built: [], held: [] });
        writeDocs(plan, at);
        expect(gen()).toMatch(/gst: \{\n\n {4}\}/);
        expect(gen()).toContain("DOC_FILES: DocFiles = {\n\n}");
        expect(downloads()).toEqual([]);
    });

    it("a stale files folder from an earlier build is cleared", () => {
        fs.mkdirSync(path.join(at.downloadsDir, "old"), { recursive: true });
        writeDocs(
            planDocs(live(), confirmed, { production: true, today: TODAY }),
            at,
        );
        expect(downloads()).toEqual([]);
    });

    it("production without the publish list fails; elsewhere it builds every page", () => {
        expect(() =>
            planDocs(null, pages, { production: true, today: TODAY }),
        ).toThrow(/never guesses/);
        expect(
            planDocs(null, pages, { production: false, today: TODAY }).all,
        ).toBe(true);
    });

    it("covers R9: a live page with unconfirmed facts is left out with a warning", () => {
        const plan = planDocs(live(GST, GUIDE), pages, {
            production: true,
            today: TODAY,
        });
        expect(plan.built).toEqual([]);
        expect(plan.held.map((h) => h.path)).toEqual([GST, GUIDE]);
        expect(plan.held[0].why).toContain("Every fact is confirmed");
        const warning = heldWarning(plan.held[0]);
        expect(warning).toMatch(/^::warning title=Page held by checks::/);
        expect(warning).toContain(GST);
        expect(warning).toContain(
            "the CBIC notification number for the 5% rate",
        );
        writeDocs(plan, at);
        expect(gen()).not.toContain("salon-and-beauty-services");
    });

    it("covers R9: a GST page checked too long ago is left out", () => {
        const plan = planDocs(live(GST), confirmed, {
            production: true,
            today: "2027-10-31",
        });
        expect(plan.built).toEqual([]);
        expect(plan.held[0].why).toEqual([
            expect.stringMatching(/checked in the last/),
        ]);
    });

    it("a live record for a page the code doesn't have builds nothing", () => {
        expect(
            planDocs(live("/gst/not-in-the-code"), confirmed, {
                production: true,
                today: TODAY,
            }),
        ).toEqual({ all: false, built: [], held: [] });
    });
});

describe("planDocs: links must land (U12)", () => {
    const NO_SHOWS = "/guides/reduce-no-shows";
    const TOOL = "/tools/cancellation-policy-generator";
    const plan = (list: Parameters<typeof planDocs>[0]) =>
        planDocs(list, confirmed, { production: true, today: TODAY });

    it("a live guide whose tool is live builds", () => {
        expect(plan(live(NO_SHOWS, TOOL)).built).toEqual([NO_SHOWS]);
    });

    it("a live guide whose tool isn't live is held, naming the link", () => {
        const p = plan(live(NO_SHOWS));
        expect(p.built).toEqual([]);
        expect(p.held).toEqual([
            {
                path: NO_SHOWS,
                why: [LINKS_LIVE],
                detail: [`It links to ${TOOL}, which isn't live.`],
            },
        ]);
        expect(heldWarning(p.held[0])).toMatch(
            /^::warning title=Page held by checks::\/guides\/reduce-no-shows .*cancellation-policy-generator/,
        );
    });

    it("a link to a taken-off page redirects, so it doesn't hold", () => {
        expect(
            plan({
                preview: false,
                live: [NO_SHOWS],
                takenOff: [{ path: TOOL }],
            }).built,
        ).toEqual([NO_SHOWS]);
    });

    it("a page linking to a held page is held too", () => {
        // The receipt format links to the GST invoice format, which links to the code finder.
        const p = plan(
            live("/downloads/receipt-format", "/downloads/gst-invoice-format"),
        );
        expect(p.built).toEqual([]);
        expect(p.held.map((h) => h.path).sort()).toEqual([
            "/downloads/gst-invoice-format",
            "/downloads/receipt-format",
        ]);
    });

    it("a GST page whose only links are its rail tools, trade page and related pins builds alone", () => {
        expect(plan(live(GST)).built).toEqual([GST]);
    });
});

describe("searchPagesLive + writeSearchContent (plan 2026-11-01-001, U2, U3)", () => {
    const LIVE = ["/for/salons", "/for/gyms", "/tools/gst-calculator"];
    const write = (list: Parameters<typeof searchPagesLive>[0]) => {
        const genFile = path.join(dir, "search-content.gen.ts");
        const toolsFile = path.join(dir, "tool-registry.gen.ts");
        writeSearchContent(searchPagesLive(list), { genFile, toolsFile });
        const text = fs.readFileSync(genFile, "utf8");
        const [forPart, toolPart] = text.split("TOOL_SOURCES");
        const slugs = (part = "") =>
            [...part.matchAll(/^ {4}"([a-z0-9-]+)":/gm)].map((m) => m[1]);
        const registry = fs.readFileSync(toolsFile, "utf8");
        // Each entry imports its own tool, and nothing else does.
        const imports = [
            ...registry.matchAll(
                /import\("@saroh\/search-pages\/tools\/([a-z0-9-]+)"\)/g,
            ),
        ].map((m) => m[1]);
        expect(slugs(registry)).toEqual(imports);
        return {
            for: slugs(forPart),
            tools: slugs(toolPart),
            code: imports,
        };
    };
    const every = (kind: string) =>
        fs
            .readdirSync(
                path.join(
                    __dirname,
                    "../../packages/search-pages/content",
                    kind,
                ),
            )
            .filter((f) => f.endsWith(".mdx"))
            .map((f) => f.slice(0, -4))
            .sort();

    it("production: only the live /for/ pages' and tools' words", () => {
        expect(
            write({
                ...live(...LIVE, GST),
                takenOff: [{ path: "/for/cafes" }],
            }),
        ).toEqual({
            for: ["gyms", "salons"],
            tools: ["gst-calculator"],
            code: ["gst-calculator"],
        });
    });

    it("a preview, or no list (next dev, tests): every page", () => {
        // The two app tools have their own routes: no component here.
        const all = {
            for: every("for"),
            tools: every("tools"),
            code: every("tools").filter(
                (t) => t !== "link-preview" && t !== "qr-code-maker",
            ),
        };
        expect(all.for).toHaveLength(34);
        expect(all.code).toHaveLength(25);
        expect(write({ preview: true, live: LIVE })).toEqual(all);
        expect(write(null)).toEqual(all);
    });
});

describe("recordDocs", () => {
    it("adds what was built and held to the production snapshot", () => {
        const stateFile = path.join(dir, "state.json");
        fs.writeFileSync(stateFile, JSON.stringify({ v: 1, builtAt: "x" }));
        const docs = {
            built: [GUIDE],
            held: [{ path: GST, why: ["Every fact is confirmed"] }],
        };
        recordDocs(docs, stateFile);
        expect(JSON.parse(fs.readFileSync(stateFile, "utf8"))).toEqual({
            v: 1,
            builtAt: "x",
            docs,
        });
    });

    it("does nothing without a snapshot (not a production build)", () => {
        const stateFile = path.join(dir, "none.json");
        recordDocs({ built: [], held: [] }, stateFile);
        expect(fs.existsSync(stateFile)).toBe(false);
    });
});
