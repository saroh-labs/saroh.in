// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { PhoneBar } from "./phone-bar";

function publishWith(props: { publishing: boolean; saving?: boolean }) {
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() =>
        root.render(
            <PhoneBar
                open={null}
                waiting={1}
                needsApproval={false}
                onSelect={() => undefined}
                {...props}
            />,
        ),
    );
    const button = host.querySelector<HTMLButtonElement>(
        'button[aria-label^="Publish"]',
    );
    act(() => root.unmount());
    return button;
}

describe("PhoneBar's Publish", () => {
    it("waits while a change is saving, as the desk's does", () => {
        expect(publishWith({ publishing: false, saving: true })?.disabled).toBe(
            true,
        );
        expect(publishWith({ publishing: true })?.disabled).toBe(true);
        expect(publishWith({ publishing: false })?.disabled).toBe(false);
    });
});
