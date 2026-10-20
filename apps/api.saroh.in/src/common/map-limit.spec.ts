import { mapLimit } from "./map-limit";

describe("mapLimit (review #17)", () => {
    it("keeps the items' order whatever order they finish in", async () => {
        const out = await mapLimit([30, 10, 20, 0], 2, async (ms, i) => {
            await new Promise((r) => setTimeout(r, ms));
            return `${i}:${ms}`;
        });
        expect(out).toEqual(["0:30", "1:10", "2:20", "3:0"]);
    });

    it("never has more than the limit in flight", async () => {
        let inFlight = 0;
        let most = 0;
        await mapLimit(
            Array.from({ length: 25 }, (_, i) => i),
            5,
            async () => {
                inFlight += 1;
                most = Math.max(most, inFlight);
                await new Promise((r) => setTimeout(r, 1));
                inFlight -= 1;
            },
        );
        expect(most).toBe(5);
    });

    it("runs nothing for no items", async () => {
        const fn = jest.fn();
        await expect(mapLimit([], 5, fn)).resolves.toEqual([]);
        expect(fn).not.toHaveBeenCalled();
    });
});
