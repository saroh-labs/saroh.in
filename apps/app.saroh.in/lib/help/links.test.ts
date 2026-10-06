import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    HELP_ARTICLES,
    HELP_MOVES_AT,
    HELP_MOVES_ON,
    HELP_TOPICS,
    helpArticleUrl,
    helpHasMoved,
    helpHomeUrl,
    helpUrl,
    TOPIC_ARTICLE,
} from "./links";

const BEFORE = new Date("2026-10-16T18:29:59.999Z"); // 16 Oct, 23:59:59.999 IST
const AFTER = new Date("2026-10-16T18:30:00.000Z"); // 17 Oct, 00:00 IST

const APPS = path.resolve(__dirname, "../../..");
const read = (app: string, file: string) =>
    readFileSync(path.join(APPS, app, file), "utf8");

describe("the day Help moves to saroh.in", () => {
    it("is Help's publishOn on saroh.in", () => {
        const help = /id: "help",[\s\S]*?publishOn: "(\d{4}-\d{2}-\d{2})"/.exec(
            read("saroh.in", "content/resources.ts"),
        );
        expect(help?.[1]).toBe(HELP_MOVES_ON);
        const constant = /HELP_PUBLISH_ON: IsoDay = "(\d{4}-\d{2}-\d{2})"/.exec(
            read("saroh.in", "content/help.ts"),
        );
        expect(constant?.[1]).toBe(HELP_MOVES_ON);
    });

    it("begins at midnight in India", () => {
        expect(HELP_MOVES_AT.toISOString()).toBe("2026-10-16T18:30:00.000Z");
        expect(helpHasMoved(BEFORE)).toBe(false);
        expect(helpHasMoved(AFTER)).toBe(true);
    });
});

describe("the articles the app links to", () => {
    it("are every article on saroh.in/help, with its own title", () => {
        const dir = path.join(APPS, "saroh.in/content/help");
        const onSite = readdirSync(dir)
            .filter((f) => f.endsWith(".mdx"))
            .map((f) => {
                const title = /^title: (.+)$/m.exec(
                    readFileSync(path.join(dir, f), "utf8"),
                )?.[1];
                return { slug: f.replace(/\.mdx$/, ""), title };
            });
        expect([...HELP_ARTICLES].map((a) => a.slug).sort()).toEqual(
            onSite.map((a) => a.slug).sort(),
        );
        for (const a of HELP_ARTICLES) {
            expect(onSite.find((s) => s.slug === a.slug)?.title).toBe(a.title);
        }
    });

    it("keep the old site's topics real until the move", () => {
        for (const topic of Object.values(HELP_TOPICS)) {
            expect(
                existsSync(
                    path.join(APPS, "help.saroh.in/content", `${topic}.mdx`),
                ),
                topic,
            ).toBe(true);
        }
    });
});

describe("where a help link goes", () => {
    it("is the old site before the move", () => {
        expect(helpHomeUrl(BEFORE)).toBe("https://help.saroh.in");
        expect(helpUrl("bookings", BEFORE)).toBe(
            "https://help.saroh.in/bookings",
        );
    });

    it("is the matching article after it, or the Help home", () => {
        expect(helpHomeUrl(AFTER)).toBe("https://www.saroh.in/help");
        expect(helpUrl("getting-started", AFTER)).toBe(
            "https://www.saroh.in/help/create-your-business",
        );
        expect(helpUrl("selling", AFTER)).toBe(
            helpArticleUrl("add-your-first-product"),
        );
        expect(helpUrl("bookings", AFTER)).toBe(
            helpArticleUrl("set-your-teams-hours"),
        );
        expect(helpUrl("website", AFTER)).toBe(
            helpArticleUrl("connect-your-own-domain"),
        );
        expect(helpUrl("customers", AFTER)).toBe("https://www.saroh.in/help");
    });

    it("never points a topic at an article that doesn't exist", () => {
        const slugs = new Set<string>(HELP_ARTICLES.map((a) => a.slug));
        for (const article of Object.values(TOPIC_ARTICLE)) {
            if (article) expect(slugs.has(article)).toBe(true);
        }
    });
});
