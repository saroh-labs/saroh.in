/**
 * The Privacy Policy, as the owner agreed it (Claude Doc "Saroh Privacy
 * Policy and Terms", settled 4 Oct 2026, rev 32; email provider rev 42, 6 Oct;
 * merchants' own trackers, owner's wording 8 Oct, rev 44; Vercel removed,
 * 9 Oct, rev 45; aligned with India's DPDP Act, 10 Oct, rev 55 (rev 68: a business's duty for a child's data, under Age; rev 69: PostHog, for errors and setup steps; rev 72: recordings of use): Data
 * Fiduciary and Data Processor named, security logs kept 1 year, 180 days
 * after closing, suspended accounts, and "If there's a breach"; the QR code
 * maker's email, 10 Oct, is NOT YET in the owner's doc: a minimal factual
 * addition for the owner to review). Published VERBATIM at
 * /privacy: do not reword it here. A change comes from the owner's text,
 * and moves `publishOn`, which is the "Last updated" date the page shows.
 *
 * The page is listed (footer, sitemap) and served only from `publishOn`
 * (plan KTD-2). The Terms (`content/terms.ts`) and the Refund and
 * Cancellation Policy (`content/refunds.ts`) sit beside it.
 *
 * Written in a small Markdown (`lib/legal-markdown.ts`): `##` headings,
 * paragraphs, `- ` lists, pipe tables and `**bold**`.
 */
export const PRIVACY = {
    title: "Privacy Policy",
    href: "/privacy",
    description:
        "How Saroh, a product of Virashi Softwares LLP, collects and uses personal data, who it is shared with, how long it is kept and what you can ask for.",
    body: `## Who we are

Saroh is a product of Virashi Softwares LLP, Unit 309, 3rd Floor, Tower-A, SAS Tower, Support Area, Medicity, Sector-38, Gurgaon, Haryana 122001, India. Write to us at contact@saroh.in. Our grievance officer is Mohit Mehta, at the same address and at contact@saroh.in.

This policy covers saroh.in, app.saroh.in, accounts.saroh.in and the emails we send. It explains what we collect, why, who we share it with and what you can ask us to do.

## Two kinds of data

- **Yours, as a Saroh user.** Your account, your business details and how you pay us. For this, we decide how it is used: under India's Digital Personal Data Protection Act, 2023 (the DPDP Act), we are the Data Fiduciary.
- **Your customers', inside Saroh.** The bookings, orders, contacts and invoices your business keeps in Saroh, and the people who use your website on saroh.app or your own domain. **Your business decides how this is used; we only process it for you, on your instructions, as your Data Processor under the DPDP Act; your business is the Data Fiduciary.** We never use it for our own marketing and never sell it. If one of your customers writes to us, we pass the request to you.

If your website uses analytics or advertising tools that you connect (such as Google Analytics, Meta Pixel or Microsoft Clarity), they run on your site on your behalf. Your business chose them and decides how what they collect is used. Saroh asks your visitors before any of them sets cookies, never loads them on checkout, payment or account pages, and stores only the tools' public IDs.

## What we collect

| What | Examples | Why |
| --- | --- | --- |
| Account | Name, email, phone, password (stored hashed), your role | To sign you in and run your account |
| Business | Business name, address, GSTIN, locations, team members | To run Saroh for your business and put the right details on invoices |
| Billing | Your plan, invoices from Saroh, payment status | To bill you. Card and UPI details are handled by Razorpay; we never see or store full card numbers |
| Waitlist and tool emails | Email, kind of business, where you heard of us, your country (worked out from your connection, never asked); for the link preview tool, the link you checked | To send what you asked for: the launch invite, the link report, or the link back to the QR code maker |
| Messages | What you write to contact@saroh.in | To help you |
| Security logs | IP address, browser, sign-in times, errors | To keep accounts safe and fix problems. Kept 1 year |
| Website visits | Pages visited on saroh.in, rough location, device, through Google Analytics cookies | To learn which pages help people. Only on saroh.in. Your customers' sites run only the tools you connect yourself |
| Product usage | Which setup steps your business has completed (a first product, a first order), and errors that happen while you use Saroh. Never your customers' details | To fix problems and make Saroh easier to use |
| Recordings of use | On saroh.in, only if you accept the cookie notice: what you click, scroll and open. In the workspace: how signed-in people use the screens. Saroh's own buttons, menus and labels show; your customers' details, your figures and anything you type are hidden, and pictures are left out | To find what is confusing or broken. You can turn workspace recording off in Settings › Your profile |

## Why we're allowed to

We use your data to give you the service you signed up for, to meet the law (tax invoices, for one), and, for anything else, with your consent. You can withdraw consent at any time, for example by unsubscribing from news; it doesn't undo what was done before.

## Who we share it with

Only the companies that help us run Saroh, each for its own job, and only what that job needs:

| Company | What for |
| --- | --- |
| Razorpay | Taking your payments to Saroh. Your own Razorpay or Cashfree account takes your customers' payments to you |
| Cashfree | Your customers' payments, when you connect it |
| Amazon Web Services (SES) | Sending the emails Saroh sends, from India |
| Google (Workspace) | Our mailboxes, when you write to us |
| Hostinger | Running our servers and database |
| Cloudflare | Serving our websites and apps, network security and speed |
| Google Analytics | Visits to saroh.in |
| PostHog | Finding and fixing errors in Saroh, seeing which setup steps businesses complete, and keeping the recordings of use. Stored in the EU |

We don't sell personal data. We share it with authorities only when the law requires it.

## Where it's stored

Our servers and database are in **India**. Some providers above may process data outside India, as Indian law allows.

## How long we keep it

| Data | Kept for |
| --- | --- |
| Your account and your business's data | While your account is open |
| After you close your account | Access ends at once. We keep the account's data for 180 days, as Indian law requires, then remove it from live systems; backups roll off within 30 days more |
| Invoices | 8 years, as Indian tax law requires |
| Waitlist entries | 12 months after the launch invite, unless you sign up; at once if you ask |
| A link-preview report | With the email it was sent to, 12 months |
| An email given to the QR code maker | 12 months after you last used it |
| Security logs | 1 year |
| A suspended account under investigation | As long as the law requires, or while it's needed to prevent, detect or investigate an offence, even if deletion was requested |
| Recordings of use | 30 days |

## Your rights

Under India's Digital Personal Data Protection Act, 2023 you can ask us to:

- show you the personal data we hold about you and who we've shared it with;
- correct it, complete it or delete it;
- stop using it for anything you consented to;
- name someone to act for you if you can't.

Write to contact@saroh.in. We reply within 30 days. If you're not satisfied, you can write to our grievance officer, and then complain to the Data Protection Board of India.

## If there's a breach

If a breach affects your personal data, we'll tell you and the Data Protection Board of India without delay, as the DPDP Act requires. If it affects your customers' data, we'll tell you without delay, so you can tell them.

## Cookies

Saroh's apps use only the cookies that keep you signed in. saroh.in also uses Google Analytics cookies to count visits and, if you accept the cookie notice, records how the site is used; recording sets no cookie. Refuse, and neither runs and the site works the same. You can change your answer at any time with "Cookie choices" at the foot of every page. We don't count or record a browser that sends Do Not Track or Global Privacy Control.

## How we protect it

Everything travels encrypted. Each business's data is kept apart from every other's: every read and write is limited to the business it belongs to. Payment keys you connect are stored encrypted, and only people who need access have it.

## Age

Saroh is for people aged 18 or older. We don't knowingly collect children's data for our own use. A business that uses Saroh is responsible for any child's data it collects from its own customers, and for a parent's verifiable consent where the DPDP Act needs it.

## Changes

We'll email you before any change that matters takes effect, and the date at the top of this page always shows the latest version.`,
} as const;
