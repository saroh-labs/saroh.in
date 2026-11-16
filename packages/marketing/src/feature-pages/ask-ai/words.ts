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
                /** The orders the card changes: they read Ready once it is pressed. */
                orders: string[];
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
        /** On a phone, the questions asked this week and the history line fold behind this. */
        askedMore: string;
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
        /** On a phone, what it can and can't change folds behind this. */
        listMore: string;
    };
    private: {
        /** On a phone, the second and third points fold behind this. */
        more: string;
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
        /** On a phone, the rule and the assistant's answer fold behind this. */
        more: string;
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
    /** The closing band's day link ("See 9 pm at …"). */
    moment: {
        link: string;
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
    chapters: readonly [
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
        readonly [string, string],
    ];
    inTheApp: {
        of: string;
        /** On a phone, the steps and what follows fold behind this. */
        phone: string;
        /** The line under the steps: how long history keeps a conversation. */
        foot: string;
        /** The steps' one conversation, played through (board "overdrive", #49). */
        play: {
            pause: string;
            play: string;
            /** Before the sources' chips while it reads them. */
            reading: string;
            /** A changed order's status once the card is pressed. */
            ready: string;
            /** The card's head once pressed, and its one button. */
            done: string;
            undo: string;
        };
    };
}
