import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SHOP_AWAITS_SELLS_FROM } from "@/lib/sites/sells-from";
import type { SellsFrom } from "@/lib/sites/service";

import { SellsFromRow } from "./sells-from-row";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/sites/actions", () => ({ updateSiteSettings: vi.fn() }));

/**
 * The site's Shop settings (G11, P4): while the shop could serve but Sells
 * from is unanswered, the section says its shop page isn't live, and the
 * readiness step's link lands on it (`#sells-from`).
 */

const online = { id: "st_1", name: "Online", products: 4 };
const hill = { id: "st_2", name: "Hill Road", products: 2 };

const row = (sellsFrom: SellsFrom, awaiting?: boolean) =>
    renderToStaticMarkup(
        <SellsFromRow
            siteId="site_1"
            sellsFrom={sellsFrom}
            canChange
            awaiting={awaiting}
        />,
    );

describe("SellsFromRow (P4)", () => {
    it("says the shop page isn't live while it waits on the answer", () => {
        const html = row({ storefront: null, choices: [online, hill] }, true);
        expect(html).toContain('id="sells-from"');
        expect(html).toContain("Not live");
        expect(html).toContain(SHOP_AWAITS_SELLS_FROM.replace("'", "&#x27;"));
        // The question is still there to answer.
        expect(html).toContain("Which storefront does this site sell from?");
    });

    it("says nothing more once it is answered, or when the API doesn't say", () => {
        for (const html of [
            row({ storefront: online, choices: [online, hill] }, true),
            row({ storefront: null, choices: [online, hill] }),
        ]) {
            expect(html).not.toContain("Not live");
            expect(html).not.toContain("your shop page isn");
        }
    });
});
