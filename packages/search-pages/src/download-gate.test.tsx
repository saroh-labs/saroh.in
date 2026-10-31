// DownloadGate (plan 2026-10-31-002, U9): both contact modes, each refusal, no provider, the file and its other formats.
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DownloadResult } from "./components/download-gate";
import {
    DOWNLOAD_GATE_WORDS,
    DownloadGate,
    DownloadGateProvider,
    phoneDigits,
} from "./components/download-gate";
import { unknownClasses } from "./test-classes";
import { saveFile } from "./tools/download";

vi.mock("./tools/download", () => ({ saveFile: vi.fn() }));

const FILES = [
    { name: "gst-invoice-format.xlsx", format: "Excel" },
    { name: "gst-invoice-format.docx", format: "Word" },
];
const own = readFileSync(
    join(__dirname, "components", "download-page.css"),
    "utf8",
);

const fetchMock = vi.fn();
beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("xlsx bytes"));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.mocked(saveFile).mockClear();
});

function gate(
    submit?: (c: unknown) => Promise<DownloadResult>,
    extra: { challenge?: ReactNode } = {},
) {
    const g = <DownloadGate slug="gst-invoice-format" files={FILES} />;
    return render(
        submit ? (
            <DownloadGateProvider
                onSubmit={submit}
                privacy="/privacy"
                challenge={extra.challenge}
            >
                {g}
            </DownloadGateProvider>
        ) : (
            g
        ),
    );
}

const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = () =>
    act(() =>
        Promise.resolve(
            fireEvent.click(
                screen.getByRole("button", { name: "Send me the files" }),
            ),
        ),
    );

describe("<DownloadGate>", () => {
    it("WhatsApp: checks the number's shape, sends +91 and the 10 digits, downloads the first file and links the other", async () => {
        const submit = vi
            .fn()
            .mockResolvedValue({ ok: true, emailed: "none" } as const);
        const { container } = gate(submit);
        expect(screen.getByRole("radio", { name: "WhatsApp" })).toHaveProperty(
            "checked",
            true,
        );
        expect(screen.getByText("+91")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Privacy" })).toHaveProperty(
            "pathname",
            "/privacy",
        );
        expect(container.querySelector("input[type=checkbox]")).toBeNull();
        expect(unknownClasses(container, own)).toEqual([]);

        type("WhatsApp number", "98765 4321");
        await press();
        expect(screen.getByRole("alert").textContent).toBe(
            DOWNLOAD_GATE_WORDS.shortPhone,
        );
        expect(submit).not.toHaveBeenCalled();

        type("WhatsApp number", "98765 43210");
        await press();
        expect(submit).toHaveBeenCalledWith({ phone: "+919876543210" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/downloads/gst-invoice-format/gst-invoice-format.xlsx",
        );
        expect(saveFile).toHaveBeenCalledWith(
            expect.any(Blob),
            "gst-invoice-format.xlsx",
        );
        const status = screen.getByRole("status").textContent;
        expect(status).toBe("✓ Your files are downloading.");
        expect(status).not.toMatch(/whatsapp|sent/i);
        const links = screen.getAllByRole("link");
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/downloads/gst-invoice-format/gst-invoice-format.docx",
        ]);
        expect(links[0]?.textContent).toBe("Get the Word file (.docx)");
        expect(unknownClasses(container, own)).toEqual([]);
    });

    it("Email: the field becomes an email, and the confirmation says the link is on its way", async () => {
        const submit = vi
            .fn()
            .mockResolvedValue({ ok: true, emailed: "sent" } as const);
        gate(submit);
        fireEvent.click(screen.getByRole("radio", { name: "Email" }));
        expect(screen.queryByText("+91")).toBeNull();
        expect(screen.getByLabelText("Email address")).toHaveProperty(
            "type",
            "email",
        );

        type("Email address", "rye@example");
        await press();
        expect(screen.getByRole("alert").textContent).toMatch(/ending/);
        expect(submit).not.toHaveBeenCalled();

        type("Email address", " rye@example.com ");
        await press();
        expect(submit).toHaveBeenCalledWith({ email: "rye@example.com" });
        expect(screen.getByRole("status").textContent).toBe(
            "✓ Your files are downloading. We've also emailed the link to rye@example.com.",
        );
    });

    it.each([
        ["bad-contact", DOWNLOAD_GATE_WORDS.badPhone],
        ["rate-limited", /a lot of tries/],
        ["challenge", DOWNLOAD_GATE_WORDS.challenge],
        ["unavailable", DOWNLOAD_GATE_WORDS.unavailable],
    ] as const)(
        "says what %s means, keeps the number and gives no file",
        async (reason, words) => {
            gate(() => Promise.resolve({ ok: false, reason }));
            type("WhatsApp number", "9876543210");
            await press();
            expect(screen.getByRole("alert").textContent).toMatch(words);
            expect(screen.getByLabelText("WhatsApp number")).toHaveProperty(
                "value",
                "9876543210",
            );
            expect(saveFile).not.toHaveBeenCalled();
            expect(screen.queryByRole("status")).toBeNull();
        },
    );

    it("the API down (a throw) is unavailable too", async () => {
        gate(() => Promise.reject(new Error("offline")));
        type("WhatsApp number", "9876543210");
        await press();
        expect(screen.getByRole("alert").textContent).toBe(
            DOWNLOAD_GATE_WORDS.unavailable,
        );
    });

    it("without a provider: unavailable, never sent", async () => {
        gate();
        type("WhatsApp number", "9876543210");
        await press();
        expect(screen.getByRole("alert").textContent).toBe(
            DOWNLOAD_GATE_WORDS.unavailable,
        );
        expect(screen.queryByRole("status")).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("when the file can't be fetched, says the files are ready and links every one", async () => {
        fetchMock.mockResolvedValue(new Response("", { status: 404 }));
        gate(() => Promise.resolve({ ok: true, emailed: "none" }));
        type("WhatsApp number", "9876543210");
        await press();
        expect(screen.getByRole("status").textContent).toBe(
            "✓ Your files are ready.",
        );
        expect(screen.getAllByRole("link")).toHaveLength(2);
    });

    it("draws the app's bot check above the button", () => {
        gate(() => Promise.resolve({ ok: true, emailed: "none" }), {
            challenge: <div data-testid="check" />,
        });
        expect(screen.getByTestId("check")).toBeTruthy();
    });

    it("the admin preview opens without sending or fetching, and links go nowhere", async () => {
        render(
            <DownloadGate slug="gst-invoice-format" files={FILES} preview />,
        );
        type("WhatsApp number", "9876543210");
        await press();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toBeTruthy();
        expect(screen.queryAllByRole("link")).toHaveLength(0);
    });
});

describe("phoneDigits", () => {
    it.each([
        ["98765 43210", "9876543210"],
        ["+91 98765-43210", "9876543210"],
        ["09876543210", "9876543210"],
        ["987654321", null],
        ["", null],
    ])("%s → %s", (typed, digits) => {
        expect(phoneDigits(typed)).toBe(digits);
    });
});
