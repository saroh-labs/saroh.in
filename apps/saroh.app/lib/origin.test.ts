import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { sameOriginHost, servedHost } from "./origin";

/**
 * The Origin check on a merchant's site (round-2 plan A, A3), and the rule
 * that every state-changing action makes it first.
 */
const h = (entries: Record<string, string>) => new Headers(entries);

describe("sameOriginHost", () => {
    it("accepts a request from the page it is served on", () => {
        expect(
            sameOriginHost(
                h({ host: "kavi.saroh.app", origin: "https://kavi.saroh.app" }),
            ),
        ).toBe("kavi.saroh.app");
        expect(
            sameOriginHost(
                h({
                    host: "Book.KaviDental.in",
                    origin: "https://book.kavidental.in",
                }),
            ),
        ).toBe("book.kavidental.in");
    });

    it("refuses another merchant's site, even on the same parent domain", () => {
        expect(
            sameOriginHost(
                h({
                    host: "kavi.saroh.app",
                    origin: "https://pulse.saroh.app",
                }),
            ),
        ).toBe(null);
    });

    it("refuses a missing, opaque or malformed Origin", () => {
        expect(sameOriginHost(h({ host: "kavi.saroh.app" }))).toBe(null);
        expect(
            sameOriginHost(h({ host: "kavi.saroh.app", origin: "null" })),
        ).toBe(null);
        expect(
            sameOriginHost(h({ host: "kavi.saroh.app", origin: "kavi" })),
        ).toBe(null);
    });

    it("refuses plain http, except on a local address", () => {
        expect(
            sameOriginHost(
                h({ host: "kavi.saroh.app", origin: "http://kavi.saroh.app" }),
            ),
        ).toBe(null);
        expect(
            sameOriginHost(
                h({
                    host: "kavi.saroh.app.localhost:3005",
                    origin: "http://kavi.saroh.app.localhost:3005",
                }),
            ),
        ).toBe("kavi.saroh.app.localhost");
    });

    it("reads the served host without its port", () => {
        expect(servedHost(h({ host: "Kavi.saroh.app:443" }))).toBe(
            "kavi.saroh.app",
        );
        expect(servedHost(h({}))).toBe(null);
    });
});

// ---- Every action checks Origin first --------------------------------------

/** The exported actions in a file that don't call `siteOrigin()` first. */
function actionsSkippingOrigin(source: string): string[] {
    const skipped: string[] = [];
    const exported = /export async function (\w+)\s*\(/g;
    let match: RegExpExecArray | null;
    while ((match = exported.exec(source)) !== null) {
        const bodyStart = source.indexOf("{\n", match.index);
        const firstLine = source
            .slice(bodyStart + 2)
            .split("\n")
            .find((line) => line.trim() !== "");
        if (!firstLine?.includes("await siteOrigin()")) {
            skipped.push(match[1]);
        }
    }
    return skipped;
}

function actionFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return actionFiles(full);
        return entry.name === "actions.ts" ? [full] : [];
    });
}

describe("state-changing actions on a merchant's site", () => {
    const root = path.resolve(__dirname, "../app/[domain]");
    const files = actionFiles(root);

    it("finds the site's actions", () => {
        expect(files.map((f) => path.relative(root, f))).toContain(
            path.join("account", "actions.ts"),
        );
    });

    it.each(files.map((f) => [path.relative(root, f), f]))(
        "%s checks Origin before anything else in every action",
        (_name, file) => {
            const source = readFileSync(file, "utf8");
            expect(source).toMatch(/export async function/);
            expect(actionsSkippingOrigin(source)).toEqual([]);
        },
    );

    it("catches an action that skips the check", () => {
        const source = `
export async function good(a: string): Promise<void> {
    if (!(await siteOrigin())) return;
    await send(a);
}

export async function bad(
    a: string,
): Promise<void> {
    await send(a);
    if (!(await siteOrigin())) return;
}
`;
        expect(actionsSkippingOrigin(source)).toEqual(["bad"]);
    });
});
