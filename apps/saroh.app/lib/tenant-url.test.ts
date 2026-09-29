import { describe, expect, it } from "vitest";

import { tenantUrl } from "./tenant-url";

describe("tenantUrl", () => {
    it("serves the host's route and keeps the query (Track, ?order=)", () => {
        const target = tenantUrl(
            "northwind.saroh.app",
            new URL("https://northwind.saroh.app/account/orders?order=abc"),
        );
        expect(target.pathname).toBe("/northwind.saroh.app/account/orders");
        expect(target.searchParams.get("order")).toBe("abc");
    });

    it("keeps every parameter, encoded as it came", () => {
        const target = tenantUrl(
            "kavi.localhost",
            new URL("http://kavi.localhost:3005/book?service=s%201&move=b2"),
        );
        expect(target.search).toBe("?service=s%201&move=b2");
        expect(target.host).toBe("kavi.localhost:3005");
    });

    it("adds no query where there was none", () => {
        const target = tenantUrl(
            "rye.saroh.app",
            new URL("https://rye.saroh.app/shop"),
        );
        expect(target.href).toBe("https://rye.saroh.app/rye.saroh.app/shop");
    });
});
