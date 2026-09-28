import { describe, expect, it, vi } from "vitest";

import { customerReader } from "./customer-reader";

describe("customerReader", () => {
    it("reads who is signed in once, however many parts of the page ask", async () => {
        const read = vi.fn(() =>
            Promise.resolve({ email: "asha@example.in", name: "Asha" }),
        );
        const customer = customerReader(read);
        const [a, b] = await Promise.all([customer(), customer()]);
        expect(await customer()).toEqual(a);
        expect(b).toEqual({ email: "asha@example.in", name: "Asha" });
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("is signed out when the read fails, and doesn't ask again", async () => {
        const read = vi.fn(() => Promise.reject(new Error("down")));
        const customer = customerReader(read);
        expect(await customer()).toBeNull();
        expect(await customer()).toBeNull();
        expect(read).toHaveBeenCalledTimes(1);
    });
});
