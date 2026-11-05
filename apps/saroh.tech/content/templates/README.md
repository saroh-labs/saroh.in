# Writing template pages

Every template page on saroh.tech is drawn from the files in this folder. No
file, no page. You never touch a route, a component or `lib/site-map.ts`: adding
data is enough, and the page, its sitemap entry, its links and its PDF, Word and
Excel files all follow.

## What each folder holds

| File                             | Makes                                                |
| -------------------------------- | ---------------------------------------------------- |
| `documents/{document}.ts`        | `/templates/{document}` (all 8 are written)          |
| `trades/{trade}.ts`              | the trade hub's content, and each combo's defaults   |
| `countries/{country}.ts`         | the country hub's content, and each combo's defaults |
| `combos/{document}-{trade}.ts`   | `/templates/{document}/{trade}`                      |
| `combos/{document}-{country}.ts` | `/templates/{document}/{country}`                    |

`types.ts` has every field, with a comment on what it's for. TypeScript rejects a
slug that doesn't exist.

The closest examples to copy: `trades/photographer.ts`,
`combos/invoice-photographer.ts`, `countries/uk.ts`, `combos/invoice-uk.ts`.

## Rules for the words

- Plain, simple English. Short sentences. No Hinglish. No em dashes.
- Amounts are round placeholders (whole numbers, or ending in .50). Never say
  what a trade "usually charges". The page already labels them Example.
- Sample data is invented: `@example.com` emails, made-up businesses.
- Never invent a law, a rate, a review or a number. A tax or legal fact goes in a
  country file with a source, or is cut or softened to `general: true`.
- Write tips and FAQs a person in that trade or country would actually miss on
  the page next to it. If only the trade's name changes, don't write the page.
- Nothing about Saroh itself: no prices or limits (this repo is public), and no
  product claim. A page's closing band is one per document, in
  `lib/templates/pages.ts`, and `scripts/check-claims.mjs` reads the built pages.

## Add a combo for a trade

1. If the trade has no data yet, do "Add a trade's data" below first.
2. Create `combos/{document}-{trade}.ts`, for example `combos/quote-photographer.ts`:

    ```ts
    import type { Combo } from "../types";

    export const quotePhotographer: Combo = {
        document: "quote",
        trade: "photographer",
        reviewed: false,
        lede: "One or two sentences under the H1.",
        tips: [/* exactly 3: { title, text } */],
        faqs: [/* 3 to 5: { question, answer } */],
        // Optional. Left out, they come from the trade, then the document:
        // items, payment, fields, example: { number: "Q-0101", ... }
    };
    ```

3. Import it in `combos/index.ts` and add it to `COMBOS`.
4. Run the check (below).

`lede`, `tips` and `faqs` together must reach **250 words on their own**.
The trade's items and payment terms are shared with its other documents, so they
stop counting the moment a second document for that trade exists. A vitest test
holds every combo to this.

## Add a combo for a country

As above, in `combos/{document}-{country}.ts`, with `country: "uk"` in place of
`trade`. The country's data file must exist first, because the facts come from it.
Put the heading the country uses in the combo, not the country file, because it
only suits that document: `example: { heading: "VAT invoice" }`.

## Add a trade's data

The 14 trades are named in `trades/index.ts`, and their hubs already exist. To
fill one in:

1. Create `trades/{trade}.ts` exporting a `TradeData` (`lede`, `items`, `payment`,
   `fields`, `example`, `reviewed: false`).
2. In `trades/index.ts`, import it and add `data: {name}` to that trade's entry.

`items` needs at least 6 lines in the trade's real units: per hour, per session,
per room, per day, per image, materials, travel. `line` and `billedBy` fill the
"What's on it" table. `description`, `qty` and `rate` fill the preview and files.
`rate` is a plain number as text: `"1500"`, `"0.50"`.

`fields` are what this trade needs that a blank invoice forgets: job address,
session date, parts used. `example.facts` shows them filled in on the preview.

## Add a country's data

The 6 countries are named in `countries/index.ts`, and their hubs already exist.

1. Create `countries/{country}.ts` exporting a `CountryData`. Set `paper`
   (`letter` for the US and Canada, else `a4`), `dateLocale` (`en-US` for the US,
   else `en-GB`) and `example.currency`.
2. In `countries/index.ts`, import it and add `data: {name}` to that entry.

Each fact is one of these two, and nothing else:

```ts
// Checked against the official tax site, today:
{
    label: "Standard VAT rate",
    value: "20%.",
    source: { name: "VAT rates, GOV.UK", url: "https://www.gov.uk/vat-rates" },
    checkedOn: "2026-11-02",
}
// Not a fact of law, and it says who to ask. You could not source a fact? Cut it.
{ label: "Late payment", value: "Set by your contract. Check with a legal adviser.", general: true }
```

Sources are official sites only: HMRC / GOV.UK, the IRS or a state revenue
office, the CRA, the ATO or business.gov.au, the UAE FTA or Ministry of Finance, IRAS. Open the page and read it. Don't
state a fact from memory. Facts older than 6 months are reported for rechecking.

## Which tool "Fill it online" opens

Automatic, from the document: invoice, proforma and credit note open the invoice
generator. Estimate, quote and price list open the quote maker. Receipt opens the
receipt maker. Payment reminder letter opens the payment reminder.

## Check your work

From `apps/saroh.tech`:

```bash
pnpm make:templates               # writes public/templates/ (git-ignored)
pnpm check:templates              # reports every page that isn't ready
pnpm check:templates --strict     # also fails on those, as a reviewed page does
pnpm check:templates --missing    # lists the planned combos not yet written
npx tsc --noEmit
npx vitest run lib/templates
```

Run `pnpm run check:words` and `pnpm run check:copy` from the repo root too.

A page must have: 6+ line items, 3 tips, 3 to 5 FAQs, a preview, all downloads,
250+ words no other page has (a word counts if it sits in a four-word run found
on no other page), no more than 50% the same text as a sibling, no FAQ question or
answer repeated on a sibling, round amounts, and for countries every fact sourced
and dated. Siblings are pages that share a document, a trade or a country.

## Going live

Every page stays `reviewed: false` (noindex, out of the sitemap) until a person
has read it. Only a person sets `reviewed: true`; a writer agent never does. A
reviewed page that fails the check stops the build.

The board's limit: about 20 new indexable pages a week.
