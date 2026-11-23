// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { TextLinksContext } from "@/components/sites/editor/link-picker";

import { RichTextEditor } from "./rich-text-editor";

vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/components/shared/fields/media-picker", () => ({
    MediaPicker: () => null,
}));

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
    document.body.innerHTML = "";
});

function open(links: boolean) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const editor = (
        <RichTextEditor value="<p>Book a trial</p>" onChange={vi.fn()} />
    );
    act(() =>
        root.render(
            links ? (
                <TextLinksContext.Provider
                    value={{
                        places: [{ label: "Contact", href: "/contact" }],
                    }}
                >
                    {editor}
                </TextLinksContext.Provider>
            ) : (
                editor
            ),
        ),
    );
    const link = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Link"]',
    );
    if (!link) throw new Error("No Link button");
    act(() => {
        link.click();
    });
}

it("in the site editor, Link opens the picker (D2)", () => {
    open(true);
    expect(document.querySelector("[data-link-picker]")).not.toBeNull();
    expect(document.body.textContent).toContain("Open in a new tab");
    expect(document.body.textContent).toContain("Contact");
});

it("outside the editor, Link stays an address box", () => {
    open(false);
    expect(document.querySelector("[data-link-picker]")).toBeNull();
    expect(
        document.querySelector('input[aria-label="Link address"]'),
    ).not.toBeNull();
});
