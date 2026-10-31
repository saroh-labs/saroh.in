import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { DocPage } from "@saroh/search-pages/docs";
import { embeddedDocs } from "@saroh/search-pages/docs-embedded";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordDocs } from "./build-state.config.js";
import { heldWarning, planDocs, writeDocs } from "./docs-content.config";

const TODAY = "2026-10-31";
const pages = embeddedDocs.all();
const GST = "/gst/salon-and-beauty-services";
const GUIDE = "/guides/reduce-no-shows";
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
        expect(gen()).not.toContain("reduce-no-shows");
        expect(gen()).not.toContain("customer-list-template");
        expect(gen()).toContain("export const DOC_PARTIAL: boolean = true;");
        expect(downloads()).toEqual([]);
    });

    it("production: a live download's files are copied, and only its", () => {
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
        ).toEqual(["customer-list.csv", "customer-list.xlsx"]);
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
            "bill-of-supply-format",
            "customer-list-template",
            "gst-invoice-format",
            "receipt-format",
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
