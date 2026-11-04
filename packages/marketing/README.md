# @saroh/marketing

What each edition's public site draws with, so the sites match by construction:
`src/tokens.css` (the `--mk-*` values), `src/tailwind.ts` (the `mk-*` theme and
the `content` glob), `cn`, `ring`, `nextIndex`, the link, button, layout, section,
nav and media primitives, the page sections, the pricing tables and the shape of a
site's content (`content-types`: words stay per site). Import one piece at a time (`@saroh/marketing/button`);
there is no barrel, because each file ends up in a browser bundle.

An app using it needs `@saroh/marketing` in `transpilePackages`,
`marketingContent` in Tailwind's `content`, `marketingTheme` in its theme, and
`@saroh/marketing/tokens.css` imported.

## The boundary

The package never reads an environment variable, the launch switch, analytics,
referral, a session or `lib/links`. The site passes them in. Each site keeps its
own header and footer, and writes them from these parts:

| Part                              | Takes as props                                                                                                                         | Stays in the app                                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MenuPanel` (a desk menu's panel) | `id`, `label`, `items`, `columns`, `seeAll`, `links`, `pathname`                                                                       | the trigger button, which menu is open, closing on Escape or a click outside, `sectionOf`                                                                                                                                  |
| `PhoneSheet` (the phone menu)     | the menus, `section`, `pathname`, `onClose`, `aboutLinks`, `pricing` (show the Pricing row), `actions` (what sits at the sheet's foot) | `actions`' contents: Sign in, the start button, the visitor's name, Account, Sign out, Open dashboard; `LAUNCH_MODE`, `Visitor`, and the sign-in, account and dashboard addresses; opening the sheet and loading it lazily |
| `ColumnHeading`                   | `className`, `children`                                                                                                                |                                                                                                                                                                                                                            |

| Sections                                                                                                                                           | Take as props                                                                 | Stay in the app                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `CtaBand`, `ProductHero`, `HomeHero`, `PricingHero`                                                                                                | the words, `actions` (a node: the site's buttons), the free-plan line, `shot` | `HeroActions`, `CtaLink`, `DemoLink`, the launch switch, analytics, referral, `demoHref`                      |
| `WorksFor`, `FeatureCards`, `SolutionCards`, `FeatureSteps`, `FeaturePoints`, `FeatureWorksWith`, `FeatureUsedBy`, `SolutionChanges`, `ComingList` | the words and links as plain data; steps and segments their `shot`            | the content files, the `openNote` choice (launch switch), `featureHelpLinks`, `solutionLink`, `byComingGroup` |
| `ScreenshotFrame`, `ShotImage`                                                                                                                     | a `ShotView`: the site's key, the file with its `srcSet`, a caption           | the manifest, the image files, `shotSources` and the sized widths (`shotView`, `sizedShot`); `tour-video`     |

Each section draws no frame without a shot and no empty column or button without
an action. Labels that no site would word differently ("How it works", "Used by",
"Click to enlarge") stay in the package.

## Pricing

The package knows neither rupees nor GST. `pricingPageModel(catalog, site)` works
out the model on the server; a `PricingSite` brings `money`, `count` and `tax`
(`PricingTax`: how a sum is taxed and every word around it, or null: no toggle, no
tax words). `placeholderPricingModel(words)` takes the plan names and stand-in
words. The catalogue's sums are minor units whatever its field names say.

| Part             | Takes as props                                                                                      | Stays in the app                                              |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `PricingCards`   | `model`, `switches`, `cta(plan, look)`, `taxToggle(checked, onChange)`, `onYearlyChange`, `compare` | the read (`readLivePricing`), the tax box, `CtaLink`, `track` |
| `PricingPlans`   | `model`, `switches`, `cards`, `usageTitle`, `usageLead`, `placeholderNote`                          | a `"use client"` wrapper holding `usePricingSwitches`         |
| `PricingSection` | `id`, `className`, `title`, `children`                                                              |                                                               |

`pricing-view` and `pricing-usage` import the catalogue package, so a client
component imports `pricing-model` and the components only
(`apps/saroh.in/client-bundle.test.ts` holds it). The package holds no price or
limit; the staff draft preview's marks stay in `apps/saroh.in`.

`ring`'s and `cn`'s callers need nothing else. Pieces that read a site's links or
switches (`CtaLink`, `HeroActions`, `DemoLink`, `TourVideo`) stay in `apps/saroh.in`.
