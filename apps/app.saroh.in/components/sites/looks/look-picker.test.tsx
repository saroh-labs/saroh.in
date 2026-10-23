// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LookId } from "@saroh/block-contract";

import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { inLook, resolveStyleVariables } from "@/lib/sites/style";

import type { LookChoices } from "./look-picker";
import { lookChoices, LookPicker, lookStatus } from "./look-picker";
import { StylePanel } from "./style-panel";

/**
 * Website › Style's Look row (DEC-172, plan U16): Classic, Quiet, Folio
 * and Live, the industry default suggested, behind `SITE_LOOKS`, with
 * Classic always one choice away.
 */

// `next/image` needs Next's runtime; a plain img is enough here.
vi.mock("next/image", () => ({
    default: (props: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.src} alt={props.alt} />
    ),
}));

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
            swatches: [{ key: "clay", label: "Clay", hsl: "18 45% 45%" }],
        },
        ...(["heroBackground", "ctaBand", "footer"] as const).map((key) => ({
            key,
            label: key,
            swatches: [{ key: "stone", label: "Stone", hsl: "30 8% 92%" }],
        })),
    ],
    scalars: [
        {
            key: "cornerRadius",
            label: "Corners",
            min: 0,
            max: 24,
            step: 1,
            unit: "px",
            default: 2,
        },
    ],
    fontPairs: [
        { key: "system", name: "System" },
        { key: "editorial", name: "Editorial" },
    ],
};

const classic: SiteStyle = {
    colours: {
        pageGround: "paper",
        text: "ink",
        accent: "clay",
        heroBackground: "stone",
        ctaBand: "stone",
        footer: "stone",
    },
    scalars: { cornerRadius: 2 },
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
});

function renderPicker(
    style: SiteStyle,
    facts: Partial<LookChoices> = {},
): ReturnType<typeof vi.fn> {
    const onChoose = vi.fn();
    act(() =>
        root.render(
            <LookPicker
                style={style}
                options={options}
                available
                liveLook={null}
                published
                templateId={null}
                error={null}
                onChoose={onChoose}
                {...facts}
            />,
        ),
    );
    return onChoose;
}

/** The gallery behind the card's Change (DEC-184), opened if it isn't. */
function openGallery() {
    if (document.querySelector('[data-brand-picker][data-state="open"]')) {
        return;
    }
    const change = host.querySelector<HTMLElement>("[data-look-change]");
    if (change) act(() => change.click());
}
const inGallery = () => {
    openGallery();
    return Array.from(
        document.querySelectorAll<HTMLElement>(
            '[data-brand-picker][data-state="open"] [data-look-choice]',
        ),
    );
};
const choices = () => inGallery().map((el) => el.dataset.lookChoice);
const choice = (id: string) => {
    const el = inGallery().find((e) => e.dataset.lookChoice === id);
    if (!el) throw new Error(`No look "${id}"`);
    return el;
};
const suggested = () =>
    inGallery()
        .filter((el) => el.textContent.includes("Suggested"))
        .map((el) => el.dataset.lookChoice);

describe("the looks on offer", () => {
    it("lists all four for every site while the flag is on, Classic first", () => {
        renderPicker(classic);
        expect(choices()).toEqual(["classic", "quiet", "folio", "live"]);
        expect(choice("classic").getAttribute("aria-checked")).toBe("true");
        // Each with a few words; the full line is in its Preview.
        expect(choice("live").textContent).toContain("Bold, like an app");
        expect(choice("quiet").textContent).toContain("Warm, airy, rounded");
        // The one in force is marked Now, not only outlined.
        expect(choice("classic").textContent).toContain("Now");
        expect(choice("quiet").textContent).not.toContain("Now");
        // The card says what is in force without opening anything.
        expect(
            host.querySelector("[data-look-current]")?.textContent,
        ).toContain("Classic");
    });

    it.each([
        ["salon", "quiet", "Suggested for salons"],
        ["bakery", "quiet", "Suggested for bakeries"],
        ["gym", "live", "Suggested for gyms"],
    ])("suggests the industry default: %s → %s", (templateId, look, words) => {
        renderPicker(classic, { templateId });
        expect(suggested()).toEqual([look]);
        expect(choice(look).textContent).toContain(words);
    });

    it("suggests Quiet, for no trade, from an unknown template or none", () => {
        for (const templateId of ["not-a-template", null]) {
            renderPicker(classic, { templateId });
            expect(suggested()).toEqual(["quiet"]);
            expect(choice("quiet").textContent).toContain("Suggested");
            expect(choice("quiet").textContent).not.toContain("Suggested for");
        }
    });

    it("draws nothing for a Classic site while the flag is off", () => {
        renderPicker(classic, { available: false });
        expect(host.textContent).toBe("");
        expect(host.querySelector("[data-look-change]")).toBeNull();
        expect(
            lookChoices({ available: false, draftLook: null, liveLook: null }),
        ).toEqual([]);
    });

    it("keeps Classic and the site's own look while the flag is off, with no suggestion", () => {
        renderPicker(inLook(classic, "folio"), {
            available: false,
            liveLook: "folio",
            templateId: "gym",
        });
        expect(choices()).toEqual(["classic", "folio"]);
        expect(choice("folio").getAttribute("aria-checked")).toBe("true");
        expect(suggested()).toEqual([]);
    });

    it("offers the live site's look back after the draft went Classic, flag off", () => {
        expect(
            lookChoices({
                available: false,
                draftLook: null,
                liveLook: "quiet",
            }),
        ).toEqual(["classic", "quiet"]);
        expect(
            lookChoices({
                available: false,
                draftLook: "live",
                liveLook: "quiet",
            }),
        ).toEqual(["classic", "quiet", "live"]);
    });
});

describe("choosing", () => {
    it("chooses a look, and Classic as none", () => {
        const onChoose = renderPicker(inLook(classic, "quiet"));
        const folio = choice("folio");
        act(() => folio.click());
        expect(onChoose).toHaveBeenLastCalledWith("folio");
        const back = choice("classic");
        act(() => back.click());
        expect(onChoose).toHaveBeenLastCalledWith(null);
    });

    it("moves with the arrow keys, one tab stop", () => {
        const onChoose = renderPicker(classic);
        openGallery();
        const stops = document.querySelectorAll(
            '[data-brand-picker] [role="radio"][tabindex="0"]',
        );
        expect(stops).toHaveLength(1);
        act(() => {
            choice("classic").dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowDown",
                    bubbles: true,
                }),
            );
        });
        expect(onChoose).toHaveBeenLastCalledWith("quiet");
    });

    it("draws each look's phone in the business's colours and the look's corners", () => {
        renderPicker(classic);
        openGallery();
        const quiet = document.querySelector<HTMLElement>(
            '[data-brand-picker] [data-look-thumbnail="quiet"]',
        );
        const folio = document.querySelector<HTMLElement>(
            '[data-brand-picker] [data-look-thumbnail="folio"]',
        );
        expect(quiet?.getAttribute("aria-hidden")).toBe("true");
        // Quiet's button is a pill, Folio's square.
        const button = (el: HTMLElement | null) =>
            el?.lastElementChild as HTMLElement | null;
        expect(button(quiet)?.style.borderRadius).toBe("999px");
        expect(button(folio)?.style.borderRadius).toMatch(/^0(px)?$/);
    });
});

describe("the line under the row", () => {
    it("says a chosen look isn't live yet", () => {
        renderPicker(inLook(classic, "folio"), { liveLook: null });
        expect(host.textContent).toContain(
            "Not published yet. Your site is Classic until you publish.",
        );
    });

    it("says nothing about publishing on a site never published", () => {
        const status = lookStatus({
            draftLook: "folio",
            liveLook: null,
            published: false,
            error: null,
        });
        expect(status?.text).not.toContain("Not published");
        expect(status?.text).toContain("Folio sets its own type");
    });

    it("says nothing for Classic that is live", () => {
        expect(
            lookStatus({
                draftLook: null,
                liveLook: null,
                published: true,
                error: null,
            }),
        ).toBeNull();
    });

    it("puts a failed save first, announced", () => {
        renderPicker(inLook(classic, "folio"), {
            error: "Couldn't reach Saroh. The look stays Classic.",
        });
        const alert = host.querySelector('[role="alert"]');
        expect(alert?.textContent).toBe(
            "Couldn't reach Saroh. The look stays Classic.",
        );
        expect(host.textContent).not.toContain("Not published yet");
    });
});

describe("Website › Style with the Look row", () => {
    function renderPanel(style: SiteStyle, looks?: LookChoices) {
        act(() =>
            root.render(
                <StylePanel
                    style={style}
                    options={options}
                    onChange={vi.fn()}
                    onReset={vi.fn()}
                    saving={false}
                    looks={looks}
                />,
            ),
        );
    }
    const facts: LookChoices = {
        available: true,
        liveLook: null,
        published: true,
        templateId: "salon",
        error: null,
        onChoose: vi.fn(),
    };
    const headings = () =>
        Array.from(host.querySelectorAll("h3")).map((h) => h.textContent);

    it("leads with Look and keeps every other control", () => {
        renderPanel(inLook(classic, "quiet"), facts);
        expect(headings()).toEqual([
            "Look",
            "Typeface",
            "Colour",
            "Spacing and shape",
        ]);
        expect(host.querySelector("#style-cornerRadius")).not.toBeNull();
        expect(host.textContent).toContain("Reset style…");
    });

    it("draws no Look row without one to offer", () => {
        renderPanel(classic, { ...facts, available: false });
        expect(headings()[0]).toBe("Typeface");
        renderPanel(classic);
        expect(headings()[0]).toBe("Typeface");
    });
});

describe("the preview's colours under a look", () => {
    it("draws a look in safe colours and leaves Classic's variables alone", () => {
        const plain = resolveStyleVariables(classic, options);
        expect(plain).not.toHaveProperty("--site-accent-text");
        const looks: LookId[] = ["quiet", "folio", "live"];
        for (const look of looks) {
            const vars = resolveStyleVariables(inLook(classic, look), options);
            expect(vars["--site-accent-text"], look).toBeTruthy();
            expect(vars["--site-rule"], look).toBeTruthy();
        }
    });

    it("keeps everything else when going back to Classic", () => {
        const styled: SiteStyle = {
            ...classic,
            fontPair: "editorial",
            look: "live",
        };
        expect(inLook(styled, null)).toEqual({
            ...classic,
            fontPair: "editorial",
        });
        expect(inLook(styled, "folio")).toEqual({ ...styled, look: "folio" });
    });
});
