// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CheckResult, UnlockResult } from "@/lib/link-preview";

import { LinkPreviewTool } from "./link-preview-tool";

/**
 * The link preview checker's states (resources plan U2, R5, R13, R19):
 * empty with its two examples, loading, each error in the page's voice,
 * results with the API's score line and six verdicts, the field that never
 * doubles the scheme, the report's own address, and the email unlock.
 */

const fetchMock = vi.fn();
const writeText = vi.fn();

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
    window.history.replaceState(null, "", "/tools/link-preview");
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    writeText.mockReset();
});

const RESULT: CheckResult = {
    ok: true,
    url: "https://shop.in/",
    checkedAt: new Date().toISOString(),
    facts: {
        domain: "shop.in",
        finalUrl: "https://shop.in/",
        status: 200,
        title: "Fresh bread every morning",
        description: null,
        siteName: "Shop",
        image: null,
        tags: {
            title: "Shop",
            description: null,
            canonical: null,
            og: {
                title: "Fresh bread every morning",
                description: null,
                image: null,
                url: null,
                siteName: "Shop",
            },
            twitter: {
                card: null,
                title: null,
                description: null,
                image: null,
            },
        },
    },
    apps: [
        { app: "whatsapp", ok: false },
        { app: "facebook", ok: false },
        { app: "linkedin", ok: false },
        { app: "x", ok: false },
        { app: "slack", ok: false },
        { app: "google", ok: false },
    ],
    right: 0,
    fixCount: 3,
    score: "Looks right on 0 of 6 apps. Fix 3 things to fix all 6.",
    tags: [
        { tag: "og:title", mark: "ok", note: "Fresh bread every morning" },
        { tag: "og:description", mark: "missing", note: "Missing" },
        { tag: "og:image", mark: "missing", note: "Missing" },
        { tag: "twitter:card", mark: "missing", note: "Missing" },
        {
            tag: "og:url",
            mark: "warn",
            note: "Missing. Apps use the address you shared.",
        },
    ],
};

const UNLOCKED: UnlockResult = {
    unlocked: true,
    emailed: "sent",
    fixes: [
        {
            key: "description",
            title: "Add a description.",
            body: "Write one sentence.",
            apps: ["whatsapp"],
        },
        {
            key: "image-missing",
            title: "Add a picture.",
            body: "Use 1200 × 630.",
            apps: ["x"],
        },
        {
            key: "x-card",
            title: "Tell X to use a large card.",
            body: "Add twitter:card.",
            apps: ["x"],
        },
    ],
    suggestedTags: '<meta name="twitter:card" content="summary_large_image">',
};

const reply = (body: unknown) =>
    Promise.resolve({ json: () => Promise.resolve(body) });
const field = () => screen.getByLabelText<HTMLInputElement>("Web address");
const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: "Check link" }));

describe("LinkPreviewTool", () => {
    it("starts empty with the two examples", () => {
        render(<LinkPreviewTool />);
        expect(screen.getByText("Not sure? Try one:")).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "A sample bakery site" }),
        ).toBeTruthy();
        expect(screen.getByRole("button", { name: "saroh.in" })).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never doubles the scheme when a full address is pasted (R19)", () => {
        render(<LinkPreviewTool />);
        fireEvent.change(field(), {
            target: { value: "https://shop.in/menu" },
        });
        expect(field().value).toBe("shop.in/menu");
        fireEvent.change(field(), { target: { value: "http://shop.in" } });
        expect(field().value).toBe("shop.in");
        expect(document.querySelector("[data-scheme]")?.textContent).toBe(
            "http://",
        );
    });

    it("says what's wrong with the address before asking anyone", () => {
        render(<LinkPreviewTool />);
        submit();
        expect(screen.getByRole("alert").textContent).toBe(
            "Paste a web address first, like yourbusiness.in.",
        );
        fireEvent.change(field(), { target: { value: "my shop" } });
        submit();
        expect(screen.getByRole("alert").textContent).toBe(
            "That doesn't look like a web address. Try something like yourbusiness.in.",
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("shows loading, then the API's failure in the page's voice", async () => {
        let answer: (value: unknown) => void = () => undefined;
        fetchMock.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            }),
        );
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "shop.in" } });
        submit();
        expect(screen.getByRole("status").textContent).toBe(
            "Reading shop.in the way WhatsApp, Facebook and Google do…",
        );
        await act(async () => {
            await Promise.resolve();
            answer({
                json: () =>
                    Promise.resolve({
                        ok: false,
                        url: "https://shop.in",
                        failure: "unreachable",
                    }),
            });
        });
        expect(screen.getByRole("alert").textContent).toBe(
            "We couldn't reach shop.in. Check the address, or try again in a minute.",
        );
    });

    it("says when a page has no tags", async () => {
        fetchMock.mockReturnValue(
            reply({ ok: false, url: "https://shop.in", failure: "no-tags" }),
        );
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "shop.in" } });
        submit();
        expect((await screen.findByRole("alert")).textContent).toContain(
            "found no share tags",
        );
    });

    it("draws the results: the API's score line, the tags, six verdicts and four locked tiles", async () => {
        fetchMock.mockReturnValue(reply(RESULT));
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "https://shop.in" } });
        submit();
        expect((await screen.findByTestId("score-line")).textContent).toBe(
            "Looks right on 0 of 6 apps. Fix 3 things to fix all 6.",
        );
        // A POST with the address in the body: never a query string.
        const [called, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(called).toBe("/api/link-preview");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({
            url: "https://shop.in",
        });
        expect(screen.getAllByLabelText(/: Needs a fix$/)).toHaveLength(6);
        expect(screen.getAllByLabelText(/, locked$/)).toHaveLength(4);
        expect(screen.getByText("Unlock the fix-it report")).toBeTruthy();
        expect(screen.queryByText("Add a description.")).toBeNull();
        // The report has its own address.
        expect(window.location.search).toBe("?url=shop.in");
    });

    it("copies the report's address (R13), and checks again past the cache", async () => {
        fetchMock.mockReturnValue(reply(RESULT));
        writeText.mockResolvedValue(undefined);
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "shop.in" } });
        submit();
        await screen.findByTestId("score-line");
        fireEvent.click(
            screen.getByRole("button", { name: "Copy link to this report" }),
        );
        await screen.findByRole("button", { name: "Link copied" });
        expect(writeText).toHaveBeenCalledWith(
            `${window.location.origin}/tools/link-preview?url=shop.in`,
        );
        expect(
            screen.getByRole("button", { name: "Link copied" }),
        ).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        const [, again] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(JSON.parse(again.body as string)).toMatchObject({
            fresh: true,
        });
    });

    it("opens a shared report already checked", async () => {
        fetchMock.mockReturnValue(reply(RESULT));
        render(<LinkPreviewTool initialUrl="shop.in" />);
        await screen.findByTestId("score-line");
        expect(field().value).toBe("shop.in");
    });

    it("refuses a bad email in the design's words, and unlocks the fixes with a good one", async () => {
        fetchMock
            .mockReturnValueOnce(reply(RESULT))
            .mockReturnValueOnce(reply(UNLOCKED));
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "shop.in" } });
        submit();
        await screen.findByTestId("score-line");

        const email = screen.getByLabelText("Email");
        fireEvent.change(email, { target: { value: "not-an-email" } });
        fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
        expect(screen.getByRole("alert").textContent).toBe(
            "That email doesn't look right. Check it and try again.",
        );

        // No news tickbox: an unverified address can't say yes to news.
        expect(screen.queryByRole("checkbox")).toBeNull();
        fireEvent.change(email, { target: { value: "owner@shop.in" } });
        fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
        expect(await screen.findByText("Fix these 3")).toBeTruthy();
        expect(screen.getByText("Add a description.")).toBeTruthy();
        expect(screen.getByText("We've emailed you a copy.")).toBeTruthy();
        expect(screen.queryAllByLabelText(/, locked$/)).toHaveLength(0);
        const [path, init] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(path).toBe("/api/link-preview/report");
        expect(JSON.parse(init.body as string)).toEqual({
            email: "owner@shop.in",
            url: "https://shop.in/",
        });
    });

    it("links the promise line to the Privacy page", async () => {
        fetchMock.mockReturnValue(reply(RESULT));
        render(<LinkPreviewTool />);
        fireEvent.change(field(), { target: { value: "shop.in" } });
        submit();
        await screen.findByTestId("score-line");
        expect(
            screen.getByRole("link", { name: "Privacy" }).getAttribute("href"),
        ).toBe("/privacy");
    });
});
