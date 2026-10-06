// @vitest-environment jsdom
/**
 * `/sites/new`'s template picker (industry templates plan, U12): the
 * suggested templates first and every one under "All", the kind's (or the
 * asked-for) one chosen to start with, a colourway of the chosen one sent
 * as `styleId`, and a module that is off said on its card, never refused.
 */
import fs from "node:fs";
import path from "node:path";

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Template } from "@/lib/sites/service";
import type { ModuleStates } from "@/lib/sites/template-picker";

import { CreateSiteForm } from "./create-site-form";

const createSite = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    createSite: (input: unknown) => createSite(input) as unknown,
}));
const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh }),
}));
vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));

vi.setConfig({ testTimeout: 15_000 });

const CHIPS = {
    crust: ["40 24% 97%", "24 10% 10%", "18 45% 45%"],
    night: ["215 25% 12%", "0 0% 98%", "38 55% 88%"],
};

const TEMPLATES: Template[] = [
    {
        id: "starter",
        version: 2,
        name: "Starter",
        description: "A home page, an about page and a contact page.",
        slug: "starter",
        kinds: [],
        shape: null,
        uses: [],
        colourways: [],
        pages: ["Home", "About", "Contact"],
    },
    {
        id: "bakery",
        version: 1,
        name: "Bakery",
        description: "A one-page site for a bakery.",
        slug: "bakery",
        kinds: ["food"],
        shape: "store",
        uses: ["COMMERCE"],
        colourways: [
            { id: "crust", name: "Crust", chips: CHIPS.crust },
            { id: "night", name: "Night", chips: CHIPS.night },
        ],
        pages: ["Home"],
    },
    {
        id: "studio",
        version: 1,
        name: "Studio",
        description: "A portfolio for a design studio.",
        slug: "studio",
        kinds: ["creator"],
        shape: "portfolio",
        uses: ["WEBSITE", "CRM"],
        colourways: [{ id: "paper", name: "Paper", chips: CHIPS.crust }],
        pages: ["Home", "Work"],
    },
];

const SELL_OFF: ModuleStates = {
    on: ["WEBSITE"],
    named: ["WEBSITE", "COMMERCE", "CRM"],
};

let host: HTMLDivElement;
let root: Root;

/** Radix's radio measures itself; jsdom has no ResizeObserver. */
class NoResize {
    observe() {
        // Nothing to measure.
    }
    unobserve() {
        // As above.
    }
    disconnect() {
        // As above.
    }
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", NoResize);
    createSite.mockReset();
    createSite.mockResolvedValue({
        ok: true,
        data: { siteId: "site_1", slug: "rye" },
    });
    push.mockClear();
    refresh.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await Promise.resolve();
        });
    }
}

function render(props: Partial<Parameters<typeof CreateSiteForm>[0]> = {}) {
    act(() => {
        root.render(
            <CreateSiteForm
                templates={TEMPLATES}
                defaults={{ siteName: "Rye & Co", address: "rye" }}
                defaultTemplateId="starter"
                suggested={["starter", "bakery"]}
                modules={SELL_OFF}
                {...props}
            />,
        );
    });
}

/** A radio group by its visible label. */
function group(label: string): HTMLElement {
    const el = Array.from(
        host.querySelectorAll<HTMLElement>('[role="radiogroup"]'),
    ).find(
        (g) =>
            document.getElementById(g.getAttribute("aria-labelledby") ?? "")
                ?.textContent === label,
    );
    if (!el) throw new Error(`No radio group "${label}"`);
    return el;
}

/** Each radio's accessible name and whether it is checked. */
function radios(label: string): [string, boolean][] {
    return Array.from(
        group(label).querySelectorAll<HTMLElement>('[role="radio"]'),
    ).map((r) => {
        const named = r.getAttribute("aria-labelledby");
        const name = named
            ? (document.getElementById(named)?.textContent ?? "")
            : r.textContent;
        return [name, r.getAttribute("aria-checked") === "true"];
    });
}

function radio(label: string, name: string): HTMLElement {
    const i = radios(label).findIndex(([n]) => n === name);
    const el = Array.from(
        group(label).querySelectorAll<HTMLElement>('[role="radio"]'),
    ).at(i);
    if (!el) throw new Error(`No ${name} in "${label}"`);
    return el;
}

function button(name: string): HTMLButtonElement {
    const b = Array.from(host.querySelectorAll("button")).find(
        (x) => x.textContent.trim() === name,
    );
    if (!b) throw new Error(`No button ${name}`);
    return b;
}

async function click(el: HTMLElement) {
    act(() => el.click());
    await settle();
}

async function submit() {
    const form = host.querySelector("form");
    act(() => {
        form?.dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    await settle();
}

describe("the template picker (U12)", () => {
    it("shows the suggested templates first, the kind's chosen", () => {
        render();
        expect(radios("Template")).toEqual([
            ["Starter", true],
            ["Bakery", false],
        ]);
        expect(button("Suggested").getAttribute("aria-pressed")).toBe("true");
    });

    it("lists every template under All", async () => {
        render();
        await click(button("All 3"));
        expect(radios("Template").map(([n]) => n)).toEqual([
            "Starter",
            "Bakery",
            "Studio",
        ]);
    });

    it("starts on All when the asked-for template isn't suggested", () => {
        render({ startTemplateId: "studio" });
        expect(radios("Template")).toContainEqual(["Studio", true]);
        expect(button("All 3").getAttribute("aria-pressed")).toBe("true");
    });

    it("keeps a template chosen under All in view under Suggested", async () => {
        render();
        await click(button("All 3"));
        await click(radio("Template", "Studio"));
        await click(button("Suggested"));
        expect(radios("Template")).toEqual([
            ["Starter", false],
            ["Bakery", false],
            ["Studio", true],
        ]);
    });

    it("has no filter when every template is suggested", () => {
        render({ suggested: ["starter", "bakery", "studio"] });
        expect(host.textContent).not.toContain("Suggested");
    });

    it("says what each uses, and what a module that is off holds back", () => {
        render();
        const text = host.textContent;
        expect(text).toContain("Uses Products");
        expect(text).toContain("Its products show once Sell is on.");
        // Still a choice like any other.
        const bakery = radio("Template", "Bakery");
        expect(bakery.hasAttribute("disabled")).toBe(false);
        const described = (bakery.getAttribute("aria-describedby") ?? "")
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent)
            .join(" ");
        expect(described).toContain("Its products show once Sell is on.");
    });

    it("sends the template chosen, without a colourway when none was chosen", async () => {
        render();
        await click(radio("Template", "Bakery"));
        expect(radios("Bakery colourway")).toEqual([
            ["Crust", true],
            ["Night", false],
        ]);
        await submit();
        expect(createSite).toHaveBeenCalledWith({
            name: "Rye & Co",
            subdomain: "rye",
            templateId: "bakery",
            templateVersion: 1,
        });
        expect(push).toHaveBeenCalledWith("/sites/site_1");
    });

    it("sends the colourway chosen as styleId", async () => {
        render();
        await click(radio("Template", "Bakery"));
        await click(radio("Bakery colourway", "Night"));
        expect(radios("Bakery colourway")).toContainEqual(["Night", true]);
        await submit();
        expect(createSite).toHaveBeenCalledWith(
            expect.objectContaining({ templateId: "bakery", styleId: "night" }),
        );
    });

    it("starts a newly chosen template in its own first colourway", async () => {
        render();
        await click(radio("Template", "Bakery"));
        await click(radio("Bakery colourway", "Night"));
        await click(radio("Template", "Starter"));
        await click(radio("Template", "Bakery"));
        expect(radios("Bakery colourway")).toContainEqual(["Crust", true]);
    });

    it("offers no colourway choice for a template with one or none", () => {
        render({ startTemplateId: "studio" });
        expect(host.textContent).not.toContain("colourway");
    });
});

describe("with no templates to choose from", () => {
    it("says a failed catalogue, offers a retry, and still creates the site", async () => {
        render({ templates: null });
        expect(host.textContent).toContain("The templates couldn't be loaded.");
        await click(button("Try again"));
        expect(refresh).toHaveBeenCalled();
        await submit();
        expect(createSite).toHaveBeenCalledWith({
            name: "Rye & Co",
            subdomain: "rye",
            templateId: undefined,
            templateVersion: undefined,
        });
    });

    it("says where an empty catalogue starts it", () => {
        const html = renderToStaticMarkup(
            <CreateSiteForm templates={[]} defaults={null} />,
        );
        expect(html).toContain(
            "The site starts from the template for what you&#x27;re setting up.",
        );
        expect(html).not.toContain('role="radiogroup"');
    });
});

describe("rendered on the server", () => {
    it("draws the cards with their names, colour chips and radio semantics", () => {
        const html = renderToStaticMarkup(
            <CreateSiteForm
                templates={TEMPLATES}
                defaults={{ siteName: "Rye & Co", address: "rye" }}
                defaultTemplateId="bakery"
                suggested={["starter", "bakery"]}
                modules={null}
            />,
        );
        expect(html).toContain('role="radiogroup"');
        expect(html).toContain("Bakery");
        expect(html).toContain("background:hsl(40 24% 97%)");
        // Modules unknown: nothing is claimed about them.
        expect(html).not.toContain("show once");
    });
});

describe("TemplateThumbnail", () => {
    it("shows the captured render when there is one, else the drawing", async () => {
        const { TemplateThumbnail } = await import("./template-picker");
        const captured = renderToStaticMarkup(
            <TemplateThumbnail
                name="Bakery"
                colourway={{ id: "crust", name: "Crust", chips: CHIPS.crust }}
                image={{
                    src: "/templates/bakery.webp",
                    width: 360,
                    height: 225,
                }}
            />,
        );
        expect(captured).toContain("<img");
        expect(captured).toContain("bakery.webp");
        expect(captured).not.toContain("Bakery<");

        const drawn = renderToStaticMarkup(
            <TemplateThumbnail
                name="Bakery"
                colourway={{ id: "crust", name: "Crust", chips: CHIPS.crust }}
            />,
        );
        expect(drawn).not.toContain("<img");
        expect(drawn).toContain("Bakery");
    });

    it("finds a captured template's picture by its id", async () => {
        const { TEMPLATE_THUMBNAILS, templateThumbnail } =
            await import("@/lib/sites/template-thumbnails");
        for (const [id, image] of Object.entries(TEMPLATE_THUMBNAILS)) {
            expect(templateThumbnail(id)).toBe(image);
            expect(image?.src).toBe(`/templates/${id}.webp`);
            // Served from this app's own public folder.
            expect(
                fs.existsSync(
                    path.join(process.cwd(), "public", image?.src ?? ""),
                ),
            ).toBe(true);
        }
        expect(templateThumbnail("no-such-template")).toBeUndefined();
    });
});
