import { retrySerializable } from "./serializable-retry";

const raced = () => Object.assign(new Error("raced"), { code: "P2034" });
const noWait = () => Promise.resolve();

describe("retrySerializable (review #33)", () => {
    it("tries again after a lost race and returns the write's answer", async () => {
        const write = jest
            .fn()
            .mockRejectedValueOnce(raced())
            .mockResolvedValueOnce("booked");
        await expect(retrySerializable(write, { sleep: noWait })).resolves.toBe(
            "booked",
        );
        expect(write).toHaveBeenCalledTimes(2);
    });

    it("gives up after three tries, throwing the race", async () => {
        const write = jest
            .fn()
            .mockImplementation(() => Promise.reject(raced()));
        await expect(
            retrySerializable(write, { sleep: noWait }),
        ).rejects.toMatchObject({ code: "P2034" });
        expect(write).toHaveBeenCalledTimes(3);
    });

    it("never retries any other error", async () => {
        const write = jest.fn().mockRejectedValue(new Error("fully booked"));
        await expect(
            retrySerializable(write, { sleep: noWait }),
        ).rejects.toThrow("fully booked");
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("waits 20 to 80 ms between tries", async () => {
        const waits: number[] = [];
        const write = jest
            .fn()
            .mockImplementation(() => Promise.reject(raced()));
        await retrySerializable(write, {
            sleep: (ms) => {
                waits.push(ms);
                return Promise.resolve();
            },
        }).catch(() => undefined);
        expect(waits).toHaveLength(2);
        for (const ms of waits) {
            expect(ms).toBeGreaterThanOrEqual(20);
            expect(ms).toBeLessThanOrEqual(80);
        }
    });
});
