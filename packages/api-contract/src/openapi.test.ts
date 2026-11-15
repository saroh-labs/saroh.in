import { describe, expect, it } from "vitest";
import { z } from "zod";

import { id, money, page, pageQuery } from "./common";
import { buildOpenApi, defineRoute } from "./openapi";

// The one example route: real routes arrive with their units.
const product = z.object({ id, name: z.string(), price: money });

defineRoute({
    method: "get",
    path: "/products",
    surface: "v1",
    tag: "Catalogue",
    summary: "List products",
    request: { query: pageQuery },
    responses: { 200: page(product) },
    capability: "catalogue:read",
});

defineRoute({
    method: "patch",
    path: "/products/:productId",
    surface: "v1",
    tag: "Catalogue",
    summary: "Rename a product",
    request: {
        params: z.object({ productId: id }),
        body: z.strictObject({ name: z.string().min(1) }),
    },
    responses: { 200: product },
    capability: "catalogue:write",
});

describe("buildOpenApi", () => {
    it("is deterministic", () => {
        const doc = buildOpenApi("v1");
        expect(JSON.stringify(buildOpenApi("v1"))).toBe(JSON.stringify(doc));
        expect(doc).toMatchSnapshot();
    });

    it("includes every registered route's schemas", () => {
        const doc = buildOpenApi("v1");
        const list = doc.paths["/products"].get as {
            parameters: { name: string; required: boolean }[];
            "x-saroh-capability": string;
        };
        expect(list.parameters).toEqual([
            expect.objectContaining({ name: "cursor", required: false }),
            expect.objectContaining({ name: "limit", required: false }),
        ]);
        expect(list["x-saroh-capability"]).toBe("catalogue:read");

        const rename = doc.paths["/products/{productId}"].patch as {
            parameters: { name: string; in: string; required: boolean }[];
            requestBody: unknown;
            responses: Record<string, unknown>;
        };
        expect(rename.parameters).toEqual([
            expect.objectContaining({
                name: "productId",
                in: "path",
                required: true,
            }),
            expect.objectContaining({
                name: "Idempotency-Key",
                in: "header",
                required: false,
            }),
        ]);
        expect(JSON.stringify(rename.requestBody)).toContain(
            '"additionalProperties":false',
        );
        expect(Object.keys(rename.responses)).toEqual([
            "200",
            "400",
            "401",
            "403",
            "404",
            "409",
            "429",
            "default",
        ]);
        // A read can't clash, so it names no 409.
        expect(
            Object.keys(
                (doc.paths["/products"].get as { responses: object }).responses,
            ),
        ).toEqual(["200", "400", "401", "403", "404", "429", "default"]);
    });

    it("keeps surfaces apart", () => {
        expect(buildOpenApi("storefront").paths).toEqual({});
    });

    it("refuses a route defined twice", () => {
        expect(() =>
            defineRoute({
                method: "get",
                path: "/products",
                surface: "v1",
                tag: "Catalogue",
                summary: "Again",
                responses: {},
                capability: null,
            }),
        ).toThrow(/defined twice/);
    });
});
