import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Tiptap's `editor.commands` and `editor.view` are getters that throw until
 * the editor has mounted (`immediatelyRender: false` renders first without
 * one). The React Compiler reads a property path a handler uses during
 * render, to cache it, so `editor.commands.focus()` even inside onClick
 * crashed the post editor three times on 21 Nov (DEV_LEARNINGS). Call
 * `editor.chain()…run()` instead; read `editor.view` only inside an effect
 * that waits for the editor, as the "/" menu does.
 */
const APP = path.resolve(__dirname, "../..");
const SKIP = new Set(["node_modules", ".next", ".turbo", ".open-next"]);

/** Files allowed, with why. */
const ALLOW: Record<string, string> = {
    "components/sites/rich-text/writing-menus.tsx":
        "editor.view only inside the effect that waits for isInitialized",
    "components/sites/editor/phone/text-sheet.tsx":
        "its `editor` is the sheet's own RichEditor, not Tiptap's",
};

function sources(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) sources(full, out);
        else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name))
            out.push(full);
    }
    return out;
}

describe("Tiptap getters are never read where the compiler can lift them", () => {
    it("no editor.commands or editor.view outside the allowed files", () => {
        const hits = ["app", "components", "lib"]
            .flatMap((d) => sources(path.join(APP, d)))
            .map((f) => path.relative(APP, f).split(path.sep).join("/"))
            .filter((rel) => !(rel in ALLOW))
            .filter((rel) =>
                /\beditor\??\.(commands|view)\b/.test(
                    readFileSync(path.join(APP, rel), "utf8")
                        .replace(/\/\*[\s\S]*?\*\//g, "")
                        .replace(/^\s*\/\/.*$/gm, ""),
                ),
            );
        expect(hits).toEqual([]);
    });
});
