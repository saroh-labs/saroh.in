// @vitest-environment jsdom
// CS4 / DEC-256: a colour no words read on shows the warning with three
// choices, and "Use it anyway" keeps the exact colour once chosen.
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { CustomColour } from "./button-colour-picker";

vi.mock("@saroh/ui/lib/use-narrow", () => ({ useNarrow: () => false }));

(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const button = (text: string) =>
    Array.from(document.querySelectorAll("button")).find((b) =>
        b.textContent.includes(text),
    );

it("offers Use it anyway on a grey, and keeps that exact colour", () => {
    const onUse = vi.fn();
    act(() =>
        root.render(
            <CustomColour
                value="#777777"
                start="#777777"
                role={null}
                roles={[]}
                onRole={vi.fn()}
                onUse={onUse}
            />,
        ),
    );
    act(() => host.querySelector<HTMLElement>("[data-colour-custom]")?.click());
    expect(document.body.textContent).toContain("hard to read");
    act(() => button("Use it anyway")?.click());
    act(() => button("Use this colour")?.click());
    expect(onUse).toHaveBeenCalledWith("#777777");
});
