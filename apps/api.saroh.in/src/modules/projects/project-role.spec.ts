import {
    canInProject,
    isProjectRole,
    PROJECT_ROLES,
    strongestProjectRole,
} from "./project-role";

describe("project-role: precedence (MANAGER > EDITOR > VIEWER)", () => {
    it("picks the strongest role from a set of paths", () => {
        expect(strongestProjectRole(["VIEWER", "MANAGER", "EDITOR"])).toBe(
            "MANAGER",
        );
        expect(strongestProjectRole(["VIEWER", "EDITOR"])).toBe("EDITOR");
        expect(strongestProjectRole(["VIEWER"])).toBe("VIEWER");
    });

    it("returns null when there are no roles (no access)", () => {
        expect(strongestProjectRole([])).toBeNull();
    });

    it("ignores unknown strings so a bad row cannot masquerade as a role", () => {
        expect(strongestProjectRole(["OWNER", "bogus"])).toBeNull();
        expect(strongestProjectRole(["bogus", "EDITOR"])).toBe("EDITOR");
    });

    it("is order-independent", () => {
        expect(strongestProjectRole(["MANAGER", "VIEWER"])).toBe(
            strongestProjectRole(["VIEWER", "MANAGER"]),
        );
    });
});

describe("project-role: isProjectRole", () => {
    it("accepts exactly the known roles", () => {
        for (const role of PROJECT_ROLES) {
            expect(isProjectRole(role)).toBe(true);
        }
        expect(isProjectRole("OWNER")).toBe(false);
        expect(isProjectRole("")).toBe(false);
    });
});

describe("project-role: capabilities", () => {
    it("VIEWER is read-only", () => {
        expect(canInProject("VIEWER", "project:read")).toBe(true);
        expect(canInProject("VIEWER", "project:write")).toBe(false);
        expect(canInProject("VIEWER", "project:manage")).toBe(false);
    });

    it("EDITOR reads + writes but cannot manage", () => {
        expect(canInProject("EDITOR", "project:read")).toBe(true);
        expect(canInProject("EDITOR", "project:write")).toBe(true);
        expect(canInProject("EDITOR", "project:manage")).toBe(false);
    });

    it("MANAGER has full control", () => {
        expect(canInProject("MANAGER", "project:read")).toBe(true);
        expect(canInProject("MANAGER", "project:write")).toBe(true);
        expect(canInProject("MANAGER", "project:manage")).toBe(true);
    });
});
