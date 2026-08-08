import {
    MODULES,
    MODULE_KEYS,
    validateModuleRegistry,
    type ModuleDescriptor,
    type ModuleKey,
} from "./module-registry";

/** A minimal valid descriptor, overridable per test. */
function descriptor(
    over: Partial<ModuleDescriptor> & { key: ModuleKey },
): ModuleDescriptor {
    return {
        label: `label-${over.key}`,
        description: "d",
        rootRoutes: ["/x"],
        requiredAction: "site:update",
        dependencies: [],
        projectSelectable: true,
        rolloutFlag: "MODULE_WEBSITE",
        readinessAdapter: over.key,
        deactivationPolicy: over.key,
        ...over,
    };
}

describe("module registry", () => {
    it("ships a valid registry", () => {
        expect(validateModuleRegistry(MODULES)).toEqual({ valid: true });
    });

    it("excludes AI (DEC-015)", () => {
        expect(MODULES.some((m) => (m.key as string) === "AI")).toBe(false);
    });

    it("exposes exactly the eight initial keys", () => {
        expect([...MODULE_KEYS]).toEqual([
            "WEBSITE",
            "CRM",
            "APPOINTMENTS",
            "COMMERCE",
            "PAYMENTS",
            "COMMUNICATIONS",
            "AUTOMATIONS",
            "INSIGHTS",
        ]);
        expect(MODULES.map((m) => m.key)).toEqual([...MODULE_KEYS]);
    });

    it("every module has at least one absolute root route", () => {
        for (const m of MODULES) {
            expect(m.rootRoutes.length).toBeGreaterThan(0);
            for (const route of m.rootRoutes) {
                expect(route.startsWith("/")).toBe(true);
            }
        }
    });

    it("every dependency references a known module", () => {
        const keys = new Set<string>(MODULE_KEYS);
        for (const m of MODULES) {
            for (const dep of m.dependencies) {
                expect(keys.has(dep)).toBe(true);
            }
        }
    });

    describe("validateModuleRegistry rejects", () => {
        it("a rejected AI module", () => {
            const reg = [descriptor({ key: "AI" as ModuleKey })];
            expect(() => validateModuleRegistry(reg)).toThrow(/AI/);
        });

        it("duplicate keys", () => {
            const reg = [
                descriptor({ key: "CRM" }),
                descriptor({ key: "CRM" }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(
                /duplicate module key/,
            );
        });

        it("duplicate labels", () => {
            const reg = [
                descriptor({ key: "CRM", label: "Same" }),
                descriptor({ key: "COMMERCE", label: "Same" }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(
                /duplicate module label/,
            );
        });

        it("a dependency outside MODULE_KEYS", () => {
            const reg = [
                descriptor({ key: "CRM", dependencies: ["NOPE" as ModuleKey] }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/unknown module/);
        });

        it("a route not beginning with a slash", () => {
            const reg = [descriptor({ key: "CRM", rootRoutes: ["crm"] })];
            expect(() => validateModuleRegistry(reg)).toThrow(/root route/);
        });

        it("an unknown rollout flag", () => {
            const reg = [
                descriptor({ key: "CRM", rolloutFlag: "NOPE" as never }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/rollout flag/);
        });

        it("an unknown required action", () => {
            const reg = [
                descriptor({ key: "CRM", requiredAction: "nope:do" as never }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/OrgAction/);
        });

        it("an unknown entitlement key", () => {
            const reg = [
                descriptor({ key: "CRM", entitlementKey: "nope" as never }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/entitlement/);
        });

        it("a direct dependency cycle", () => {
            const reg = [
                descriptor({ key: "CRM", dependencies: ["COMMERCE"] }),
                descriptor({ key: "COMMERCE", dependencies: ["CRM"] }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/cycle/);
        });

        it("a transitive dependency cycle", () => {
            const reg = [
                descriptor({ key: "CRM", dependencies: ["COMMERCE"] }),
                descriptor({ key: "COMMERCE", dependencies: ["PAYMENTS"] }),
                descriptor({ key: "PAYMENTS", dependencies: ["CRM"] }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/cycle/);
        });

        it("a project-selectable module depending on a non-selectable one", () => {
            const reg = [
                descriptor({ key: "CRM", projectSelectable: false }),
                descriptor({
                    key: "APPOINTMENTS",
                    projectSelectable: true,
                    dependencies: ["CRM"],
                }),
            ];
            expect(() => validateModuleRegistry(reg)).toThrow(/non-selectable/);
        });
    });
});
