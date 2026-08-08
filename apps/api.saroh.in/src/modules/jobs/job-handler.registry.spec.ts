import type { Job } from "@saroh/database";

import { JobHandlerRegistry } from "./job-handler.registry";

function job(over: Partial<Job> = {}): Job {
    return { id: "job_1", type: "enquiry.notify", ...over } as Job;
}

describe("JobHandlerRegistry", () => {
    it("registers and looks up a handler by type", () => {
        const reg = new JobHandlerRegistry();
        const handler = jest.fn().mockResolvedValue(undefined);
        reg.register("enquiry.notify", handler);

        expect(reg.has("enquiry.notify")).toBe(true);
        expect(reg.get("enquiry.notify")).toBe(handler);
    });

    it("throws when the same type is registered twice", () => {
        const reg = new JobHandlerRegistry();
        reg.register("enquiry.notify", jest.fn());
        expect(() => reg.register("enquiry.notify", jest.fn())).toThrow(
            /already registered/,
        );
    });

    it("returns a loud no-op fallback for an unknown type (resolves, doesn't throw)", async () => {
        const reg = new JobHandlerRegistry();
        expect(reg.has("nope.unknown")).toBe(false);
        const fallback = reg.get("nope.unknown");
        // Must resolve so the worker COMPLETEs an unknown-type job rather than
        // retrying it forever.
        await expect(
            fallback(job({ type: "nope.unknown" })),
        ).resolves.toBeUndefined();
    });
});
