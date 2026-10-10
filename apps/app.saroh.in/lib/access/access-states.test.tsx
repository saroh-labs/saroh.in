/**
 * The right card for the state, and no control a role can't use (UX audit,
 * 10 Oct 2026): a denial is drawn with `PermissionDeniedState`, never the
 * dashed card of "nothing here yet" or the red one of a failed read, and a
 * lead's write controls are drawn only for someone who may use them.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/navigation", () => ({
    notFound: () => {
        throw new Error("NEXT_NOT_FOUND");
    },
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
}));
vi.mock("@/lib/leads/actions", () => ({
    completeTask: vi.fn(),
    addNote: vi.fn(),
    addTask: vi.fn(),
    createActivity: vi.fn(),
    createTask: vi.fn(),
}));
vi.mock("@/lib/messages/actions", () => ({
    setConsent: vi.fn(),
    sendMessage: vi.fn(),
}));
const resolveActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => resolveActiveOrganization() as unknown,
}));
const moduleAccess = vi.fn();
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: (...args: unknown[]) => moduleAccess(...args) as unknown,
}));
vi.mock("@/components/billing/plan-locked", () => ({
    PlanLocked: () => null,
}));

import { BookingsLocked } from "@/components/bookings/calendar/parts";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { ConsentToggle } from "@/components/crm/consent-toggle";
import { LeadActions } from "@/components/crm/lead-actions";
import { FollowUpsList } from "@/components/leads/follow-ups-list";
import { ModuleGate } from "@/components/modules/module-gate";
import { ServiceEditorState } from "@/components/services/service-editor/editor-states";
import { postParagraphs } from "@/lib/content/plain-text";
import type { ComposerGate } from "@/lib/messages/composer-gate";

const text = (node: React.ReactNode) =>
    renderToStaticMarkup(<>{node}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const WHO = "An owner or admin can change this in Settings › Team.";

beforeEach(() => {
    resolveActiveOrganization.mockReset();
    moduleAccess.mockReset();
});

describe("BookingsLocked", () => {
    const html = text(<BookingsLocked business="Rye & Co." role="Reviewer" />);

    it("is the denied card: a solid wall, not a dashed space to fill", () => {
        expect(html).toContain("border-solid");
        expect(html).not.toContain("border-dashed");
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain("Try again");
    });

    it("says the one sentence, with the menu's name", () => {
        expect(html).toContain("You can't open Bookings");
        expect(html).toContain(
            "Your role in Rye & Co. is Reviewer. It doesn't include Bookings.",
        );
        expect(html).toContain(WHO);
        expect(html).toContain("Back to Home");
    });

    it("leaves out a role it wasn't told", () => {
        expect(
            text(<BookingsLocked business="Rye & Co." role={null} />),
        ).toContain("Your role in Rye & Co. doesn't include Bookings.");
    });
});

describe("the Service Editor's states", () => {
    it.each([
        ["forbidden", "You can't open Services", "Back to Home"],
        ["cant-add", "You can't open New service", "Back to services"],
    ] as const)(
        "%s is a denial, not the red failed card",
        (state, title, back) => {
            const html = text(
                <ServiceEditorState state={state} retryHref="/services/new" />,
            );
            expect(html).toContain(title);
            expect(html).toContain(WHO);
            expect(html).toContain(back);
            expect(html).not.toContain('role="alert"');
            expect(html).not.toContain("border-destructive");
            expect(html).not.toContain("Try again");
        },
    );

    it("a read that failed is still the failed card, with a retry", () => {
        const html = text(
            <ServiceEditorState state="failed" retryHref="/services/svc_1" />,
        );
        expect(html).toContain('role="alert"');
        expect(html).toContain("Couldn't load this service");
        expect(html).toContain("Try again");
    });
});

describe("ModuleGate", () => {
    const blocked = (key: string, label: string, code: string) => ({
        state: "unavailable",
        module: {
            key,
            label,
            lifecycle: "DISABLED",
            canManage: true,
            blockers: [{ code }],
        },
    });
    const gate = async (key: string) =>
        text(await ModuleGate({ moduleKey: key, children: <p>inside</p> }));

    it("names a module the menu's way in a denial: Sell, not Commerce", async () => {
        moduleAccess.mockResolvedValue(
            blocked("COMMERCE", "Commerce", "UNAUTHORIZED"),
        );
        resolveActiveOrganization.mockResolvedValue({
            name: "Rye & Co.",
            role: "REVIEWER",
            roleKey: "REVIEWER",
        });
        const html = await gate("COMMERCE");
        expect(html).toContain("You can't open Sell");
        expect(html).toContain(
            "Your role in Rye & Co. is Reviewer. It doesn't include Sell.",
        );
        expect(html).toContain(WHO);
        expect(html).not.toMatch(/Commerce|organization|by address/);
        expect(html).not.toContain("inside");
    });

    it("says Contacts, never CRM", async () => {
        moduleAccess.mockResolvedValue(blocked("CRM", "CRM", "UNAUTHORIZED"));
        resolveActiveOrganization.mockResolvedValue(null);
        const html = await gate("CRM");
        expect(html).toContain("You can't open Contacts");
        expect(html).toContain("Your role doesn't include Contacts.");
        expect(html).not.toContain("CRM");
    });

    it("says a module that is off is off for the business, and where to turn it on", async () => {
        moduleAccess.mockResolvedValue(
            blocked("COMMERCE", "Commerce", "ORG_MODULE_DISABLED"),
        );
        const html = await gate("COMMERCE");
        expect(html).toContain("Sell is turned off");
        expect(html).toContain(
            "Sell is not switched on for this business. Nothing it holds has been deleted. Turning it on brings this section back.",
        );
        expect(html).toContain("Turn on in Modules");
        expect(html).toContain('href="/settings/modules"');
        expect(html).not.toMatch(/Manage capabilities|organization|[—;]/);
    });

    it("draws the section when the module is available", async () => {
        moduleAccess.mockResolvedValue({ state: "available" });
        expect(await gate("COMMERCE")).toContain("inside");
    });
});

describe("a lead's controls, by permission", () => {
    const open: ComposerGate = { kind: "compose" };
    const gates = { EMAIL: open, WHATSAPP: open };
    const actions = (canLog: boolean, canMessage: boolean) =>
        text(
            <LeadActions
                leadId="lead_1"
                contactId="contact_1"
                consent={{}}
                gates={gates}
                canLog={canLog}
                canMessage={canMessage}
            />,
        );

    it("offers all three to someone who may do all three", () => {
        const html = actions(true, true);
        expect(html).toContain("Add note");
        expect(html).toContain("Schedule follow-up");
        expect(html).toContain("Send message");
    });

    it("offers no note or follow-up without activity:write", () => {
        const html = actions(false, true);
        expect(html).not.toContain("Add note");
        expect(html).not.toContain("Schedule follow-up");
        expect(html).toContain("Send message");
    });

    it("offers no message without message:write", () => {
        const html = actions(true, false);
        expect(html).toContain("Add note");
        expect(html).not.toContain("Send message");
    });

    it("draws nothing for someone who may do none of it", () => {
        expect(actions(false, false)).toBe("");
    });

    const task = {
        id: "task_1",
        leadId: "lead_1",
        body: "Call back",
        dueAt: "2099-10-01T05:30:00.000Z",
    };

    it("Follow-ups shows Done only to someone with activity:write", () => {
        const list = (canWrite: boolean) =>
            text(
                <FollowUpsList
                    tasks={[task] as never}
                    leads={{ lead_1: { title: "Wedding cake", who: null } }}
                    canWrite={canWrite}
                />,
            );
        expect(list(true)).toContain(">Done<");
        expect(list(false)).not.toContain(">Done<");
        expect(list(false)).toContain("Call back");
    });

    it("the timeline's open follow-up has no button for a reader", () => {
        const entry = {
            id: "act_1",
            type: "TASK",
            body: "Call back",
            dueAt: "2099-10-01T05:30:00.000Z",
            completedAt: null,
            createdAt: "2026-10-01T05:30:00.000Z",
        };
        const timeline = (canWrite: boolean) =>
            text(
                <ActivityTimeline
                    leadId="lead_1"
                    activities={[entry] as never}
                    canWrite={canWrite}
                />,
            );
        expect(timeline(true)).toContain("<button");
        expect(timeline(false)).not.toContain("<button");
        expect(timeline(false)).toContain("Call back");
    });

    it("consent reads, with no Grant or Revoke, without consent:write", () => {
        const consent = (canWrite: boolean) =>
            text(
                <ConsentToggle
                    contactId="contact_1"
                    consent={{ EMAIL: "REVOKED" }}
                    canWrite={canWrite}
                />,
            );
        expect(consent(true)).toContain("<button");
        expect(consent(false)).not.toContain("<button");
        expect(consent(false)).toContain("REVOKED");
    });
});

describe("postParagraphs, a post's body as text", () => {
    it("keeps the writing and drops every tag", () => {
        expect(
            postParagraphs(
                "<h2>Hours</h2><p>From <strong>1 December</strong> we close at 6.</p><ul><li>Mon</li><li>Tue</li></ul>",
            ),
        ).toEqual(["Hours", "From 1 December we close at 6.", "Mon", "Tue"]);
    });

    it("never lets markup through, a script's contents least of all", () => {
        const out = postParagraphs(
            '<p>Hi</p><script>alert("x")</script><img src=x onerror=alert(1)><style>p{}</style>',
        );
        expect(out).toEqual(["Hi"]);
    });

    it("reads entities as the characters they are, once", () => {
        expect(postParagraphs("<p>Tea &amp; cake&nbsp;&lt;3</p>")).toEqual([
            "Tea & cake <3",
        ]);
        expect(postParagraphs("<p>&amp;lt;b&amp;gt;</p>")).toEqual([
            "&lt;b&gt;",
        ]);
    });

    it("is empty for an empty post", () => {
        expect(postParagraphs("")).toEqual([]);
        expect(postParagraphs(null)).toEqual([]);
        expect(postParagraphs("<p></p><p> </p>")).toEqual([]);
    });
});
