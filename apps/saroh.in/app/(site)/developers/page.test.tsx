// @vitest-environment jsdom
import { existsSync } from "node:fs";
import path from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEVELOPERS, DOCS_ORIGIN } from "@/content/developers";

import DevelopersRoute, { metadata } from "./page";

// The switches this "build" has off: each test sets them.
const switches = vi.hoisted(() => ({ off: [] as string[] }));
vi.mock("@/lib/feature-switches", () => ({ featuresOff: () => switches.off }));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
}));

afterEach(() => {
    cleanup();
    switches.off = [];
});

const hrefs = (root: HTMLElement) =>
    Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"));

/** The docs site's pages, from its content tree (`content/api/<name>.mdx`). */
const DOCS_CONTENT = path.resolve(
    __dirname,
    "../../../../docs.saroh.in/content",
);
function docsPageExists(href: string): boolean {
    const p = new URL(href).pathname.replace(/^\//, "");
    return (
        existsSync(path.join(DOCS_CONTENT, `${p}.mdx`)) ||
        existsSync(path.join(DOCS_CONTENT, p, "index.mdx"))
    );
}

describe("/developers", () => {
    it("is a 404 while its switch is off", () => {
        switches.off = ["developers"];
        expect(() => DevelopersRoute()).toThrow("NEXT_NOT_FOUND");
    });

    it("has one H1, its canonical, the four steps and the docs cards", () => {
        const { container } = render(DevelopersRoute());
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe("/developers");
        for (const step of DEVELOPERS.steps) {
            expect(
                screen.getByRole("heading", {
                    name: `Step ${DEVELOPERS.steps.indexOf(step) + 1}: ${step.title}`,
                }),
            ).toBeTruthy();
        }
        expect(
            screen.getByRole("heading", { name: "Read the docs" }),
        ).toBeTruthy();
        // No trade "Used by".
        expect(container.textContent).not.toMatch(/Used by/);
    });

    it("links only to docs pages that exist", () => {
        const { container } = render(DevelopersRoute());
        const docs = hrefs(container).filter(
            (h): h is string => !!h && h.startsWith(DOCS_ORIGIN),
        );
        expect(docs.length).toBeGreaterThanOrEqual(5);
        for (const href of docs) expect(docsPageExists(href), href).toBe(true);
    });

    it("draws no docs link while docs.saroh.in isn't up", () => {
        switches.off = ["docs"];
        const { container } = render(DevelopersRoute());
        expect(hrefs(container).some((h) => h?.includes("docs.saroh"))).toBe(
            false,
        );
        expect(
            screen.queryByRole("heading", { name: "Read the docs" }),
        ).toBeNull();
        expect(container.textContent).not.toContain("Read the API docs");
    });

    it("offers See AI apps only while that page is built", () => {
        const on = render(DevelopersRoute());
        expect(hrefs(on.container)).toContain("/features/ai-apps");
        cleanup();
        switches.off = ["ai-apps"];
        const off = render(DevelopersRoute());
        expect(hrefs(off.container)).not.toContain("/features/ai-apps");
    });

    it("shows no real key shape, and names no price or plan line", () => {
        const { container } = render(DevelopersRoute());
        const text = container.textContent;
        // The docs' placeholders only: a prefix, then an ellipsis.
        for (const key of text.match(/\b[sp]k_(live|test)_[^\s"'/]*/g) ?? []) {
            expect(key).toMatch(/^[sp]k_(live|test)_([0-9a-f]{4})?…$/);
        }
        expect(text).not.toMatch(/₹|paid plans|Free plan|\bGrow\b|\bPro\b/);
    });
});
