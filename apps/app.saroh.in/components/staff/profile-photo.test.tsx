// @vitest-environment jsdom
// A team member's photo and About them (ERVStaffPhoto): the states (none,
// uploading, set, too large, wrong type), saving at once, and Remove.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const save = vi.fn();
vi.mock("@/lib/staff/actions", () => ({
    saveStaffProfile: (...a: unknown[]) => save(...a) as unknown,
}));
const upload = vi.fn();
const uploadState = {
    busy: false,
    preparing: false,
    progress: null as number | null,
    error: null as string | null,
};
vi.mock("@/components/shared/fields/media-picker", () => ({
    useImageUpload: () => ({ upload, ...uploadState }),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));

import { photoProblem, StaffProfileFields } from "./profile-photo";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    Object.assign(uploadState, {
        busy: false,
        preparing: false,
        progress: null,
        error: null,
    });
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

const show = (photo: string | null, byOther = false) =>
    act(() =>
        root.render(
            <StaffProfileFields
                staffId="st_1"
                name="Asha Rao"
                photo={photo}
                about={null}
                byOther={byOther}
            />,
        ),
    );
const button = (label: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === label,
    );

describe("a team member's photo", () => {
    it("none: initials, Add a photo, and what is accepted", () => {
        show(null);
        expect(host.textContent).toContain("Photo (optional)");
        expect(host.textContent).toContain("AR");
        expect(button("Add a photo")).toBeDefined();
        expect(host.textContent).toContain(
            "JPG, PNG or WebP. We make it smaller before it uploads.",
        );
        expect(button("Remove")).toBeUndefined();
    });

    it("set: Change and Remove, and where it shows", () => {
        show("https://m.example/asha.webp");
        expect(button("Change")).toBeDefined();
        expect(button("Remove")).toBeDefined();
        expect(host.textContent).toContain(
            "Shows on the website's Our team and the calendar.",
        );
    });

    it("an owner setting it for someone is told they will be told", () => {
        show("https://m.example/asha.webp", true);
        expect(host.textContent).toContain("are told when you change it");
    });

    it("uploading: says so, and that leaving the page is fine", () => {
        Object.assign(uploadState, { busy: true, preparing: true });
        show(null);
        expect(host.textContent).toContain("Getting your photo ready…");
        expect(host.textContent).toContain(
            "You can leave this page. It keeps going.",
        );
        expect(button("Getting your photo ready…")?.disabled).toBe(true);
    });

    it("says why an upload failed", () => {
        uploadState.error = "The upload did not go through. Try again.";
        show(null);
        expect(host.textContent).toContain("The upload did not go through");
    });

    it("refuses a photo that is too large or not a photo, before anything uploads", () => {
        expect(
            photoProblem({ type: "image/png", size: 11 * 1024 * 1024 }),
        ).toBe("That photo is too large to use. Choose one under 10 MB.");
        expect(photoProblem({ type: "application/pdf", size: 10 })).toBe(
            "That is not a photo. Choose a JPG, PNG or WebP.",
        );
        expect(photoProblem({ type: "image/webp", size: 10 })).toBeNull();
    });

    it("saves the uploaded photo at once, then shows it", async () => {
        upload.mockResolvedValue({
            mediaId: "m1",
            src: "https://m.example/n.webp",
        });
        save.mockResolvedValue({ ok: true, data: {} });
        show(null);
        const file = new File(["x"], "a.png", { type: "image/png" });
        const input =
            host.querySelector<HTMLInputElement>('input[type="file"]');
        if (!input) throw new Error("No file input");
        await act(async () => {
            Object.defineProperty(input, "files", {
                value: [file],
                configurable: true,
            });
            input.dispatchEvent(new Event("change", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(save).toHaveBeenCalledWith("st_1", { photoMediaId: "m1" });
        // Set now: Change and Remove, not Add a photo.
        expect(button("Change")).toBeDefined();
    });

    it("Remove clears the photo and goes back to initials", async () => {
        save.mockResolvedValue({ ok: true, data: {} });
        show("https://m.example/asha.webp");
        await act(async () => {
            button("Remove")?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(save).toHaveBeenCalledWith("st_1", { photoMediaId: null });
        expect(button("Add a photo")).toBeDefined();
    });

    it("says what the API refused, and keeps the old photo", async () => {
        save.mockResolvedValue({
            ok: false,
            error: "Only an owner or admin can.",
        });
        show("https://m.example/asha.webp");
        await act(async () => {
            button("Remove")?.click();
            await new Promise((r) => setTimeout(r, 0));
        });
        expect(host.textContent).toContain("Only an owner or admin can.");
        expect(button("Change")).toBeDefined();
    });
});
