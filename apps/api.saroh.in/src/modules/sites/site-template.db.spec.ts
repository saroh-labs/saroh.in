/**
 * DEC-070 K15 against a real Postgres: a new site starts from its kind's
 * template, and its enquiry forms take enquiries from the first publish.
 *
 * - With no template asked for: a business gets `starter@2`, "Just me"
 *   `personal@1`, "A site for my work" `portfolio@1`. An explicit choice in
 *   `/sites/new` wins.
 * - Every enquiry section a template lays down gets its Form with the site
 *   (a template can lay down content only, so it has no `formId` of its
 *   own), and the section carries the Form's id.
 * - Personal lists the business's Services only with Appointments on and a
 *   service to list.
 *
 * Every business here is its own, made by this file.
 */
import { parseSectionContent, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FLAG_KEYS } from "../feature-flags/flags";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;

type Kind = "BUSINESS" | "SOLO" | "WORK";

async function business(
    name: string,
    kind?: Kind,
): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `k15-${tag}-${seq}@example.test` },
    });
    const org = await prisma.organization.create({
        data: { name, slug: `k15-${seq}-${tag}`, ...(kind ? { kind } : {}) },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** The new site's draft pages, by path, with their sections in order. */
async function draft(siteId: string) {
    const pages = await prisma.page.findMany({
        where: { siteId },
        orderBy: { path: "asc" },
        select: {
            path: true,
            versions: {
                select: {
                    sections: {
                        orderBy: { order: "asc" },
                        select: {
                            type: true,
                            contractVersion: true,
                            content: true,
                        },
                    },
                },
            },
        },
    });
    return pages.map((p) => ({
        path: p.path,
        sections: p.versions.flatMap((v) => v.sections),
    }));
}

const typesOf = (page: { sections: { type: string }[] } | undefined) =>
    page?.sections.map((s) => s.type);

beforeAll(async () => {
    for (const key of FLAG_KEYS.filter((k) => k.startsWith("MODULE_"))) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

describe("a new site starts from the kind's template (K15)", () => {
    it.each([
        ["a business", "BUSINESS", ["/", "/about"]],
        ["a business from before the kind", undefined, ["/", "/about"]],
        ["Just me", "SOLO", ["/", "/about", "/contact"]],
        ["A site for my work", "WORK", ["/", "/about", "/work"]],
    ] as [string, Kind | undefined, string[]][])(
        "%s gets its template's pages",
        async (_label, kind, paths) => {
            const ctx = await business("Asha Rao", kind);
            const { siteId } = await sites.createFromTemplate(ctx, {
                name: "Asha Rao",
            });
            expect((await draft(siteId)).map((p) => p.path)).toEqual(paths);
        },
    );

    it("A site for my work opens with the Projects block on Home and Work", async () => {
        const ctx = await business("Asha Rao Studio", "WORK");
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Asha Rao Studio",
        });
        const pages = await draft(siteId);
        expect(typesOf(pages.find((p) => p.path === "/"))).toEqual([
            "hero",
            "projects",
            "enquiry",
        ]);
        expect(typesOf(pages.find((p) => p.path === "/work"))).toContain(
            "projects",
        );
    });

    it("an explicit template wins over the kind's", async () => {
        const ctx = await business("Asha Rao Studio", "WORK");
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Asha Rao Studio",
            templateId: "starter",
        });
        expect((await draft(siteId)).map((p) => p.path)).toEqual([
            "/",
            "/about",
        ]);

        const writer = await business("Ink Notes", "SOLO");
        const writing = await sites.createFromTemplate(writer, {
            name: "Ink Notes",
            templateId: "writing",
        });
        expect(
            typesOf((await draft(writing.siteId)).find((p) => p.path === "/")),
        ).toEqual(["hero", "journal"]);
    });
});

describe("a template's enquiry form works from the first publish (K15)", () => {
    it.each([
        ["portfolio", "WORK", "/", "Work with Asha Rao Studio"],
        ["personal", "SOLO", "/contact", "Get in touch with Asha Rao Studio"],
        ["writing", "SOLO", "/contact", "Write to Asha Rao Studio"],
    ] as [string, Kind, string, string][])(
        "%s: each enquiry section has its own Form, on the site",
        async (templateId, kind, path, formName) => {
            const ctx = await business("Asha Rao Studio", kind);
            const { siteId } = await sites.createFromTemplate(ctx, {
                name: "Asha Rao Studio",
                templateId,
            });
            const enquiries = (await draft(siteId)).flatMap((p) =>
                p.sections
                    .filter((s) => s.type === "enquiry")
                    .map((s) => ({ path: p.path, ...s })),
            );
            expect(enquiries.map((e) => e.path)).toEqual([path]);

            const [section] = enquiries;
            const content = section?.content as {
                formId?: string;
                title?: string;
                fields: unknown[];
            };
            expect(content.formId).toEqual(expect.any(String));
            // Still what the contract accepts, the Form's id and all.
            expect(
                parseSectionContent(
                    "enquiry",
                    section?.contractVersion ?? 1,
                    content,
                ).success,
            ).toBe(true);

            const form = await prisma.form.findUniqueOrThrow({
                where: { id: content.formId },
            });
            expect(form).toMatchObject({
                organizationId: ctx.organizationId,
                siteId,
                status: "ACTIVE",
                name: formName,
            });
            expect(form.fields).toEqual(content.fields);
            expect(await prisma.form.count({ where: { siteId } })).toBe(1);
        },
    );

    it("the starter lays down no enquiry, so no Form is made", async () => {
        const ctx = await business("Northwind Salon", "BUSINESS");
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Northwind Salon",
        });
        expect(await prisma.form.count({ where: { siteId } })).toBe(0);
    });

    it("a refused site makes no Form either", async () => {
        const ctx = await business("Asha Rao Studio", "WORK");
        await sites
            .createFromTemplate(ctx, {
                name: "Asha Rao Studio",
                subdomain: `k15-bad--${seq}`,
            })
            .catch(() => null);
        expect(
            await prisma.form.count({
                where: { organizationId: ctx.organizationId },
            }),
        ).toBe(0);
    });
});

describe("Personal lists Services only with Appointments on (K14, K15)", () => {
    async function service(organizationId: string, name: string) {
        return prisma.service.create({
            data: {
                organizationId,
                name,
                durationMinutes: 60,
                timezone: "Asia/Kolkata",
                showOnBookingPage: true,
            },
            select: { id: true },
        });
    }

    async function appointments(organizationId: string, on: boolean) {
        await prisma.organizationModule.create({
            data: {
                organizationId,
                moduleKey: "APPOINTMENTS",
                status: on ? "ENABLED" : "DISABLED",
            },
        });
    }

    async function home(ctx: OrganizationContext) {
        const { siteId } = await sites.createFromTemplate(ctx, {
            name: "Asha Rao",
        });
        return (await draft(siteId)).find((p) => p.path === "/");
    }

    it("lists the business's services, oldest first, with Appointments on", async () => {
        const ctx = await business("Asha Rao", "SOLO");
        await appointments(ctx.organizationId, true);
        const first = await service(ctx.organizationId, "Consultation");
        const second = await service(ctx.organizationId, "Review");
        const page = await home(ctx);
        expect(typesOf(page)).toEqual([
            "hero",
            "features",
            "servicesList",
            "cta",
        ]);
        expect(page?.sections[2]?.content).toMatchObject({
            serviceIds: [first.id, second.id],
        });
    });

    it.each([
        ["Appointments off", true, false],
        ["Appointments on, no service", false, true],
    ])("offers placeholder offers with %s", async (_l, withService, on) => {
        const ctx = await business("Asha Rao", "SOLO");
        await appointments(ctx.organizationId, on);
        if (withService) await service(ctx.organizationId, "Consultation");
        expect(typesOf(await home(ctx))).toEqual([
            "hero",
            "features",
            "features",
            "cta",
        ]);
    });
});
