// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Section } from "@/lib/sites/service";

import type { EditorModel } from "../shell/editor-model";
import { AddPanel } from "./add-panel";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh }),
}));
const listServicesForPicker = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    listServicesForPicker: () => listServicesForPicker() as unknown,
}));
vi.mock("@/lib/sites/actions", () => ({
    createPage: vi.fn(),
    duplicatePage: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
}));

/**
 * Rail › Add (U46e): Add a page opens its own sheet, a section goes in
 * below the selected one, and A service asks which services first and
 * goes in bound to them.
 */
let root: Root;
let host: HTMLDivElement;

const sections = [
    { key: "a", type: "hero", content: { heading: "Welcome" } },
    { key: "b", type: "faq", content: { heading: "Questions" } },
] as unknown as Section[];

function model(over: Partial<EditorModel> = {}) {
    const add = {
        addSection: vi.fn(),
        setLookFor: vi.fn(),
        setBrowsing: vi.fn(),
    };
    const draft = { sections, restoreSections: vi.fn() };
    const m = {
        siteId: "site_1",
        pageId: "pg_1",
        pages: [],
        page: {
            id: "pg_1",
            path: "/",
            title: "Home",
            isHome: true,
            hidden: false,
        },
        address: "sample.saroh.app",
        readOnly: false,
        canUpdateSite: true,
        unsaved: false,
        addablePageKinds: ["SHOP", "CONTACT"],
        shopOpen: true,
        packsOpen: false,
        active: { index: 0, section: sections[0] },
        draft,
        add,
        openRail: vi.fn(),
        ...over,
    } as unknown as EditorModel;
    return { m, add, draft };
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    listServicesForPicker.mockResolvedValue({
        ok: true,
        services: [
            { id: "s1", name: "Sample one", status: "ACTIVE" },
            { id: "s2", name: "Sample two", status: "ACTIVE" },
        ],
    });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

async function render(m: EditorModel, phone = false) {
    await act(async () => {
        root.render(<AddPanel model={m} phone={phone} />);
        await new Promise((r) => setTimeout(r, 0));
    });
}
const text = () => document.body.textContent;
const button = (name: string | RegExp) =>
    Array.from(document.querySelectorAll("button")).find((b) =>
        typeof name === "string"
            ? (b.getAttribute("aria-label") ?? b.textContent) === name
            : name.test(b.getAttribute("aria-label") ?? b.textContent),
    );
const click = async (b: Element | null | undefined) => {
    expect(b).toBeTruthy();
    await act(async () => {
        (b as HTMLElement).click();
        await Promise.resolve();
    });
};

describe("AddPanel (U46e)", () => {
    it("draws pages, then a section below the selected one", async () => {
        const { m } = model();
        await render(m);
        for (const kept of [
            "Add a page",
            "Blank page",
            "Copy this page",
            "Ready pages",
            "Add a section",
            "below Welcome",
            "Suggested for this page",
            "From your business",
            "A service",
            "2 services",
        ]) {
            expect(text(), kept).toContain(kept);
        }
        expect(button(/^Browse all \d+ sections, with previews$/)).toBeTruthy();
        expect(button("Add a Shop page")).toBeTruthy();
        // The page already has Questions: not suggested again.
        expect(button("Add Questions")).toBeUndefined();
    });

    it("Blank page opens the Add a page sheet", async () => {
        const { m } = model();
        await render(m);
        await click(button("Blank page"));
        expect(document.querySelector("[role=dialog]")?.textContent).toContain(
            "Opens here as a draft page. Nothing is live until you publish.",
        );
    });

    it("Browse all opens today's library", async () => {
        const { m, add } = model();
        await render(m);
        await click(button(/^Browse all/));
        expect(add.setBrowsing).toHaveBeenCalledWith(true);
    });

    it("A service: which services, then in bound to them", async () => {
        const { m, add, draft } = model();
        await render(m);
        await click(button("Add A service"));
        expect(text()).toContain("Which services · From Services");
        await click(
            Array.from(document.querySelectorAll("label"))
                .find((l) => l.textContent === "Sample two")
                ?.querySelector("button"),
        );
        await click(button("Add to the page"));
        expect(add.addSection).toHaveBeenCalledWith(
            "servicesList",
            "cards",
            expect.any(Function),
        );
        const fill = add.addSection.mock.calls[0]?.[2] as (at: number) => void;
        fill(1);
        const update = draft.restoreSections.mock.calls[0]?.[0] as (
            prev: Section[],
        ) => Section[];
        const next = update(sections);
        expect(next[1]?.content).toMatchObject({ serviceIds: ["s2"] });
        expect(next[0]).toBe(sections[0]);
    });

    it("no services: no A service row", async () => {
        listServicesForPicker.mockResolvedValue({ ok: true, services: [] });
        const { m } = model();
        await render(m);
        expect(text()).not.toContain("A service");
    });

    it("no page rows without site:update, nothing at all for a reader", async () => {
        await render(model({ canUpdateSite: false }).m);
        expect(text()).not.toContain("Blank page");
        expect(text()).toContain("Add a section");
        await render(model({ readOnly: true }).m);
        expect(text()).toBe("");
    });

    it("a search lists matching sections and pages", async () => {
        const { m } = model();
        await render(m, true);
        const input = document.querySelector("input");
        await act(async () => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, "shop");
            input?.dispatchEvent(new Event("input", { bubbles: true }));
            await Promise.resolve();
        });
        // ListSearch may debounce; give it a tick.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 400));
        });
        expect(text()).toContain("Shop page");
    });
});
