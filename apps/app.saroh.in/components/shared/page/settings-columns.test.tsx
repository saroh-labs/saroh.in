import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SettingsColumns } from "./settings-columns";

/**
 * The one layout Sell › Location, Website › Settings and Settings ›
 * Business share: the "what's left" card first for the keyboard, above the
 * rows on a narrow screen and to their right on a wide one.
 */
describe("SettingsColumns", () => {
    const html = renderToStaticMarkup(
        <SettingsColumns
            aside={<section aria-label="What's left">Left</section>}
            before={<p>Read only</p>}
        >
            <nav aria-label="Tabs">Tabs</nav>
            <div role="tabpanel">Rows</div>
        </SettingsColumns>,
    );

    it("puts the card first in the page's order, for the keyboard", () => {
        expect(html.indexOf("What&#x27;s left")).toBeLessThan(
            html.indexOf("Read only"),
        );
        expect(html.indexOf("Read only")).toBeLessThan(html.indexOf("Tabs"));
    });

    it("draws notes, then the card, then the rows on a narrow screen", () => {
        expect(html).toMatch(/order-2[^"]*"[^>]*>[\s\S]*What/);
        expect(html).toMatch(/class="order-1[^"]*"><p>Read only/);
        expect(html).toMatch(/class="order-3[^"]*"><nav/);
    });

    it("grows the rows to 1040px and moves the card right from 1440px", () => {
        expect(html).toContain("max-w-[760px]");
        expect(html).toContain("min-[1440px]:max-w-[1040px]");
        expect(html).toContain("min-[1440px]:flex-row");
        expect(html).toContain("min-[1440px]:order-last");
        expect(html).toContain("min-[1440px]:sticky");
    });

    it("moves the card from 1760px when something is already beside the rows", () => {
        const beside = renderToStaticMarkup(
            <SettingsColumns beside aside={<section>Left</section>}>
                <div>Rows</div>
            </SettingsColumns>,
        );
        // The rows still grow from 1440px: one width rule for every screen.
        expect(beside).toContain("min-[1440px]:max-w-[1040px]");
        expect(beside).toContain("min-[1760px]:flex-row");
        expect(beside).not.toContain("min-[1440px]:flex-row");
    });

    it("leaves no empty place for a card with nothing left to say", () => {
        const none = renderToStaticMarkup(
            <SettingsColumns>
                <div>Rows</div>
            </SettingsColumns>,
        );
        expect(none).not.toContain('data-slot="settings-aside"');
        // The rows keep the same measure, card or no card.
        expect(none).toContain("max-w-[760px]");
        expect(none).toContain("min-[1440px]:max-w-[1040px]");
    });
});
