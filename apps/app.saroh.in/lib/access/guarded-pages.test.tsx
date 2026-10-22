/**
 * Every create, edit and import page asks before it draws a form (UX audit,
 * 10 Oct 2026): a role without the permission the API asks of the save is
 * told so, in the one sentence, and never handed a form whose Save is
 * refused. Where the person may read but not write, the page reads.
 *
 * Two checks. A scan, so a new `new`, `edit` or `import` page can't be
 * added with no guard. And each guarded page drawn for a role without the
 * permission, read as markup.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Organization } from "@/lib/organizations/service";

const resolveActiveOrganization = vi.fn();
vi.mock("@/lib/organizations/service", () => ({
    resolveActiveOrganization: () => resolveActiveOrganization() as unknown,
}));
vi.mock("@/lib/session", () => ({ requireSession: () => Promise.resolve() }));
vi.mock("@/env", () => ({ env: {} }));
// The pages' reads are server-only. None runs before the guard, and the
// read-only pages' own reads are mocked below.
vi.mock("@/lib/api/http", () => ({}));
vi.mock("next/headers", () => ({}));
const notFound = vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
    notFound: () => notFound(),
    redirect: (to: string) => {
        throw new Error(`NEXT_REDIRECT ${to}`);
    },
    forbidden: vi.fn(),
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
}));

const getSite = vi.fn();
const listSites = vi.fn(() => Promise.resolve([]));
vi.mock("@/lib/sites/service", () => ({
    getSite: (...args: unknown[]) => getSite(...args) as unknown,
    listSites: () => listSites(),
    listTemplates: () => Promise.resolve([]),
    getNewSiteDefaults: () => Promise.resolve(null),
}));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
const getPost = vi.fn();
vi.mock("@/lib/content/service", () => ({
    getPost: (...args: unknown[]) => getPost(...args) as unknown,
    listPostCategories: () =>
        Promise.resolve([{ id: "cat_1", name: "News", slug: "news" }]),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    pausedOrNull: () => Promise.resolve(null),
    billingAccessOrNull: () => Promise.resolve(null),
}));
const getDiscount = vi.fn();
vi.mock("@/lib/discounts/service", () => ({
    getDiscount: (...args: unknown[]) => getDiscount(...args) as unknown,
}));
const loadReachOptions = vi.fn(() =>
    Promise.resolve({
        options: { storefronts: [], collections: [], products: [] },
        defaultCurrency: "INR",
    }),
);
vi.mock("@/lib/discounts/options", () => ({
    loadReachOptions: () => loadReachOptions(),
}));
// The forms themselves are not under test: a marker says one was drawn.
vi.mock("@/components/stores/discounts/discount-form", () => ({
    DiscountForm: () => <form data-testid="discount-form" />,
}));
vi.mock("@/components/customers/add-customer-form", () => ({
    AddCustomerForm: () => <form data-testid="add-customer-form" />,
}));
vi.mock("@/components/sites/posts/post-editor", () => ({
    PostEditor: () => <form data-testid="post-editor" />,
}));

const org = (actions: string[], over: Partial<Organization> = {}) =>
    ({
        id: "org_1",
        name: "Rye & Co.",
        slug: "rye",
        role: "MEMBER",
        roleKey: "MEMBER",
        actions,
        ...over,
    }) as Organization;

/** The Member's floor: reads, and nothing that writes. */
const MEMBER = [
    "org:read",
    "member:read",
    "store:read",
    "site:read",
    "module:read",
    "booking:read",
    "service:read",
    "contact:read",
    "order:stage",
];

const text = (node: unknown) =>
    renderToStaticMarkup(<>{node as React.ReactNode}</>)
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, "&");

const params = <T,>(value: T) => Promise.resolve(value);

beforeEach(() => {
    resolveActiveOrganization.mockReset();
    getSite.mockReset();
    getPost.mockReset();
    getDiscount.mockReset();
    loadReachOptions.mockClear();
});

/** Each guarded page, the permission its save asks, and its name. */
const GUARDED: {
    page: string;
    action: string;
    thing: string;
    load: () => Promise<{ default: (props: never) => Promise<unknown> }>;
    props?: unknown;
}[] = [
    {
        page: "commerce/customers/new",
        action: "contact:write",
        thing: "New customer",
        load: () => import("@/app/(shell)/commerce/customers/new/page"),
    },
    {
        page: "commerce/discounts/new",
        action: "discount:write",
        thing: "New discount code",
        load: () => import("@/app/(shell)/commerce/discounts/new/page"),
    },
    {
        page: "courses/new",
        action: "course:write",
        thing: "New course",
        load: () => import("@/app/(shell)/courses/new/page"),
    },
    {
        page: "courses/[courseId]/edit",
        action: "course:write",
        thing: "Edit course",
        load: () => import("@/app/(shell)/courses/[courseId]/edit/page"),
        props: { params: params({ courseId: "course_1" }) },
    },
    {
        page: "billing/invoices/new",
        action: "invoice:write",
        thing: "New invoice",
        load: () => import("@/app/(shell)/billing/invoices/new/page"),
        props: { searchParams: params({}) },
    },
    {
        page: "billing/invoices/[invoiceId]/edit",
        action: "invoice:write",
        thing: "Edit invoice",
        load: () =>
            import("@/app/(shell)/billing/invoices/[invoiceId]/edit/page"),
        props: { params: params({ invoiceId: "inv_1" }) },
    },
    {
        page: "commerce/locations/new",
        action: "store:create",
        thing: "New location",
        load: () => import("@/app/(shell)/commerce/locations/new/page"),
    },
    {
        page: "sites/new",
        action: "site:create",
        thing: "New site",
        load: () => import("@/app/(shell)/sites/new/page"),
        props: { searchParams: params({}) },
    },
];

// Each case imports its page cold, and a page like New invoice pulls in a
// large module graph: 5s isn't enough with the rest of the suite running.
describe(
    "a create or edit page, for a role without the permission",
    { timeout: 15_000 },
    () => {
        it.each(GUARDED)(
            "$page says it can't be opened, before any form ($action)",
            async ({ load, props, thing, action }) => {
                resolveActiveOrganization.mockResolvedValue(org(MEMBER));
                const { default: Page } = await load();
                const said = text(await Page((props ?? {}) as never));
                expect(said).toContain(`You can't open ${thing}`);
                expect(said).toContain(
                    `Your role in Rye & Co. is Member. It doesn't include ${thing}.`,
                );
                expect(said).toContain(
                    "An owner or admin can change this in Settings › Team.",
                );
                expect(said).not.toMatch(/<form|<input|<textarea/);
                expect(said).not.toContain(action);
                expect(said).not.toContain('role="alert"');
            },
        );

        it("opens for a role the business made with the permission ticked", async () => {
            resolveActiveOrganization.mockResolvedValue(
                org(["contact:read", "contact:write"], {
                    roleKey: "front-desk",
                }),
            );
            const { default: Customers } =
                await import("@/app/(shell)/commerce/customers/new/page");
            expect(text(await Customers())).toContain("add-customer-form");

            resolveActiveOrganization.mockResolvedValue(
                org(["discount:read", "discount:write"], { roleKey: "offers" }),
            );
            const { default: Discounts } =
                await import("@/app/(shell)/commerce/discounts/new/page");
            expect(text(await Discounts())).toContain("discount-form");
        });
    },
);

describe("New post and a post, for someone who reads the site", () => {
    const site = (edit: boolean) => ({
        id: "site_1",
        name: "Rye",
        postsPrefix: "journal",
        can: { edit },
        pages: [],
    });
    const post = {
        id: "post_1",
        title: "Winter hours",
        slug: "winter-hours",
        excerpt: "We close early in December.",
        content:
            "<p>From <strong>1 December</strong> we close at 6.</p><script>alert(1)</script><p>See you &amp; yours.</p>",
        categoryId: "cat_1",
        featured: false,
        image: null,
        status: "DRAFT",
        publishedAt: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        author: "Asha",
        live: false,
        liveAt: null,
    };

    it("New post is denied to a Reviewer", async () => {
        getSite.mockResolvedValue(site(false));
        resolveActiveOrganization.mockResolvedValue(
            org(["site:read", "site:comment", "site:approve"], {
                role: "REVIEWER",
                roleKey: "REVIEWER",
            }),
        );
        const { default: Page } =
            await import("@/app/(shell)/sites/[siteId]/posts/new/page");
        const said = text(await Page({ params: params({ siteId: "site_1" }) }));
        expect(said).toContain("You can't open New post");
        expect(said).toContain(
            "Your role in Rye & Co. is Reviewer. It doesn't include New post.",
        );
        expect(said).toContain('href="/sites/site_1/posts"');
        expect(said).not.toContain("post-editor");
    });

    it("New post opens the editor for someone who may write", async () => {
        getSite.mockResolvedValue(site(true));
        const { default: Page } =
            await import("@/app/(shell)/sites/[siteId]/posts/new/page");
        expect(
            text(await Page({ params: params({ siteId: "site_1" }) })),
        ).toContain("post-editor");
    });

    it("a post opens to read for a Member: no input, no Save, no Publish", async () => {
        getSite.mockResolvedValue(site(false));
        getPost.mockResolvedValue(post);
        const { default: Page } =
            await import("@/app/(shell)/sites/[siteId]/posts/[postId]/page");
        const said = text(
            await Page({
                params: params({ siteId: "site_1", postId: "post_1" }),
            }),
        );
        expect(said).toContain(
            "Your role can read this post but not change it. An owner or admin can change this in Settings › Team.",
        );
        expect(said).toContain("Winter hours");
        expect(said).toContain("Draft");
        expect(said).toContain("/journal/winter-hours");
        expect(said).toContain("News");
        expect(said).toContain("From 1 December we close at 6.");
        expect(said).toContain("See you & yours.");
        // The body is text. A draft's markup is never drawn, least of all
        // a script.
        expect(said).not.toMatch(/<strong>|<script|alert\(1\)/i);
        expect(said).not.toMatch(/<input|<textarea|<form|post-editor/);
        expect(said).not.toMatch(/>Save<|>Publish<|Save draft/);
    });

    it("a post opens in the editor for someone who may write", async () => {
        getSite.mockResolvedValue(site(true));
        getPost.mockResolvedValue(post);
        const { default: Page } =
            await import("@/app/(shell)/sites/[siteId]/posts/[postId]/page");
        expect(
            text(
                await Page({
                    params: params({ siteId: "site_1", postId: "post_1" }),
                }),
            ),
        ).toContain("post-editor");
    });
});

describe("a discount code, for someone who reads discounts", () => {
    const discount = {
        id: "disc_1",
        code: "MARKETDAY",
        description: "Saturday stall",
        kind: "PERCENTAGE",
        percent: "15",
        amount: null,
        currency: null,
        appliesTo: "BUSINESS",
        targets: [],
        startsAt: null,
        endsAt: null,
        usageLimit: 100,
        used: 12,
        state: "ACTIVE",
    };

    it("reads, with no field and no Save, without discount:write", async () => {
        getDiscount.mockResolvedValue(discount);
        resolveActiveOrganization.mockResolvedValue(
            org([...MEMBER, "discount:read"]),
        );
        const { default: Page } =
            await import("@/app/(shell)/commerce/discounts/[discountId]/page");
        const said = text(
            await Page({ params: params({ discountId: "disc_1" }) }),
        );
        expect(said).toContain(
            "Your role can read this code but not change it. An owner or admin can change this in Settings › Team.",
        );
        expect(said).toContain("MARKETDAY");
        expect(said).toContain("15% off");
        expect(said).toContain("12 of 100");
        expect(said).toContain("Live");
        expect(said).not.toMatch(/<input|<form|discount-form|>Save/);
        // The form's options are never read for a page that has no form.
        expect(loadReachOptions).not.toHaveBeenCalled();
    });

    it("is the form for someone who may change it", async () => {
        getDiscount.mockResolvedValue(discount);
        resolveActiveOrganization.mockResolvedValue(
            org(["discount:read", "discount:write"]),
        );
        const { default: Page } =
            await import("@/app/(shell)/commerce/discounts/[discountId]/page");
        expect(
            text(await Page({ params: params({ discountId: "disc_1" }) })),
        ).toContain("discount-form");
    });
});

/**
 * No page under `app/(shell)` that makes, edits or imports something may
 * draw without asking. A new one fails here until it calls `requireCan`
 * (or `deniedFor`), or is listed below with what guards it instead.
 */
describe("every new, edit and import page asks first", () => {
    const shell = path.resolve(__dirname, "../../app/(shell)");
    const pages: string[] = [];
    const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
            const full = path.join(dir, name);
            if (statSync(full).isDirectory()) walk(full);
            else if (name === "page.tsx") pages.push(full);
        }
    };
    walk(shell);
    const makes = pages
        .map((p) => path.relative(shell, path.dirname(p)))
        .filter((p) => /(^|\/)(new|edit|import)$/.test(p))
        .sort();

    /** Guarded another way, and how. */
    const OTHERWISE: Readonly<Record<string, string>> = {
        // Only send the person on. The page they land on asks.
        "stores/new": "redirect",
        "stores/[storeId]/customers/new": "redirect",
        "stores/[storeId]/customers/import": "redirect",
        "stores/[storeId]/orders/new": "redirect",
        "stores/[storeId]/products/new": "redirect",
        "stores/[storeId]/products/import": "redirect",
        "commerce/orders/new": "redirect",
        // Ask through their editor's own context, which also reads a
        // location's own roles (only the API knows those).
        "billing/plans/new": "subscription:write",
        "billing/plans/[planId]/edit": "subscription:read",
        "class-packs/new": "canWrite",
        "class-packs/[packId]/edit": "canWrite",
        "services/new": "canEdit",
        "commerce/products/new": "store:read",
        "commerce/products/[productId]/edit": "NoProductAccess",
    };

    it("finds the pages it is meant to check", () => {
        expect(makes.length).toBeGreaterThan(15);
        expect(makes).toContain("commerce/customers/new");
    });

    it.each(makes)("%s", (page) => {
        const source = readFileSync(path.join(shell, page, "page.tsx"), "utf8");
        const otherwise = OTHERWISE[page];
        if (otherwise) {
            expect(source).toContain(otherwise);
            return;
        }
        expect(source).toMatch(/requireCan\(|deniedFor\(/);
    });

    it("lists no page that has gone", () => {
        expect(
            Object.keys(OTHERWISE).filter((p) => !makes.includes(p)),
        ).toEqual([]);
    });
});
