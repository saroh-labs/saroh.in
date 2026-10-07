/**
 * DEC-070 K10 against a real Postgres: the site a business gets when it
 * turns Website on.
 *
 * `starter@1` drafted a hero and a gallery pointing at
 * `/templates/starter/*.jpg`, files no app serves, so every new site opened
 * in the editor with broken images, and its copy spoke as a company to "our
 * customers". A new site now starts from `starter@3` (v2's words, UX-070's menu): its draft names no
 * image, links only to its own pages, and says nothing a person working for
 * themselves could not publish as it stands.
 *
 * Every business here is its own, made by this file.
 */
import { prisma } from "@saroh/database";
import {
    HERO_PROMPT,
    STARTER_TEMPLATE_ID,
    starterTemplate,
} from "@saroh/templates";

import type { OrganizationContext } from "../../common/types/organization-context";
import { EntitlementService } from "../billing/entitlement.service";
import { ModuleLifecycleService } from "../capabilities/module-lifecycle.service";
import { ModuleReadinessRegistry } from "../capabilities/readiness/module-readiness.registry";
import { ModuleSetupService } from "../capabilities/setup/module-setup.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FLAG_KEYS } from "../feature-flags/flags";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;

const flags = new FeatureFlagService();
const entitlements = new EntitlementService();
const lifecycle = new ModuleLifecycleService(
    new ModuleReadinessRegistry(),
    prisma,
    undefined,
    flags,
);
const setup = new ModuleSetupService(lifecycle, entitlements, flags);

async function business(name: string): Promise<OrganizationContext> {
    seq += 1;
    const user = await prisma.user.create({
        data: { email: `k10-${tag}-${seq}@example.com` },
    });
    const org = await prisma.organization.create({
        data: { name, slug: `k10-${seq}-${tag}` },
    });
    return { organizationId: org.id, userId: user.id, role: "OWNER" };
}

/** Every string anywhere in a section's content. */
function strings(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(strings);
    if (value && typeof value === "object") {
        return Object.values(value).flatMap(strings);
    }
    return [];
}

/** Every `src` anywhere in a section's content: the images it would draw. */
function imageSources(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(imageSources);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) =>
            k === "src" && typeof v === "string" ? [v] : imageSources(v),
        );
    }
    return [];
}

beforeAll(async () => {
    for (const key of FLAG_KEYS.filter((k) => k.startsWith("MODULE_"))) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: true },
            update: { enabledByDefault: true },
        });
    }
});

describe("Turning Website on drafts starter@3", () => {
    it("names no image, and no business words, on any drafted page", async () => {
        expect(starterTemplate).toMatchObject({
            id: STARTER_TEMPLATE_ID,
            version: 3,
        });
        const ctx = await business("Asha Rao");
        const out = await setup.enable(ctx, "WEBSITE", {
            siteName: "Asha Rao",
            address: `asha-${seq}-${tag}`,
        });

        const pages = await prisma.page.findMany({
            where: { siteId: out.created.siteId },
            select: {
                path: true,
                versions: {
                    select: {
                        sections: {
                            orderBy: { order: "asc" },
                            select: { type: true, content: true },
                        },
                    },
                },
            },
            orderBy: { path: "asc" },
        });
        expect(pages.map((p) => p.path)).toEqual(["/", "/about"]);

        const sections = pages.flatMap((p) =>
            p.versions.flatMap((v) => v.sections),
        );
        // No closing button without an email: the hero's About is the one
        // (UX-070).
        expect(sections.map((s) => s.type)).toEqual([
            "hero",
            "richText",
            "richText",
            "hero",
            "richText",
        ]);
        for (const section of sections) {
            expect(imageSources(section.content)).toEqual([]);
            const copy = strings(section.content).join(" ").toLowerCase();
            expect(copy).not.toContain("/templates/starter/");
            expect(copy).not.toContain("customers");
            expect(copy).not.toContain("we build");
            expect(copy).not.toContain("our story");
        }
        expect(sections[0]?.content).toMatchObject({
            variant: "centered",
            heading: "Asha Rao",
            subheading: HERO_PROMPT,
        });

        // A real menu from the first draft (UX-070): Home, then About.
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: out.created.siteId },
            select: { navigation: true },
        });
        const ids = new Map(
            (
                await prisma.page.findMany({
                    where: { siteId: out.created.siteId },
                    select: { id: true, path: true },
                })
            ).map((p) => [p.id, p.path]),
        );
        const items = (site.navigation as { items: { pageId: string }[] })
            .items;
        expect(items.map((i) => ids.get(i.pageId))).toEqual(["/", "/about"]);
    });

    it("links only to pages the site has, when there is no contact email", async () => {
        const ctx = await business("Northlight Studio");
        const out = await setup.enable(ctx, "WEBSITE", {
            siteName: "Northlight Studio",
            address: `northlight-${seq}-${tag}`,
        });
        const pages = await prisma.page.findMany({
            where: { siteId: out.created.siteId },
            select: {
                path: true,
                versions: {
                    select: { sections: { select: { content: true } } },
                },
            },
        });
        const paths = new Set(pages.map((p) => p.path));
        const hrefs = pages
            .flatMap((p) => p.versions.flatMap((v) => v.sections))
            .flatMap((s) => {
                const c = s.content as {
                    href?: unknown;
                    cta?: { href?: unknown };
                };
                return [c.href, c.cta?.href].filter(
                    (h): h is string => typeof h === "string",
                );
            });
        expect(hrefs).toEqual(["/about"]);
        for (const href of hrefs) expect(paths.has(href)).toBe(true);
    });
});
