// @vitest-environment jsdom
/**
 * The editor's Template row (DEC-216, boards D6 and D7): the site's
 * template, its preview, See templates with the trade's suggestion, the
 * confirm that names the pages it replaces, and the states: unsaved edits,
 * a paid look refused, a template the renderer can't draw, a catalogue
 * that couldn't be read, and a reader's row with nothing to change.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StarterContentActions } from "@/components/sites/looks/starter-content-actions";
import type { SitePage, Template } from "@/lib/sites/service";

import { couldntDrawWords } from "./template-preview";
import type { TemplateRowSource } from "./template-row";
import { TemplateRow, waitsForSaveWords } from "./template-row";

vi.mock("@/lib/sites/actions", () => ({
    readTemplatePreview: () =>
        Promise.resolve({
            context: {
                organizationName: "Meher Hair Studio",
                modules: ["WEBSITE", "APPOINTMENTS"],
            },
            services: [],
            visit: null,
            facts: { team: [{ name: "Farah" }, { name: "Imran" }] },
        }),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
    usePathname: () => "/sites/s1",
}));

vi.setConfig({ testTimeout: 15_000 });

const t = (
    id: string,
    name: string,
    over: Partial<Template> = {},
): Template => ({
    id,
    version: 1,
    name,
    kinds: [],
    uses: [],
    colourways: [],
    ...over,
});

const TEMPLATES: Template[] = [
    t("starter", "Starter"),
    t("personal", "Personal"),
    t("salon", "Salon", {
        kinds: ["salon"],
        uses: ["APPOINTMENTS"],
        colourways: [
            { id: "kesar", name: "Kesar", chips: ["0 0% 100%"] },
            { id: "mauve", name: "Mauve", chips: ["0 0% 90%"] },
        ],
    }),
];

const SOURCE: TemplateRowSource = {
    templates: TEMPLATES,
    current: "starter",
    basis: {
        trade: "salon",
        kind: "BUSINESS",
        modules: { on: ["WEBSITE", "APPOINTMENTS"], named: [] },
        defaultId: "starter",
    },
};

const PAGES: SitePage[] = [
    { id: "h", path: "/", title: "Home", isHome: true, hidden: false },
    { id: "a", path: "/about", title: "About", isHome: false, hidden: false },
    {
        id: "c",
        path: "/contact",
        title: "Contact",
        isHome: false,
        hidden: false,
    },
];

function starter(over: Partial<StarterContentActions> = {}) {
    return {
        blocked: null,
        copy: vi.fn().mockResolvedValue({ ok: true }),
        copyTemplate: vi.fn().mockResolvedValue({ ok: true }),
        fillDetails: vi.fn().mockResolvedValue(undefined),
        listVersions: vi.fn().mockResolvedValue({ ok: true, versions: [] }),
        rollback: vi.fn().mockResolvedValue({ ok: true }),
        bringIn: vi.fn().mockResolvedValue({ ok: true }),
        ...over,
    } satisfies StarterContentActions;
}

class NoResize {
    observe() {
        // jsdom has no layout.
    }
    unobserve() {
        // As above.
    }
    disconnect() {
        // As above.
    }
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", NoResize);
    refresh.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

async function render(props: Partial<Parameters<typeof TemplateRow>[0]> = {}) {
    act(() => {
        root.render(
            <TemplateRow
                source={SOURCE}
                pages={PAGES}
                starter={starter()}
                look={null}
                {...props}
            />,
        );
    });
    await settle();
}

function button(name: string | RegExp): HTMLButtonElement {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
        typeof name === "string"
            ? x.textContent.trim() === name
            : name.test(x.textContent.trim()),
    );
    if (!b) throw new Error(`No button ${String(name)}`);
    return b;
}

async function click(el: HTMLElement) {
    act(() => el.click());
    await settle();
}

const dialog = () => document.querySelector('[role="dialog"]');

describe("the Template row (DEC-216)", () => {
    it("names the site's template and the trade's suggestion", async () => {
        await render();
        expect(host.textContent).toContain("Starter");
        expect(host.textContent).toContain("Your site started from it");
        expect(host.textContent).toContain("Salon is suggested for salons.");
    });

    it("opens the preview on the suggestion, drawn with the business's name, and asks before replacing pages", async () => {
        const s = starter();
        await render({ starter: s, look: "quiet" });
        await click(button("See templates"));
        expect(dialog()?.textContent).toContain("Your site in Salon");
        expect(
            dialog()?.querySelector('[data-template-preview="salon"]')
                ?.textContent,
        ).toContain("Meher Hair Studio");
        expect(dialog()?.textContent).toContain("From Meher Hair Studio");
        expect(dialog()?.textContent).toContain(
            "Farah and Imran, who do the work",
        );
        expect(dialog()?.textContent).toContain(
            "About and Contact stay as they are.",
        );
        await click(button("Use Salon and its pages"));
        // The draft's look kept; its colours only when asked.
        expect(s.copyTemplate).toHaveBeenCalledWith(
            "salon",
            null,
            "quiet",
            true,
        );
        expect(dialog()).toBeNull();
    });

    it("waits while the editor has unsaved changes", async () => {
        await render({ starter: starter({ blocked: "unsaved" }) });
        await click(button("See templates"));
        expect(dialog()?.textContent).toContain(waitsForSaveWords("Salon"));
        expect(button("Use Salon and its pages").disabled).toBe(true);
    });

    it("says a paid look refused, with its plan note", async () => {
        const s = starter({
            copyTemplate: vi
                .fn()
                .mockResolvedValue({ ok: false, error: "No", paid: true }),
        });
        await render({ starter: s, look: "quiet" });
        await click(button("See templates"));
        await click(button("Use Salon and its pages"));
        expect(
            dialog()?.querySelector("[data-paid-refusal]")?.textContent,
        ).toContain("Quiet");
    });

    it("stands the picture in when the renderer can't draw a template", async () => {
        await render();
        await click(button("See templates"));
        const pick = document.querySelector<HTMLButtonElement>(
            '[data-template-preview-pick="personal"]',
        );
        if (pick) await click(pick);
        expect(dialog()?.textContent).toContain(couldntDrawWords("Personal"));
    });

    it("says a catalogue that couldn't be read, with Try again", async () => {
        await render({ source: { ...SOURCE, templates: null } });
        expect(host.textContent).toContain("Couldn't load the templates.");
        await click(button(/Try again/));
        expect(refresh).toHaveBeenCalled();
    });

    it("is a line to read for someone who can't change the site", async () => {
        await render({ starter: null });
        expect(host.textContent).not.toContain("See templates");
        await click(button("Preview"));
        expect(dialog()?.textContent).toContain("Your site's template.");
        expect(dialog()?.textContent).not.toContain("Use Salon");
    });
});
