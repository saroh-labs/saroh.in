/**
 * The words Website draws (DEC-221), as each edition's
 * `content/reach-*.ts` builds them from its own world. Generated from
 * saroh.in's builder's type with every word widened to `string`, so
 * saroh.tech's Global words fill the same shape.
 */
import type { WorldBusiness } from "../../content/world";

/**
 * /features/website, the Reach page built around its signature (boards
 * FWDesk and FWPhone2, DEC-221): change a price once in Products and the
 * site says it. Every name, price, time and address comes from the world
 * (`content/world.ts`); the words around them are this file's.
 *
 * Two switches shape the words:
 * - `shop` is the `site-shop` claim: products and the shop on a merchant's
 *   site wait for `SITE_SHOP` (claims ledger H12). Off, the page tells the
 *   same story with the services, the class and the hours the site does
 *   read today, and draws no shop.
 * - `open` is the launch switch: plan terms ("on every plan", "a paid plan")
 *   are said only once it is open, as a point's `openNote` is (DEC-136).
 */

/** A step of the page: its heading and lead, the drawing's name, and its points. */
export interface StepWords {
    title: string;
    lead: string;
    label: string;
    points: { title: string; body: string }[];
}

/** A colourway in the switcher: whose look it borrows, its name, and the line under it. */
export interface LookWords {
    business: WorldBusiness;
    label: string;
    line: string;
    /** A band colour the look's site uses beside its accent (HSL channels). */
    band?: {
        bg: string;
        fg: string;
    };
}
export interface WebsiteWords {
    name: string;
    title: {
        before: string;
        mark: string;
    };
    lede: string;
    secondary: string;
    note: string;
    signature: {
        at: string;
        line: string;
        label: string;
        place: string;
        page: string;
        rows: (
            | {
                  key: string;
                  name: string;
                  note: string;
                  from: string;
                  to: string;
                  price?: undefined;
              }
            | {
                  key: string;
                  name: string;
                  note: string;
                  price: string;
                  from?: undefined;
                  to?: undefined;
              }
        )[];
        arrow: string;
        shopUrl: string;
        shopItem: {
            name: string;
            unit: string;
            price: string;
            badge: string;
        };
        phoneMore: string;
        phoneMoreMeta: string;
        phoneList: string[];
    };
    looks: {
        id: string;
        title: string;
        label: string;
        group: string;
        note: string;
        frame: string;
        example: string;
        options: (
            | {
                  business: WorldBusiness;
                  label: string;
                  line: string;
                  band:
                      | {
                            bg: string;
                            fg: string;
                        }
                      | undefined;
              }
            | {
                  business: WorldBusiness;
                  label: string;
                  line: string;
                  band?: undefined;
              }
        )[];
        site: {
            name: string;
            address: string;
            nav: string[];
            order: string;
            headline: string;
            line: string;
            ctas: string[];
            open: string;
            shopTitle: string;
            seeShop: string;
            products: (
                | {
                      key: string;
                      name: string;
                      unit: string;
                      price: string;
                      badge?: undefined;
                  }
                | {
                      key: string;
                      name: string;
                      unit: string;
                      price: string;
                      badge: string;
                  }
            )[];
            classTitle: string;
            classLine: string;
            slot: string;
            classShort: string;
            leftShort: string;
            book: string;
            foot: string[];
            pins: {
                products: string;
                bookings: string;
                hours: string;
            };
        };
        templates: string;
        templatesLink: string;
        templatesMeta: string;
        of: string;
    };
    records: {
        title: string;
        lead: string;
        live: string;
        products: {
            key: string;
            name: string;
            note: string;
            price: string;
        }[];
        classRow: {
            name: string;
            note: string;
            count: string;
        };
        classPlace: string;
        classTail: string;
        hoursPlace: string;
        hoursPage: string;
        hours: readonly (readonly [string, string])[];
        visit: string;
        arrows: {
            shop: string;
            booking: string;
            hours: string;
        };
        pay: {
            before: string;
            bold: string;
            after: string;
            link: string;
        };
    };
    address: {
        title: string;
        lead: string;
        web: {
            title: string;
            sub: string;
            slug: string;
            host: string;
            foot: string;
        };
        own: {
            title: string;
            sub: string;
            domain: string;
            foot: string;
        };
        live: string;
        records: string;
        recordsMeta: string;
        head: string[];
        rows: readonly [
            readonly [string, string, string],
            readonly [string, string, string],
        ];
        found: string;
    };
    draft: {
        title: string;
        lead: string;
        label: string;
        page: string;
        state: string;
        preview: string;
        publish: string;
        sectionsTitle: string;
        sections: string[];
        addSection: string;
        selected: string;
        hero: {
            title: string;
            line: string;
            cta: string;
        };
        history: string;
        versions: (
            | {
                  when: string;
                  live: string;
              }
            | {
                  when: string;
                  live?: undefined;
              }
        )[];
        published: string;
        putBack: string;
        previewTitle: string;
        previewNote: string;
        points: {
            title: string;
            body: string;
        }[];
        phoneMore: string;
        phoneMoreMeta: string;
    };
    /** Test releases, reviewers and approval (the `site-test-releases` claim). */
    testRelease: StepWords & {
        panel: string;
        name: string;
        number: string;
        address: string;
        only: string;
        reviewer: string;
        approved: string;
        now: string;
        later: string;
    };
    /** The editor's device switch: desktop, tablet and phone, zoom and Fit. */
    preview: StepWords & {
        devices: readonly string[];
        zoom: string;
    };
    /** The look panel: theme, colours, typefaces and logo. */
    brand: StepWords & {
        panel: string;
        theme: string;
        themeValue: string;
        colours: string;
        typefaces: string;
        typefacesValue: string;
        logo: string;
    };
    sections: {
        /** On a phone, what the sections read and what you fill fold behind this. */
        more: string;
        title: string;
        lead: string;
        pages: readonly (readonly [string, string])[];
        addPage: string;
        read: {
            title: string;
            body: string;
        };
        fill: {
            title: string;
            body: string;
        };
    };
    shared: {
        /** On a phone, the shared preview is cut and this opens it. */
        more: string;
        title: string;
        lead: string;
        chatLabel: string;
        who: string;
        card: {
            title: string;
            line: string;
            url: string;
        };
        message: string;
        time: string;
        panel: string;
        panelPage: string;
        fields: readonly [readonly [string, string], readonly [string, string]];
        picture: string;
        warn: string;
        sitemap: readonly [string, string];
        google: readonly [string, string];
        bing: readonly [string, string];
        phoneMore: string;
        phoneMoreMeta: string;
    };
    ask: {
        /** On a phone, the assistant's answer folds behind this. */
        more: string;
        title: string;
        at: string;
        body: string;
        link: string;
        label: string;
        app: string;
        connected: string;
        ask: string;
        answer: string;
        draft: string;
        draftUrl: string;
    };
    tail: {
        moment: string;
        momentLead: string;
        momentAt: string;
        momentLink: string;
        plan: string;
        compare: string;
        works: string;
    };
    faq: {
        q: string;
        a: string;
    }[];
    ask_us: {
        lead: string;
        label: string;
        href: string;
        more: string;
    };
    close: {
        title: string;
        note: string;
    };
    inTheApp: {
        everything: string;
        usedBy: string;
        of: string;
        /** On a phone, the steps and what follows fold behind this. */
        phone: string;
    };
}
