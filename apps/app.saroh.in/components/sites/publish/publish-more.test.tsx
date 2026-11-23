// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { MoreRow } from "./publish-more";

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => {
    // Unmount inside act, so no React work is left to run after the
    // environment is torn down ("window is not defined" in CI).
    act(() => {
        for (const r of roots.splice(0)) r.unmount();
    });
    document.body.innerHTML = "";
});

const button = (name: string) =>
    Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent === name,
    );

function draw(phone: boolean, onAsk = vi.fn()) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    roots.push(root);
    act(() =>
        root.render(
            <MoreRow
                phone={phone}
                more={{
                    versionsHref: "/sites/s/versions",
                    testLinks: { count: 2, onOpen: vi.fn() },
                    review: {
                        inReview: false,
                        asking: false,
                        onAsk,
                        onWithdraw: vi.fn(),
                    },
                }}
            />,
        ),
    );
    return host;
}

it("on a phone, one More holds versions, test links and Ask a teammate to review (P2)", () => {
    const onAsk = vi.fn();
    const host = draw(true, onAsk);
    expect(host.textContent).not.toContain("See versions");
    act(() => button("More")?.click());
    expect(host.textContent).toContain("See versions");
    expect(host.textContent).toContain("Test links (2)");
    act(() => button("Ask a teammate to review")?.click());
    expect(onAsk).toHaveBeenCalled();
});

it("on a desk, the links stay in a row, as before", () => {
    const host = draw(false);
    expect(button("More")).toBeUndefined();
    expect(host.textContent).toContain("See versions");
    expect(host.textContent).not.toContain("Ask a teammate");
});
