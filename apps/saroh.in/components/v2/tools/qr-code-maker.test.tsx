// @vitest-environment jsdom
import { tooLightToScan } from "@saroh/ui/lib/qr-art";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { qrCodeMaker as copy } from "@/content/qr-code-maker";
import type { QrUnlockResult } from "@/lib/qr-code-maker";
import { QR_SWATCHES } from "@/lib/qr-code-maker";

const files = vi.hoisted(() => ({
    saveFile: vi.fn(),
    svgToPng: vi.fn(),
    // jsdom's Blob can't be read back, so the SVG file is kept as its text.
    svgBlob: (svg: string) => ({ svg }) as unknown as Blob,
}));
vi.mock("./qr-download", async (original) => ({
    ...(await original<Record<string, unknown>>()),
    saveFile: files.saveFile,
    svgToPng: files.svgToPng,
    svgBlob: files.svgBlob,
}));

import { QrCodeMaker } from "./qr-code-maker";

/**
 * The QR code maker's states (QR codes plan U9): the code follows what is
 * typed, a logo is read in the page and never sent, a colour too light to
 * scan says so, and an email unlocks the downloads. The one request the
 * page makes carries the email and nothing about the code.
 */

const fetchMock = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    files.svgToPng.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    files.saveFile.mockReset();
    files.svgToPng.mockReset();
});

const answer = (body: QrUnlockResult, status = 200) =>
    fetchMock.mockResolvedValue({
        ok: status < 400,
        status,
        json: () => Promise.resolve(body),
    });

const linkField = () => screen.getByLabelText(copy.link.field);
/** An element the page must have drawn. */
function found<T extends Element>(selector: string): T {
    const el = document.querySelector<T>(selector);
    if (!el) throw new Error(`${selector} is not on the page`);
    return el;
}
const code = () => found<SVGElement>("svg[data-qr-art]");
const dots = () => code().querySelector("path")?.getAttribute("d");
const type = (el: HTMLElement, value: string) =>
    fireEvent.change(el, { target: { value } });

async function unlockWith(email: string) {
    type(screen.getByLabelText(copy.gate.emailField), email);
    fireEvent.click(screen.getByRole("button", { name: copy.gate.submit }));
    await screen.findByRole("button", { name: copy.downloads.png });
}

describe("the code", () => {
    it("opens on a sample that says it is one, with the logo placeholder in its box", () => {
        render(<QrCodeMaker />);
        expect(
            screen.getByRole("img", { name: copy.preview.sampleAlt }),
        ).toBeTruthy();
        expect(screen.getByText(copy.preview.sample)).toBeTruthy();
        expect(code().getAttribute("data-qr-art")).toBe("code");
        expect(
            document.querySelector("[data-logo-placeholder]")?.textContent,
        ).toBe("logo");
        expect(code().querySelector("[data-qr-logo-box]")).toBeTruthy();
    });

    it("follows the link as it is typed", () => {
        render(<QrCodeMaker />);
        const sample = dots();
        type(linkField(), "shop.example.com/book");
        expect(
            screen.getByRole("img", {
                name: "QR code for https://shop.example.com/book",
            }),
        ).toBeTruthy();
        const first = dots();
        expect(first).not.toBe(sample);
        type(linkField(), "shop.example.com/menu");
        expect(dots()).not.toBe(first);
        expect(screen.queryByText(copy.preview.sample)).toBeNull();
    });

    it("never doubles a pasted scheme, and keeps a pasted http", () => {
        render(<QrCodeMaker />);
        type(linkField(), "https://shop.example.com");
        expect((linkField() as HTMLInputElement).value).toBe(
            "shop.example.com",
        );
        expect(
            screen.getByRole("img", {
                name: "QR code for https://shop.example.com",
            }),
        ).toBeTruthy();
        type(linkField(), "http://old.example.com");
        expect(document.querySelector("[data-scheme]")?.textContent).toBe(
            "http://",
        );
        expect(
            screen.getByRole("img", {
                name: "QR code for http://old.example.com",
            }),
        ).toBeTruthy();
    });

    it("says when a link is too long for any code", () => {
        render(<QrCodeMaker />);
        type(linkField(), `shop.example.com/${"a".repeat(3000)}`);
        expect(screen.getByRole("alert").textContent).toBe(
            copy.preview.tooLong,
        );
    });

    it("draws the label on a pill in the code's colour, and none when empty", () => {
        render(<QrCodeMaker />);
        expect(document.querySelector("[data-qr-label]")).toBeNull();
        const field = screen.getByLabelText(copy.label.label);
        expect(field.getAttribute("placeholder")).toBe("Scan to book");
        type(field, "Scan to book");
        const pill = found<HTMLElement>("[data-qr-label]");
        expect(pill.textContent).toBe("Scan to book");
        expect(pill.style.backgroundColor).toBe("rgb(28, 28, 26)");
    });
});

describe("the colour", () => {
    it("offers the five swatches, Ink chosen, and recolours the code", () => {
        render(<QrCodeMaker />);
        const swatches = screen
            .getByRole("group", { name: copy.colour.label })
            .querySelectorAll("button");
        expect(swatches).toHaveLength(5);
        expect(
            screen.getByRole("button", { name: "Ink", pressed: true }),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Navy" }));
        expect(
            screen.getByRole("button", { name: "Navy", pressed: true }),
        ).toBeTruthy();
        expect(code().querySelector("path")?.getAttribute("fill")).toBe(
            "#1E3A5F",
        );
        expect(screen.queryByRole("alert")).toBeNull();
    });

    it("offers only colours that scan", () => {
        for (const swatch of QR_SWATCHES) {
            expect(tooLightToScan(swatch.hex), swatch.name).toBe(false);
        }
    });
});

describe("the logo", () => {
    const choose = (file: File) =>
        fireEvent.change(screen.getByLabelText(copy.logo.add), {
            target: { files: [file] },
        });

    it("is read in the page and drawn in the box, and nothing is uploaded", async () => {
        render(<QrCodeMaker />);
        choose(new File(["logo-bytes"], "logo.png", { type: "image/png" }));
        await waitFor(() => expect(code().querySelector("image")).toBeTruthy());
        expect(code().querySelector("image")?.getAttribute("href")).toMatch(
            /^data:image\/png;base64,/,
        );
        expect(document.querySelector("[data-logo-placeholder]")).toBeNull();
        expect(screen.getByLabelText(copy.logo.change)).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a file that isn't a picture, and one that is too big", async () => {
        render(<QrCodeMaker />);
        choose(new File(["%PDF"], "menu.pdf", { type: "application/pdf" }));
        expect((await screen.findByRole("alert")).textContent).toBe(
            copy.logo.notPicture,
        );
        const big = new File(["x"], "big.png", { type: "image/png" });
        Object.defineProperty(big, "size", { value: 3 * 1024 * 1024 });
        choose(big);
        await waitFor(() =>
            expect(screen.getByRole("alert").textContent).toBe(
                copy.logo.tooBig,
            ),
        );
        expect(code().querySelector("image")).toBeNull();
    });
});

describe("the email gate", () => {
    it("refuses an incomplete email in the page, sending nothing and unlocking nothing", () => {
        render(<QrCodeMaker />);
        expect(screen.getByText(copy.gate.title)).toBeTruthy();
        // An unverified address can't say yes to news: no tickbox.
        expect(screen.queryByRole("checkbox")).toBeNull();
        type(screen.getByLabelText(copy.gate.emailField), "owner@shop");
        fireEvent.click(screen.getByRole("button", { name: copy.gate.submit }));
        expect(screen.getByRole("alert").textContent).toBe(
            "That email looks incomplete. Check it and try again.",
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(
            screen.queryByRole("button", { name: copy.downloads.png }),
        ).toBeNull();
    });

    it("unlocks PNG and SVG with a valid email, sending the email and nothing about the code", async () => {
        answer({ unlocked: true, emailed: "sent" });
        render(<QrCodeMaker />);
        type(linkField(), "private.example.com/secret-offer");
        type(screen.getByLabelText(copy.label.label), "Scan me");
        await unlockWith(" owner@shop.example.com ");

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(path).toBe("/api/qr-code-maker/unlock");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            email: "owner@shop.example.com",
        });
        expect(init.body as string).not.toContain("private.example.com");
        expect(init.body as string).not.toContain("Scan me");

        expect(
            screen.getByRole("button", { name: copy.downloads.svgName }),
        ).toBeTruthy();
        expect(screen.getByRole("status").textContent).toBe(
            copy.downloads.emailed.sent,
        );
        expect(screen.queryByLabelText(copy.gate.emailField)).toBeNull();
    });

    it.each([
        ["limited", copy.downloads.emailed.limited],
        ["not-sent", copy.downloads.emailed["not-sent"]],
    ] as const)(
        "still unlocks when no email went (%s), and says so",
        async (emailed, line) => {
            answer({ unlocked: true, emailed });
            render(<QrCodeMaker />);
            await unlockWith("owner@shop.example.com");
            expect(screen.getByRole("status").textContent).toBe(line);
        },
    );

    it.each([
        ["rate-limited", 429, copy.gate.rateLimited],
        ["unavailable", 502, copy.gate.failed],
        ["bad-email", 400, copy.gate.badEmail],
    ] as const)(
        "says %s in the page's words and keeps the code and the email",
        async (failure, status, line) => {
            answer({ unlocked: false, failure }, status);
            render(<QrCodeMaker />);
            type(linkField(), "shop.example.com");
            const before = dots();
            const email = screen.getByLabelText(copy.gate.emailField);
            type(email, "owner@shop.example.com");
            fireEvent.click(
                screen.getByRole("button", { name: copy.gate.submit }),
            );
            expect((await screen.findByRole("alert")).textContent).toBe(line);
            expect(dots()).toBe(before);
            expect((email as HTMLInputElement).value).toBe(
                "owner@shop.example.com",
            );
            expect(
                screen.getByRole("button", { name: copy.gate.submit }),
            ).toHaveProperty("disabled", false);
        },
    );

    it("says so when the request never arrives, and the code stays usable", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        render(<QrCodeMaker />);
        type(screen.getByLabelText(copy.gate.emailField), "a@shop.example.com");
        fireEvent.click(screen.getByRole("button", { name: copy.gate.submit }));
        expect((await screen.findByRole("alert")).textContent).toBe(
            copy.gate.failed,
        );
        type(linkField(), "shop.example.com");
        expect(
            screen.getByRole("img", {
                name: "QR code for https://shop.example.com",
            }),
        ).toBeTruthy();
    });
});

describe("the downloads", () => {
    // Braces: a function returned from a hook is run as its teardown.
    beforeEach(() => {
        answer({ unlocked: true, emailed: "sent" });
    });

    it("saves the SVG as my-qr-code.svg, made in the page from the link, colour and label", async () => {
        render(<QrCodeMaker />);
        type(linkField(), "shop.example.com/book");
        type(screen.getByLabelText(copy.label.label), "Scan to book");
        fireEvent.click(screen.getByRole("button", { name: "Plum" }));
        await unlockWith("owner@shop.example.com");
        fireEvent.click(
            screen.getByRole("button", { name: copy.downloads.svgName }),
        );
        const [file, name] = files.saveFile.mock.calls[0] as unknown as [
            { svg: string },
            string,
        ];
        expect(name).toBe("my-qr-code.svg");
        const { svg } = file;
        expect(svg).toMatch(/^<svg [^>]*width="1200" height="1200"/);
        expect(svg).toContain('fill="#5C2A48"');
        expect(svg).toContain(">Scan to book</text>");
        // Only the gate's call was ever made.
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("saves the PNG as my-qr-code.png, drawn 1200 square from the same SVG", async () => {
        render(<QrCodeMaker />);
        type(linkField(), "shop.example.com");
        await unlockWith("owner@shop.example.com");
        fireEvent.click(
            screen.getByRole("button", { name: copy.downloads.png }),
        );
        await waitFor(() => expect(files.saveFile).toHaveBeenCalled());
        const [svg, size] = files.svgToPng.mock.calls[0] as [string, number];
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(size).toBe(1200);
        expect(files.saveFile.mock.calls[0]?.[1]).toBe("my-qr-code.png");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("says to try the SVG when the browser can't make a PNG", async () => {
        files.svgToPng.mockRejectedValue(new Error("no canvas"));
        render(<QrCodeMaker />);
        type(linkField(), "shop.example.com");
        await unlockWith("owner@shop.example.com");
        fireEvent.click(
            screen.getByRole("button", { name: copy.downloads.png }),
        );
        expect((await screen.findByRole("alert")).textContent).toBe(
            copy.downloads.pngFailed,
        );
        expect(files.saveFile).not.toHaveBeenCalled();
    });

    it("won't download the sample or a colour that won't scan, and says why", async () => {
        render(<QrCodeMaker />);
        await unlockWith("owner@shop.example.com");
        const png = screen.getByRole("button", { name: copy.downloads.png });
        expect(png.getAttribute("aria-disabled")).toBe("true");
        expect(screen.getByText(copy.downloads.needLink)).toBeTruthy();
        fireEvent.click(png);
        fireEvent.click(
            screen.getByRole("button", { name: copy.downloads.svgName }),
        );
        expect(files.saveFile).not.toHaveBeenCalled();

        type(linkField(), "shop.example.com");
        expect(png.getAttribute("aria-disabled")).toBeNull();
    });
});
