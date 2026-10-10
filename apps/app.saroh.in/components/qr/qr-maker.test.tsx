// @vitest-environment jsdom
/**
 * The QR code maker (plan U5): what is on screen before a code is made is
 * a sample; "Make this code" or the first Download makes it, and only then
 * is a file drawn, from the code's own short link. Choosing a target and
 * place that already have a code selects it. A colour too light to scan
 * stops the download; a plan without its own look keeps Plain; a refusal
 * is said beside the control it is about and nothing chosen is lost.
 *
 * `react-dom/client` + `act`, as the other component tests do.
 */
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { code } from "@/lib/qr/fixtures.test-data";
import { buildQrTargets } from "@/lib/qr/targets";
import type { QrCodeView } from "@/lib/qr/types";
import { TOO_LIGHT } from "@/lib/qr/words";

import type { DownloadEnv } from "./qr-download";
import { QrMaker } from "./qr-maker";
import type { QrStyleLock } from "./qr-style-lock";
import { QR_KEPT_LINE, QR_LOCKED_LINE } from "./qr-style-lock";

const log: string[] = [];
const createQrCode = vi.fn();
const updateQrCode = vi.fn();
vi.mock("@/lib/qr/actions", () => ({
    createQrCode: (...args: unknown[]) => {
        log.push("create");
        return createQrCode(...args) as unknown;
    },
    updateQrCode: (...args: unknown[]) => {
        log.push("update");
        return updateQrCode(...args) as unknown;
    },
}));
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));
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

const ORIGIN = "https://glow.saroh.app";
const TARGETS = buildQrTargets({
    origin: ORIGIN,
    links: { shop: `${ORIGIN}/shop`, book: `${ORIGIN}/book` },
    products: [{ id: "p1", name: "Argan shampoo", slug: "argan-shampoo" }],
    pages: [],
});
const SWATCHES = ["#1c1c1a", "#5c2a48", "#1f4d3a"];
const LOCK: QrStyleLock = {
    line: QR_LOCKED_LINE,
    plan: "Plan B",
    kept: QR_KEPT_LINE,
    cta: "See Plan B",
    href: "/settings/billing?plan=b#change-plan",
};

const saved: { name: string; svg: string }[] = [];
const env: DownloadEnv = {
    rasterise: (svg) => {
        log.push("rasterise");
        saved.push({ name: "", svg });
        return Promise.resolve(new Blob(["png"], { type: "image/png" }));
    },
    save: (_blob, filename) => {
        log.push(`save ${filename}`);
    },
};

let host: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const onChangingDone = vi.fn();

async function draw(
    over: {
        codes?: QrCodeView[];
        lock?: QrStyleLock | null;
        changing?: QrCodeView | null;
        origin?: string | null;
        logo?: string | null;
    } = {},
) {
    await act(async () => {
        root.render(
            <QrMaker
                siteId="site_1"
                origin={over.origin === undefined ? ORIGIN : over.origin}
                displayOrigin={ORIGIN}
                targets={TARGETS}
                codes={over.codes ?? []}
                swatches={SWATCHES}
                lock={over.lock ?? null}
                business={{
                    name: "Glow Studio",
                    initials: "GS",
                    dataUrl: over.logo ?? null,
                    hasLogo: Boolean(over.logo),
                }}
                changing={over.changing ?? null}
                onChangingDone={onChangingDone}
                onSaved={onSaved}
                env={env}
            />,
        );
        await Promise.resolve();
    });
}

const q = <T extends Element = HTMLElement>(sel: string) =>
    host.querySelector<T>(sel);
const button = (name: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
        (b) => (b.getAttribute("aria-label") ?? b.textContent).trim() === name,
    );
const radio = (name: string) =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
        (b) =>
            (b.getAttribute("aria-label") ?? "") === name ||
            b.textContent.trim().startsWith(name),
    );
async function click(el: Element | null | undefined) {
    expect(el, "the control is on screen").toBeTruthy();
    await act(async () => {
        el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        // The action's promise, then the file's.
        for (let i = 0; i < 6; i++) await Promise.resolve();
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    log.length = 0;
    saved.length = 0;
    vi.clearAllMocks();
    createQrCode.mockImplementation(
        (_site: string, input: Record<string, unknown>) =>
            Promise.resolve({
                ok: true,
                data: code({
                    code: "h7c",
                    place: input.place as QrCodeView["place"],
                    label: (input.label as string | null) ?? null,
                    style: input.style as QrCodeView["style"],
                    color: input.color as string,
                    target: {
                        kind: input.targetKind as QrCodeView["target"]["kind"],
                        ref: (input.targetRef as string | null) ?? null,
                        name: "Booking page",
                        path: "/book",
                        missing: false,
                    },
                }),
            }),
    );
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("QrMaker — a sample until the code is made", () => {
    it("draws a sample of the address, with no link to copy or encode", async () => {
        await draw();
        expect(q("[data-qr-card]")?.getAttribute("data-qr-card")).toBe(
            "sample",
        );
        expect(q("[data-qr-link]")).toBeNull();
        expect(host.textContent).toContain("glow.saroh.app/q/…");
        expect(host.textContent).toContain(
            "A sample for now, for Booking page",
        );
        expect(button("Copy link")?.disabled).toBe(true);
        // The real targets, most useful first; the label follows the target.
        expect(
            Array.from(
                host
                    .querySelector('[role="radiogroup"]')
                    ?.querySelectorAll('[role="radio"]') ?? [],
            ).map((r) => r.querySelector("span")?.textContent),
        ).toEqual(["Booking page", "Online shop", "Website"]);
        expect(q("[data-qr-label]")?.textContent).toBe("Scan to book");
        expect(host.textContent).toContain(
            "Your UPI QR stays separate. This one opens your page, not a payment.",
        );
    });

    it("makes the code, then shows its real short link", async () => {
        await draw();
        await click(button("Make this code"));
        expect(createQrCode).toHaveBeenCalledWith("site_1", {
            targetKind: "BOOK",
            targetRef: null,
            place: "COUNTER",
            placeNote: null,
            label: "Scan to book",
            style: "PLAIN",
            color: "#1c1c1a",
        });
        expect(q("[data-qr-card]")?.getAttribute("data-qr-card")).toBe("code");
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/h7c");
        expect(host.textContent).toContain("opens Booking page");
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(showSuccess).toHaveBeenCalledWith(
            "Code made",
            "glow.saroh.app/q/h7c",
        );
        expect(button("Copy link")?.disabled).toBe(false);
    });

    it("makes the code before the first download, and names the file for it", async () => {
        await draw();
        await click(button("Download PNG"));
        expect(log).toEqual([
            "create",
            "rasterise",
            "save glow-studio-qr-h7c.png",
        ]);
        // The file is drawn from the saved code, label and all.
        expect(saved[0]?.svg).toContain("Scan to book");
        expect(saved[0]?.svg.startsWith("<svg")).toBe(true);

        // Made once: a second download saves nothing more.
        await click(button("Download SVG"));
        expect(log.slice(3)).toEqual(["save glow-studio-qr-h7c.svg"]);
        expect(createQrCode).toHaveBeenCalledTimes(1);
    });

    it("downloads nothing when the code can't be made", async () => {
        createQrCode.mockResolvedValueOnce({
            ok: false,
            error: "We couldn't make that code. Try again.",
        });
        await draw();
        await click(button("Download PNG"));
        expect(log).toEqual(["create"]);
        expect(showError).toHaveBeenCalledWith(
            "We couldn't make that code. Try again.",
        );
        expect(q("[data-qr-card]")?.getAttribute("data-qr-card")).toBe(
            "sample",
        );
    });

    it("can't make a code for a site with no web address", async () => {
        await draw({ origin: null });
        expect(button("Make this code")?.disabled).toBe(true);
        expect(button("Download PNG")?.disabled).toBe(true);
        expect(host.textContent).toContain("no web address yet");
    });
});

describe("QrMaker — never a duplicate by accident", () => {
    const mirror = code({
        code: "m2r",
        place: "MIRROR",
        label: "Book your next visit",
        color: "#1f4d3a",
    });

    it("selects the code already made for the target and place", async () => {
        await draw({ codes: [mirror] });
        expect(q("[data-qr-card]")?.getAttribute("data-qr-card")).toBe(
            "sample",
        );
        await click(radio("Mirror"));
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/m2r");
        // In its own saved look.
        expect(q("[data-qr-label]")?.textContent).toBe("Book your next visit");
        expect(radio("Colour #1f4d3a")?.getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(host.textContent).toContain("You already have this code.");

        await click(button("Download PNG"));
        expect(createQrCode).not.toHaveBeenCalled();
        expect(log).toEqual(["rasterise", "save glow-studio-qr-m2r.png"]);
    });

    it("makes a second one only when asked", async () => {
        await draw({ codes: [mirror] });
        await click(radio("Mirror"));
        await click(button("Make another"));
        expect(q("[data-qr-card]")?.getAttribute("data-qr-card")).toBe(
            "sample",
        );
        await click(button("Make this code"));
        expect(createQrCode).toHaveBeenCalledTimes(1);
        expect(createQrCode.mock.calls[0]?.[1]).toMatchObject({
            targetKind: "BOOK",
            place: "MIRROR",
        });
    });

    it("saves a changed look before the download", async () => {
        updateQrCode.mockResolvedValue({
            ok: true,
            data: { ...mirror, color: "#5c2a48" },
        });
        await draw({ codes: [mirror] });
        await click(radio("Mirror"));
        await click(radio("Colour #5c2a48"));
        expect(button("Save changes")).toBeTruthy();
        await click(button("Download PNG"));
        expect(updateQrCode).toHaveBeenCalledWith("site_1", "qr_m2r", {
            color: "#5c2a48",
        });
        expect(log).toEqual([
            "update",
            "rasterise",
            "save glow-studio-qr-m2r.png",
        ]);
    });
});

describe("QrMaker — a colour a phone can't read", () => {
    it("shows the alert and turns the downloads off; ink clears it", async () => {
        // A code can't be saved this light; one drawn so says so.
        await draw({ changing: code({ color: "#f0a92b" }) });
        expect(q('[role="alert"]')?.textContent).toBe(TOO_LIGHT);
        expect(button("Download PNG")?.disabled).toBe(true);
        expect(button("Download SVG")?.disabled).toBe(true);

        await click(radio("Ink"));
        expect(q('[role="alert"]')).toBeNull();
        expect(button("Download PNG")?.disabled).toBe(false);
        expect(button("Save changes")?.disabled).toBe(false);
    });

    it("says the API's refusal by the colour", async () => {
        createQrCode.mockResolvedValueOnce({
            ok: false,
            error: "That colour is too light for a phone to scan.",
            field: "color",
            reason: "too-light",
        });
        await draw();
        await click(button("Make this code"));
        expect(q('[role="alert"]')?.textContent).toBe(TOO_LIGHT);
        expect(showError).not.toHaveBeenCalled();
    });
});

describe("QrMaker — a plan without its own look", () => {
    it("keeps Plain, says the one line and dims the colours past ink", async () => {
        await draw({ lock: LOCK });
        const branded = radio("Logo + colour");
        expect(branded?.getAttribute("aria-disabled")).toBe("true");
        await click(branded);
        expect(radio("Plain")?.getAttribute("aria-checked")).toBe("true");

        const line = q("[data-qr-lock]");
        expect(line?.textContent).toBe(
            "Logo, colours, print files and scan counts come with Plan B.",
        );
        const link = line?.querySelector("a");
        expect(link?.getAttribute("href")).toBe(
            "/settings/billing?plan=b#change-plan",
        );
        expect(link?.getAttribute("aria-label")).toBe("See Plan B");

        expect(radio("Ink")?.getAttribute("aria-disabled")).toBeNull();
        const plum = radio("Colour #5c2a48");
        expect(plum?.getAttribute("aria-disabled")).toBe("true");
        expect(plum?.className).toContain("opacity-35");
        await click(plum);
        expect(radio("Ink")?.getAttribute("aria-checked")).toBe("true");

        // A plain code is for everyone.
        await click(button("Download PNG"));
        expect(createQrCode.mock.calls[0]?.[1]).toMatchObject({
            style: "PLAIN",
            color: "#1c1c1a",
        });
        expect(log.at(-1)).toBe("save glow-studio-qr-h7c.png");
    });

    it("lets a code already in its own look keep it, and says so", async () => {
        await draw({
            lock: LOCK,
            changing: code({ style: "BRANDED", color: "#5c2a48" }),
        });
        expect(radio("Logo + colour")?.getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(
            radio("Colour #5c2a48")?.getAttribute("aria-disabled"),
        ).toBeNull();
        expect(q("[data-qr-lock]")?.textContent).toContain(QR_KEPT_LINE);
    });

    it("reads a refused branded code as the lock, never as an error", async () => {
        createQrCode.mockResolvedValueOnce({
            ok: false,
            error: "Your own look isn't in your plan",
            plan: {
                code: "MODULE_LOCKED",
                title: "Your own look isn't in your plan",
                body: "",
                cta: "See Plan B",
                upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
                limit: null,
                used: null,
            },
        });
        await draw();
        await click(radio("Logo + colour"));
        await click(button("Make this code"));
        expect(showError).not.toHaveBeenCalled();
        expect(q("[data-qr-lock]")?.textContent).toContain("Plan B");
        expect(radio("Plain")?.getAttribute("aria-checked")).toBe("true");
        expect(radio("Logo + colour")?.getAttribute("aria-disabled")).toBe(
            "true",
        );
    });
});

describe("QrMaker — branded", () => {
    it("draws the initials and points at where the logo is set", async () => {
        await draw();
        await click(radio("Logo + colour"));
        expect(q("[data-qr-logo-box] text")?.textContent).toBe("GS");
        expect(host.textContent).toContain(
            "No logo yet, so your initials stand in.",
        );
        expect(
            Array.from(host.querySelectorAll("a"))
                .find((a) => a.textContent === "Add your logo")
                ?.getAttribute("href"),
        ).toBe("/settings/organization?section=identity&edit=logo");
    });

    it("draws the logo, and puts it inside the downloaded file", async () => {
        const logo = "data:image/png;base64,iVBORw==";
        await draw({ logo });
        await click(radio("Logo + colour"));
        expect(q("[data-qr-logo-box] image")?.getAttribute("href")).toBe(logo);
        expect(host.textContent).not.toContain("No logo yet");
        await click(button("Download SVG"));
        expect(createQrCode.mock.calls[0]?.[1]).toMatchObject({
            style: "BRANDED",
        });
        expect(log.at(-1)).toBe("save glow-studio-qr-h7c.svg");
    });
});

describe("QrMaker — the API says no", () => {
    it("says why beside the target and keeps everything chosen", async () => {
        createQrCode.mockResolvedValueOnce({
            ok: false,
            error: "Your online shop isn't open on this site, so a code can't open it yet.",
            field: "target",
            reason: "shop-closed",
        });
        await draw();
        await click(radio("Online shop"));
        await click(radio("Flyer"));
        await click(button("Make this code"));

        expect(q('[role="alert"]')?.textContent).toBe(
            "Your online shop isn't open on this site, so a code can't open it yet.",
        );
        expect(showError).not.toHaveBeenCalled();
        expect(radio("Online shop")?.getAttribute("aria-checked")).toBe("true");
        expect(radio("Flyer")?.getAttribute("aria-checked")).toBe("true");
        expect(q("[data-qr-label]")?.textContent).toBe("Scan to order");

        // Choosing something else clears it.
        await click(radio("Website"));
        expect(q('[role="alert"]')).toBeNull();
    });
});

describe("QrMaker — Change re-points a code", () => {
    it("sends only what changed and keeps the short link", async () => {
        const counter = code();
        updateQrCode.mockResolvedValue({
            ok: true,
            data: {
                ...counter,
                target: {
                    kind: "SITE",
                    ref: null,
                    name: "Website",
                    path: "/",
                    missing: false,
                },
            },
        });
        await draw({ codes: [counter], changing: counter });
        expect(q("[data-qr-maker]")?.getAttribute("data-qr-maker")).toBe(
            "change",
        );
        expect(host.textContent).toContain("Its link stays the same");

        await click(radio("Website"));
        // Still that code: the pickers re-point it rather than re-match.
        expect(q("[data-qr-link]")?.textContent).toBe("glow.saroh.app/q/h7c");
        await click(button("Save changes"));
        expect(updateQrCode).toHaveBeenCalledWith("site_1", "qr_h7c", {
            targetKind: "SITE",
            targetRef: null,
        });
        expect(createQrCode).not.toHaveBeenCalled();
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(onChangingDone).toHaveBeenCalledTimes(1);
    });

    it("finds a product behind More…, and Cancel leaves the code alone", async () => {
        const counter = code();
        await draw({ codes: [counter], changing: counter });
        await click(button("More… a product or a page"));
        await click(
            Array.from(host.querySelectorAll("li button")).find((b) =>
                b.textContent.startsWith("Argan shampoo"),
            ),
        );
        // What was chosen joins the cards.
        expect(radio("Argan shampoo")?.getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(host.textContent).toContain("glow.saroh.app/shop/argan-shampoo");
        await click(button("Cancel"));
        expect(onChangingDone).toHaveBeenCalledTimes(1);
        expect(updateQrCode).not.toHaveBeenCalled();
    });

    it("moves the choice with the arrow keys", async () => {
        await draw();
        const group = Array.from(
            host.querySelectorAll('[role="radiogroup"]'),
        ).at(1);
        await act(async () => {
            group?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
            await Promise.resolve();
        });
        expect(radio("Mirror")?.getAttribute("aria-checked")).toBe("true");
        expect(radio("Mirror")?.tabIndex).toBe(0);
        expect(radio("Counter")?.tabIndex).toBe(-1);
    });
});
