import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { NextFunction, Request, Response } from "express";

import {
    MERCHANT_API_ROUTES,
    merchantApiAllows,
    merchantApiOnly,
    NOT_ON_MERCHANT_API,
} from "./merchant-api";

function run(host: string, path: string) {
    const next = jest.fn() as unknown as NextFunction;
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    merchantApiOnly(
        { headers: { host }, path } as unknown as Request,
        { status } as unknown as Response,
        next,
    );
    return { next, status };
}

describe("merchantApiOnly", () => {
    it("serves a listed route on the merchant address", () => {
        const { next, status } = run(
            "api.saroh.app",
            "/public/sites/rye/pages",
        );
        expect(next).toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
    });

    it("refuses everything else there", () => {
        for (const path of [
            "/organizations/org_1",
            "/api/auth/session",
            "/admin/users",
            "/billing/plans",
            "/public/waitlist",
            "/public/webhooks/razorpay",
            "/",
        ]) {
            const { next, status } = run("api.saroh.app", path);
            expect(next).not.toHaveBeenCalled();
            expect(status).toHaveBeenCalledWith(404);
        }
    });

    it("does the same on the development address, with a port or capitals", () => {
        expect(
            run("API.saroh.dev:443", "/admin/users").status,
        ).toHaveBeenCalledWith(404);
    });

    it("leaves every other address alone", () => {
        for (const host of [
            "api.saroh.in",
            "api.saroh.tech",
            "localhost:3333",
        ]) {
            expect(run(host, "/admin/users").next).toHaveBeenCalled();
        }
    });
});

describe("merchantApiAllows", () => {
    it("matches a whole route name, not a prefix of one", () => {
        expect(merchantApiAllows("/public/sites")).toBe(true);
        expect(merchantApiAllows("/public/sites-extra")).toBe(false);
        expect(merchantApiAllows("/public/sitesx/a")).toBe(false);
    });
});

describe("every public route is decided", () => {
    const files = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory()
                ? files(join(dir, e.name))
                : e.name.endsWith(".controller.ts")
                  ? [join(dir, e.name)]
                  : [],
        );

    const publicRoutes = new Set(
        files(join(__dirname, "../modules")).flatMap((file) =>
            [
                ...readFileSync(file, "utf8").matchAll(
                    /@Controller\(\s*"(public\/[^"/]+)/g,
                ),
            ].map((m) => m[1]),
        ),
    );

    it("finds the routes, so this test can't pass by reading nothing", () => {
        expect(publicRoutes.has("public/sites")).toBe(true);
    });

    it("lists each on one side or the other", () => {
        const decided = new Set<string>([
            ...MERCHANT_API_ROUTES,
            ...NOT_ON_MERCHANT_API,
        ]);
        expect([...publicRoutes].filter((r) => !decided.has(r))).toEqual([]);
    });

    it("never lists one on both", () => {
        const on = new Set<string>(MERCHANT_API_ROUTES);
        expect(NOT_ON_MERCHANT_API.filter((r) => on.has(r))).toEqual([]);
    });
});
