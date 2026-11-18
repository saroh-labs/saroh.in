import { memberLeaving, setMemberLeavingHook } from "./member-leaving";

describe("what lets go of someone leaving (GC-09)", () => {
    afterEach(() => setMemberLeavingHook(null));

    it("does nothing with no hook registered", async () => {
        await expect(memberLeaving("org_a", "m_1")).resolves.toBeUndefined();
    });

    it("runs the registered hook with the business and the membership", async () => {
        const hook = jest.fn().mockResolvedValue(undefined);
        setMemberLeavingHook(hook);
        await memberLeaving("org_a", "m_1");
        expect(hook).toHaveBeenCalledWith("org_a", "m_1");
    });
});
