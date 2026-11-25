import { correlationStorage, requestMemo } from "./request-context";

const inRequest = <T>(method: string, fn: () => Promise<T>) =>
    correlationStorage.run({ correlationId: "c", method }, fn);

describe("requestMemo", () => {
    it("reads once per key inside a GET", async () => {
        const load = jest.fn().mockResolvedValue(1);
        await inRequest("GET", async () => {
            await Promise.all([
                requestMemo("plan:a", load),
                requestMemo("plan:a", load),
            ]);
            await requestMemo("plan:b", load);
        });
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("reads every time in a write, outside a request, and in the next request", async () => {
        const load = jest.fn().mockResolvedValue(1);
        await inRequest("POST", async () => {
            await requestMemo("k", load);
            await requestMemo("k", load);
        });
        await requestMemo("k", load);
        await inRequest("GET", () => requestMemo("k", load));
        await inRequest("GET", () => requestMemo("k", load));
        expect(load).toHaveBeenCalledTimes(5);
    });

    it("doesn't keep a failure", async () => {
        const load = jest
            .fn()
            .mockRejectedValueOnce(new Error("db down"))
            .mockResolvedValue(2);
        await inRequest("GET", async () => {
            await expect(requestMemo("k", load)).rejects.toThrow("db down");
            await expect(requestMemo("k", load)).resolves.toBe(2);
        });
    });
});
