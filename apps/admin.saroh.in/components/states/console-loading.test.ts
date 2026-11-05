import { describe, expect, it } from "vitest";

import { skeletonFor } from "./console-loading";

describe("skeletonFor", () => {
    it.each([
        ["/", "list"],
        ["/businesses", "list"],
        ["/businesses/org_1/overview", "detail"],
        ["/users/u_1", "detail"],
        ["/releases/new_checkout/who", "detail"],
        ["/search-pages/tattoo-studios", "detail"],
        ["/leads", "board"],
        ["/team", "list"],
        ["/team/roles", "list"],
        ["/team/pa_1/earnings", "detail"],
        ["/billing/invoices", "list"],
        ["/billing/invoices/inv_1", "detail"],
        ["/billing/invoices/export", "list"],
        ["/operations/jobs", "list"],
        ["/operations/runs/op_1", "detail"],
        ["/flags/anything", "list"],
    ] as const)("%s draws a %s", (path, shape) => {
        expect(skeletonFor(path)).toBe(shape);
    });
});
