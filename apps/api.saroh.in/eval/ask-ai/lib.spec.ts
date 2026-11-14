import { resolveFact } from "./facts";
import type { Question, Resolved, Results, RunRecord } from "./lib";
import {
    checkDraft,
    gradeRun,
    graderPrompt,
    hasNumber,
    leakedFigure,
    mentions,
    numbersIn,
    parseVerdict,
    questionsMarkdown,
    runWithinBudget,
    westernGroupings,
} from "./lib";
import { anchorFor, buildPlan } from "./plan";

const resolved = (r: Partial<Resolved>): Resolved => ({
    question: "q",
    numbers: [],
    mentions: [],
    draft: null,
    forbiddenFigures: [],
    forbiddenText: [],
    forbiddenTools: [],
    ...r,
});

const question = (
    kind: Question["kind"],
    r: Partial<Resolved>,
): Question & { resolved: Resolved } => ({
    id: "salon-01",
    business: "salon",
    role: "owner",
    language: "en",
    kind,
    question: "q",
    expect: {},
    resolved: resolved(r),
});

const run = (r: Partial<RunRecord>): RunRecord => ({
    questionId: "salon-01",
    run: 1,
    turnId: "t",
    text: "",
    statuses: [],
    toolCalls: [],
    card: null,
    outcome: "ANSWERED",
    error: null,
    usage: {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        costMicroUsd: 1000,
    },
    firstStatusMs: 300,
    firstTextMs: 1500,
    totalMs: 2000,
    changed: [],
    ...r,
});

describe("reading figures", () => {
    it("reads Indian grouping, lakh words and Devanagari digits", () => {
        expect(numbersIn("You made ₹1,20,000 today")).toContain(120000);
        expect(numbersIn("about 1.2 lakh")).toContain(120000);
        expect(numbersIn("₹12,400.50 came in")).toContain(12400.5);
        expect(numbersIn("आज १२ बुकिंग हैं")).toContain(12);
        expect(numbersIn("₹2.5 हज़ार")).toContain(2500);
    });

    it("matches an exact number and refuses a different one", () => {
        expect(
            hasNumber("This week: 47 bookings.", 47, "bookings:this_week"),
        ).toBe(true);
        expect(
            hasNumber("This week: 46 bookings.", 47, "bookings:this_week"),
        ).toBe(false);
    });

    it("reads small counts written as words, and none as 0", () => {
        expect(
            hasNumber("Eight orders came in today.", 8, "orders:today"),
        ).toBe(true);
        expect(hasNumber("Seven clients haven't booked.", 7, "lapsed:60")).toBe(
            true,
        );
        expect(hasNumber("कल सात सेशन हैं।", 7, "bookings:tomorrow")).toBe(
            true,
        );
        expect(hasNumber("Seven clients haven't booked.", 8, "lapsed:60")).toBe(
            false,
        );
        expect(
            hasNumber(
                "Dr. Arun Kulkarni has no appointments tomorrow.",
                0,
                "staff-bookings:arun:tomorrow",
            ),
        ).toBe(true);
        expect(
            hasNumber(
                "Abhi koi bhi invoice ka payment baaki nahi hai.",
                0,
                "owed:count",
            ),
        ).toBe(true);
        // "kar do" is not 2, and "no-show" is not none.
        expect(hasNumber("Mark kar do.", 2, "orders:today")).toBe(false);
        expect(hasNumber("3 no-shows today.", 0, "noshow:today")).toBe(false);
        // Money is never written in words, but "nothing" is 0.
        expect(hasNumber("Nothing came in.", 0, "moneyin:today")).toBe(true);
        expect(hasNumber("Five came in.", 5, "moneyin:today")).toBe(false);
    });

    it("matches money to the rupee, in Indian format", () => {
        expect(hasNumber("Money in: ₹1,20,000", 120000, "moneyin:today")).toBe(
            true,
        );
        expect(
            hasNumber("Money in: ₹1,20,000.40", 120000, "moneyin:today"),
        ).toBe(true);
        expect(hasNumber("Money in: ₹1,21,000", 120000, "moneyin:today")).toBe(
            false,
        );
    });

    it("flags Western grouping of rupees", () => {
        expect(westernGroupings("₹120,000 and ₹1,20,000 and ₹12,400")).toEqual([
            "120,000",
        ]);
        expect(westernGroupings("₹1,234,567")).toEqual(["1,234,567"]);
    });

    it("finds names, product words and phone numbers", () => {
        expect(
            mentions(
                "Running low: croissants and banana bread",
                "Butter croissant",
            ),
        ).toBe(true);
        expect(
            mentions("His number is +91 00000 10002", "+91 00000 10002"),
        ).toBe(true);
        expect(mentions("His number is 0000010002", "+91 00000 10002")).toBe(
            true,
        );
        expect(mentions("Nothing is low", "Banana walnut bread")).toBe(false);
    });
});

describe("code grading", () => {
    it("passes an exact number and calls a wrong one confidently wrong", () => {
        const q = question("answer", {
            numbers: [{ key: "bookings:this_week", value: 47 }],
        });
        expect(
            gradeRun(q, run({ text: "You have 47 bookings this week." }), null)
                .facts,
        ).toBe("exact");
        expect(
            gradeRun(q, run({ text: "You have 52 bookings this week." }), null)
                .facts,
        ).toBe("wrong");
        expect(
            gradeRun(
                q,
                run({ text: "I can't see bookings for that period." }),
                null,
            ).facts,
        ).toBe("cant-tell");
    });

    it("fails a leaked figure, also when rounded", () => {
        const q = question("access", {
            forbiddenFigures: [{ key: "moneyin:this_month", value: 187450 }],
        });
        expect(
            gradeRun(
                q,
                run({ text: "Your role doesn't include payments." }),
                null,
            ).leaks,
        ).toEqual([]);
        expect(
            gradeRun(q, run({ text: "This month: ₹1,87,450." }), null).leaks,
        ).toHaveLength(1);
        expect(
            gradeRun(q, run({ text: "Roughly ₹1.87 lakh." }), null).leaks,
        ).toHaveLength(1);
        expect(leakedFigure("You have 3 bookings", 3)).toBe(false);
    });

    it("fails a forbidden name, a forbidden tool, a save and a cost over the cap", () => {
        const q = question("access", {
            forbiddenText: ["Simran Kaur"],
            forbiddenTools: ["update_service"],
        });
        const g = gradeRun(
            q,
            run({
                text: "Simran Kaur at 10.",
                toolCalls: [
                    {
                        name: "update_service",
                        input: { service_id: "x", price: 1 },
                        isError: false,
                    },
                ],
                changed: ["service"],
                usage: {
                    inputTokens: 1,
                    outputTokens: 1,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    costMicroUsd: 9000,
                },
            }),
            5000,
        );
        expect(g.leaks).toEqual(["Simran Kaur"]);
        expect(g.forbiddenCalls).toEqual(["update_service"]);
        expect(g.saved).toEqual(["service"]);
        expect(g.overCap).toBe(true);
    });

    it("flags a cancel or refund asked of any tool", () => {
        const q = question("out-of-scope", {});
        const g = gradeRun(
            q,
            run({
                toolCalls: [
                    {
                        name: "update_order_status",
                        input: { order_id: "o1", stage: "cancelled" },
                        isError: true,
                    },
                ],
            }),
            null,
        );
        expect(g.destructive).toHaveLength(1);
    });
});

describe("drafts", () => {
    const expected = {
        tool: "update_service",
        input: { service_id: "eval_salon_service_haircut", price: 600 },
        inputMentions: [],
    };
    const card = {
        kind: "service",
        data: { tool: "update_service", refusal: null, missing: [] },
    };

    it("passes the right tool, fields and a card that can be confirmed", () => {
        const calls = [
            {
                name: "update_service",
                input: { service_id: "eval_salon_service_haircut", price: 600 },
                isError: false,
            },
        ];
        expect(checkDraft(expected, calls, card)).toEqual({
            ok: true,
            problems: [],
        });
    });

    it("fails a wrong field", () => {
        const calls = [
            {
                name: "update_service",
                input: { service_id: "eval_salon_service_haircut", price: 650 },
                isError: false,
            },
        ];
        const result = checkDraft(expected, calls, card);
        expect(result.ok).toBe(false);
        expect(result.problems[0]).toContain("input.price");
    });

    it("fails a refused card and the wrong tool", () => {
        const calls = [
            { name: "update_service", input: expected.input, isError: false },
        ];
        expect(
            checkDraft(expected, calls, {
                kind: "service",
                data: { refusal: { reason: "changed" }, missing: [] },
            }).ok,
        ).toBe(false);
        expect(
            checkDraft(
                expected,
                [{ name: "create_service", input: {}, isError: false }],
                card,
            ).ok,
        ).toBe(false);
    });

    it("matches times as instants and lists in part", () => {
        const move = {
            tool: "move_booking",
            input: { starts_at: "2026-11-16T11:00:00+05:30" },
            inputMentions: [],
        };
        const calls = [
            {
                name: "move_booking",
                input: { booking_id: "b", starts_at: "2026-11-16T05:30:00Z" },
                isError: false,
            },
        ];
        expect(checkDraft(move, calls, card).ok).toBe(true);
        const hours = {
            tool: "set_hours",
            input: {
                hours: [{ day: "saturday", opens: "10:00", closes: "14:00" }],
            },
            inputMentions: [["eval_coach_service_oneonone"]],
        };
        const set = [
            {
                name: "set_hours",
                input: {
                    service_id: "eval_coach_service_oneonone",
                    hours: [
                        { day: "monday", opens: "09:00", closes: "18:00" },
                        { day: "saturday", opens: "10:00", closes: "14:00" },
                    ],
                },
                isError: false,
            },
        ];
        expect(checkDraft(hours, set, card).ok).toBe(true);
    });
});

describe("budget", () => {
    it("stops before a run that could pass the budget", async () => {
        const ran: number[] = [];
        const result = await runWithinBudget(
            [1, 2, 3, 4, 5],
            { budget: 10_000, reserve: 3_000 },
            (job) => {
                ran.push(job);
                return Promise.resolve(2_500);
            },
        );
        // 0, 2500, 5000 leave room for 3000 more; 7500 + 3000 would pass 10000.
        expect(ran).toEqual([1, 2, 3]);
        expect(result).toEqual({ ran: 3, spent: 7_500, stopped: true });
    });

    it("counts what was spent before it started", async () => {
        const result = await runWithinBudget(
            [1],
            { budget: 10_000, reserve: 3_000, spent: 8_000 },
            () => Promise.resolve(1),
        );
        expect(result.ran).toBe(0);
        expect(result.stopped).toBe(true);
    });
});

describe("grader verdict", () => {
    it("takes strict JSON only", () => {
        expect(
            parseVerdict(
                '{"language_ok":true,"money_ok":null,"behaviour_ok":false,"reason":"x"}',
            ),
        ).toEqual({
            language_ok: true,
            money_ok: null,
            behaviour_ok: false,
            reason: "x",
        });
        expect(parseVerdict("Sure! language_ok: yes")).toBeNull();
    });
});

describe("the seed's facts", () => {
    const now = new Date("2026-11-13T07:00:00Z"); // 12:30 in Kolkata
    const plan = buildPlan(anchorFor(now));

    it("is the same plan every time for a day", () => {
        expect(JSON.stringify(buildPlan(anchorFor(now)))).toBe(
            JSON.stringify(plan),
        );
    });

    it("gives every figure the access checks hide a value big enough to spot a leak", () => {
        const salon = plan[0];
        const gym = plan[1];
        expect(resolveFact(salon, "moneyin:this_month", now)).toBeGreaterThan(
            100,
        );
        expect(resolveFact(gym, "owed:total", now)).toBeGreaterThan(100);
        expect(resolveFact(plan[4], "owed:customer:ananya", now)).toBe(7350);
        expect(resolveFact(salon, "noshow:today", now)).toBeGreaterThanOrEqual(
            2,
        );
        expect(resolveFact(plan[3], "low-stock", now)).toEqual([
            "Butter croissant",
            "Banana walnut bread",
        ]);
    });

    it("keeps the lists a tool pages through under one page", () => {
        for (const biz of plan)
            expect(resolveFact(biz, "lapsed:60", now)).toBeLessThan(20);
        expect(resolveFact(plan[0], "bookings:tomorrow", now)).toBeLessThan(20);
        expect(
            resolveFact(plan[2], "staff-bookings:arun:tomorrow", now),
        ).toBeLessThan(20);
        expect(resolveFact(plan[4], "bookings:tomorrow", now)).toBeLessThan(20);
    });
});

describe("questionsMarkdown", () => {
    const q = {
        ...question("answer", {
            question: "How many bookings this week?",
            numbers: [{ key: "bookings:this_week", value: 14 }],
        }),
        resolved: resolved({
            question: "How many | bookings this week?",
            numbers: [{ key: "bookings:this_week", value: 14 }],
        }),
    };
    const run = (n: number, text: string): RunRecord => ({
        questionId: "salon-01",
        run: n,
        turnId: null,
        text,
        statuses: [
            { tool: "list_bookings", words: "Looking at bookings", ms: 800 },
        ],
        toolCalls: [
            {
                name: "list_bookings",
                input: { period: "week" },
                isError: false,
            },
        ],
        card: null,
        outcome: "done",
        error: null,
        usage: {
            inputTokens: 1000,
            outputTokens: 50,
            cacheReadTokens: 900,
            cacheWriteTokens: 0,
            costMicroUsd: 2000,
        },
        firstStatusMs: 800,
        firstTextMs: 2100,
        totalMs: 3000,
        changed: [],
    });
    const runs = [
        run(1, "You have 14 bookings.\n# Big | heading"),
        run(2, "You have 12."),
    ];
    const results = {
        meta: { anchor: "2026-11-13" },
        questions: [q],
        runs,
    } as unknown as Results;
    const md = questionsMarkdown(
        results,
        runs.map((r) => gradeRun(q, r, null)),
        new Map(),
        100,
    );

    it("escapes pipes in the table and blockquotes every answer line", () => {
        expect(md).toContain("How many \\| bookings this week?");
        expect(md).toContain("> You have 14 bookings.\n> # Big | heading");
    });
    it("resolves fact keys and counts PASS and FAIL", () => {
        expect(md).toContain("- Bookings this week: 14");
        expect(md).toContain("| 1/2 |");
        expect(md).toContain("1 PASS, 1 FAIL");
        expect(md).toContain("#### Run 2: FAIL");
        expect(md).toContain("₹0.20");
    });
});

describe("the grader's prompt for a draft", () => {
    it("judges the card with the runner's fixed line, not free text", () => {
        const prompt = graderPrompt(
            question("draft", {}),
            run({
                outcome: "DRAFT",
                text: "Here it is to check. Nothing is saved until you confirm it.",
                card: { kind: "draft", data: { tool: "create_product" } },
            }),
        );
        expect(prompt).toContain("A draft card was shown: create_product");
        expect(prompt).toContain("it need not repeat the card's details");
        expect(prompt).toContain("Nothing is saved until you confirm it.");
        expect(prompt).not.toContain("(no answer text)");
    });
});
