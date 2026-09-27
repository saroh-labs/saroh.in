import { describe, expect, it } from "vitest";

import {
    newFormIds,
    stampFormIds,
} from "@/components/sites/editor/stamp-form-ids";
import type { Section } from "@/lib/sites/service";

const enquiry = (key: string, formId?: string, title = "Get in touch") =>
    ({
        key,
        type: "enquiry",
        contractVersion: 1,
        content: {
            title,
            formId,
            fields: [
                {
                    name: "email",
                    label: "Email",
                    type: "email",
                    required: true,
                },
            ],
        },
    }) as Section;

const hero = (key: string): Section => ({
    key,
    type: "hero",
    contractVersion: 1,
    content: { heading: "Welcome" },
});

const formIdOf = (s: Section) =>
    s.type === "enquiry" ? s.content.formId : undefined;

describe("newFormIds", () => {
    it("finds only the ids the sync gave out", () => {
        const before = [hero("h"), enquiry("a"), enquiry("b", "f-old")];
        const synced = [
            hero("h"),
            enquiry("a", "f-new"),
            enquiry("b", "f-old"),
        ];
        expect(newFormIds(before, synced)).toEqual([
            { index: 1, before: before[1], formId: "f-new" },
        ]);
    });
});

describe("stampFormIds", () => {
    it("stamps a section left untouched since the save began", () => {
        const before = [hero("h"), enquiry("a")];
        const found = newFormIds(before, [hero("h"), enquiry("a", "f1")]);
        const out = stampFormIds(before, found, before.length);
        expect(formIdOf(out[1])).toBe("f1");
        // Nothing else is replaced.
        expect(out[0]).toBe(before[0]);
    });

    it("stamps a section edited mid-save by its position", () => {
        const before = [enquiry("a")];
        const found = newFormIds(before, [enquiry("a", "f1")]);
        const edited = [enquiry("a", undefined, "Say hello")];
        const out = stampFormIds(edited, found, before.length);
        expect(formIdOf(out[0])).toBe("f1");
        // What was typed meanwhile is kept.
        expect(out[0].type === "enquiry" && out[0].content.title).toBe(
            "Say hello",
        );
    });

    it("does not hand a Form to a neighbour once a block was added in between", () => {
        const before = [enquiry("a")];
        const found = newFormIds(before, [enquiry("a", "f1")]);
        const now = [enquiry("new"), enquiry("a", undefined, "Edited")];
        const out = stampFormIds(now, found, before.length);
        expect(out.map(formIdOf)).toEqual([undefined, undefined]);
    });

    it("never overwrites a formId a section already has", () => {
        const before = [enquiry("a")];
        const found = newFormIds(before, [enquiry("a", "f1")]);
        const now = [enquiry("a", "f-kept")];
        expect(formIdOf(stampFormIds(now, found, 1)[0])).toBe("f-kept");
    });
});
