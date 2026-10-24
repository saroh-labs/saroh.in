import type { NextFunction, Request, Response } from "express";

/**
 * Keeps an API out of search engines: with `ROBOTS_NOINDEX=on` (the dev API
 * on saroh.io) every answer says `X-Robots-Tag: noindex, nofollow`. Anything
 * else, unset included, adds nothing, so production is unchanged and the
 * routes' own headers stay as they are.
 */
export function robotsNoindex(setting: "on" | "off" | undefined) {
    if (setting !== "on") return null;
    return (_req: Request, res: Response, next: NextFunction) => {
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        next();
    };
}
