import { describe, expect, it } from "vitest";

import {
    buttonLevels,
    changedFields,
    elementAt,
    hexToHsv,
    hsvToHex,
    inForce,
    parseElementMark,
    readableLine,
    stampElements,
    withElementAt,
} from "./element-style";

describe("one element in a section's content (DEC-253)", () => {
    const content = {
        heading: "Hello",
        cta: { label: "Book", action: { kind: "page", pageId: "p" } },
        image: { src: "/a.jpg" },
        people: [{ name: "Asha", image: { src: "/b.jpg" } }],
        frame: { styles: { button: { corners: "pill" } } },
    };

    it("stamps each button and photo with its place, and nothing else", () => {
        const stamped = stampElements(content) as typeof content & {
            cta: { editorPath: string };
            image: { editorPath: string };
            people: { image: { editorPath: string } }[];
            editorPath?: string;
        };
        expect(stamped.cta.editorPath).toBe("cta");
        expect(stamped.image.editorPath).toBe("image");
        expect(stamped.people[0].image.editorPath).toBe("people.0.image");
        expect(stamped.editorPath).toBeUndefined();
        // The frame is never walked.
        expect(stamped.frame).toBe(content.frame);
        // A CTA section is a button itself.
        expect(
            (
                stampElements({ label: "Go", href: "/" }) as {
                    editorPath: string;
                }
            ).editorPath,
        ).toBe(".");
    });

    it("reads and writes the element at its place", () => {
        expect(elementAt(content, "people.0.image")).toEqual({ src: "/b.jpg" });
        const next = withElementAt(content, "cta", (el) => ({
            ...el,
            elementStyle: { size: "l" },
        })) as typeof content;
        expect(next.cta).toMatchObject({ elementStyle: { size: "l" } });
        expect(next.image).toBe(content.image);
        expect(parseElementMark("button:cta")).toEqual({
            kind: "button",
            path: "cta",
        });
        expect(parseElementMark("nope")).toBeNull();
    });

    it("shows what wins, closest first, and what differs from the look", () => {
        const levels = buttonLevels(
            { label: "Book", style: "soft", elementStyle: { size: "l" } },
            { button: { corners: "square" } },
            { buttonColour: "fg", buttons: "rounded" },
            undefined,
        );
        expect(inForce(levels, "element")).toMatchObject({
            size: "l",
            style: "soft",
            corners: "square",
            colour: "fg",
        });
        expect(inForce(levels, "site")).toMatchObject({
            corners: "rounded",
            size: "m",
        });
        expect(changedFields(levels, "element").sort()).toEqual([
            "size",
            "style",
        ]);
        // Classic's own corners are Rounded: not a change.
        expect(changedFields(levels, "site")).toEqual(["colour"]);
    });

    it("says how well the words read on a colour", () => {
        expect(readableLine("#F2C94C", undefined)).toMatchObject({
            light: false,
        });
        const vars = {
            "--site-accent": "18 45% 45%",
            "--site-accent-fg": "0 0% 100%",
        };
        const line = readableLine("accent", vars);
        expect(line?.light).toBe(true);
        expect(line?.ratio).toBeGreaterThan(4);
    });
});

describe("the custom picker's square and strip (CSI-C)", () => {
    it("turns a colour into hue, saturation and value and back", () => {
        for (const hex of [
            "#1F5F8B",
            "#F2C94C",
            "#000000",
            "#FFFFFF",
            "#A65E3F",
        ]) {
            expect(hsvToHex(hexToHsv(hex))).toBe(hex);
        }
        expect(hexToHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
        expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000FF");
    });
});
