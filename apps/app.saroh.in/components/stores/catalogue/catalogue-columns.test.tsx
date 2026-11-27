import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CatalogueRow } from "@/lib/products/catalogue";

import { catalogueColumns } from "./catalogue-columns";

/** Finding 17: how a product sells, beside it, for a role that reads sales. */
describe("Sold, 30 days", () => {
    const row = { id: "p1", currency: "INR" } as unknown as CatalogueRow;
    const sold = (map?: Record<string, { units: number; amount: string }>) =>
        catalogueColumns({ ratingById: new Map(), sold: map }).find(
            (c) => c.id === "sold",
        );

    it("says units and money, and None for a product that hasn't sold", () => {
        const column = sold({ p1: { units: 14, amount: "16100.00" } });
        const html = renderToStaticMarkup(<>{column?.cell(row)}</>);
        expect(html).toContain(">14<");
        expect(html).toContain("₹16,100");
        const none = renderToStaticMarkup(
            <>{column?.cell({ ...row, id: "p2" })}</>,
        );
        expect(none).toContain("None");
    });

    it("isn't drawn when the API sent no sales (a role without order money)", () => {
        expect(sold(undefined)).toBeUndefined();
    });
});
