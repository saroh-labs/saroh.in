/**
 * The Terms of Service, as the owner agreed them (Claude Doc "Saroh Privacy
 * Policy and Terms": the 4 Oct text, with the 5 Oct changes for the 12-month
 * term, the introductory month and moving to a lower plan, and the 7 Oct
 * change to the term's end: a request to pay, not a one-tap renewal,
 * DEC-100; the 8 Oct paragraph on merchants' own trackers, DEC-108; and
 * the 9 Oct additions, rev 46: "Your customers and your business", suspending
 * at once for illegal use or fraud, "Fair use", and the line in "Liability"
 * on businesses' goods and disputes). Published VERBATIM at /terms: do not reword it here. A change comes from the owner's
 * text, and moves `publishOn` (`content/resources.ts`), which is the "Last
 * updated" date the page shows.
 *
 * Held back until they ship, in the same doc: the Referrals section (#809),
 * the Free plan's footer link (#812), cancelling in Settings and the 3-day
 * reminder before each monthly payment (#805). No price or rate is named
 * here; the repo is public, and prices live in the database.
 *
 * Written in the small Markdown of `lib/legal-markdown.ts`.
 */
export const TERMS = {
    title: "Terms of Service",
    href: "/terms",
    description:
        "The agreement for using Saroh, a product of Virashi Softwares LLP: plans and billing, cancelling, your data, and what you can't do.",
    body: `## The agreement

These terms are an agreement between you and Virashi Softwares LLP ("Saroh", "we") for using Saroh. By creating an account you accept them for yourself and for the business you sign up. You must be 18 or older and able to agree on the business's behalf.

## Your account and team

Keep your sign-in safe. You're responsible for what happens in your account, including what the team members you invite do, within the roles you give them. Tell us at once at contact@saroh.in if you think someone else got in.

## Plans and billing

- Each plan's price, limits and add-ons are shown on saroh.in/pricing and in the app before you choose. Prices are shown before GST; GST is added as the law requires, and you get a tax invoice for every charge.
- A paid plan runs for a term of 12 months at the price you chose, paid monthly by UPI Autopay or card, or once for the year. Your price doesn't change during your term.
- Before your term ends, we email you asking you to pay for the next term, at the price then. Paying starts your next term. If you don't pay, your plan moves to Free when the term ends.
- We send a receipt with its tax invoice after every payment.
- If you start with an introductory first month, you pay the amount shown when you sign up, and your plan's full price starts on the date shown unless you cancel before then. We email you 3 days before.
- We'll give you at least 30 days' notice by email before a price you pay goes up. A new price applies only from your next term.
- When you reach a plan's limit, Saroh warns you first, then asks you to move up a plan or add an add-on. It never deletes what you already have.

## Moving to a lower plan

If your plan moves to a lower one (you cancel, don't pay for the next term, or a payment fails), what's over the new plan's limits becomes read-only: team members beyond the limit are paused, products and posts beyond the limit are hidden from your site, and extra locations stop taking orders and bookings. We email you 7 days before it happens. Nothing is deleted, your invoices, orders and customers stay, and moving back up restores everything at once.

## Cancelling and refunds

You can cancel at any time by writing to contact@saroh.in. Payments aren't refunded, monthly or yearly: you keep your plan until the end of the period you've paid for, then it moves to Free. If you cancel during an introductory first month, nothing more is charged. Our Refund and Cancellation Policy says the same in full.

## Early access

Saroh opens in early access on 17 October 2026. It works, and it may still have rough edges. We fix what you report, and we'll tell you about changes that affect you.

## Money you take

Your customers pay you through your own payment account (Razorpay or Cashfree). The money goes straight to you; Saroh never holds it. Your payment provider's own terms apply to that account. You're responsible for the prices, taxes, refunds and GST details you set for your customers.

## Your customers and your business

Saroh is software a business uses to run its shop, bookings and website. Each business sells its own goods and services, sets its own prices and policies, and deals with its own customers. Saroh isn't a party to those sales. We don't check or guarantee any business, what it sells or what it says, and we don't verify a business's identity, licences or registrations. You're responsible for your orders, bookings, refunds and complaints, and for the laws that apply to your business. We're responsible for Saroh itself.

## Your data and content

What you put into Saroh stays yours: your products, photos, bookings, customer records and website. You let us store, process and show it only to run Saroh for you. You can download your orders yourself, and we'll send you a copy of everything else if you ask at contact@saroh.in. When you close your account we delete it as the Privacy Policy says, except invoices the law makes us keep.

For your customers' personal data, your business is responsible for having the right to collect and use it, and we process it only for you.

## What you can't do

Don't use Saroh to:

- sell anything illegal in India, or break someone else's rights;
- send spam or messages people didn't agree to receive;
- pretend to be someone else, or collect payment or sign-in details under false pretences;
- break into, overload or probe Saroh or other people's systems, including through the link preview tool;
- get around a plan's limits or someone else's access.

We may remove content or suspend an account that does these things. Where we can, we'll tell you first and give you a chance to fix it.

We may suspend or close an account at once, without notice, and stop the people behind it from using Saroh again, if we reasonably believe it's used for something illegal, for fraud or to harm customers, or if the law or a payment provider requires it. We may report it to the authorities.

## Fair use

Plans with "no limit", or with large allowances, are for the normal running of one business. Don't resell Saroh, run several businesses' worth of traffic or storage on one account, send automated bulk messages, or use Saroh as file hosting. If an account uses far more than a typical business on its plan, or puts Saroh at risk for others, we'll contact you to agree a way forward before limiting anything, unless we need to act at once to keep Saroh running.

## Your website and domain

You're responsible for what your website says. A domain you connect stays registered to you. We can take down a page that breaks the law or these terms.

You can connect analytics and advertising tools to your website from the list Saroh offers. You're responsible for having a lawful reason and a privacy notice for what they collect, and for how you use it. You must not use them to deceive or harm visitors. Saroh may switch them off on your site, and tell you why, if they put visitors or Saroh at risk.

## The source code

Saroh's code is public under the Elastic License 2.0. That licence covers the code; these terms cover the service we run at saroh.in.

## Availability and changes

We work to keep Saroh running and your data safe, but we can't promise it will never be down, especially during early access. We'll tell you ahead of planned maintenance where we can. We may change or retire features; we'll give you notice before removing one you pay for.

## Closing an account

You can close your account at any time. We may close it if you seriously or repeatedly break these terms, or don't pay. For 30 days after, you can still ask us for a copy of your data, unless the law or safety requires otherwise.

## Liability

Saroh is provided as it is. To the extent the law allows, we're not liable for lost profits or indirect losses. Our total liability for any claim is limited to what you paid us in the 3 months before it arose. Nothing here limits liability that the law doesn't allow us to limit.

We're not responsible for the goods, services, conduct or content of any business that uses Saroh, or for disputes between a business and its customers.

## Changes to these terms

We'll email you at least 30 days before a change that matters takes effect. If you keep using Saroh after that, the new terms apply.

## Law and disputes

These terms are governed by the laws of India. Courts in Gurugram, Haryana, have jurisdiction. Write to contact@saroh.in first; most things are sorted out that way.`,
} as const;
