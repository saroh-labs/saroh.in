import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { PublishContext } from "@/content/resources";

import { helpHostPath, helpHostTarget, OLD_TO_NEW } from "./help-host";

const BEFORE = new Date("2026-10-16T18:29:59.999Z"); // 16 Oct, 23:59:59.999 IST
const AFTER = new Date("2026-10-16T18:30:00.000Z"); // 17 Oct, 00:00 IST
const ctx = (now: Date, preview = false): PublishContext => ({
    now,
    preview,
    routes: null,
});

describe("helpHostTarget", () => {
    it("sends a help. host to the www. host of the same domain", () => {
        expect(helpHostTarget("help.saroh.in")).toBe("www.saroh.in");
        expect(helpHostTarget("HELP.saroh.io:443")).toBe("www.saroh.io");
    });

    it("leaves every other host alone", () => {
        for (const host of [
            "www.saroh.in",
            "saroh.in",
            "localhost:3002",
            null,
        ]) {
            expect(helpHostTarget(host)).toBeNull();
        }
    });
});

describe("helpHostPath", () => {
    it("is the home page while Help isn't published", () => {
        for (const p of ["/", "/getting-started", "/selling", "/nope"]) {
            expect(helpHostPath(p, ctx(BEFORE))).toBe("/");
        }
    });

    it("is Help, or an old page's article, once it is", () => {
        expect(helpHostPath("/", ctx(AFTER))).toBe("/help");
        expect(helpHostPath("/Getting-Started/", ctx(AFTER))).toBe(
            "/help/create-your-business",
        );
        expect(helpHostPath("/customers", ctx(AFTER))).toBe("/help");
        expect(helpHostPath("/selling", ctx(BEFORE, true))).toBe(
            "/help/add-your-first-product",
        );
    });

    it("maps each old page as the app's help links do", () => {
        const app = readFileSync(
            path.resolve(__dirname, "../../app.saroh.in/lib/help/links.ts"),
            "utf8",
        );
        const block = /TOPIC_ARTICLE[^{]*\{([\s\S]*?)\};/.exec(app)?.[1] ?? "";
        const pairs = Array.from(
            block.matchAll(/"?([a-z-]+)"?: (?:"([a-z-]+)"|null)/g),
        );
        expect(pairs.length).toBeGreaterThan(0);
        for (const match of pairs) {
            const topic: string = match[1];
            const article: string | undefined = match[2];
            expect(helpHostPath(`/${topic}`, ctx(AFTER)), topic).toBe(
                article ? `/help/${article}` : "/help",
            );
        }
        expect(Object.keys(OLD_TO_NEW).length).toBe(
            pairs.filter((m) => m[2]).length,
        );
    });
});
