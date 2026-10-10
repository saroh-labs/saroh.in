import { describe, expect, it } from "vitest";

import type { Invitation, Member } from "@/lib/members/service";

import type { LocationPeople } from "./people";
import {
    onlyOwnerHere,
    onlyOwnerWords,
    peopleAccess,
    personName,
    roleLabel,
    shownInvitations,
} from "./people";

/** A location's People tab: who may do what, and its words. Made-up people. */

const owner: Member = {
    userId: "u_owner",
    name: "Asha Rao",
    email: "asha.rao@example.com",
    role: "OWNER",
    kind: "owner",
};
const dev: Member = {
    userId: "u_dev",
    name: "Dev Shah",
    email: "dev.shah@example.com",
    role: "EDITOR",
    kind: "member",
};
const invited: Invitation = {
    id: "inv_1",
    email: "mira.sen@example.com",
    role: "VIEWER",
    status: "PENDING",
    expiresAt: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-10-10T00:00:00.000Z",
};
const people = (over: Partial<LocationPeople> = {}): LocationPeople => ({
    members: [owner, dev],
    invitations: [],
    canManage: true,
    canInvite: true,
    ...over,
});

describe("peopleAccess", () => {
    it("the location's owner manages; inviting also needs the team's invite", () => {
        expect(
            peopleAccess([owner, dev], "u_owner", {
                role: "MEMBER",
                actions: ["member:invite"],
            }),
        ).toEqual({ canManage: true, canInvite: true });
        expect(
            peopleAccess([owner, dev], "u_owner", {
                role: "OWNER",
                actions: ["store:write"],
            }),
        ).toEqual({ canManage: true, canInvite: false });
    });

    it("someone who works here, but doesn't own it, does neither", () => {
        expect(
            peopleAccess([owner, dev], "u_dev", {
                role: "ADMIN",
                actions: ["member:invite"],
            }),
        ).toEqual({ canManage: false, canInvite: false });
    });

    it("falls back to the role's name for a response without permissions", () => {
        expect(
            peopleAccess([owner], "u_owner", { role: "ADMIN" }).canInvite,
        ).toBe(true);
        expect(
            peopleAccess([owner], "u_owner", { role: "MEMBER" }).canInvite,
        ).toBe(false);
        expect(peopleAccess([owner], "u_owner", null)).toEqual({
            canManage: true,
            canInvite: false,
        });
    });
});

describe("the roster's words", () => {
    it("a role in words, and a person by name or else email", () => {
        expect(roleLabel("VIEWER")).toBe("Viewer");
        expect(personName(dev)).toBe("Dev Shah");
        expect(personName({ ...dev, name: null })).toBe("dev.shah@example.com");
        expect(personName({ ...dev, name: "  " })).toBe("dev.shah@example.com");
    });

    it("invitations are shown only to someone who may manage", () => {
        expect(shownInvitations(people({ invitations: [invited] }))).toEqual([
            invited,
        ]);
        expect(
            shownInvitations(
                people({ invitations: [invited], canManage: false }),
            ),
        ).toEqual([]);
    });
});

describe("only the owner here", () => {
    it("is the owner alone with nobody invited", () => {
        expect(onlyOwnerHere(people({ members: [owner] }))).toBe(true);
        expect(onlyOwnerHere(people())).toBe(false);
        expect(
            onlyOwnerHere(people({ members: [owner], invitations: [invited] })),
        ).toBe(false);
        // No roster at all is not "only the owner": it wasn't shown.
        expect(onlyOwnerHere(people({ members: [] }))).toBe(false);
    });

    it("names who owns it, and offers the invite only to someone who may", () => {
        expect(onlyOwnerWords(people({ members: [owner] }), "Hill Road")).toBe(
            "Asha Rao (asha.rao@example.com) owns Hill Road. Invite someone to work on its catalogue, orders and customers.",
        );
        expect(
            onlyOwnerWords(
                people({
                    members: [{ ...owner, name: null }],
                    canInvite: false,
                }),
                "Hill Road",
            ),
        ).toBe("asha.rao@example.com owns Hill Road.");
        expect(
            onlyOwnerWords(
                people({
                    members: [owner, { ...dev, kind: "owner" }],
                    canInvite: false,
                }),
                "Hill Road",
            ),
        ).toBe(
            "Asha Rao (asha.rao@example.com) and Dev Shah (dev.shah@example.com) own Hill Road.",
        );
    });
});
