import type { NextFunction, Request, Response } from "express";

import { robotsNoindex } from "./robots-header";

function answer(middleware: NonNullable<ReturnType<typeof robotsNoindex>>) {
    const headers: Record<string, string> = {};
    const res = {
        setHeader: (name: string, value: string) => (headers[name] = value),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;
    middleware({} as Request, res, next);
    return { headers, next };
}

describe("ROBOTS_NOINDEX — the dev API out of search", () => {
    it("on: every answer says noindex, nofollow", () => {
        const middleware = robotsNoindex("on");
        expect(middleware).not.toBeNull();
        const { headers, next } = answer(middleware!);
        expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
        expect(next).toHaveBeenCalledTimes(1);
    });

    it("unset or off: nothing is added — production", () => {
        expect(robotsNoindex(undefined)).toBeNull();
        expect(robotsNoindex("off")).toBeNull();
    });
});
