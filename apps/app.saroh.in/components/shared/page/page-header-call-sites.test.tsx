import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PackDetailHeader } from "@/components/class-packs/pack-detail/detail-header";
import { packCrumbs } from "@/components/class-packs/pack-editor/pack-crumbs";
import { OrdersHeading } from "@/components/commerce/orders/orders-states";
import { ProductPageBar } from "@/components/commerce/product-page/page-state";
import { ListHeading } from "@/components/customers/list/states";
import { PublishBanner } from "@/components/editor-shell/publish-banner";
import { HomeHeader } from "@/components/home/header/home-header";
import { SettingsPanelHeader } from "@/components/settings/page/settings-panel";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: {
        href: string;
        children: React.ReactNode;
    }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

/**
 * One screen of each kind, moved onto the one page header: a list, a record,
 * a Settings section, an editor, Home and a whole-page state. Each draws one
 * `<h1>` at the page title's size, with its breadcrumb above it.
 */
const h1s = (html: string) => html.match(/<h1[\s>]/g) ?? [];
const TITLE = "text-[30px]";

function isPageHeader(html: string) {
    expect(h1s(html)).toHaveLength(1);
    expect(html).toContain(TITLE);
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html.indexOf('aria-label="Breadcrumb"')).toBeLessThan(
        html.indexOf("<h1"),
    );
}

describe("a list: Customers", () => {
    it("draws the page header with the count beside the title", () => {
        const html = renderToStaticMarkup(
            <ListHeading
                count="12 customers"
                actions={<button type="button">New customer</button>}
            />,
        );
        isPageHeader(html);
        expect(html).toMatch(/data-slot="page-count"[^>]*>12 customers</);
        expect(html).toContain("Sell");
    });

    it("draws no count when there is none to say", () => {
        const html = renderToStaticMarkup(<ListHeading count={null} />);
        expect(html).not.toContain('data-slot="page-count"');
    });
});

describe("a list: Orders", () => {
    it("says how many orders beside the title, in its own word", () => {
        const html = renderToStaticMarkup(<OrdersHeading count="3 orders" />);
        isPageHeader(html);
        expect(html).toMatch(/data-slot="page-count"[^>]*>3 orders</);
    });
});

describe("a record: a class pack", () => {
    const head = {
        thumbN: "10",
        thumbUnit: "classes",
        status: { label: "On sale", tone: "ok" },
        kindLabel: "Class pack",
        firstOnly: false,
        pending: false,
        meta: "10 classes for ₹4,500",
        bookingPage: "On the booking page",
        onSale: true,
        archived: false,
        note: null,
        editHref: "/class-packs/p1/edit",
    };

    it("draws where it sits, its name, its pills and its actions", () => {
        const html = renderToStaticMarkup(
            <PackDetailHeader
                name="Ten classes"
                head={head as never}
                lens="team"
                onLens={() => undefined}
                canSell
                onSell={() => undefined}
                canWrite
                busy={false}
                onRestore={() => undefined}
            />,
        );
        isPageHeader(html);
        // "Class packs", as the menu says it, never "Packs".
        expect(html).toMatch(/<a href="\/class-packs">Class packs<\/a>/);
        expect(html).toMatch(/<h1[^>]*>Ten classes<\/h1>/);
        expect(html).toMatch(/data-slot="page-badge"[^>]*>[\s\S]*On sale/);
        // The primary is the last button, at the default size and corner.
        const actions = html.slice(html.indexOf('data-slot="page-actions"'));
        expect(actions.indexOf("Sell at the desk")).toBeLessThan(
            actions.indexOf("Edit pack"),
        );
        expect(actions).not.toContain("rounded-[9px]");
        expect(actions).not.toContain("text-[14px]");
    });

    it("names the crumbs as the menu does", () => {
        const html = renderToStaticMarkup(<>{packCrumbs("New pack")}</>);
        expect(html).toContain("Bookings");
        expect(html).toContain("Class packs");
        expect(html).not.toMatch(/>Packs</);
    });
});

describe("a Settings section", () => {
    it("draws a real page title inside the panel", () => {
        const html = renderToStaticMarkup(
            <SettingsPanelHeader
                title="Team"
                description="Everyone here works across the whole business."
                readOnlyNote="Only owners and admins can change this."
            />,
        );
        isPageHeader(html);
        expect(html).toMatch(/<h1[^>]*>Team<\/h1>/);
        expect(html).not.toContain("<h2");
        expect(html).toMatch(/role="note"[^>]*>[\s\S]*Only owners and admins/);
    });
});

describe("an editor: the publish banner", () => {
    it("draws the page header inside its sticky bar, with Publish last", () => {
        const html = renderToStaticMarkup(
            <PublishBanner
                breadcrumb={["Payments", "Plans", "Monthly"]}
                title="Monthly"
                pill={{ label: "Draft", tone: "off" } as never}
                line={{ text: "Draft · saved", tone: "quiet", action: null }}
                actions={{
                    publishLabel: "Publish",
                    publishOn: true,
                    publishWhy: null,
                    discard: false,
                    deleteDraft: true,
                    view: false,
                }}
                handlers={{
                    onPublish: () => undefined,
                    onDiscard: () => undefined,
                    onDelete: () => undefined,
                    onRetry: () => undefined,
                    onReload: () => undefined,
                }}
                busy={false}
                canEdit
                view={null}
                changesText={null}
            />,
        );
        isPageHeader(html);
        expect(html).toMatch(/role="status"[^>]*>Draft · saved</);
        const actions = html.slice(html.indexOf('data-slot="page-actions"'));
        expect(actions.indexOf("Delete draft")).toBeLessThan(
            actions.indexOf("Publish"),
        );
        expect(actions).not.toContain("rounded-[9px]");
        expect(actions).not.toContain("text-[14px]");
    });
});

describe("Home", () => {
    it("draws the greeting as the page's title", () => {
        const html = renderToStaticMarkup(
            <HomeHeader lastDay={null} name="Asha" businessName="Rye" />,
        );
        isPageHeader(html);
        expect(html).toMatch(/<h1[^>]*>[^<]*Asha/);
    });
});

describe("a whole-page state: the product page", () => {
    it("keeps the page header over the state", () => {
        const html = renderToStaticMarkup(<ProductPageBar />);
        isPageHeader(html);
        expect(html).toMatch(/<a href="\/commerce\/products">Products<\/a>/);
    });
});
