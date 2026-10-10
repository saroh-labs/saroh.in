// @vitest-environment jsdom
/**
 * "Ready to print" (plan U6): four PDFs of the saved code, fetched through
 * the app's own route. No code yet, or a plan without print files, shows
 * the section with no button that would do nothing; a refusal is said in
 * the API's words on the card it is about; a file that failed can be tried
 * again while the others stay usable; and a file that went out with
 * initials in place of a logo says so, and only why as far as is known.
 *
 * `react-dom/client` + `act`, as the other component tests do.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { code } from "@/lib/qr/fixtures.test-data";
import type { PrintEnv } from "@/lib/qr/print";
import { printInitialsNote } from "@/lib/qr/print";
import type { QrCodeView } from "@/lib/qr/types";

import {
    PRINT_NEEDS_ADDRESS,
    PRINT_NEEDS_CODE,
    QrPrintSlot,
} from "./qr-print-slot";
import type { QrStyleLock } from "./qr-style-lock";
import { QR_KEPT_LINE, QR_LOCKED_LINE } from "./qr-style-lock";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children?: ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const LOCK: QrStyleLock = {
    line: QR_LOCKED_LINE,
    plan: "Plan B",
    kept: QR_KEPT_LINE,
    cta: "See Plan B",
    href: "/settings/billing?plan=b#change-plan",
};

const pdf = (name: string, logo = "none") =>
    new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
        status: 200,
        headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="${name}"`,
            "x-saroh-qr-logo": logo,
        },
    });
const refusal = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

const asked: string[] = [];
const saved: string[] = [];
let answers: (() => Promise<Response>)[] = [];
const env: PrintEnv = {
    fetch: (path) => {
        asked.push(path);
        const next = answers.shift();
        return next ? next() : Promise.reject(new Error("no answer"));
    },
    save: (_blob, filename) => {
        saved.push(filename);
    },
};

let host: HTMLDivElement;
let root: Root;

async function draw(
    over: {
        code?: QrCodeView | null;
        lock?: QrStyleLock | null;
        hasLogo?: boolean;
        dataUrl?: string | null;
    } = {},
) {
    await act(async () => {
        root.render(
            <QrPrintSlot
                siteId="site_1"
                code={over.code === undefined ? code() : over.code}
                lock={over.lock ?? null}
                business={{
                    name: "Glow Studio",
                    initials: "GS",
                    hasLogo: over.hasLogo ?? false,
                    dataUrl: over.dataUrl ?? null,
                }}
                env={env}
            />,
        );
        await Promise.resolve();
    });
}

const q = <T extends Element = HTMLElement>(sel: string) =>
    host.querySelector<T>(sel);
const card = (format: string) => q(`[data-qr-print-format="${format}"]`);
const buttonOf = (format: string) =>
    card(format)?.querySelector<HTMLButtonElement>("button") ?? null;
const buttons = () =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button"));
async function click(el: Element | null | undefined) {
    expect(el, "the control is on screen").toBeTruthy();
    await act(async () => {
        el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        // The fetch, its body, then the save.
        for (let i = 0; i < 8; i++) await Promise.resolve();
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    asked.length = 0;
    saved.length = 0;
    answers = [];
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("QrPrintSlot — what it shows", () => {
    it("draws the four files at their real sizes, each with its own download", async () => {
        await draw();
        expect(q("[data-qr-print]")?.getAttribute("data-qr-print")).toBe(
            "ready",
        );
        expect(q("h4")?.textContent).toBe("Ready to print");
        const said = ["standee", "tent", "sticker", "card"].map(
            (f) => card(f)?.textContent ?? "",
        );
        expect(said[0]).toContain("Counter standee");
        expect(said[0]).toContain("A5 · 148 × 210 mm");
        expect(said[1]).toContain("Table tent");
        expect(said[1]).toContain("100 × 140 mm");
        expect(said[2]).toContain("Round sticker");
        expect(said[2]).toContain("60 mm across");
        expect(said[3]).toContain("Card");
        expect(said[3]).toContain("89 × 51 mm");
        expect(buttons().map((b) => b.textContent)).toEqual([
            "Download PDF",
            "Download PDF",
            "Download PDF",
            "Download PDF",
        ]);
        // Each paper is the real file's shape, with the saved code on it.
        expect(
            q<HTMLElement>('[data-qr-print-paper="standee"]')?.style
                .aspectRatio,
        ).toBe("148 / 210");
        expect(
            q<HTMLElement>('[data-qr-print-paper="card"]')?.style.aspectRatio,
        ).toBe("89 / 51");
        expect(host.querySelectorAll('[data-qr-art="code"]')).toHaveLength(4);
    });

    it("says to make the code first, with no buttons, while it is a sample", async () => {
        await draw({ code: null });
        expect(q("[data-qr-print]")?.getAttribute("data-qr-print")).toBe(
            "sample",
        );
        expect(q('[role="note"]')?.textContent).toBe(PRINT_NEEDS_CODE);
        expect(buttons()).toHaveLength(0);
        // Nothing truthful to draw yet: the paper, and where the code goes.
        expect(host.querySelectorAll("[data-qr-art]")).toHaveLength(0);
        expect(host.querySelectorAll("[data-qr-print-empty]")).toHaveLength(4);
    });

    it("says a site with no address has no link to print", async () => {
        await draw({ code: code({ link: null }) });
        expect(q('[role="note"]')?.textContent).toBe(PRINT_NEEDS_ADDRESS);
        expect(buttons()).toHaveLength(0);
    });

    it("is a preview with the way up, and no downloads, when the plan leaves print files off", async () => {
        await draw({ lock: LOCK });
        expect(q("[data-qr-print]")?.getAttribute("data-qr-print")).toBe(
            "locked",
        );
        const line = q("[data-qr-print-lock]");
        expect(line?.textContent).toBe(
            "Logo, colours, print files and scan counts come with Plan B.",
        );
        const link = line?.querySelector("a");
        expect(link?.getAttribute("href")).toBe(
            "/settings/billing?plan=b#change-plan",
        );
        expect(link?.getAttribute("aria-label")).toBe("See Plan B");
        expect(buttons()).toHaveLength(0);
        // Still the four files, so it is clear what the plan adds.
        expect(host.querySelectorAll("[data-qr-print-format]")).toHaveLength(4);
    });
});

describe("QrPrintSlot — downloading", () => {
    it("fetches one file through the app's route and saves it under the API's name", async () => {
        answers = [() => Promise.resolve(pdf("glow-studio-qr-h7c-tent.pdf"))];
        await draw();
        await click(buttonOf("tent"));
        expect(asked).toEqual([
            "/api/qr-codes/site_1/qr_h7c/print?format=tent",
        ]);
        expect(saved).toEqual(["glow-studio-qr-h7c-tent.pdf"]);
        expect(buttonOf("tent")?.textContent).toBe("Download PDF");
        expect(q('[role="alert"]')).toBeNull();
        expect(q("[data-qr-print-initials]")).toBeNull();
    });

    it("shows progress on the pressed button and leaves the others usable", async () => {
        let finish: (res: Response) => void = () => undefined;
        answers = [
            () =>
                new Promise<Response>((resolve) => {
                    finish = resolve;
                }),
            () => Promise.resolve(pdf("glow-studio-qr-h7c-card.pdf")),
        ];
        await draw();
        await click(buttonOf("standee"));
        expect(buttonOf("standee")?.textContent).toBe("Making the PDF…");
        expect(buttonOf("standee")?.disabled).toBe(true);
        expect(buttonOf("standee")?.getAttribute("aria-busy")).toBe("true");
        expect(buttonOf("card")?.disabled).toBe(false);

        // Another file, while the first is still being made.
        await click(buttonOf("card"));
        expect(saved).toEqual(["glow-studio-qr-h7c-card.pdf"]);
        expect(buttonOf("standee")?.textContent).toBe("Making the PDF…");

        await act(async () => {
            finish(pdf("glow-studio-qr-h7c-standee.pdf"));
            for (let i = 0; i < 8; i++) await Promise.resolve();
        });
        expect(saved).toEqual([
            "glow-studio-qr-h7c-card.pdf",
            "glow-studio-qr-h7c-standee.pdf",
        ]);
        expect(buttonOf("standee")?.textContent).toBe("Download PDF");
    });

    it("says a failed download on its card, and the same button tries again", async () => {
        answers = [
            () => Promise.reject(new Error("offline")),
            () => Promise.resolve(pdf("glow-studio-qr-h7c-sticker.pdf")),
        ];
        await draw();
        await click(buttonOf("sticker"));
        expect(
            card("sticker")?.querySelector('[role="alert"]')?.textContent,
        ).toBe("Couldn't reach Saroh. Check your connection and try again.");
        expect(buttonOf("sticker")?.textContent).toBe("Try again");
        expect(saved).toEqual([]);
        // The other three are as they were.
        expect(buttonOf("standee")?.textContent).toBe("Download PDF");

        await click(buttonOf("sticker"));
        expect(asked).toHaveLength(2);
        expect(saved).toEqual(["glow-studio-qr-h7c-sticker.pdf"]);
        expect(q('[role="alert"]')).toBeNull();
        expect(buttonOf("sticker")?.textContent).toBe("Download PDF");
    });

    it("says ours when the server failed without words", async () => {
        answers = [() => Promise.resolve(refusal(502, {}))];
        await draw();
        await click(buttonOf("card"));
        expect(q('[role="alert"]')?.textContent).toBe(
            "Couldn't make the PDF. Try again.",
        );
    });
});

describe("QrPrintSlot — a refusal", () => {
    it.each([
        [
            "retired",
            "This code is retired, so it can't be printed.",
            "This code is retired, so it can't be printed.",
        ],
        [
            "no-address",
            "This site has no Saroh address yet, so the code has no link to print.",
            "This site has no Saroh address yet, so the code has no link to print.",
        ],
        [
            "unencodable",
            "This code's link is too long to print as a QR.",
            "This code's link is too long to print as a QR.",
        ],
        // No sentence came with it: ours for the reason.
        [
            "no-address",
            "",
            "This site has no web address yet, so the code has no link to print.",
        ],
    ])("says the API's words for %s", async (reason, error, shown) => {
        answers = [() => Promise.resolve(refusal(409, { error, reason }))];
        await draw();
        await click(buttonOf("standee"));
        expect(
            card("standee")?.querySelector('[role="alert"]')?.textContent,
        ).toBe(shown);
        expect(saved).toEqual([]);
    });

    it("says a code that is gone, and a role that may not, by status", async () => {
        answers = [
            () => Promise.resolve(refusal(404, {})),
            () => Promise.resolve(refusal(403, {})),
        ];
        await draw();
        await click(buttonOf("standee"));
        expect(q('[role="alert"]')?.textContent).toBe(
            "This code wasn't found. Reload and try again.",
        );
        await click(buttonOf("standee"));
        expect(q('[role="alert"]')?.textContent).toBe(
            "Your role can't download this file.",
        );
    });

    it("turns into the locked preview when the plan refuses, never an error", async () => {
        answers = [
            () =>
                Promise.resolve(
                    refusal(403, {
                        error: "QR print files aren't on your plan.",
                        plan: {
                            code: "MODULE_LOCKED",
                            title: "QR print files aren't on your plan.",
                            body: "",
                            cta: "See Plan B",
                            upgradeTo: {
                                planId: "b",
                                name: "Plan B",
                                pricePaise: 100,
                            },
                            limit: null,
                            used: null,
                        },
                    }),
                ),
        ];
        await draw();
        await click(buttonOf("tent"));
        expect(q("[data-qr-print]")?.getAttribute("data-qr-print")).toBe(
            "locked",
        );
        expect(q("[data-qr-print-lock]")?.textContent).toBe(
            "Logo, colours, print files and scan counts come with Plan B.",
        );
        expect(q('[role="alert"]')).toBeNull();
        expect(buttons()).toHaveLength(0);
    });
});

describe("QrPrintSlot — initials in place of the logo", () => {
    const branded = () => code({ style: "BRANDED" });

    it("says the file has initials because the logo is a WebP", async () => {
        answers = [
            () =>
                Promise.resolve(pdf("glow-studio-qr-h7c-card.pdf", "initials")),
        ];
        await draw({
            code: branded(),
            hasLogo: true,
            dataUrl: "data:image/webp;base64,AAAA",
        });
        await click(buttonOf("card"));
        expect(saved).toEqual(["glow-studio-qr-h7c-card.pdf"]);
        const note = q("[data-qr-print-initials]");
        expect(note?.getAttribute("role")).toBe("status");
        expect(note?.textContent).toBe(
            "This file has your initials in place of your logo. Print files can use a PNG or JPG logo, and yours is a WebP image.",
        );
    });

    it("says nothing when the logo went in, the code is plain, or there is no logo", async () => {
        answers = [
            () => Promise.resolve(pdf("a.pdf", "image")),
            () => Promise.resolve(pdf("b.pdf", "initials")),
        ];
        await draw({
            code: branded(),
            hasLogo: true,
            dataUrl: "data:image/png;base64,AAAA",
        });
        await click(buttonOf("card"));
        expect(q("[data-qr-print-initials]")).toBeNull();

        // No logo set: the screen already draws initials, nothing to explain.
        await draw({ code: branded(), hasLogo: false });
        await click(buttonOf("card"));
        expect(q("[data-qr-print-initials]")).toBeNull();
    });

    it("claims only what is known about why", () => {
        expect(printInitialsNote({ hasLogo: false, dataUrl: null })).toBeNull();
        // Read here as a PNG: the API couldn't have it just then.
        expect(
            printInitialsNote({
                hasLogo: true,
                dataUrl: "data:image/png;base64,AAAA",
            }),
        ).toBe(
            "This file has your initials in place of your logo. Your logo couldn't be read just now. Download it again to try once more.",
        );
        // Not read here either: the rule, without guessing.
        expect(printInitialsNote({ hasLogo: true, dataUrl: null })).toBe(
            "This file has your initials in place of your logo. Print files can use a PNG or JPG logo, and yours couldn't be used this time.",
        );
    });
});
