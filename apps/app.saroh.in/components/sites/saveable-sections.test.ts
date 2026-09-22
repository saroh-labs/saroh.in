import { describe, expect, it } from "vitest";

import { emptySection } from "@/components/sites/empty-section";
import {
    saveableSections,
    UNFINISHED_MESSAGE,
} from "@/components/sites/saveable-sections";
import type { Section } from "@/lib/sites/service";

function hero(key: string, heading: string): Section {
    return { key, type: "hero", contractVersion: 1, content: { heading } };
}

function text(key: string, value: string): Section {
    return {
        key,
        type: "richText",
        contractVersion: 1,
        content: { format: "html", value },
    };
}

describe("saveableSections", () => {
    it("passes an all-valid list through unchanged", () => {
        const current = [hero("a", "Welcome"), text("b", "<p>Hi</p>")];
        const out = saveableSections(current, []);
        expect(out.toSend).toEqual(current);
        expect(out.sentFrom).toEqual([0, 1]);
        expect(out.heldBack).toEqual([]);
    });

    it("leaves out a new section that fails its contract", () => {
        const added = emptySection("hero");
        const current = [hero("a", "Welcome"), added];
        const out = saveableSections(current, [hero("a", "Welcome")]);
        expect(out.toSend).toEqual([hero("a", "Welcome")]);
        expect(out.sentFrom).toEqual([0]);
        expect(out.heldBack).toEqual([
            {
                index: 1,
                key: added.key,
                type: "hero",
                message: UNFINISHED_MESSAGE,
            },
        ]);
    });

    it("sends the saved version of a section that has become invalid", () => {
        const saved = [hero("a", "Welcome"), text("b", "<p>Hi</p>")];
        const current = [hero("a", ""), text("b", "<p>Hello</p>")];
        const out = saveableSections(current, saved);
        expect(out.toSend).toEqual([
            hero("a", "Welcome"),
            text("b", "<p>Hello</p>"),
        ]);
        expect(out.sentFrom).toEqual([0, 1]);
        expect(out.heldBack.map((h) => h.index)).toEqual([0]);
    });

    it("keeps the editor's order, including a reorder around a held-back section", () => {
        const saved = [hero("a", "One"), text("b", "<p>B</p>")];
        const added = emptySection("cta");
        const current = [text("b", "<p>B</p>"), added, hero("a", "One")];
        const out = saveableSections(current, saved);
        expect(out.toSend.map((s) => s.key)).toEqual(["b", "a"]);
        expect(out.sentFrom).toEqual([0, 2]);
        expect(out.heldBack).toMatchObject([{ index: 1, type: "cta" }]);
    });

    it("holds back each unfinished section with its own index and type", () => {
        const current = [
            emptySection("gallery"),
            text("b", "<p>B</p>"),
            emptySection("hero"),
        ];
        const out = saveableSections(current, []);
        expect(out.toSend.map((s) => s.key)).toEqual(["b"]);
        expect(out.heldBack.map((h) => [h.index, h.type])).toEqual([
            [0, "gallery"],
            [2, "hero"],
        ]);
    });

    it("uses the contract's message when it was written for an author", () => {
        const split: Section = {
            key: "s",
            type: "hero",
            contractVersion: 1,
            content: { heading: "Welcome", variant: "split" },
        };
        const [held] = saveableSections([split], []).heldBack;
        expect(held.message).toMatch(/Split/);
    });

    it("treats a section with no key as never saved", () => {
        const keyless: Section = {
            type: "hero",
            contractVersion: 1,
            content: { heading: "" },
        };
        const out = saveableSections([keyless], [keyless]);
        expect(out.toSend).toEqual([]);
        expect(out.heldBack).toHaveLength(1);
    });
});
