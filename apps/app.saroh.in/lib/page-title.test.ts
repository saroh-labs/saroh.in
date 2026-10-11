import { forbidden, notFound, redirect } from "next/navigation";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";

import { clip, recordTitle, titleTemplate } from "./page-title";

/** What Next does with a template: every "%s" becomes the page's title. */
const fill = (template: string, page: string) => template.replace(/%s/g, page);

describe("the tab's title inside a business", () => {
    it("is ‹Page› · ‹Business› · Saroh", () => {
        const title = titleTemplate("Rye & Co.");
        expect(title?.template).toBe("%s · Rye & Co. · Saroh");
        expect(fill(title?.template ?? "", "Orders")).toBe(
            "Orders · Rye & Co. · Saroh",
        );
        // A page that forgot its title still says whose it is. The root
        // layout's "%s · Saroh" is put around this by Next.
        expect(title?.default).toBe("Rye & Co.");
    });

    it("leaves the root layout's ‹Page› · Saroh when no business is known", () => {
        expect(titleTemplate(null)).toBeNull();
        expect(titleTemplate(undefined)).toBeNull();
        expect(titleTemplate("   ")).toBeNull();
    });

    it("a %s in the business's own name is not a slot", () => {
        const title = titleTemplate("50%sale");
        const filled = fill(title?.template ?? "", "Orders");
        expect(filled.startsWith("Orders · 50%")).toBe(true);
        expect(filled.endsWith("sale · Saroh")).toBe(true);
        expect(filled.match(/Orders/g)).toHaveLength(1);
    });

    it("cuts a very long name, so the rest still fits", () => {
        const long = "A".repeat(200);
        expect(clip(long)).toHaveLength(60);
        expect(clip(long).endsWith("…")).toBe(true);
        expect(clip("  Rye \n & Co.  ")).toBe("Rye & Co.");
    });
});

describe("a record's page title", () => {
    interface Order {
        orderId: string;
    }
    const order: Order = { orderId: "1042" };
    const found = () => Promise.resolve<Order | null>(order);
    const name = (o: Order) => `Order #${o.orderId}`;

    it("names the record from the page's own read", async () => {
        expect(await recordTitle(found, name, "Order")).toEqual({
            title: "Order #1042",
        });
    });

    it("falls back when there is no record, or nothing to call it", async () => {
        const none = () => Promise.resolve<Order | null>(null);
        expect(await recordTitle(none, name, "Order")).toEqual({
            title: "Order",
        });
        expect(await recordTitle(found, () => null, "Invoice")).toEqual({
            title: "Invoice",
        });
        expect(await recordTitle(found, () => "   ", "Post")).toEqual({
            title: "Post",
        });
    });

    it("puts the section after it: ‹post› · Website", async () => {
        expect(
            await recordTitle(found, () => "Autumn menu", "Post", "Website"),
        ).toEqual({ title: "Autumn menu · Website" });
        expect(await recordTitle(found, () => null, "Post", "Website")).toEqual(
            { title: "Post · Website" },
        );
    });

    it("never decides what the page shows: a refusal or a failure is the fallback", async () => {
        // `getJson` answers a 403 with forbidden(), and a read may call
        // notFound(); the page says which it was, in its own words.
        const refused = () => new Promise<Order>(() => forbidden());
        const missing = () => new Promise<Order>(() => notFound());
        const failed = () =>
            Promise.reject<Order>(new ApiError(502, "GET /orders/1"));
        for (const read of [refused, missing, failed])
            expect(await recordTitle(read, name, "Order")).toEqual({
                title: "Order",
            });
    });

    it("lets Next's own signals through", async () => {
        const moved = () => new Promise<Order>(() => redirect("/orders"));
        await expect(recordTitle(moved, name, "Order")).rejects.toThrow(
            "NEXT_REDIRECT",
        );
    });
});
