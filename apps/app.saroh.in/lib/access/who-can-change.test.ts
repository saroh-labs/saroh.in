import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { knownRoleName } from "@/lib/organizations/role-name";

import {
    ONLY_OWNER_CAN_CHANGE,
    readOnlyLine,
    WHO_CAN_CHANGE,
    whoCanChange,
    whoCanChangeLine,
} from "./who-can-change";

describe("whoCanChange, the one sentence for a denial", () => {
    it("says what, the role and business, and who can change it", () => {
        expect(
            whoCanChange({
                thing: "Sell",
                business: "Rye & Co.",
                role: "Member",
            }),
        ).toEqual({
            title: "You can't open Sell",
            description:
                "Your role in Rye & Co. is Member. It doesn't include Sell.",
            note: "An owner or admin can change this in Settings › Team.",
        });
    });

    it("says only the owner can, for what only the owner reaches", () => {
        expect(
            whoCanChange({ thing: "Close business", ownerOnly: true }).note,
        ).toBe("Only the owner can change this.");
        expect(whoCanChangeLine(true)).toBe(ONLY_OWNER_CAN_CHANGE);
        expect(whoCanChangeLine()).toBe(WHO_CAN_CHANGE);
    });

    it("leaves out a role or a business it wasn't given, and guesses neither", () => {
        expect(whoCanChange({ thing: "Stock" }).description).toBe(
            "Your role doesn't include Stock.",
        );
        expect(
            whoCanChange({ thing: "Stock", business: "Rye & Co." }).description,
        ).toBe("Your role in Rye & Co. doesn't include Stock.");
        expect(
            whoCanChange({ thing: "Stock", role: " Packer " }).description,
        ).toBe("Your role is Packer. It doesn't include Stock.");
    });

    it("has words for a denial that knows nothing but that it was one", () => {
        expect(whoCanChange()).toEqual({
            title: "You can't open this",
            description: "Your role doesn't include this.",
            note: WHO_CAN_CHANGE,
        });
    });

    it("never says how the person got there, or 'organization'", () => {
        const said = whoCanChange({ thing: "Sell", business: "B", role: "R" });
        const all = [said.title, said.description, said.note].join(" ");
        expect(all).not.toMatch(/by address|rail|organization/i);
    });

    it("has no em dash or semicolon in any of it", () => {
        const said = whoCanChange({ thing: "Sell", business: "B", role: "R" });
        const all = [
            said.title,
            said.description,
            said.note,
            ONLY_OWNER_CAN_CHANGE,
            readOnlyLine("this booking"),
        ].join(" ");
        expect(all).not.toMatch(/[—;]/);
    });
});

describe("readOnlyLine", () => {
    it("is the first sentence of a read-only note", () => {
        expect(readOnlyLine("this booking")).toBe(
            "Your role can read this booking but not change it.",
        );
        expect(readOnlyLine("leads", true)).toBe(
            "Your role can read leads but not change them.",
        );
    });
});

describe("knownRoleName", () => {
    it("is the business's own label when it has one", () => {
        expect(knownRoleName({ role: "MEMBER", roleLabel: " Packer " })).toBe(
            "Packer",
        );
    });

    it("names a built-in the API said is the built-in", () => {
        expect(knownRoleName({ role: "MEMBER", roleKey: "MEMBER" })).toBe(
            "Member",
        );
        expect(knownRoleName({ role: "REVIEWER" })).toBe("Reviewer");
        expect(knownRoleName({ role: "OWNER" })).toBe("Owner");
    });

    it("never guesses Member for a made role, and never shows its key", () => {
        expect(knownRoleName({ role: "MEMBER", roleKey: "role_8f2c" })).toBe(
            null,
        );
        expect(knownRoleName({ role: "MEMBER" })).toBe(null);
    });
});

/**
 * The wordings this replaced, kept out by a scan. A screen that words its
 * own denial is how 28 of them came to exist.
 */
describe("the app's access copy", () => {
    const root = path.resolve(__dirname, "../..");
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            if (name === "node_modules" || name.startsWith(".")) continue;
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
                files.push(full);
            }
        }
    };
    for (const dir of ["app", "components", "lib"]) walk(path.join(root, dir));
    const source = files.map((f) => [f, readFileSync(f, "utf8")] as const);

    it.each([
        ["how they got here", /reached it by address/],
        ["the old pointer to Team", /can change what your role reaches in/],
        ["the old module button", /Manage capabilities/],
        ["the old denial title", /You do not have access to/],
        ["a denial that says organization", /role in this organization/],
    ])("no screen says %s", (_, pattern) => {
        const found = source
            .filter(([, text]) => pattern.test(text))
            .map(([f]) => path.relative(root, f));
        expect(found).toEqual([]);
    });
});
