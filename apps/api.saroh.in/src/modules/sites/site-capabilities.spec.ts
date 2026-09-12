// #275: the API tells each caller what they may do here, so no screen has to
// mirror organization-policy.ts and drift from it.
import { can } from "../organizations/organization-policy";

/**
 * The shape `getSite` sends. Asserted against the policy rather than against a
 * hand-written table: a second table of role → capability is exactly what this
 * field exists to stop.
 */
function capabilitiesFor(role: Parameters<typeof can>[0]) {
    return {
        edit: can(role, "section:write"),
        publish: can(role, "site:publish"),
        comment: can(role, "site:comment"),
        approve: can(role, "site:approve"),
        manageSettings: can(role, "site:update"),
        manageDomain: can(role, "domain:manage"),
    };
}

describe("what each role may do with a site (#275)", () => {
    it("gives an OWNER everything", () => {
        expect(capabilitiesFor("OWNER")).toEqual({
            edit: true,
            publish: true,
            comment: true,
            approve: true,
            manageSettings: true,
            manageDomain: true,
        });
    });

    it("gives an ADMIN everything: the day-to-day operator", () => {
        expect(capabilitiesFor("ADMIN")).toEqual(capabilitiesFor("OWNER"));
    });

    it("gives a MEMBER nothing but the read the site page already allows", () => {
        // Every capability here is a write or a verdict. A MEMBER may look.
        expect(Object.values(capabilitiesFor("MEMBER"))).toEqual([
            false,
            false,
            false,
            false,
            false,
            false,
        ]);
    });

    it("lets a REVIEWER comment and approve, and nothing else", () => {
        expect(capabilitiesFor("REVIEWER")).toEqual({
            edit: false,
            publish: false,
            comment: true,
            approve: true,
            manageSettings: false,
            manageDomain: false,
        });
    });

    it("never lets a role that cannot edit still publish", () => {
        // The pairing the screens rely on: the reviewer surface is chosen by
        // `edit`, and it must never be the one hiding a publish control from
        // someone who has it.
        for (const role of ["OWNER", "ADMIN", "MEMBER", "REVIEWER"] as const) {
            const caps = capabilitiesFor(role);
            if (caps.publish) expect(caps.edit).toBe(true);
        }
    });
});
