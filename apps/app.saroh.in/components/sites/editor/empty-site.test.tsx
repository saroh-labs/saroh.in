// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const copyStarterContent = vi.fn();
vi.mock("@/lib/sites/actions", () => ({
    copyStarterContent: (...a: unknown[]) =>
        copyStarterContent(...a) as unknown,
}));
vi.mock("@/lib/api/run-action", () => ({
    runAction: (send: () => Promise<unknown>) => send(),
}));
vi.mock("@saroh/ui/toast", () => ({
    dismissToasts: vi.fn(),
    showUndo: vi.fn(),
    showInfo: vi.fn(),
}));
vi.mock("./add/add-page-sheet", () => ({
    AddPageSheet: ({ open }: { open: boolean }) =>
        open ? <div data-add-page="" /> : null,
}));

import { EmptySite } from "./empty-site";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
    document.body.innerHTML = "";
});

const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === name,
    );

function draw(readOnly = false) {
    const host = document.createElement("div");
    document.body.append(host);
    act(() =>
        createRoot(host).render(
            <EmptySite
                siteId="site_1"
                readOnly={readOnly}
                address={null}
                looksAvailable={false}
                draftLook={null}
                addableKinds={[]}
            />,
        ),
    );
    return host;
}

it("starts from a look's starter content without leaving the editor (E1)", async () => {
    copyStarterContent.mockResolvedValue({
        ok: true,
        data: {
            snapshotId: "snap",
            filled: [],
            replaced: [],
            created: ["Home"],
            skipped: [],
        },
    });
    draw();
    act(() => button("Start from a look")?.click());
    await act(async () => {
        button("Classic")?.click();
        await Promise.resolve();
    });
    expect(copyStarterContent).toHaveBeenCalledWith("site_1", "classic", true);
    expect(refresh).toHaveBeenCalled();
});

it("Add a page opens Add's own sheet here", () => {
    draw();
    act(() => button("Add a page")?.click());
    expect(document.querySelector("[data-add-page]")).not.toBeNull();
});

it("a reader is offered nothing", () => {
    const host = draw(true);
    expect(host.querySelector("button")).toBeNull();
    expect(host.textContent).toContain("once a teammate adds one");
});
