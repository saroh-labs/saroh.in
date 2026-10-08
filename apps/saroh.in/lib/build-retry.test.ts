import { describe, expect, it, vi } from "vitest";

import { withBuildRetries } from "./build-retry";

const noSleep = () => Promise.resolve();

describe("withBuildRetries (a read while the site is built)", () => {
    it("returns the first success, after failures", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const read = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error("timeout"))
            .mockRejectedValueOnce(new Error("503"))
            .mockResolvedValue("ok");
        await expect(withBuildRetries(read, [1, 1, 1], noSleep)).resolves.toBe(
            "ok",
        );
        expect(read).toHaveBeenCalledTimes(3);
    });

    it("throws the last failure once the retries are spent", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const read = vi.fn(() => Promise.reject(new Error("still down")));
        await expect(withBuildRetries(read, [1, 1], noSleep)).rejects.toThrow(
            "still down",
        );
        expect(read).toHaveBeenCalledTimes(3);
    });
});
