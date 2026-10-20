// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LookPreviewSource } from "@/components/sites/look-preview";
import type { Section, SitePage } from "@/lib/sites/service";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { inLook } from "@/lib/sites/style";
import type { SiteStyleAccess } from "@/lib/sites/style-access";
import { styleChoiceRules } from "@/lib/sites/style-access";

import type { LookChoices } from "./look-picker";
import { StylePanel } from "./style-panel";

/**
 * Free and paid looks, typefaces and colourways in Website › Style
 * (DEC-177): a paid one says "Paid plans"; on a plan without "Themes,
 * fonts and templates" choosing it is refused in the panel, the previous
 * choice stays, and one line says why. Each look has a Preview that draws
 * the home page in it without changing the draft or saving anything.
 */

vi.mock("next/image", () => ({
    default: (props: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.src} alt={props.alt} />
    ),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/sites",
}));
vi.mock("@/lib/saroh-billing/plans-shown", () => ({
    plansShown: () => true,
}));
// Nothing here may write a style: the actions are watched, never called.
const actions = vi.hoisted(() => ({
    updateSiteStyle: vi.fn(),
    getPageSections: vi.fn(),
}));
vi.mock("@/lib/sites/actions", () => actions);

const options: SiteStyleOptions = {
    rows: [
        {
            key: "pageGround",
            label: "Page ground",
            swatches: [{ key: "paper", label: "Paper", hsl: "0 0% 100%" }],
        },
        {
            key: "text",
            label: "Text",
            swatches: [{ key: "ink", label: "Ink", hsl: "24 10% 10%" }],
        },
        {
            key: "accent",
            label: "Accent",
            swatches: [
                { key: "clay", label: "Clay", hsl: "18 45% 45%" },
                { key: "teal", label: "Teal", hsl: "180 45% 30%" },
            ],
        },
    ],
    scalars: [],
    fontPairs: [
        { key: "system", name: "Your visitor's system font" },
        { key: "own", name: "Own pair" },
        { key: "archivo", name: "Archivo" },
    ],
    colourways: [
        {
            id: "kesar",
            name: "Kesar",
            style: {
                colours: { pageGround: "paper", text: "ink", accent: "clay" },
                scalars: {},
            },
            chips: [],
        },
        {
            id: "mauve",
            name: "Mauve",
            style: {
                colours: { pageGround: "paper", text: "ink", accent: "teal" },
                scalars: {},
            },
            chips: [],
        },
    ],
    startColourway: "kesar",
};

const style: SiteStyle = {
    colours: { pageGround: "paper", text: "ink", accent: "clay" },
    scalars: {},
    fontPair: "own",
};

const FREE: SiteStyleAccess["free"] = {
    looks: ["quiet", "live"],
    fontPairs: ["system", "own"],
    colourways: ["kesar"],
};

const PAGES: SitePage[] = [
    { id: "p-home", path: "/", title: "Home", isHome: true, hidden: false },
];
const HERO: Section = {
    key: "s1",
    type: "hero",
    contractVersion: 1,
    content: { heading: "Welcome to Kesar" },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

function render({
    paidIncluded = false,
    at = style,
    preview,
}: {
    paidIncluded?: boolean;
    at?: SiteStyle;
    preview?: Partial<LookPreviewSource>;
} = {}) {
    const onChange = vi.fn();
    const onChoose = vi.fn();
    const looks: LookChoices = {
        available: true,
        liveLook: null,
        published: true,
        templateId: "salon",
        error: null,
        onChoose,
        preview: {
            siteId: "site-1",
            address: "kesar.saroh.app",
            pages: PAGES,
            chrome: { name: "Kesar Salon", navigation: [], footer: null },
            homeSections: [HERO],
            readPage: vi.fn(),
            ...preview,
        },
    };
    act(() =>
        root.render(
            <StylePanel
                style={at}
                options={options}
                onChange={onChange}
                onReset={vi.fn()}
                saving={false}
                looks={looks}
                rules={styleChoiceRules(
                    { free: FREE, paidIncluded },
                    style,
                    options,
                )}
            />,
        ),
    );
    return { onChange, onChoose, looks };
}

const radio = (name: string) => {
    const el = Array.from(
        host.querySelectorAll<HTMLElement>('[role="radio"]'),
    ).find((r) => r.textContent.includes(name));
    if (!el) throw new Error(`No choice "${name}"`);
    return el;
};
const press = (el: Element) =>
    act(() => {
        (el as HTMLElement).click();
    });
const refusals = (within: ParentNode = host) =>
    Array.from(within.querySelectorAll<HTMLElement>("[data-paid-refusal]"));
const dialog = () =>
    document.body.querySelector<HTMLElement>('[role="dialog"]');
const shown = () => {
    const d = dialog();
    if (!d) throw new Error("No preview open");
    return d;
};
const button = (within: ParentNode, name: string) => {
    const el = Array.from(within.querySelectorAll<HTMLElement>("button")).find(
        (b) => (b.getAttribute("aria-label") ?? b.textContent) === name,
    );
    if (!el) throw new Error(`No button "${name}"`);
    return el;
};

describe("the Paid plans mark", () => {
    it("marks a paid look, typeface and colourway, and nothing free", () => {
        render();
        expect(radio("Folio").textContent).toContain("Paid plans");
        expect(radio("Quiet").textContent).not.toContain("Paid plans");
        expect(radio("Classic").textContent).not.toContain("Paid plans");
        expect(radio("Archivo").textContent).toContain("Paid plans");
        expect(radio("Own pair").textContent).not.toContain("Paid plans");
        expect(radio("Mauve").textContent).toContain("Paid plans");
        expect(radio("Kesar").textContent).not.toContain("Paid plans");
    });
});

describe("a paid choice on a plan without themes", () => {
    it("keeps the typeface it had, and says why in one line with the way to plans", () => {
        const { onChange } = render();
        press(radio("Archivo"));
        expect(onChange).not.toHaveBeenCalled();
        expect(radio("Own pair").getAttribute("aria-checked")).toBe("true");
        const [line, ...more] = refusals();
        expect(more).toHaveLength(0);
        expect(line.getAttribute("role")).toBe("alert");
        expect(line.textContent).toContain("Archivo comes with a paid plan");
        expect(line.querySelector("a")?.getAttribute("href")).toBe(
            "/settings/billing/plans",
        );
        expect(actions.updateSiteStyle).not.toHaveBeenCalled();
    });

    it("keeps the colourway it had", () => {
        const { onChange } = render();
        press(radio("Mauve"));
        expect(onChange).not.toHaveBeenCalled();
        expect(radio("Kesar").getAttribute("aria-checked")).toBe("true");
        expect(refusals()[0]?.textContent).toContain("Mauve");
    });

    it("keeps the look it had, saying so under the Look row", () => {
        const { onChoose } = render();
        press(radio("Folio"));
        expect(onChoose).not.toHaveBeenCalled();
        expect(radio("Classic").getAttribute("aria-checked")).toBe("true");
        expect(refusals()[0]?.textContent).toContain("Folio comes with");
    });

    it("takes a free one at once and clears the line", () => {
        const { onChange, onChoose } = render();
        press(radio("Archivo"));
        press(radio("Your visitor's system font"));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("fontPair");
        expect(refusals()).toHaveLength(0);
        press(radio("Quiet"));
        expect(onChoose).toHaveBeenCalledWith("quiet");
    });

    it("lets colours change: they're never paid", () => {
        const { onChange } = render();
        const teal = host.querySelector<HTMLElement>('[aria-label="Teal"]');
        if (!teal) throw new Error("No Teal swatch");
        press(teal);
        expect(onChange).toHaveBeenCalled();
        expect(refusals()).toHaveLength(0);
    });
});

describe("a plan with themes", () => {
    it("takes a paid typeface, colourway and look", () => {
        const { onChange, onChoose } = render({ paidIncluded: true });
        press(radio("Archivo"));
        expect(onChange.mock.calls[0]?.[0]).toMatchObject({
            fontPair: "archivo",
        });
        press(radio("Mauve"));
        expect(onChange).toHaveBeenCalledTimes(2);
        press(radio("Folio"));
        expect(onChoose).toHaveBeenCalledWith("folio");
        expect(refusals()).toHaveLength(0);
    });
});

describe("Preview", () => {
    it("names each look's button, as a 44px target on touch", () => {
        render();
        for (const name of ["Classic", "Quiet", "Folio", "Live"]) {
            const b = button(host, `Preview ${name}`);
            expect(b.className).toContain("coarse:min-h-11");
        }
    });

    it("draws the home page in the look, and closing leaves the draft as it was", async () => {
        const { onChoose, onChange } = render();
        const open = button(host, "Preview Folio");
        act(() => open.focus());
        press(open);

        const d = shown();
        expect(d.textContent).toContain("Folio");
        expect(d.textContent).toContain("Suits classes and yoga");
        const drawn = d.querySelector<HTMLElement>("[data-look-preview]");
        expect(drawn?.dataset.lookPreview).toBe("folio");
        expect(drawn?.hasAttribute("inert")).toBe(true);
        expect(drawn?.textContent).toContain("Welcome to Kesar");
        // A paid look is shown on any plan, marked.
        expect(d.textContent).toContain("Paid plans");

        press(button(d, "Close"));
        expect(dialog()).toBeNull();
        expect(onChoose).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();
        expect(actions.updateSiteStyle).not.toHaveBeenCalled();
        // The row still shows Classic, and the keyboard is back on Preview
        // (the dialog hands it back on the next tick, as Radix does).
        expect(radio("Classic").getAttribute("aria-checked")).toBe("true");
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(document.activeElement).toBe(open);
    });

    it("refuses Use this look for a paid look on this plan, and stays open", () => {
        const { onChoose } = render();
        press(button(host, "Preview Folio"));
        press(button(shown(), "Use this look"));
        expect(onChoose).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
        const line = refusals(shown())[0];
        expect(line.textContent).toContain("Folio comes with a paid plan");
        expect(line.querySelector("a")).not.toBeNull();
    });

    it("chooses a free look from Use this look, and closes", () => {
        const { onChoose } = render();
        press(button(host, "Preview Quiet"));
        press(button(shown(), "Use this look"));
        expect(onChoose).toHaveBeenCalledWith("quiet");
        expect(dialog()).toBeNull();
    });

    it("chooses a paid look on a plan with themes", () => {
        const { onChoose } = render({ paidIncluded: true });
        press(button(host, "Preview Folio"));
        press(button(shown(), "Use this look"));
        expect(onChoose).toHaveBeenCalledWith("folio");
    });

    it("says the draft is in the look already, with nothing to use", () => {
        render({ at: inLook(style, "quiet") });
        press(button(host, "Preview Quiet"));
        expect(shown().textContent).toContain("Your draft is in Quiet.");
        expect(() => button(shown(), "Use this look")).toThrow();
    });

    it("reads the home page's draft when another page is open", async () => {
        const readPage = vi.fn().mockResolvedValue([HERO]);
        render({ preview: { homeSections: null, readPage } });
        press(button(host, "Preview Live"));
        expect(shown().textContent).toContain("Drawing your home page");
        await act(async () => {
            await Promise.resolve();
        });
        expect(readPage).toHaveBeenCalledWith("p-home");
        expect(
            shown().querySelector("[data-look-preview]")?.textContent,
        ).toContain("Welcome to Kesar");
    });

    it("says when the home page can't be drawn, with Try again", async () => {
        const readPage = vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce([HERO]);
        render({ preview: { homeSections: null, readPage } });
        press(button(host, "Preview Live"));
        await act(async () => {
            await Promise.resolve();
        });
        expect(shown().textContent).toContain("Couldn’t draw your home page.");
        press(button(shown(), "Try again"));
        await act(async () => {
            await Promise.resolve();
        });
        expect(readPage).toHaveBeenCalledTimes(2);
        expect(shown().querySelector("[data-look-preview]")).not.toBeNull();
    });
});
