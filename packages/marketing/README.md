# @saroh/marketing

What each edition's public site draws with, so the sites match by construction:
`src/tokens.css` (the `--mk-*` values), `src/tailwind.ts` (the `mk-*` theme and
the `content` glob), `cn`, `ring`, `nextIndex`, and the link, button, layout,
section and nav primitives. Import one piece at a time (`@saroh/marketing/button`);
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

`ring`'s and `cn`'s callers need nothing else. Pieces that read a site's words or
links (`CtaLink`, `HeroActions`, `CtaBand`, `ProductHero`, `Breadcrumbs`) are
still in `apps/saroh.in`.
