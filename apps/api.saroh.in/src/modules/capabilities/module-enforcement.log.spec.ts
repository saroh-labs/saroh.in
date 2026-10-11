import { structuredLogger } from "../../common/logging/structured-logger";
import {
    LOG_WINDOW_MS,
    logModuleEnforcement,
    MAX_KEYS,
    resetModuleEnforcementLog,
} from "./module-enforcement.log";

/**
 * The guard's log lines (#117): one per key per window, however much
 * traffic repeats it, with the count folded in; bounded memory.
 */
describe("logModuleEnforcement", () => {
    let info: jest.SpyInstance;
    let warn: jest.SpyInstance;

    beforeEach(() => {
        resetModuleEnforcementLog();
        info = jest.spyOn(structuredLogger, "info").mockImplementation();
        warn = jest.spyOn(structuredLogger, "warn").mockImplementation();
    });
    afterEach(() => {
        jest.restoreAllMocks();
    });

    const FIELDS = {
        module: "COMMERCE",
        route: "POST /organizations/:organizationId/orders/:orderId/stage",
        org: "org_1",
        blockers: ["ORG_MODULE_DISABLED"],
        status: 403,
    };

    it("writes would_refuse at INFO and refused at WARN, with the fields", () => {
        logModuleEnforcement("module_enforcement_would_refuse", FIELDS, 0);
        logModuleEnforcement("module_enforcement_refused", FIELDS, 0);
        expect(info).toHaveBeenCalledWith("module_enforcement_would_refuse", {
            ...FIELDS,
            repeats: 0,
        });
        expect(warn).toHaveBeenCalledWith("module_enforcement_refused", {
            ...FIELDS,
            repeats: 0,
        });
    });

    it("writes one line per window and counts the rest into the next", () => {
        const e = "module_enforcement_would_refuse" as const;
        expect(logModuleEnforcement(e, FIELDS, 0)).toBe(true);
        expect(logModuleEnforcement(e, FIELDS, 1)).toBe(false);
        expect(logModuleEnforcement(e, FIELDS, LOG_WINDOW_MS - 1)).toBe(false);
        expect(info).toHaveBeenCalledTimes(1);

        expect(logModuleEnforcement(e, FIELDS, LOG_WINDOW_MS)).toBe(true);
        expect(info).toHaveBeenLastCalledWith(e, { ...FIELDS, repeats: 2 });
    });

    it("keeps different organizations, routes and modules apart", () => {
        const e = "module_enforcement_would_refuse" as const;
        logModuleEnforcement(e, FIELDS, 0);
        logModuleEnforcement(e, { ...FIELDS, org: "org_2" }, 0);
        logModuleEnforcement(e, { ...FIELDS, route: "GET /x" }, 0);
        logModuleEnforcement(e, { ...FIELDS, module: "CRM" }, 0);
        expect(info).toHaveBeenCalledTimes(4);
    });

    it("forgets the oldest key past its limit rather than growing", () => {
        const e = "module_enforcement_refused" as const;
        for (let i = 0; i <= MAX_KEYS; i += 1) {
            logModuleEnforcement(e, { ...FIELDS, org: `org_${i}` }, 0);
        }
        // org_0 was forgotten, so it writes again inside the window …
        expect(logModuleEnforcement(e, { ...FIELDS, org: "org_0" }, 1)).toBe(
            true,
        );
        // … while a recent key is still remembered.
        expect(
            logModuleEnforcement(e, { ...FIELDS, org: `org_${MAX_KEYS}` }, 1),
        ).toBe(false);
    });
});
