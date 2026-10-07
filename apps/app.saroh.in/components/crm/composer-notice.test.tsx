import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ComposerNotice } from "./composer-notice";

/**
 * What the lead's "Send a message" says in place of the composer, per plan
 * (UX-067): Free sees the plan that has its own email and See plans, never
 * a Connect; Grow sees Connect email; Communications off says where to turn
 * it on only to someone who may.
 */
describe("ComposerNotice", () => {
    it("Free: the plan and See plans, no Connect", () => {
        const html = renderToStaticMarkup(
            <ComposerNotice
                gate={{
                    kind: "plan",
                    title: "Sending from your own email comes with Plus.",
                    cta: "See Plus",
                    href: "/settings/billing?plan=plus#change-plan",
                }}
            />,
        );
        expect(html).toContain("comes with Plus");
        expect(html).toContain(
            'href="/settings/billing?plan=plus#change-plan"',
        );
        expect(html).not.toContain("Connect");
    });

    it("Grow: Connect email to Providers", () => {
        const html = renderToStaticMarkup(
            <ComposerNotice
                gate={{
                    kind: "connect",
                    title: "Connect your email to write from here.",
                    cta: "Connect email",
                    href: "/settings/providers",
                }}
            />,
        );
        expect(html).toContain("Connect your email to write from here.");
        expect(html).toContain('href="/settings/providers"');
    });

    it("Communications off: a line for a manager, nothing for anyone else", () => {
        expect(
            renderToStaticMarkup(
                <ComposerNotice gate={{ kind: "off", canManage: true }} />,
            ),
        ).toContain('href="/settings/modules"');
        expect(
            renderToStaticMarkup(
                <ComposerNotice gate={{ kind: "off", canManage: false }} />,
            ),
        ).toBe("");
    });

    it("compose: nothing in its place", () => {
        expect(
            renderToStaticMarkup(<ComposerNotice gate={{ kind: "compose" }} />),
        ).toBe("");
    });
});
