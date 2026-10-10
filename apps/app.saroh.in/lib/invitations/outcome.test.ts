import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
    INVITATION_GONE,
    INVITATION_REFUSED_TITLE,
    INVITATION_UNREACHABLE,
    INVITATION_WRONG_PERSON_TITLE,
    invitationProblem,
    LOCATION_WRONG_EMAIL,
    switchAccountLabel,
    wrongPersonDescription,
} from "./outcome";

const APPS = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(APPS, file), "utf8");

/**
 * An invitation that was not accepted (UX audit, 10 Oct): a failure to
 * reach the API used to read as "This invitation cannot be used".
 */
describe("invitationProblem", () => {
    it("is unreachable when the API never answered or could not", () => {
        expect(invitationProblem(null)).toBe("unreachable");
        for (const status of [500, 502, 503, 504, 429]) {
            expect(invitationProblem(status), String(status)).toBe(
                "unreachable",
            );
        }
    });

    it("is unreachable for a lapsed session, so trying again signs them in", () => {
        expect(invitationProblem(401)).toBe("unreachable");
    });

    it("is gone for unknown, withdrawn, used and expired alike", () => {
        expect(invitationProblem(404)).toBe("gone");
        expect(invitationProblem(400)).toBe("gone");
        expect(invitationProblem(410)).toBe("gone");
    });

    it("is the wrong person for a business invitation's 403", () => {
        expect(invitationProblem(403)).toBe("wrong-person");
    });

    it("tells a location's two 403s apart by the refusal", () => {
        expect(invitationProblem(403, true)).toBe("wrong-person");
        expect(invitationProblem(403, false)).toBe("refused");
    });

    it("is refused, in the API's words, for anything else it said no to", () => {
        // 409: the business's plan has no room (INVITATION_PAUSED).
        expect(invitationProblem(409)).toBe("refused");
        expect(invitationProblem(422)).toBe("refused");
    });
});

describe("what each state says", () => {
    it("never calls an unchecked invitation unusable", () => {
        expect(INVITATION_UNREACHABLE.title).toBe(
            "Couldn't check this invitation",
        );
        expect(INVITATION_UNREACHABLE.description).toBe(
            "Try again in a moment. The invitation itself is untouched.",
        );
    });

    it("has one title for the gone state, the same as before sign-in", () => {
        expect(INVITATION_GONE.title).toBe(
            "This invitation can no longer be used",
        );
        // The accounts page a signed-out invitee reads says the same.
        const accounts = read("accounts.saroh.in/lib/invitations.ts");
        expect(accounts).toContain(`title: "${INVITATION_GONE.title}"`);
        expect(accounts).toContain(`"${INVITATION_GONE.description}"`);
        expect(accounts).toContain(`title: "${INVITATION_UNREACHABLE.title}"`);
        expect(accounts).toContain(
            `description: "${INVITATION_UNREACHABLE.description}"`,
        );
    });

    it("names both people when the wrong one is signed in", () => {
        expect(INVITATION_WRONG_PERSON_TITLE).toBe(
            "This invitation is for someone else",
        );
        expect(
            wrongPersonDescription("ravi@example.com", "asha@example.com"),
        ).toBe(
            "It was sent to ravi@example.com. You are signed in as asha@example.com. Only the person it was sent to can accept it.",
        );
        // A location's invitation does not say who it was sent to.
        expect(wrongPersonDescription(null, "asha@example.com")).toBe(
            "It was sent to a different email address. You are signed in as asha@example.com. Only the person it was sent to can accept it.",
        );
    });

    it("offers to sign out and use the invited address", () => {
        expect(switchAccountLabel("ravi@example.com")).toBe(
            "Sign out and use ravi@example.com",
        );
        expect(switchAccountLabel(null)).toBe("Sign out and use another email");
    });

    it("says business and location, never workspace or storefront", () => {
        const words = [
            INVITATION_GONE.title,
            INVITATION_GONE.description,
            INVITATION_UNREACHABLE.title,
            INVITATION_UNREACHABLE.description,
            INVITATION_WRONG_PERSON_TITLE,
            INVITATION_REFUSED_TITLE,
            wrongPersonDescription("a@example.com", "b@example.com"),
            switchAccountLabel("a@example.com"),
        ];
        for (const line of words) {
            expect(line).not.toMatch(/workspace|storefront|organi[sz]ation/i);
            expect(line).not.toMatch(/[—;]/);
        }
        for (const page of [
            "app.saroh.in/app/(shell)/join/[token]/page.tsx",
            "app.saroh.in/app/(shell)/invitations/[token]/page.tsx",
        ]) {
            expect(read(page)).toMatch(/title: "Join a (business|location)"/);
        }
    });
});

describe("the location accept's wrong-account refusal", () => {
    it("is the API's own sentence", () => {
        expect(
            read("api.saroh.in/src/modules/members/members.service.ts"),
        ).toContain(`"${LOCATION_WRONG_EMAIL}"`);
    });
});
