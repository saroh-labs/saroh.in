// @vitest-environment jsdom
/**
 * Bookings › Services and a service's page on React Query (DEC-259), read
 * in the browser: the list's header is drawn at once with its rows as a
 * skeleton, one read each; a failed read says so with Try again, a refusal
 * is the denied card; a service's page keeps its loader until its one
 * read lands, and a missing one says it isn't here.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shown = vi.hoisted(() => ({
    props: null as null | Record<string, unknown>,
}));
vi.mock("./services-screen", () => ({
    ServicesScreen: (props: Record<string, unknown>) => {
        shown.props = props;
        return <div data-screen="" />;
    },
}));
vi.mock("@/components/services/service-editor/service-editor", () => ({
    ServiceEditor: (props: Record<string, unknown>) => {
        shown.props = props;
        return <div data-editor="" />;
    },
}));

import {
    NewServiceContainer,
    ServiceContainer,
} from "@/components/services/service-editor/service-container";
import { renderWithQuery } from "@/lib/query/test-utils";

import { ServicesContainer } from "./services-container";

const SERVICE = { id: "sv_1", name: "Physio", updatedAt: "2026-11-25" };
const CONTEXT = {
    others: [{ id: "sv_1", name: "Physio" }],
    staff: [],
    openingHours: null,
    hasPage: true,
    hasStorefront: null,
    payment: null,
    gstRegistered: false,
    businessPriceMode: null,
    timezone: "Asia/Kolkata",
    currency: "INR",
    paymentsLock: null,
    meet: null,
};
const LIST = {
    services: [SERVICE],
    staff: [],
    usage: {},
    currency: "INR",
    hasPage: true,
    payment: null,
    alsoSell: null,
    modules: [],
    missingRates: null,
    canNewCourse: false,
    bookingLink: null,
    shareSetup: null,
};

const fetches: string[] = [];
let answers: Record<string, { body: unknown; status: number }> = {};
const pending: (() => void)[] = [];

beforeEach(() => {
    fetches.length = 0;
    shown.props = null;
    answers = {};
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            fetches.push(url);
            if (!(url in answers)) {
                // Held: the first paint, before the read lands.
                return new Promise((resolve) =>
                    pending.push(() =>
                        resolve(new Response("{}", { status: 503 })),
                    ),
                );
            }
            const a = answers[url];
            return Promise.resolve(
                new Response(JSON.stringify(a.body), {
                    status: a.status,
                    headers: { "content-type": "application/json" },
                }),
            );
        }),
    );
});

afterEach(() => {
    for (const release of pending.splice(0)) release();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
});

const settle = async () => {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
};

describe("Bookings › Services", () => {
    it("draws the header at once, the rows a skeleton, with one read", async () => {
        const { host, unmount } = renderWithQuery(
            <ServicesContainer canEdit={false} />,
        );
        await settle();
        expect(host.querySelector("h1")?.textContent).toBe("Services");
        expect(host.textContent).toContain(
            "Your role can see services but not change them.",
        );
        expect(host.querySelector('[role="status"]')).not.toBeNull();
        expect(host.querySelector("[data-screen]")).toBeNull();
        expect(fetches).toEqual(["/api/services"]);
        unmount();
    });

    it("hands the list's read to the screen once it lands", async () => {
        answers["/api/services"] = { body: LIST, status: 200 };
        const { host, unmount } = renderWithQuery(
            <ServicesContainer canEdit />,
        );
        await settle();
        expect(host.querySelector("[data-screen]")).not.toBeNull();
        expect(shown.props).toMatchObject({
            services: [SERVICE],
            canEdit: true,
            currency: "INR",
        });
        expect(fetches).toEqual(["/api/services"]);
        unmount();
    });

    it("a failed read says so, with Try again, never an empty list", async () => {
        answers["/api/services"] = {
            body: { code: "unavailable" },
            status: 503,
        };
        const { host, unmount } = renderWithQuery(
            <ServicesContainer canEdit />,
        );
        await settle();
        expect(host.textContent).toContain("Couldn't load your services");
        expect(host.textContent).toContain("Try again");
        expect(host.textContent).not.toContain("No services yet");
        unmount();
    });

    it("a refusal is the denied card, not a failure", async () => {
        answers["/api/services"] = {
            body: { code: "role_denied" },
            status: 403,
        };
        const { host, unmount } = renderWithQuery(
            <ServicesContainer canEdit />,
        );
        await settle();
        expect(host.textContent).not.toContain("Couldn't load");
        expect(host.querySelector("[data-screen]")).toBeNull();
        unmount();
    });
});

describe("a service's page", () => {
    it("keeps the loader until its one read lands, then the editor", async () => {
        const { host, unmount } = renderWithQuery(
            <ServiceContainer
                serviceId="sv_1"
                canEdit
                skeleton={<p data-skeleton="" />}
            />,
        );
        await settle();
        expect(host.querySelector("[data-skeleton]")).not.toBeNull();
        expect(fetches).toEqual(["/api/services/sv_1"]);
        unmount();

        answers["/api/services/sv_1"] = {
            body: {
                service: { ...SERVICE, currency: "INR" },
                rules: [],
                usage: null,
                priceHistory: null,
                share: null,
                context: CONTEXT,
            },
            status: 200,
        };
        const again = renderWithQuery(
            <ServiceContainer
                serviceId="sv_1"
                canEdit={false}
                skeleton={<p data-skeleton="" />}
            />,
        );
        await settle();
        expect(again.host.querySelector("[data-editor]")).not.toBeNull();
        expect(shown.props).toMatchObject({
            service: { id: "sv_1" },
            canEdit: false,
            others: CONTEXT.others,
            timezone: "Asia/Kolkata",
        });
        again.unmount();
    });

    it("another business's or a missing service isn't here; a failure says so", async () => {
        answers["/api/services/sv_x"] = {
            body: { code: "not_found" },
            status: 404,
        };
        const missing = renderWithQuery(
            <ServiceContainer serviceId="sv_x" canEdit skeleton={null} />,
        );
        await settle();
        expect(missing.host.textContent).toContain("That service isn't here");
        missing.unmount();

        answers["/api/services/sv_y"] = {
            body: { code: "unavailable" },
            status: 503,
        };
        const failed = renderWithQuery(
            <ServiceContainer serviceId="sv_y" canEdit skeleton={null} />,
        );
        await settle();
        expect(failed.host.textContent).toContain("Couldn't load this service");
        failed.unmount();
    });

    it("New service reads only the editor's context", async () => {
        answers["/api/services/editor"] = { body: CONTEXT, status: 200 };
        const { host, unmount } = renderWithQuery(
            <NewServiceContainer skeleton={null} />,
        );
        await settle();
        expect(host.querySelector("[data-editor]")).not.toBeNull();
        expect(shown.props).toMatchObject({ service: null, canEdit: true });
        expect(fetches).toEqual(["/api/services/editor"]);
        unmount();
    });
});
