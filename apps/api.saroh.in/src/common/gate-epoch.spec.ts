import type { Request, Response } from "express";

import { gateEpochMiddleware } from "./gate-epoch";

function run(
    authUrl: string,
    method: string,
    url: string,
    cookie?: string,
): string[] {
    const set: string[] = [];
    const res = {
        append: (name: string, value: string) => {
            expect(name).toBe("Set-Cookie");
            set.push(value);
        },
    } as unknown as Response;
    const next = jest.fn();
    gateEpochMiddleware(
        authUrl.includes("saroh.in") ? ".saroh.in" : null,
        authUrl.startsWith("https:"),
    )({ method, url, headers: { cookie } } as unknown as Request, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    return set;
}

const SIGNED_IN = "__Secure-better-auth.session_token=abc; other=1";

describe("gateEpochMiddleware", () => {
    it("sets a new epoch on a signed-in browser's write, on the shared domain", () => {
        const [cookie] = run(
            "https://api.saroh.in",
            "PUT",
            "/organizations/org_1/modules/INSIGHTS",
            SIGNED_IN,
        );
        expect(cookie).toMatch(
            /^gate_epoch=[0-9a-z]+; Path=\/; SameSite=Lax; Domain=\.saroh\.in; Secure$/,
        );
    });

    it("stays host-only and not Secure on a bare http host (CI)", () => {
        const [cookie] = run(
            "http://localhost:3333",
            "POST",
            "/organizations/org_1/roles",
            SIGNED_IN,
        );
        expect(cookie).toMatch(/^gate_epoch=[0-9a-z]+; Path=\/; SameSite=Lax$/);
    });

    it("leaves reads, signed-out calls, customers and sign-in alone", () => {
        const url = "https://api.saroh.in";
        expect(run(url, "GET", "/organizations/org_1/me", SIGNED_IN)).toEqual(
            [],
        );
        expect(run(url, "PUT", "/organizations/org_1/modules/X")).toEqual([]);
        expect(run(url, "POST", "/public/orders", SIGNED_IN)).toEqual([]);
        expect(run(url, "POST", "/api/auth/sign-out", SIGNED_IN)).toEqual([]);
    });
});
