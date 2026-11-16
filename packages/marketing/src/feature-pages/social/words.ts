/**
 * The words Social draws (DEC-221), as each edition's
 * `content/reach-*.ts` builds them from its own world. Generated from
 * saroh.in's builder's type with every word widened to `string`, so
 * saroh.tech's Global words fill the same shape.
 */
import type { SiteLook } from "../../kit/site-drawing";

export interface CardWordsSet {
    label: string;
    name: string;
    photoLine: string;
    tag: {
        price: string;
        unit?: string;
    };
    offer: {
        big: string;
        was: string;
        now: string;
        label: string;
    };
    simpleLine: string;
    mark: string;
    web: string;
}
export interface SocialWords {
    name: string;
    title: {
        before: string;
        mark: string;
    };
    lede: string;
    free: string;
    secondary: string;
    note: string;
    looks: {
        lead: {
            look: SiteLook | undefined;
            band:
                | {
                      bg: string;
                      fg: string;
                  }
                | undefined;
        };
        other: {
            look: SiteLook | undefined;
            band:
                | {
                      bg: string;
                      fg: string;
                  }
                | undefined;
        };
    };
    cards: {
        lead: CardWordsSet;
        other: CardWordsSet;
    };
    stage: {
        label: string;
        /** On a phone, the cards are cut; this opens them. */
        more: string;
        product: string;
        productNote: string;
        phoneNote: string;
        live: string;
        share: string;
        pick: string;
        sizes: string[];
        styles: {
            photo: string;
            price: string;
            offer: string;
            simple: string;
        };
        picked: string;
        note: string;
        of: string;
    };
    salon: {
        title: string;
        lead: string;
        site: string;
        phoneMore: string;
        duo: {
            name: string;
            kind: string;
        }[];
    };
    worth: {
        /** On a phone, Ask AI's answer folds behind this. */
        askMore: string;
        title: string;
        lead: string;
        label: string;
        small: string;
        page: string;
        pageLine: string;
        newPost: string;
        head: string;
        headNote: string;
        make: string;
        ideas: (
            | {
                  kind: "price";
                  name: string;
                  line: string;
              }
            | {
                  kind: "offer";
                  name: string;
                  line: string;
              }
            | {
                  kind: "text";
                  name: string;
                  line: string;
              }
        )[];
        ask: {
            label: string;
            title: string;
            q: string;
            a: string;
            more: string;
            from: string;
            sources: string[];
            follow: string;
            plans: string;
        };
        phoneMore: string;
        phoneMoreMeta: string;
        phoneAlso: string;
    };
    story: {
        id: string;
        title: string;
        lead: string;
        of: string;
        card: {
            at: string;
            title: string;
            body: string;
            another: string;
            seg: string[];
            sizes: (
                | {
                      size: "post";
                      name: string;
                      ratio: string;
                  }
                | {
                      size: "square";
                      name: string;
                      ratio: string;
                  }
                | {
                      size: "story";
                      name: string;
                      ratio: string;
                  }
            )[];
        };
        caption: {
            at: string;
            title: string;
            body: string;
            product: string;
            productNote: string;
            head: string;
            done: string;
            kinds: string[];
            on: string;
            text: string;
            link: string;
            note: string;
        };
        share: {
            at: string;
            title: string;
            body: string;
            head: string;
            download: string[];
            copy: string[];
            apps: string[];
            phone: string;
        };
    };
    feed: {
        handle: string;
        initials: string;
        caption: string;
        inBio: string;
    };
    posted: {
        /** On a phone, the feed is cut and this opens it. */
        more: string;
        at: string;
        title: string;
        label: string;
        ticks: string[];
        buttons: string[];
        laterAt: string;
        shared: string;
        laterName: string;
        laterWhen: string;
        visits: string;
        example: string;
        visitsNote: string;
    };
    own: {
        title: string;
        lead: string;
        label: string;
        headline: string;
        caption: string;
        ask: string;
        hint: string;
        count: string;
        photo: string;
        linkTo: string;
        linkPage: string;
        saved: string;
        yours: string;
        listTitle: string;
        list: (
            | {
                  kind: "offer";
                  name: string;
                  when: string;
                  visits: string;
                  state: string;
                  fill?: undefined;
                  card?: undefined;
                  line?: undefined;
              }
            | {
                  kind: "price";
                  name: string;
                  when: string;
                  visits: string;
                  state: string;
                  fill?: undefined;
                  card?: undefined;
                  line?: undefined;
              }
            | {
                  kind: "text";
                  fill: "accent";
                  name: string;
                  card: string;
                  when: string;
                  state: string;
                  visits?: undefined;
                  line?: undefined;
              }
            | {
                  kind: "text";
                  fill: "band";
                  name: string;
                  when: string;
                  visits: string;
                  state: string;
                  card?: undefined;
                  line?: undefined;
              }
            | {
                  kind: "text";
                  fill: "band";
                  name: string;
                  line: string;
                  when: string;
                  visits: string;
                  state: string;
                  card?: undefined;
              }
        )[];
        foot: string;
        phoneMore: string;
        phoneMoreMeta: string;
    };
    social: {
        id: string;
        title: string;
        lead: string;
        pill: string;
        notYetTitle: string;
        notYet: string;
        label: string;
        week: string;
        views: string[];
        legend: string[];
        addPost: string;
        days: readonly [
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
        ];
        hours: string[];
        goodTime: string;
        events: {
            day: number;
            at: number;
            name: string;
            time: string;
        }[];
        goodDays: number[];
        posts: (
            | {
                  day: number;
                  past: boolean;
                  kind: "simple";
                  on?: undefined;
              }
            | {
                  day: number;
                  past: boolean;
                  kind: "price";
                  on: boolean;
              }
        )[];
        postShort: string;
        postAt: string;
        panel: {
            day: string;
            meta: string;
            posts: string;
            when: string;
            where: string;
            edit: string;
            now: string;
            schedule: string;
            bookings: string;
            rows: readonly [
                readonly [string, string, string],
                readonly [string, string, string],
            ];
        };
        points: {
            title: string;
            body: string;
        }[];
        phoneMore: string;
        phoneMoreMeta: string;
        phoneWeek: string;
    };
    tail: {
        plan: string;
        compare: string;
    };
    faq: {
        q: string;
        a: string;
    }[];
    askUs: {
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
        of: string;
        /** On a phone, the steps and what follows fold behind this. */
        phone: string;
    };
    insights: boolean;
}
