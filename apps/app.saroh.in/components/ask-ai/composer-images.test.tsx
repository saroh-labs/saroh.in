// @vitest-environment jsdom
/**
 * Images in Ask AI's box (owner, 22 Nov; boards AIImgCompose and
 * AIImgStates): up to ten, thumbnails with remove, the count, Ask waiting
 * for every upload, a failed one kept with Try again and Remove it, and the
 * one provider line. The upload itself is stood in for here.
 */
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => ({ sendPhoto: vi.fn() }));
vi.mock("@/components/shared/fields/media-picker", () => ({
    useImageUpload: () => upload,
}));
vi.mock("@/lib/media/actions", () => ({
    listLibrary: vi.fn().mockResolvedValue([]),
}));

import { Composer } from "./composer";
import type { Attachments } from "./use-attachments";
import { useAttachments } from "./use-attachments";

let root: Root;
let host: HTMLDivElement;
const held: { current: Attachments | null } = { current: null };
const box = (): Attachments => {
    if (!held.current) throw new Error("The box has not rendered");
    return held.current;
};

function Harness() {
    const attach = useAttachments();
    useEffect(() => {
        held.current = attach;
    });
    return (
        <Composer
            value=""
            onChange={() => undefined}
            onSend={() => undefined}
            onStop={() => undefined}
            running={false}
            paused={false}
            placeholder="Ask"
            attach={attach}
        />
    );
}

const png = (name = "a.png") => new File(["x"], name, { type: "image/png" });
const files = (n: number) =>
    Array.from({ length: n }, (_, i) => png(`p${i}.png`));
const ask = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="Ask"]');

async function flush() {
    await act(async () => {
        for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    upload.sendPhoto.mockReset();
    upload.sendPhoto.mockImplementation((file: File) =>
        Promise.resolve({
            mediaId: `m-${file.name}`,
            url: "https://media.test/x",
        }),
    );
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Harness />));
});
afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

describe("the box's images", () => {
    it("an empty box shows no count and Ask is off with no words", () => {
        expect(host.textContent).not.toContain(" of 10");
        expect(ask()?.disabled).toBe(true);
    });

    it("an image added shows a thumbnail and '1 of 10', and lets images go without words", async () => {
        act(() => box().addFiles([png()]));
        await flush();
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(1);
        expect(host.textContent).toContain("1 of 10");
        expect(upload.sendPhoto).toHaveBeenCalledOnce();
        expect(ask()?.disabled).toBe(false);
        expect(box().mediaIds).toEqual(["m-a.png"]);
    });

    it("takes ten, keeps the first ten of thirteen, and says how many weren't added", async () => {
        act(() => box().addFiles(files(13)));
        await flush();
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(10);
        expect(host.textContent).toContain(
            "10 of 10 · the most for one message",
        );
        expect(host.textContent).toContain(
            "Up to 10 images in one message. 3 weren't added.",
        );
        expect(upload.sendPhoto).toHaveBeenCalledTimes(10);
        // At ten the add button is off, with the limit in its name.
        const add = host.querySelector<HTMLButtonElement>(
            'button[aria-label="Up to 10 images in one message"]',
        );
        expect(add?.disabled).toBe(true);
    });

    it("removing one brings the add button back", async () => {
        act(() => box().addFiles(files(10)));
        await flush();
        act(() =>
            host
                .querySelector<HTMLButtonElement>(
                    'button[aria-label^="Remove "]',
                )
                ?.click(),
        );
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(9);
        expect(
            host.querySelector('button[aria-label="Add images"]'),
        ).toBeTruthy();
    });

    it("Ask waits until every image is in", async () => {
        let finish: (v: { mediaId: string; url: string }) => void = () =>
            undefined;
        upload.sendPhoto.mockImplementationOnce(
            () => new Promise((r) => (finish = r)),
        );
        act(() => box().addFiles([png()]));
        expect(host.textContent).toContain("1 of 10 · 1 uploading");
        expect(ask()?.disabled).toBe(true);
        await act(() => {
            finish({ mediaId: "m1", url: "u" });
            return Promise.resolve();
        });
        await flush();
        expect(ask()?.disabled).toBe(false);
    });

    it("a failed upload keeps its thumbnail, with Try again and Remove it; Ask waits", async () => {
        upload.sendPhoto.mockRejectedValueOnce(new Error("The upload failed."));
        act(() => box().addFiles([png("tape-rolls.png")]));
        await flush();
        expect(host.textContent).toContain("tape-rolls.png didn't upload.");
        expect(host.querySelector('[data-attachment="failed"]')).toBeTruthy();
        expect(ask()?.disabled).toBe(true);
        const retry = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent === "Try again",
        );
        act(() => retry?.click());
        await flush();
        expect(host.textContent).not.toContain("didn't upload");
        expect(box().mediaIds).toEqual(["m-tape-rolls.png"]);
        expect(ask()?.disabled).toBe(false);
    });

    it("a file that isn't an image is named in one line, and nothing is added", async () => {
        act(() =>
            box().addFiles([
                new File(["x"], "price-list.pdf", { type: "application/pdf" }),
            ]),
        );
        await flush();
        expect(host.textContent).toContain(
            "price-list.pdf isn't an image. Choose a JPG, PNG, WebP or GIF.",
        );
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(0);
    });

    it("a refused question gives the images back; taking them empties the box", async () => {
        act(() => box().addFiles(files(2)));
        await flush();
        const kept: { taken: ReturnType<Attachments["take"]> } = { taken: [] };
        act(() => {
            kept.taken = box().take();
        });
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(0);
        act(() => box().restore(kept.taken));
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(2);
    });

    it("pasting an image adds it; pasting words leaves them to the box", async () => {
        const textarea = host.querySelector("textarea");
        const event = (items: File[]) => {
            const e = new Event("paste", { bubbles: true, cancelable: true });
            Object.defineProperty(e, "clipboardData", {
                value: { files: items },
            });
            return e;
        };
        const words = event([]);
        act(() => void textarea?.dispatchEvent(words));
        expect(words.defaultPrevented).toBe(false);
        const picture = event([png("shot.png")]);
        await act(() => {
            textarea?.dispatchEvent(picture);
            return Promise.resolve();
        });
        expect(picture.defaultPrevented).toBe(true);
        expect(host.querySelectorAll("[data-attachment]")).toHaveLength(1);
    });
});
