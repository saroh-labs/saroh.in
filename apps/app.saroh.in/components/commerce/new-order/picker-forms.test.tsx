import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { WalkInForm } from "./picker-forms";

/**
 * The walk-in form (B13, B13b): it says a phone keeps them as a customer,
 * ties that line to the phone field for a screen reader, and its button
 * says what it will do.
 */
const render = (phone: string) =>
    renderToStaticMarkup(
        <WalkInForm
            initial={{ name: "Asha", phone, email: "" }}
            onUse={vi.fn()}
            onCancel={vi.fn()}
        />,
    );

describe("WalkInForm", () => {
    it("asks for a phone to keep them as a customer", () => {
        const html = render("");
        expect(html).toContain("Add a phone to keep them as a customer.");
        expect(html).toContain("Use walk-in");
    });

    it("says they'll be kept as a customer once a phone is in", () => {
        const html = render("+91 98450 00002");
        expect(html).toContain(
            "They&#x27;ll be kept as a customer, by this phone.",
        );
        expect(html).toContain("Keep as customer");
        expect(html).not.toContain("Use walk-in");
    });

    it("describes the phone field by that line", () => {
        const html = render("");
        const describedBy = /type="tel"[^>]*aria-describedby="([^"]+)"/.exec(
            html,
        )?.[1];
        expect(describedBy).toBeTruthy();
        expect(html).toContain(`id="${describedBy}"`);
    });
});
