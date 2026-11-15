# Ask AI quality test

The gate before Ask AI's screens are built (plan `2026-11-13-001`, U6): 88
questions, run three times each, through the real `TurnRunner` and the real
provider, as real people of seven made-up businesses, then graded. The
first 60 (salon, gym, clinic, bakery, coach) are the original set; the
25 after them add a clothing shop, a yoga studio, summaries over long
periods and blog drafts, and the last 3 ask for big lists (a count, the
card and its link, never every row).

**Run by hand, never in CI. It costs money**: every turn calls the provider,
and so does the AI grader. The runner and the grader both stop at the budget
in the targets file.

## Files

| File               | What it is                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan.ts`          | The seven businesses (salon, gym, clinic, bakery, coach, clothing, yoga) as data: a pure function of the run date and a fixed seed                                                                                                                          |
| `seed.ts`          | Writes the plan into the eval database with Prisma                                                                                                                                                                                                          |
| `facts.ts`         | The right answers, read from the same plan (`bookings:this_week`, `moneyin:today`, `orders:last_3_months:amount`, …)                                                                                                                                        |
| `questions/*.json` | The 88 questions: business, person, language, kind, words, and what is expected, as fact keys; one file per trade, plus `periods.json` (summaries over long periods) `blog.json` (blog drafts) and `lists.json` (big lists: a count, the card and its link) |
| `run.ts`           | Runs them, records each run                                                                                                                                                                                                                                 |
| `grade.ts`         | Code grading, the AI grader, the pass marks                                                                                                                                                                                                                 |
| `lib.ts`           | The pure parts (figures in Indian formats, draft matching, budget, marks); `lib.spec.ts` tests them                                                                                                                                                         |

## "Today"

The API reads the real clock (`new Date()` in the turn runner and the
tools; `Date.now()` in `find_lapsed_customers`) and has no clock to inject.
So the data is not frozen at a fixed date: it is laid out around **the day
you seed** (history 120 days back, the clothing shop's orders 190 so "the
last 3 months" has 3 months before it to compare with, bookings 14 days
ahead), and that day is
the run date. The seed stores it (the salon business was "made" exactly 365
days before it) and the runner refuses to run on another day or before
11:00 Kolkata time (today's history is laid out until then). No history
falls 59 to 61 days back, so "not seen for 60 days" can't change with the
hour, and the yoga studio has no visit 30 or 31 days back, for "not in for 30
days" likewise. Every expected value is computed from the plan for the
moment of the run, never written into a question.

## The businesses

| Business                       | What it has                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Glow Theory Salon (`salon`)    | Staff diary, one-to-one services, a few products                                                                                |
| IronPeak Fitness (`gym`)       | Classes and personal training, monthly membership bills                                                                         |
| CareWell Clinic (`clinic`)     | Consultations, bills some unpaid                                                                                                |
| Crumb & Co. Bakery (`bakery`)  | Products and orders; a website for blog drafts                                                                                  |
| Pathway Coaching (`coach`)     | Sessions, bills paid late                                                                                                       |
| Threadline Studio (`clothing`) | Two stores; products with sizes or colours, stock per store; counter and online orders, some cancelled or discounted; a website |
| Prana Yoga Studio (`yoga`)     | Daily classes with capacity, a full Saturday class with a waitlist, class packs sold and spent, a monthly membership            |

Each has its owner, a Member (no money) and, for the salon, the bakery and
the clothing shop, a Storefront team person at the main store. Every
business has Ask AI on, the plan row, `ORG_AUTHORIZATION` and its staff's
hours; the bakery and the clothing shop also have Website on, the yoga
studio Class packs.

## Run it

You need Postgres on this machine, the API's `.env` (with
`ANTHROPIC_API_KEY`), the AI settings file (`~/.saroh-ai-dev-settings.json`,
see `src/cli/ask.cli.ts`; its `ai.prices` must include the grader's model)
and the targets file (below). The database name must end in `-eval`: the
seed, the runner and the grader refuse any other, and any that is not on
this machine.

```bash
# A fresh database each day you run it
dropdb --if-exists saroh-ai-eval && createdb saroh-ai-eval
export DATABASE_URL=postgresql://$USER@localhost:5432/saroh-ai-eval
pnpm --filter @saroh/database db:migrate:deploy
pnpm --filter @saroh/database db:seed            # flags and plans the businesses use

pnpm --filter @saroh/api build                   # the runner uses the API's build
pnpm --filter @saroh/api eval:ask-ai seed
pnpm --filter @saroh/api exec node dist/cli/ask.cli.js \
    --setup-settings ~/.saroh-ai-dev-settings.json --as owner.salon.eval@example.com

# One question once, to check the setup (cheap)
pnpm --filter @saroh/api eval:ask-ai run --only salon-01 --runs 1 --out /tmp/ask-ai-try

# The test
pnpm --filter @saroh/api eval:ask-ai run
pnpm --filter @saroh/api eval:ask-ai grade --results <the folder run printed>
```

`run` flags: `--targets <file>` (default `~/.saroh-ai-eval-targets.json`),
`--out <folder>` (default `<reportDir>/<time>/` from the targets file),
`--runs <n>`, `--only <id,id>`. `grade` flags: `--results <folder>`,
`--targets <file>`, `--no-ai` (code grading only; the AI marks then fail).

The people: `owner.<business>.eval@example.com`, `member.…` (a Member, who
sees no money) and, for the salon, the bakery and the clothing shop,
`storefront.…` (Storefront team). Ask AI is Owner and Admin by default, so
the seed gives the others `ai:use` as an extra.

A question that `needs` a tool Ask AI hasn't got yet (the blog drafts need
`draft_blog_post`) is not run: `run` prints `skipped: tool not available`
and keeps the list in `results.json`, and `grade` lists it as SKIP, in no
mark. A question's `before` turns ("Publish it" after a blog draft) are
asked first in the same conversation and not graded; their cost is spent
from the budget but kept out of the question's own cost.

## Results

Into the out folder, outside the repository: `results.json` (every run:
answer, status lines, tool calls with their input, every card shown, tokens and
cost, time to the first status line and to the first answer text, tables
that changed) and `report.md`, written as the run goes; then `grade.json`
and `grade.md` from the grader, which also prints PASS or FAIL per mark and
exits 1 unless all pass.

## Grading

By code, per run: the expected figures are in the answer (₹1,20,000,
1.2 lakh, Devanagari digits all read; money to the rupee, counts exactly),
a wrong figure is told apart from "can't tell"; the draft tool's input
matches the expected fields and its card can be confirmed (`"*"` in an
expected field is any words, `"?x"` absent or x); a summary says its
period's first and last days (15 Aug, August 15th, १५ अगस्त, 15/08 all
read) and shows a table or products card with its link (these count with
the figures); no forbidden
tool was called; no forbidden figure (exactly or rounded) or name is in the
answer; nothing in the business's tables changed (a save without Confirm);
no delete, cancel or refund was asked of any tool; the cost is under the
per-question cap. Then a stronger model checks the language, money words,
kind refusals and asking back against a written checklist and answers in
strict JSON.

## The targets file

Local only, never committed (`~/.saroh-ai-eval-targets.json`, mode 600; a
copy in this folder is git-ignored). The values are the private spec's;
shares are 0 to 1, money is micro-USD, waits are milliseconds (p75):

```json
{
    "runsPerQuestion": 0,
    "budgetMicroUsd": 0,
    "rupeesPerUsd": 0,
    "graderModel": "<model id>",
    "reportDir": "<folder outside the repo>",
    "marks": {
        "numbersExact": 0,
        "drafts": 0,
        "language": 0,
        "refusals": 0,
        "medianCostMicroUsd": 0,
        "p95CostMicroUsd": 0,
        "statusLineMs": 0,
        "answerStartP75Ms": 0
    }
}
```

`marks.perQuestionCapMicroUsd` is optional; without it the cap is the
`askAi.turnCostCapMicroUsd` setting.

## Unit tests

```bash
pnpm --filter @saroh/api exec jest -c eval/ask-ai/jest.config.js
pnpm --filter @saroh/api exec tsc -p eval/ask-ai/tsconfig.json
```
