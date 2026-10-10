# Ad conversions on saroh.in

> **Read when:** turning Saroh's own ad tracking on or off, changing the
> cookie notice, or touching anything that loads a third party's tag.
> The decision: DEC-127. The rules a change must keep:
> `docs/patterns/devops-observability.md` → Ad tags.

Saroh advertises its own business with Google Ads and with Meta (Instagram
and Facebook). To see which ads work, saroh.in can tell each platform about
two things a visitor does. Everything here is off until its id is set, and
none of it runs anywhere but saroh.in.

## What is sent, and when

| What happened                                                 | Google Ads                              | Meta                   |
| ------------------------------------------------------------- | --------------------------------------- | ---------------------- |
| A visitor joined the waitlist (a new entry, not a repeat)     | a conversion, with the waitlist's label | `Lead`                 |
| A new account finished sign-up (its email was just confirmed) | a conversion, with the sign-up's label  | `CompleteRegistration` |

Once a visitor has accepted advertising cookies, the two tags also see each
saroh.in page they open (the Pixel's `PageView`, Google's tag loading), which
is how either platform ties a later conversion to an ad click.

**Never sent:** an email, a phone number, a name, a business name, a city,
or anything a visitor typed. Google's enhanced conversions and Meta's
advanced matching both work by sending a hashed email or phone number, so
both stay off: the code passes neither, and the two account settings below
must stay off too. A sign-up's conversion carries one number, the time it
was sent, so a reload doesn't count it twice.

## What a tag sees of the page's address

Both tags report the address of the page they are on, and an address can
carry something about somebody else: `?ref=` is another entrant's referral
id. So before a tag loads, the address is cut back to one allow-list
(`apps/saroh.in/lib/page-address.ts`), for Google Analytics, Google Ads and
Meta alike.

| Stays                                                          | Cut                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `plan`, `src`, `template` (the page's own choices)             | `ref`, `invite`, `email`, `token`, `next`                                      |
| `utm_…`, `gclid`, `gbraid`, `wbraid`, `fbclid` (campaign data) | anything else, a parameter nobody has listed included (`site`, `url`, `at`, …) |
|                                                                | a listed parameter whose value holds an `@`                                    |

- **It is the address itself that is cut**, in the browser's address bar
  (`history.replaceState`), before either tag's script is added to the page.
  The Pixel takes no address from the site: it reads the page's. Cutting the
  page's own address is the one way that holds for both tags and for
  everything they send, so that is what is done, not a cleaned copy handed
  to each tag.
- **Every later address is cut as it is set** (a link followed inside the
  site, a tool writing its state into the address), before a tag listening
  for page changes can read it.
- **Each event saroh.in sends to Google also names the cut address**
  (`page_location`). It is not put on the tag's `config`: there it could
  hold for Google Analytics' own page views on later pages and report the
  first page for all of them.
- **The page reads first.** What is cut is kept for the tab, by page, and a
  page reads its query through `readAddress()`, never `location.search`. So
  the waitlist still records who referred someone, and "Report this
  business" still fills the site in.
- Only where a tag may load: with nothing accepted, in the team's browser
  or off production, the address is left as it is.

One thing a visitor can notice: once they have accepted cookies, the
address bar no longer shows what was cut. The link preview tool's
`?url=…` goes from the address bar that way (its "Copy link" still gives
the full link, and a shared link still opens the report); reloading the
page then opens the tool empty. Add a parameter to the allow-list only if
it is never about a person or a business.

## Who is never tagged

- **Anyone who hasn't accepted.** No tag is loaded and no request goes to
  Google Ads or Meta until the visitor accepts advertising cookies in the
  cookie notice. Advertising is its own answer: "Visit counts only" keeps
  Google Analytics and loads no ad tag, and someone who accepted visit
  counts before saroh.in advertised is asked once about advertising. Someone
  who refused is not asked again. "Cookie choices" in the footer takes both
  answers back: both tags are told consent is withdrawn, Google Analytics is
  switched off for the page, and the cookies they set on saroh.in are
  deleted (`_ga…`, `_gcl_…`, `_gac_…`, `_fbp`, `_fbc`). What Google and Meta
  hold on their own domains is theirs; the site can't delete it.
- **The team** (`saroh_team=1`, the same rule as Google Analytics).
- **A browser that says don't track**: Do Not Track or Global Privacy
  Control is read as a refusal, of Google Analytics too, and no notice shows.
- **Anything but production.** The ids are read only where
  `VERCEL_ENV=production`, so previews, local runs and tests are never
  conversions, even with the ids in a local `.env`.

Google's tag runs in Consent Mode v2: `ad_storage`, `ad_user_data`,
`ad_personalization` and `analytics_storage` start denied, and each is
granted only for what was accepted.

## How a sign-up is counted

Sign-up happens on accounts.saroh.in, which loads no ad tag and can't read
what a visitor answered on saroh.in. So when the hand-off is on, a newly
verified account's browser passes through `https://www.saroh.in/welcome` on
its way to onboarding. That page reads the visitor's answer from saroh.in's
own storage; if they accepted advertising cookies it counts the sign-up, and
either way it sends them straight on (at once when there is nothing to
count, within about two seconds when there is). It forwards only to accounts
and the workspace, and counts only a visit accounts sent in the last ten
minutes, so a bookmark or the back button counts nothing.

A visitor who signs up without ever answering saroh.in's cookie notice (or
in a different browser) is not counted. That is the price of asking first.
An account made with a social sign-in button (Google, GitHub) skips the
email step and is not counted either.

## Turning ads tracking on

Each id is public (it is visible in any tagged page), so it goes in the
repo, not in a secret store. All four go in `apps/saroh.in/wrangler.jsonc`
under `env.production.vars`, where commented lines are waiting.

**1. Google Ads: the two conversions**

1. In Google Ads, open **Goals › Summary** and choose **+ Create conversion
   action**. Pick **Conversions on a website**, enter `saroh.in` and scan.
2. Create one conversion for the waitlist (category "Submit lead form") and
   one for sign-up (category "Sign-up"). For each choose **Manually using
   code**, and count **One** conversion per click.
3. After saving, choose **See event snippet**. It holds a line like
   `'send_to': 'AW-123456789/AbC-D_efG-h12_34-567'`.
    - The part before the slash, `AW-123456789`, is
      `NEXT_PUBLIC_GOOGLE_ADS_ID`. It is the same for both conversions.
    - The part after the slash is that conversion's label:
      `NEXT_PUBLIC_GOOGLE_ADS_WAITLIST_LABEL` for the waitlist one,
      `NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL` for the sign-up one.
4. Don't paste the snippet anywhere: the site already has the code, and
   needs only the id and the two labels.
5. Leave **Enhanced conversions** off (Goals › Settings).

**2. Meta: the Pixel**

1. In Meta **Events Manager**, connect a new **Web** data source (a "dataset",
   which is what Meta now calls a Pixel) and name it Saroh.
2. Its number, shown under the dataset's name and in its **Settings** as
   **Dataset ID** (or Pixel ID), is `NEXT_PUBLIC_META_PIXEL_ID`: digits only.
3. Choose to install the code manually and stop there: the site already has
   it. Nothing needs pasting.
4. In the dataset's **Settings**, leave **Automatic advanced matching** off.
5. In Ads Manager, optimise or report on **Lead** (waitlist) and **Complete
   registration** (sign-up).

Meta moves these menus often; the number is what matters.

**3. The Privacy Policy**

Add Google Ads and Meta to `apps/saroh.in/content/privacy.ts` (the owner's
text) before the ids go live: the notice links to it.

**4. Switch it on**

1. Uncomment the four lines in `apps/saroh.in/wrangler.jsonc`
   (`env.production.vars`) and fill them in. Either platform can go alone:
   leave the other's lines commented.
2. Release saroh.in. The cookie notice now offers "Accept all", "Visit
   counts only" and "Refuse".
3. Only then, for the sign-up conversion, uncomment
   `NEXT_PUBLIC_SIGNUP_WELCOME_URL` in
   `apps/accounts.saroh.in/wrangler.jsonc` (`env.production.vars`) and
   release accounts. Before saroh.in has `/welcome`, that line would send
   new accounts to a page that isn't there.

**5. Check it**

In a browser that is not the team's and sends no Do Not Track: open
saroh.in, choose "Accept all", and join the waitlist with a test address.
Google Ads shows the conversion under Goals › Summary within a few hours
(the Google Tag Assistant shows it at once); Events Manager's **Test events**
shows `PageView` and `Lead` live. Then delete the test waitlist entry.

## Turning it off

Comment the id out and release saroh.in: that platform's tag stops loading
for everyone. Comment `NEXT_PUBLIC_SIGNUP_WELCOME_URL` out to stop sign-ups
passing through `/welcome`.

## Where the code is

| Piece                                                   | File                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| The ids, production only                                | `apps/saroh.in/lib/ga.ts`, `lib/site-tag-config.ts`, `env.ts`        |
| The visitor's two answers, the privacy signals, cookies | `apps/saroh.in/lib/consent.ts`                                       |
| Loading and stopping the tags; sending a conversion     | `apps/saroh.in/lib/tags.ts`                                          |
| What a tag may see of the address                       | `apps/saroh.in/lib/page-address.ts`                                  |
| The cookie notice                                       | `apps/saroh.in/app/site-tags.tsx`                                    |
| The waitlist conversion                                 | `apps/saroh.in/components/v2/waitlist/waitlist-form.tsx`             |
| The sign-up hand-off                                    | `apps/saroh.in/lib/welcome.ts`, `lib/welcome-forward.ts`, `/welcome` |
| accounts' side of it                                    | `apps/accounts.saroh.in/lib/signup-welcome.ts`, `lib/app-urls.ts`    |
| The check that keeps ad tags off every other app        | `scripts/check-merchant-site-tracking.mjs`                           |

No security header changes: the apps' Content-Security-Policy sets
`frame-ancestors` only, so it lists no script or connection hosts to add to.
