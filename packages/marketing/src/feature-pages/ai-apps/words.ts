/**
 * The words AiApps draws (DEC-221), as each edition's
 * `content/reach-*.ts` builds them from its own world. Generated from
 * saroh.in's builder's type with every word widened to `string`, so
 * saroh.tech's Global words fill the same shape.
 */

export interface AiAppsWords {
    name: string;
    title: {
        before: string;
        mark: string;
    };
    lede: string;
    apps: string;
    secondary: string;
    note: string;
    chat: {
        label: string;
        app: string;
        connected: string;
        first: {
            at: string;
            ask: string;
            steps: {
                did: string;
                what: string;
                tool: string;
                state: string;
            }[];
            answer: string[];
            link: string;
        };
        second: {
            at: string;
            ask: string;
            step: {
                did: string;
                what: string;
                tool: string;
                state: string;
            };
            answer: string;
        };
        reply: string;
        cap: string;
        momentLink: string;
        phoneMore: string;
    };
    rule: {
        bold: string;
        text: string;
        link: string;
    };
    land: {
        /** On a phone, the three ways a change arrives fold behind this. */
        arriveMore: string;
        title: string;
        lead: string;
        products: {
            after: string;
            when: string;
            label: string;
            crumb: string[];
            title: string;
            count: string;
            head: string[];
            rows: (
                | {
                      key: string;
                      name: string;
                      state: string;
                      price: string;
                      isNew: boolean;
                  }
                | {
                      key: string;
                      name: string;
                      state: string;
                      price: string;
                      isNew?: undefined;
                  }
            )[];
            where: string;
            foot: string;
        };
        request: {
            after: string;
            when: string;
            label: string;
            crumb: string[];
            title: string;
            rows: readonly [
                readonly [string, string, string],
                readonly [string, string, string],
                readonly [string, string, string],
            ];
            live: string;
            liveWhat: string;
            preview: string;
            note: string;
            buttons: string[];
        };
        arrive: {
            title: string;
            how: string;
            draft: boolean;
            body: string;
        }[];
    };
    compare: {
        /** On a phone, the table is cut and this opens it. */
        more: string;
        title: string;
        lead: string;
        cols: {
            name: string;
            sub: string;
        }[];
        rows: readonly [
            readonly [string, string, string],
            readonly [string, string, string],
            readonly [string, string, string],
            readonly [string, string, string],
            readonly [string, string, string],
            ...(readonly [string, string, string])[],
        ];
    };
    connect: {
        id: string;
        title: string;
        lead: string;
        address: string;
        moves: (
            | {
                  where: string;
                  claude: boolean;
                  label: string;
                  bar: string[];
                  title: string;
                  body: string;
                  link: {
                      label: string;
                      href: string;
                  };
              }
            | {
                  where: string;
                  label: string;
                  title: string;
                  body: string;
                  claude?: undefined;
                  bar?: undefined;
                  link?: undefined;
              }
        )[];
        form: {
            title: string;
            name: string[];
            addr: string;
            copy: string;
            add: string;
        };
        signIn: {
            host: string;
            title: string;
            email: string[];
            go: string;
            note: string;
        };
        consent: {
            title: string;
            all: string;
            one: string;
            able: string;
            can: string[];
            allow: string;
        };
        chatgpt: {
            bold: string;
            text: string;
            link: string;
        };
        of: string;
    };
    can: {
        /** On a phone, the groups past the first fold behind this. */
        more: string;
        title: string;
        lead: string;
        groups: {
            title: string;
            sub: string;
            items: string[];
            tools: string[];
        }[];
        honest: string;
        all: string;
        names: string;
    };
    cant: {
        title: string;
        lead: string;
        stays: string;
        list: string[];
        record: {
            title: string;
            body: string;
        };
        panel: {
            /** On a phone, the activity panel folds behind this. */
            more: string;
            label: string;
            title: string;
            sub: string;
            rows: readonly [
                readonly [string, string],
                readonly [string, string],
                readonly [string, string],
            ];
            buttons: string[];
        };
        foot: string;
    };
    dev: {
        lead: string;
        link: string;
    };
    plan: {
        line: string;
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
    };
    inTheApp: {
        everything: string;
        usedBy: string;
        of: string;
        /** On a phone, the steps and what follows fold behind this. */
        phone: string;
    };
}
