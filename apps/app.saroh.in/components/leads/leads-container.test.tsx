// @vitest-environment jsdom
/**
 * Leads, the Pipeline board and a lead's page on React Query, first paint
 * (owner, 25 Nov): the list and the board draw their heading, the Board |
 * List switch, the tabs and their buttons at once (New lead held until
 * what it offers is read), with skeleton rows and no lead; a lead's page,
 * whose title and actions are the lead's, keeps the route's loader. Then
 * the rows land in their place. A lead write reads Leads, Contacts and the
 * shell's badges again and marks Customers and Home stale.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/leads",
    notFound: () => {
        throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    },
}));
vi.mock("@/lib/api/http", () => ({}));

import { LeadDetailContainer } from "@/components/crm/lead-detail-container";
import { PipelineContainer } from "@/components/crm/pipeline-container";
import { LeadsContainer } from "@/components/leads/leads-container";
import { leadsSaved } from "@/lib/leads/use-leads";
import { LIST_LIMIT } from "@/lib/lists/capped";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const LEAD = {
    id: "l1",
    title: "Wedding flowers",
    status: "OPEN",
    value: 500000,
    pipelineId: "p1",
    stageId: "s1",
    createdAt: "2026-11-01T00:00:00.000Z",
    contact: {
        id: "c1",
        email: "asha@example.com",
        firstName: "Asha",
        lastName: "Rao",
        company: null,
        phone: null,
    },
    stage: { id: "s1", name: "New", order: 0 },
};
const ADD = {
    contacts: [],
    stages: [{ id: "s1", name: "New" }],
    currency: "INR",
};
const BODY: Record<string, unknown> = {
    "/api/leads": { leads: [LEAD], tasks: [], addLead: ADD },
    "/api/pipeline": {
        pipeline: {
            id: "p1",
            name: "Sales",
            isDefault: true,
            createdAt: "2026-11-01T00:00:00.000Z",
            stages: [{ id: "s1", name: "New", order: 0, pipelineId: "p1" }],
        },
        leads: [LEAD],
        addLead: ADD,
    },
    "/api/leads/l1": {
        lead: {
            ...LEAD,
            pipeline: { id: "p1", name: "Sales", stages: [LEAD.stage] },
            activities: [],
        },
        messages: [],
        consent: {},
    },
};

let release: () => void;
const reads: string[] = [];

beforeEach(() => {
    reads.length = 0;
    const landed = new Promise<void>((r) => (release = r));
    // A desk: the board doesn't scroll to its first lead.
    vi.stubGlobal("matchMedia", () => ({
        matches: false,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
            reads.push(url);
            await landed;
            const body = BODY[url.split("?")[0] ?? ""];
            return body
                ? new Response(JSON.stringify(body), { status: 200 })
                : new Response(JSON.stringify({ code: "not_found" }), {
                      status: 404,
                  });
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

const newLead = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent === "New lead",
    );

describe("Leads before its first read", () => {
    it("draws the frame and skeleton rows, then the leads in their place", async () => {
        const { host, unmount } = renderWithQuery(
            <LeadsContainer tab="leads" canWrite canLog currency="INR" />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Leads");
        expect(host.textContent).toContain("Follow-ups");
        expect(newLead(host)?.disabled).toBe(true);
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(
            host.querySelector('[data-slot="figure-loading"]'),
        ).not.toBeNull();
        expect(host.textContent).not.toContain("Wedding flowers");
        expect(reads).toEqual(["/api/leads"]);

        release();
        await tick(50);
        expect(host.querySelector('[data-shape="rows"]')).toBeNull();
        expect(host.textContent).toContain("Wedding flowers");
        expect(newLead(host)?.disabled).toBe(false);
        unmount();
    });
});

describe("the Pipeline board before its first read", () => {
    it("draws the heading and held buttons, then the columns", async () => {
        const { host, unmount } = renderWithQuery(
            <PipelineContainer canWrite mayManage currency="INR" />,
        );
        await tick();
        expect(host.querySelector("h1")?.textContent).toContain("Pipeline");
        expect(newLead(host)?.disabled).toBe(true);
        expect(host.querySelector('[data-shape="rows"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="Stage New"]')).toBeNull();

        release();
        await tick(50);
        expect(host.querySelector('[aria-label="Stage New"]')).not.toBeNull();
        expect(host.textContent).toContain("Wedding flowers");
        unmount();
    });
});

describe("the leads cap", () => {
    const NOTE = `Showing ${LIST_LIMIT} leads: every open one first`;

    it("says nothing below the cap", async () => {
        release();
        const { host, unmount } = renderWithQuery(
            <LeadsContainer tab="leads" canWrite canLog currency="INR" />,
        );
        await tick(50);
        expect(host.textContent).toContain("Wedding flowers");
        expect(host.textContent).not.toContain(NOTE);
        unmount();
    });

    it("the board says it holds the API's LIST_LIMIT, open ones first", async () => {
        const many = Array.from({ length: LIST_LIMIT }, (_, i) => ({
            ...LEAD,
            id: `l${i}`,
        }));
        const pipeline = BODY["/api/pipeline"] as Record<string, unknown>;
        BODY["/api/pipeline"] = { ...pipeline, leads: many };
        try {
            release();
            const { host, unmount } = renderWithQuery(
                <PipelineContainer
                    canWrite={false}
                    mayManage={false}
                    currency="INR"
                />,
            );
            await tick(100);
            expect(host.textContent).toContain(NOTE);
            unmount();
        } finally {
            BODY["/api/pipeline"] = pipeline;
        }
    });
});

describe("a lead's page", () => {
    const open = (leadId: string) =>
        renderWithQuery(
            <LeadDetailContainer
                ask={{ leadId }}
                skeleton={<p data-testid="loader">Loading the lead</p>}
                canWrite
                canLog
                canMessage
                canConsent
                currency="INR"
                gates={{
                    EMAIL: { kind: "compose" },
                    WHATSAPP: { kind: "compose" },
                }}
            />,
        );

    it("keeps the route's loader until the lead lands", async () => {
        const { host, unmount } = open("l1");
        await tick();
        expect(host.querySelector('[data-testid="loader"]')).not.toBeNull();
        expect(host.querySelector("h1")).toBeNull();
        release();
        await tick(50);
        expect(host.querySelector("h1")?.textContent).toContain(
            "Wedding flowers",
        );
        unmount();
    });
});

describe("a lead write", () => {
    it("reads Leads, Contacts and the shell's badges again; marks Customers and Home stale", async () => {
        const client = makeTestClient();
        const asked: { key: unknown; refetch?: string }[] = [];
        const invalidate = client.invalidateQueries.bind(client);
        client.invalidateQueries = (filters) => {
            asked.push({
                key: filters?.queryKey,
                refetch: filters?.refetchType,
            });
            return invalidate(filters);
        };
        await leadsSaved(client, "org_1");
        expect(asked).toEqual([
            { key: ["leads", "org_1"], refetch: undefined },
            { key: ["contacts", "org_1"], refetch: undefined },
            { key: ["shell", "org_1", "live"], refetch: undefined },
            { key: ["customers", "org_1"], refetch: "none" },
            { key: ["home", "org_1"], refetch: "none" },
        ]);
    });
});
