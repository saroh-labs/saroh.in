// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AskAiUsageRow } from "./ask-ai-usage-row";

/** Plan and billing's Ask AI row (plan 2026-11-13-001 U11). Made-up counts. */

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Ask AI usage row", () => {
    it("says N of M and links to the Ask AI tab", () => {
        act(() => root.render(<AskAiUsageRow used={7} limit={40} canOpen />));
        const link = host.querySelector("a");
        expect(link?.getAttribute("href")).toBe("/settings/developers/ask-ai");
        expect(link?.textContent).toContain("Ask AI questions");
        expect(link?.textContent).toContain("7 of 40");
    });

    it("is only a row for someone who can't open the tab", () => {
        act(() =>
            root.render(
                <AskAiUsageRow used={7} limit={null} canOpen={false} />,
            ),
        );
        expect(host.querySelector("a")).toBeNull();
        expect(host.textContent).toContain("Ask AI questions7");
    });
});
