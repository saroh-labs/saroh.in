import { googleBusyCounted, setGoogleBusyGate } from "./google-busy-gate";

describe("the Google busy gate (GC-02)", () => {
    afterEach(() => setGoogleBusyGate(null));

    it("counts nobody's Google busy times until Google Calendar registers", async () => {
        await expect(googleBusyCounted("org_a")).resolves.toBeNull();
    });

    it("asks what Google Calendar registered", async () => {
        setGoogleBusyGate((org) =>
            Promise.resolve(new Set(org === "org_a" ? ["m_1"] : [])),
        );
        await expect(googleBusyCounted("org_a")).resolves.toEqual(
            new Set(["m_1"]),
        );
    });
});
