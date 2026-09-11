import { JobHandlerRegistry } from "./job-handler.registry";

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

    it("has no fallback for an unknown type — the worker dead-letters it", () => {
        const reg = new JobHandlerRegistry();
        expect(reg.has("nope.unknown")).toBe(false);
        // Not a resolving no-op: that is what let the worker record an
        // unhandled job as DONE.
        expect(reg.get("nope.unknown")).toBeUndefined();
    });
});
