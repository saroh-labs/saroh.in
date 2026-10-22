// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StarterContentActions } from "@/components/sites/editor/starter-content-actions";
import type { LookPreviewSource } from "@/components/sites/look-preview";
import type { SitePage } from "@/lib/sites/service";
import type { SitePalette } from "@saroh/block-contract";
import {
    PALETTE_ROLES,
    PALETTE_SAFE_ROLES,
    PALETTE_STATUS_ROLES,
} from "@saroh/block-contract";

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
 * its showcase template with sample words (DEC-182) without changing the
 * draft or saving anything, and offers its starter content, said first.
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
}));
vi.mock("@/lib/sites/actions", () => actions);

// A colourway is told apart by its exact palette (DEC-090), as the API's
// save tells it (review #22).
const paletteOf = (hex: string) =>
    Object.fromEntries(
        [...PALETTE_ROLES, ...PALETTE_STATUS_ROLES, ...PALETTE_SAFE_ROLES].map(
            (role) => [role, hex],
        ),
    ) as unknown as SitePalette;
const KESAR = paletteOf("#fbf7f2");
const MAUVE = paletteOf("#f6f0f4");

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
                palette: KESAR,
            },
            chips: [],
        },
        {
            id: "mauve",
            name: "Mauve",
            style: {
                colours: { pageGround: "paper", text: "ink", accent: "teal" },
                scalars: {},
                palette: MAUVE,
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
    palette: KESAR,
};

// Classic is the only free look (DEC-177, owner 21 Oct).
const FREE: SiteStyleAccess["free"] = {
    looks: [],
    fontPairs: ["system", "own"],
    colourways: ["kesar"],
};

const PAGES: SitePage[] = [
    { id: "p-home", path: "/", title: "Home", isHome: true, hidden: false },
];

/** A starter the dialog is handed: the editor's, watched. */
function starter(over: Partial<StarterContentActions> = {}) {
    return {
        blocked: null,
        copy: vi.fn().mockResolvedValue({ ok: true }),
        fillDetails: vi.fn().mockResolvedValue(undefined),
        listVersions: vi.fn().mockResolvedValue({ ok: true, versions: [] }),
        rollback: vi.fn().mockResolvedValue({ ok: true }),
        bringIn: vi.fn().mockResolvedValue({ ok: true }),
        ...over,
    } satisfies StarterContentActions;
}

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
        preview: { pages: PAGES, ...preview },
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
        expect(radio("Quiet").textContent).toContain("Paid plans");
        expect(radio("Live").textContent).toContain("Paid plans");
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

    it("refuses Quiet in place: Classic stays, one line says why", () => {
        const { onChoose } = render();
        press(radio("Quiet"));
        expect(onChoose).not.toHaveBeenCalled();
        expect(radio("Classic").getAttribute("aria-checked")).toBe("true");
        const [line, ...more] = refusals();
        expect(more).toHaveLength(0);
        expect(line.textContent).toContain("Quiet comes with a paid plan");
        expect(actions.updateSiteStyle).not.toHaveBeenCalled();
    });

    it("lets a site in a look go back to Classic", () => {
        const { onChoose } = render({ at: inLook(style, "quiet") });
        press(radio("Classic"));
        expect(onChoose).toHaveBeenCalledWith(null);
        expect(refusals()).toHaveLength(0);
    });

    it("takes a free one at once and clears the line", () => {
        const { onChange } = render();
        press(radio("Archivo"));
        press(radio("Your visitor's system font"));
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0]?.[0]).not.toHaveProperty("fontPair");
        expect(refusals()).toHaveLength(0);
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
        press(radio("Quiet"));
        expect(onChoose).toHaveBeenCalledWith("quiet");
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

    it("draws the look's showcase template with its sample words, and closing leaves the draft as it was", async () => {
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
        // Folio's showcase is the Studio template, for its sample business.
        expect(
            d.querySelector<HTMLElement>("[data-look-showcase]")?.dataset
                .lookShowcase,
        ).toBe("studio");
        expect(drawn?.textContent).toContain("Studio Neue");
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

    it("chooses Classic from Use this look on any plan, and closes", () => {
        const { onChoose } = render({ at: inLook(style, "quiet") });
        press(button(host, "Preview Classic"));
        press(button(shown(), "Use this look"));
        expect(onChoose).toHaveBeenCalledWith(null);
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

    it("offers no starter content where the editor gives none", () => {
        render();
        press(button(host, "Preview Live"));
        expect(() =>
            button(shown(), "Use this look with its starter content"),
        ).toThrow();
    });
});

describe("a look's starter content (DEC-182)", () => {
    it("says what it replaces and adds, then copies it and closes", async () => {
        const s = starter();
        const { onChoose } = render({
            paidIncluded: true,
            preview: { starter: s },
        });
        press(button(host, "Preview Live"));
        press(button(shown(), "Use this look with its starter content"));

        const confirm = shown().querySelector("[data-look-starter-confirm]");
        expect(confirm?.textContent).toContain(
            "Your draft of Home is replaced with the Gym template's.",
        );
        expect(confirm?.textContent).toContain(
            "Your other pages stay as they are.",
        );
        expect(confirm?.textContent).toContain("a sample business's");
        expect(s.copy).not.toHaveBeenCalled();

        await act(async () => {
            press(button(shown(), "Use Live and its starter content"));
            await Promise.resolve();
        });
        // "Fill in my details" is on unless it is unticked.
        expect(s.copy).toHaveBeenCalledWith("live", true);
        // The server sets the look with the copy: the row's choice isn't used.
        expect(onChoose).not.toHaveBeenCalled();
        expect(dialog()).toBeNull();
    });

    it("goes back to the look without copying anything", () => {
        const s = starter();
        render({ paidIncluded: true, preview: { starter: s } });
        press(button(host, "Preview Quiet"));
        press(button(shown(), "Use this look with its starter content"));
        press(button(shown(), "Back"));
        expect(shown().querySelector("[data-look-starter-confirm]")).toBeNull();
        expect(() => button(shown(), "Use this look")).not.toThrow();
        expect(s.copy).not.toHaveBeenCalled();
    });

    it("refuses a paid look's starter on this plan before the confirm", () => {
        const s = starter();
        render({ preview: { starter: s } });
        press(button(host, "Preview Folio"));
        press(button(shown(), "Use this look with its starter content"));
        expect(shown().querySelector("[data-look-starter-confirm]")).toBeNull();
        expect(refusals(shown())[0].textContent).toContain(
            "Folio comes with a paid plan",
        );
        expect(s.copy).not.toHaveBeenCalled();
    });

    it("offers Classic's Bakery on any plan", async () => {
        const s = starter();
        render({ preview: { starter: s } });
        press(button(host, "Preview Classic"));
        press(button(shown(), "Use this look with its starter content"));
        expect(shown().textContent).toContain("the Bakery template's");
        await act(async () => {
            press(button(shown(), "Use Classic and its starter content"));
            await Promise.resolve();
        });
        expect(s.copy).toHaveBeenCalledWith(null, true);
    });

    it("copies the samples alone when Fill in my details is unticked", async () => {
        const s = starter();
        render({ paidIncluded: true, preview: { starter: s } });
        press(button(host, "Preview Live"));
        press(button(shown(), "Use this look with its starter content"));
        const fill = shown().querySelector<HTMLElement>(
            "[data-look-starter-fill]",
        );
        expect(fill?.getAttribute("aria-checked")).toBe("true");
        expect(shown().textContent).toContain("Fill in my details");
        if (fill) press(fill);
        expect(fill?.getAttribute("aria-checked")).toBe("false");
        await act(async () => {
            press(button(shown(), "Use Live and its starter content"));
            await Promise.resolve();
        });
        expect(s.copy).toHaveBeenCalledWith("live", false);
    });

    it("waits while the editor has changes not saved yet", () => {
        const s = starter({ blocked: "Your last changes aren't saved yet." });
        render({ paidIncluded: true, preview: { starter: s } });
        press(button(host, "Preview Live"));
        press(button(shown(), "Use this look with its starter content"));
        expect(shown().textContent).toContain(
            "Your last changes aren't saved yet.",
        );
        expect(
            button(shown(), "Use Live and its starter content").hasAttribute(
                "disabled",
            ),
        ).toBe(true);
    });

    it("says a refusal inside the confirm and stays open", async () => {
        const s = starter({
            copy: vi.fn().mockResolvedValue({
                ok: false,
                error: "Couldn't copy the starter content.",
            }),
        });
        render({ paidIncluded: true, preview: { starter: s } });
        press(button(host, "Preview Live"));
        press(button(shown(), "Use this look with its starter content"));
        await act(async () => {
            press(button(shown(), "Use Live and its starter content"));
            await Promise.resolve();
        });
        const alert = shown().querySelector('[role="alert"]');
        expect(alert?.textContent).toBe("Couldn't copy the starter content.");
        expect(dialog()).not.toBeNull();
    });

    it("says the plan's refusal from the server as the row says it", async () => {
        const s = starter({
            copy: vi.fn().mockResolvedValue({
                ok: false,
                error: "Refused",
                paid: true,
            }),
        });
        render({ paidIncluded: true, preview: { starter: s } });
        press(button(host, "Preview Quiet"));
        press(button(shown(), "Use this look with its starter content"));
        await act(async () => {
            press(button(shown(), "Use Quiet and its starter content"));
            await Promise.resolve();
        });
        expect(refusals(shown())[0].textContent).toContain(
            "Quiet comes with a paid plan",
        );
    });
});
