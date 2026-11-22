// Where a service shows on a site (website editor plan U47a).
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: {
        site: { findFirst: jest.fn() },
        service: { findFirst: jest.fn() },
    },
}));
jest.mock("./module-pages", () => ({ modulePageState: jest.fn() }));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { modulePageState } from "./module-pages";
import {
    namesService,
    serviceUsePages,
    ServiceUsesService,
} from "./service-uses";

const siteFindFirst = prisma.site.findFirst as jest.Mock;
const serviceFindFirst = prisma.service.findFirst as jest.Mock;
const moduleState = modulePageState as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "OWNER",
        ...over,
    };
}

const list = (ids: string[], heading = "Bridal packages") => ({
    key: "k1",
    type: "servicesList",
    content: { heading, serviceIds: ids },
});
const book = {
    key: "k2",
    type: "booking",
    content: { serviceId: "svc_trial" },
};
const words = {
    key: "k3",
    type: "richText",
    content: { format: "html", value: "<p>Bridal trial</p>" },
};

describe("namesService", () => {
    it("finds a service by id anywhere in a section", () => {
        expect(
            namesService({ serviceIds: ["a", "svc_trial"] }, "svc_trial"),
        ).toBe(true);
        expect(namesService({ serviceId: "svc_trial" }, "svc_trial")).toBe(
            true,
        );
        expect(
            namesService(
                {
                    images: [
                        { link: { kind: "service", serviceId: "svc_trial" } },
                    ],
                },
                "svc_trial",
            ),
        ).toBe(true);
        expect(namesService({ value: "svc_trial" }, "svc_trial")).toBe(false);
    });
});

describe("serviceUsePages", () => {
    it("lists Bridal packages and Book a trial on two pages, draft and live", () => {
        const draft = [
            {
                id: "p_home",
                title: "Home",
                path: "/",
                sections: [list(["svc_trial"]), words],
            },
            {
                id: "p_book",
                title: "Book a trial",
                path: "/book",
                sections: [book],
            },
            {
                id: "p_about",
                title: "About",
                path: "/about",
                sections: [words],
            },
        ];
        const live = {
            pages: [
                {
                    path: "/",
                    title: "Home",
                    sections: [
                        {
                            type: "servicesList",
                            content: list(["svc_trial"]).content,
                        },
                    ],
                },
            ],
            keys: { "/": { id: "p_home", sections: ["k1"] } },
        };
        expect(serviceUsePages("svc_trial", draft, live)).toEqual([
            {
                pageId: "p_home",
                title: "Home",
                path: "/",
                sections: [
                    {
                        key: "k1",
                        label: "Bridal packages",
                        draft: true,
                        live: true,
                    },
                ],
            },
            {
                pageId: "p_book",
                title: "Book a trial",
                path: "/book",
                sections: [
                    {
                        key: "k2",
                        label: expect.any(String),
                        draft: true,
                        live: false,
                    },
                ],
            },
        ]);
    });

    it("keeps a live-only use: a section removed in the draft still shows today", () => {
        const live = {
            pages: [
                {
                    path: "/old",
                    title: "Old prices",
                    sections: [{ type: "booking", content: book.content }],
                },
            ],
            keys: { "/old": { id: "p_old", sections: ["k9"] } },
        };
        expect(serviceUsePages("svc_trial", [], live)).toEqual([
            {
                pageId: "p_old",
                title: "Old prices",
                path: "/old",
                sections: [
                    {
                        key: "k9",
                        label: expect.any(String),
                        draft: false,
                        live: true,
                    },
                ],
            },
        ]);
    });
});

describe("ServiceUsesService.read", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        siteFindFirst.mockResolvedValue({
            currentPublication: null,
            pages: [
                {
                    id: "p_book",
                    title: "Book a trial",
                    path: "/book",
                    versions: [{ sections: [book] }],
                },
            ],
        });
        serviceFindFirst.mockResolvedValue({
            status: "ACTIVE",
            showOnBookingPage: true,
        });
        moduleState.mockResolvedValue({ state: "on" });
    });

    it("says the booking page offers it", async () => {
        const uses = await new ServiceUsesService().read(
            ctx(),
            "site_1",
            "svc_trial",
        );
        expect(uses.bookingPage).toBe(true);
        expect(uses.pages).toHaveLength(1);
    });

    it("not when it's off the booking page", async () => {
        serviceFindFirst.mockResolvedValue({
            status: "ACTIVE",
            showOnBookingPage: false,
        });
        const uses = await new ServiceUsesService().read(
            ctx(),
            "site_1",
            "svc_trial",
        );
        expect(uses.bookingPage).toBe(false);
    });

    it("is a 404 for another business's service", async () => {
        serviceFindFirst.mockResolvedValue(null);
        await expect(
            new ServiceUsesService().read(ctx(), "site_1", "svc_other"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses a reviewer: no service:read", async () => {
        await expect(
            new ServiceUsesService().read(
                ctx({ role: "REVIEWER" }),
                "site_1",
                "svc_trial",
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
