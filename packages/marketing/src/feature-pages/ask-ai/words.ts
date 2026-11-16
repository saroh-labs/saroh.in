/**
 * The words AskAi draws (DEC-221), as each edition's
 * `content/reach-*.ts` builds them from its own world. Generated from
 * saroh.in's builder's type with every word widened to `string`, so
 * saroh.tech's Global words fill the same shape.
 */

export interface AskAiWords {
    name: string;
    title: {
        before: string;
        mark: string;
    };
    lede: string;
    plan: string;
    secondary: string;
    note: string;
    hero: {
        at: string;
        moment: string;
        line: string;
        phoneLine: string;
        next: {
            title: string;
            body: string;
        };
        drop: string;
        slips: {
            customers: {
                title: string;
                sub: string;
                rows: (
                    | {
                          name: string;
                          end: string;
                          hi?: undefined;
                      }
                    | {
                          name: string;
                          end: string;
                          hi: boolean;
                      }
                )[];
                note: string;
                feed: {
                    line: string;
                    end: string;
                };
            };
            orders: {
                title: string;
                sub: string;
                rows: {
                    id: string;
                    name: string;
                    end: string;
                    hi: boolean;
                }[];
                feed: {
                    line: string;
                    end: string;
                };
            };
            stock: {
                title: string;
                sub: string;
                head: string[];
                rows: (
                    | {
                          name: string;
                          end: string;
                          hi: boolean;
                      }
                    | {
                          name: string;
                          end: string;
                          hi?: undefined;
                      }
                )[];
                feed: {
                    line: string;
                    end: string;
                };
            };
        };
        panel: {
            label: string;
            title: string;
            about: string;
            q: string;
            checked: string;
            lead: string;
            why: string;
            head: string[];
            rows: {
                id: string;
                customer: string;
                total: string;
                paid: string;
                from: boolean;
            }[];
            stockHead: string[];
            stockRows: {
                name: string;
                need: string;
                have: string;
            }[];
            from: string;
            sources: string[];
            where: string;
            card: {
                head: string;
                title: string;
                kv: readonly [
                    readonly [string, string],
                    readonly [string, string],
                ];
                note: string;
                buttons: string[];
            };
            more: string;
        };
        example: string;
    };
    where: {
        id: string;
        title: string;
        lead: string;
        ask: string;
        hintHome: string;
        hintPage: string;
        screens: (
            | {
                  name: string;
                  sub: string;
                  page: string;
                  label: string;
                  h: string;
                  small: string;
                  lines: (readonly [string, string])[];
                  about: string;
                  sugs: (
                      | {
                            t: string;
                            h: string;
                            act?: undefined;
                        }
                      | {
                            t: string;
                            h?: undefined;
                            act?: undefined;
                        }
                      | {
                            t: string;
                            h: string;
                            act: boolean;
                        }
                  )[];
                  lead?: undefined;
              }
            | {
                  name: string;
                  sub: string;
                  label: string;
                  h: string;
                  small: string;
                  lines: readonly [
                      readonly [string, string],
                      readonly [string, string],
                      readonly [string, string],
                  ];
                  lead: string;
                  sugs: (
                      | {
                            t: string;
                            h: string;
                            act?: undefined;
                        }
                      | {
                            t: string;
                            h: string;
                            act: boolean;
                        }
                  )[];
                  page?: undefined;
                  about?: undefined;
              }
            | {
                  name: string;
                  sub: string;
                  page: string;
                  label: string;
                  h: string;
                  small: string;
                  lines: readonly [
                      readonly [string, string],
                      readonly [string, string],
                      readonly [string, string],
                      readonly [string, string],
                  ];
                  about: string;
                  sugs: (
                      | {
                            t: string;
                            h: string;
                            act?: undefined;
                        }
                      | {
                            t: string;
                            act: boolean;
                            h?: undefined;
                        }
                  )[];
                  lead?: undefined;
              }
        )[];
        phoneMore: string;
        asked: string;
        questions: {
            q: string;
            from: string[];
        }[];
        history: string;
    };
    acts: {
        id: string;
        title: string;
        lead: string;
        steps: {
            at: string;
            title: string;
        }[];
        q: string;
        checked: string;
        lead1: string;
        slots: readonly [
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
        ];
        bookHere: string;
        lead2: string;
        newBooking: string;
        what: string;
        kv: readonly [
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
        ];
        told: string;
        book: string[];
        booked: string;
        doneTitle: string;
        doneKv: readonly [readonly [string, string], readonly [string, string]];
        doneNote: string;
        done: string[];
        again: string;
        can: readonly [
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
            readonly [string, string],
        ];
        never: readonly [string, string];
    };
    private: {
        id: string;
        title: string;
        role: {
            title: string;
            body: string;
        };
        staff: {
            who: string;
            q: string;
            a: string;
        };
        yours: {
            title: string;
            body: string;
        };
        who: {
            title: string;
            body: string;
        };
    };
    plans: {
        id: string;
        line: string;
        compare: string;
    };
    mcp: {
        title: string;
        body: string;
        link: string;
        rule: {
            bold: string;
            text: string;
        };
        label: string;
        who: string;
        q: string;
        a: string;
    };
    moment: {
        at: string;
        before: string;
        q: string;
        after: string;
        link: string;
    };
    works: string;
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
    chapters: readonly [
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
    ];
    inTheApp: {
        everything: string;
        usedBy: string;
        of: string;
        /** On a phone, the steps and what follows fold behind this. */
        phone: string;
    };
}
