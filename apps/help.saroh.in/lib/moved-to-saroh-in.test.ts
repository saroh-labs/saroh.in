import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    HELP_MOVES_AT,
    HELP_MOVES_ON,
    helpHasMoved,
    movedTo,
    OLD_TO_NEW,
} from "./moved-to-saroh-in";

const BEFORE = new Date("2026-10-16T18:29:59.999Z"); // 16 Oct, 23:59:59.999 IST
const AFTER = new Date("2026-10-16T18:30:00.000Z"); // 17 Oct, 00:00 IST
const WWW = "https://www.saroh.in";

const SAROH_IN = path.resolve(__dirname, "../../saroh.in");
const read = (file: string) => readFileSync(path.join(SAROH_IN, file), "utf8");

describe("the day Help moves", () => {
    it("is Help's publishOn on saroh.in, so both change on the same instant", () => {
        const resources = read("content/resources.ts");
        const help = /id: "help",[\s\S]*?publishOn: "(\d{4}-\d{2}-\d{2})"/.exec(
            resources,
        );
        expect(help?.[1]).toBe(HELP_MOVES_ON);
        const constant = /HELP_PUBLISH_ON: IsoDay = "(\d{4}-\d{2}-\d{2})"/.exec(
            read("content/help.ts"),
        );
        expect(constant?.[1]).toBe(HELP_MOVES_ON);
    });

    it("begins at midnight in India", () => {
        expect(HELP_MOVES_AT.toISOString()).toBe("2026-10-16T18:30:00.000Z");
        expect(helpHasMoved(BEFORE)).toBe(false);
        expect(helpHasMoved(AFTER)).toBe(true);
    });
});

describe("movedTo", () => {
    it("leaves every page here before the day", () => {
        for (const p of ["/", "/getting-started", "/selling", "/nope"]) {
            expect(movedTo(p, BEFORE, WWW)).toBeNull();
        }
    });

    it("sends an old page with a clear match to its new article", () => {
        expect(movedTo("/getting-started", AFTER, WWW)).toBe(
            `${WWW}/help/create-your-business`,
        );
        expect(movedTo("/Getting-Started/", AFTER, WWW)).toBe(
            `${WWW}/help/create-your-business`,
        );
    });

    it("sends everything else to Help's home", () => {
        for (const p of [
            "/",
            "/selling",
            "/bookings",
            "/customers",
            "/website",
            "/organisation",
            "/finding-your-way-around",
            "/what-your-business-needs",
            "/favicon.ico",
            "/no-such-page",
        ]) {
            expect(movedTo(p, AFTER, WWW), p).toBe(`${WWW}/help`);
        }
    });

    it("uses the origin it is given, without doubling a slash", () => {
        expect(movedTo("/", AFTER, "https://saroh.io/")).toBe(
            "https://saroh.io/help",
        );
        expect(movedTo("/", AFTER)).toBe(`${WWW}/help`);
    });

    it("maps only to articles that exist on saroh.in", () => {
        for (const to of Object.values(OLD_TO_NEW)) {
            const slug = to.replace(/^\/help\//, "");
            expect(() => read(`content/help/${slug}.mdx`)).not.toThrow();
        }
    });

    it("maps only old pages that exist here", () => {
        for (const from of Object.keys(OLD_TO_NEW)) {
            expect(() =>
                readFileSync(
                    path.resolve(__dirname, `../content${from}.mdx`),
                    "utf8",
                ),
            ).not.toThrow();
        }
    });
});
