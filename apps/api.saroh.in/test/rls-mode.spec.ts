import {
    isRlsTestMode,
    organizationOfCall,
    roleUrl,
    wrapOrgScopedMethods,
} from "./rls-mode";

describe("integration RLS mode (#53)", () => {
    it("is on only when TEST_RLS says so", () => {
        expect(isRlsTestMode({})).toBe(false);
        expect(isRlsTestMode({ TEST_RLS: "on" })).toBe(true);
        expect(isRlsTestMode({ TEST_RLS: "1" })).toBe(true);
        expect(isRlsTestMode({ TEST_RLS: "off" })).toBe(false);
    });

    it("swaps the user and password, keeping the database", () => {
        expect(
            roleUrl("postgresql://owner@localhost:5432/saroh_test", "r", "p"),
        ).toBe("postgresql://r:p@localhost:5432/saroh_test");
    });

    class Sample {
        withContext(_ctx: unknown) {
            return 1;
        }
        withId(organizationId: string) {
            return organizationId;
        }
        withOther(siteId: string) {
            return siteId;
        }
    }
    const p = Sample.prototype;

    it("finds the organization of a call made with an OrganizationContext", () => {
        const ctx = { organizationId: "org_1", userId: "u", role: "OWNER" };
        expect(organizationOfCall(p.withContext, [ctx])).toBe("org_1");
        // A job payload or DTO that merely mentions an organization is not a
        // request context: jobs run with no context in production.
        expect(
            organizationOfCall(p.withContext, [{ organizationId: "org_1" }]),
        ).toBeUndefined();
    });

    it("finds it from a first parameter named organizationId, and nothing else", () => {
        expect(organizationOfCall(p.withId, ["org_2"])).toBe("org_2");
        expect(organizationOfCall(p.withOther, ["site_1"])).toBeUndefined();
        expect(organizationOfCall(p.withId, [])).toBeUndefined();
    });

    it("runs a wrapped method inside the context and leaves others alone", () => {
        class Svc {
            a(organizationId: string) {
                return `ran ${organizationId}`;
            }
            b(x: string) {
                return x;
            }
        }
        const seen: string[] = [];
        wrapOrgScopedMethods(Svc, (id, fn) => {
            seen.push(id);
            return fn();
        });
        const svc = new Svc();
        expect(svc.a("org_3")).toBe("ran org_3");
        expect(svc.b("plain")).toBe("plain");
        expect(seen).toEqual(["org_3"]);
    });
});
