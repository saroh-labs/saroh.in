import { beforeEach, describe, expect, it, vi } from "vitest";

import { websiteAreaFrom, websiteAreaOn } from "./website-area-switch";

// What the api answers, set per test (a plain function: a rejecting
// `vi.fn` is reported as a failure even when the caller catches it).
const api = vi.hoisted(() => ({
    answer: (): Promise<Response> => Promise.resolve(new Response(null)),
    paths: [] as string[],
}));
vi.mock("@/lib/api/http", () => ({
    apiFetch: (path: string) => {
        api.paths.push(path);
        return api.answer();
    },
}));

/** The Website area's switch: the api's answer, off unless it says on (DEC-240). */
describe("websiteAreaOn (asks the api)", () => {
    beforeEach(() => {
        api.paths = [];
    });

    it("is on only when the api says on", async () => {
        api.answer = () => Promise.resolve(Response.json({ on: true }));
        await expect(websiteAreaOn()).resolves.toBe(true);
        expect(api.paths).toEqual(["/website-area"]);
        api.answer = () => Promise.resolve(Response.json({ on: false }));
        await expect(websiteAreaOn()).resolves.toBe(false);
    });

    it("is off when the api answers an error", async () => {
        api.answer = () => Promise.resolve(new Response(null, { status: 500 }));
        await expect(websiteAreaOn()).resolves.toBe(false);
    });

    it("is off when the api can't be reached", async () => {
        api.answer = () => Promise.reject(new Error("unreached"));
        await expect(websiteAreaOn()).resolves.toBe(false);
    });

    it("reads nothing but a true `on` as on", () => {
        expect(websiteAreaFrom(null)).toBe(false);
        expect(websiteAreaFrom({ on: "on" })).toBe(false);
        expect(websiteAreaFrom({ on: true })).toBe(true);
    });
});
