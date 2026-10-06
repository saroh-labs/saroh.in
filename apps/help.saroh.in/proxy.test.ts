import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
    MARKETING_URL: undefined as string | undefined,
}));
vi.mock("./env", () => ({ env }));

import proxy from "./proxy";

/** The proxy at `iso`: 308 to saroh.in/help from 17 Oct (India), else through. */
function at(iso: string, url: string) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    return proxy(new NextRequest(url));
}

afterEach(() => {
    vi.useRealTimers();
    env.MARKETING_URL = undefined;
});

describe("help.saroh.in's proxy", () => {
    it("passes every request through before the day", () => {
        const res = at(
            "2026-10-16T18:29:59.999Z",
            "https://help.saroh.in/selling",
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("location")).toBeNull();
    });

    it("sends a request to saroh.in/help with a 308 from the day", () => {
        const res = at(
            "2026-10-16T18:30:00.000Z",
            "https://help.saroh.in/getting-started?x=1",
        );
        expect(res.status).toBe(308);
        expect(res.headers.get("location")).toBe(
            "https://www.saroh.in/help/create-your-business",
        );
    });

    it("uses MARKETING_URL when it is set", () => {
        env.MARKETING_URL = "https://saroh.io";
        const res = at("2026-10-20T00:00:00.000Z", "https://help.saroh.io/");
        expect(res.status).toBe(308);
        expect(res.headers.get("location")).toBe("https://saroh.io/help");
    });
});
