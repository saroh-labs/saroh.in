import { describe, expect, it } from "vitest";

import { templateRendersAllowed } from "./guard";

const ROOT = "templates.saroh.app.localhost";
const on = { rootDomain: ROOT, flag: "on", vercelEnv: undefined };

describe("templateRendersAllowed", () => {
    it("answers on the renderer's own host with the switch on", () => {
        expect(templateRendersAllowed({ ...on, host: ROOT })).toBe(true);
        // The port and case never matter.
        expect(
            templateRendersAllowed({
                ...on,
                host: "Templates.Saroh.App.Localhost:4321",
            }),
        ).toBe(true);
    });

    it("refuses on a merchant's address", () => {
        for (const host of [
            `rye.${ROOT}`,
            `test--rye.${ROOT}`,
            "ryeandco.in",
            "www.ryeandco.in",
        ]) {
            expect(templateRendersAllowed({ ...on, host })).toBe(false);
        }
    });

    it("refuses without the switch", () => {
        for (const flag of [undefined, "off", "true", "ON"]) {
            expect(templateRendersAllowed({ ...on, flag, host: ROOT })).toBe(
                false,
            );
        }
    });

    it("refuses on a production deployment, switch or not", () => {
        expect(
            templateRendersAllowed({
                ...on,
                vercelEnv: "production",
                host: ROOT,
            }),
        ).toBe(false);
        expect(
            templateRendersAllowed({ ...on, vercelEnv: "preview", host: ROOT }),
        ).toBe(true);
    });

    it("refuses with no host or no apex to compare with", () => {
        expect(templateRendersAllowed({ ...on, host: null })).toBe(false);
        expect(templateRendersAllowed({ ...on, host: "" })).toBe(false);
        expect(
            templateRendersAllowed({ ...on, rootDomain: "", host: "" }),
        ).toBe(false);
    });
});
