// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section, SitePage } from "@/lib/sites/service";

import { LinkPicker, linkKindOf, linkPlaces, linkTarget } from "./link-picker";
import { TextSheet } from "./phone/text-sheet";

/** Type into an input as React hears it. */
function typeInput(el: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("linkTarget (U47d): only what the site may draw", () => {
    it("makes each kind's address", () => {
        expect(linkTarget("page", "/about")).toBe("/about");
        expect(linkTarget("page", "/services#book-a-trial")).toBe(
            "/services#book-a-trial",
        );
        expect(linkTarget("service", "svc 1")).toBe("/book?service=svc%201");
        expect(linkTarget("call", "+91 00000 01001")).toBe("tel:+910000001001");
        expect(linkTarget("whatsapp", "+91 00000 01001")).toBe(
            "https://wa.me/910000001001",
        );
        expect(linkTarget("url", "https://example.com/a")).toBe(
            "https://example.com/a",
        );
    });

    it("refuses every unsafe or unfinished address", () => {
        for (const bad of [
            "javascript:alert(1)",
            "java\nscript:alert(1)",
            "data:text/html,<b>x</b>",
            "vbscript:x",
            "//evil.example.com",
            "example.com",
            "https://",
            "",
        ]) {
            expect(linkTarget("url", bad), bad).toBeNull();
            expect(linkTarget("page", bad), bad).toBeNull();
        }
        expect(linkTarget("call", "call me")).toBeNull();
        expect(linkTarget("whatsapp", "javascript:1")).toBeNull();
    });

    it("reads an existing link back to its kind", () => {
        expect(linkKindOf("tel:+910000001001")).toEqual({
            kind: "call",
            value: "+910000001001",
        });
        expect(linkKindOf("https://wa.me/910000001001")).toEqual({
            kind: "whatsapp",
            value: "+910000001001",
        });
        expect(linkKindOf("/book?service=svc_1")).toEqual({
            kind: "service",
            value: "svc_1",
        });
        expect(linkKindOf("/about").kind).toBe("page");
        expect(linkKindOf("https://example.com").kind).toBe("url");
    });

    it("lists published pages and the open page's named sections", () => {
        const pages: SitePage[] = [
            { id: "h", path: "/", title: "Home", isHome: true, hidden: false },
            {
                id: "x",
                path: "/x",
                title: "Hidden",
                isHome: false,
                hidden: true,
            },
        ];
        const sections = [
            {
                type: "faq",
                contractVersion: 1,
                content: {
                    heading: "Questions",
                    anchor: "questions",
                    items: [{ question: "Q", answer: "A" }],
                },
            },
        ] as Section[];
        expect(linkPlaces(pages, "h", sections)).toEqual([
            { label: "Home", href: "/" },
            { label: "Questions", href: "/#questions" },
        ]);
    });
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

/** Where a sheet is laid, as the phone editor's frame is. */
const frame = () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
};
const button = (name: string) => {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    return hit;
};
/** The radio whose row holds these words. */
const radio = (words: string) => {
    const hit = Array.from(document.querySelectorAll("[role=radio]")).find(
        // A RadioCards row's label, or a tile's own words (D2).
        (r) => (r.closest("label") ?? r).textContent.includes(words),
    );
    if (!hit) throw new Error(`No choice ${words}`);
    return hit;
};
const click = (el: Element) =>
    act(() => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

describe("the link picker", () => {
    it("keeps Apply off until the address is one the site may draw", () => {
        const onApply = vi.fn();
        act(() =>
            root.render(
                <LinkPicker words="a trial" places={[]} onApply={onApply} />,
            ),
        );
        expect(document.body.textContent).toContain("Link “a trial” to");
        click(radio("Any web address"));
        const address =
            document.querySelector<HTMLInputElement>("input[type=url]");
        if (!address) throw new Error("No web address");
        act(() => typeInput(address, "javascript:alert(1)"));
        expect(button("Apply").disabled).toBe(true);
        expect(document.body.textContent).toContain(
            "Enter a full web address, starting with https://",
        );
        act(() => typeInput(address, "https://example.com"));
        click(button("Apply"));
        expect(onApply).toHaveBeenCalledWith({
            href: "https://example.com",
            newTab: false,
        });
    });
});

describe("the phone's text sheet on rich text (U47d, fix/WXNText)", () => {
    function richField(html: string) {
        const setContent = vi.fn(() => true);
        const page = document.createElement("div");
        page.className = "ProseMirror";
        Object.defineProperty(page, "isContentEditable", { value: true });
        Object.assign(page, {
            editor: { getHTML: () => html, commands: { setContent } },
        });
        document.body.appendChild(page);
        return { page, setContent };
    }
    const select = (node: Node, from: number, to: number) => {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        const sel = document.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
    };

    it("Bold and Link change the words, and Save gives the field its HTML", () => {
        const { page, setContent } = richField("<p>Book a trial today</p>");
        act(() =>
            root.render(
                <TextSheet
                    field={{ el: page, label: "Content", section: "About" }}
                    container={frame()}
                    links={{ places: [{ label: "Book", href: "/book" }] }}
                    onClose={vi.fn()}
                />,
            ),
        );
        const box = document.getElementById("phone-text-sheet");
        if (!box) throw new Error("No text box");
        expect(box.innerHTML).toBe("<p>Book a trial today</p>");
        expect(document.body.textContent).toContain("4 words");
        const text = () => box.querySelector("p")?.firstChild as Node;

        select(text(), 0, 4);
        click(button("Bold"));
        expect(box.innerHTML).toBe(
            "<p><strong>Book</strong> a trial today</p>",
        );

        // " a trial": link it to a page of the site.
        const rest = Array.from(box.querySelector("p")?.childNodes ?? []).find(
            (n) => n.textContent === " a trial today",
        ) as Node;
        select(rest, 3, 8);
        click(button("Link"));
        expect(document.body.textContent).toContain("Link “trial” to");
        click(radio("Book/book"));
        click(button("Apply"));
        expect(box.innerHTML).toBe(
            '<p><strong>Book</strong> a <a href="/book">trial</a> today</p>',
        );

        click(button("Save"));
        expect(setContent).toHaveBeenCalledWith(box.innerHTML, {
            emitUpdate: true,
        });
    });

    it("plain text has no Bold or Link: the field cannot hold them", () => {
        const area = document.createElement("textarea");
        area.value = "Ask us";
        document.body.appendChild(area);
        act(() =>
            root.render(
                <TextSheet
                    field={{ el: area, label: "Intro", section: "Questions" }}
                    container={frame()}
                    onClose={vi.fn()}
                />,
            ),
        );
        expect(document.querySelector("[aria-label=Bold]")).toBeNull();
        expect(document.querySelector("[aria-label=Link]")).toBeNull();
    });
});
