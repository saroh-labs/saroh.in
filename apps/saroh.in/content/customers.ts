/**
 * /customers: for someone who bought from, or booked with, a business that
 * uses Saroh (Terms rev 46, 9 Oct: "Your customers and your business").
 * A Free site's footer links here with "Report", beside "Made with Saroh"
 * (`?site=<its address>`, which fills the form in; DEC-121); a paid site
 * carries no Saroh link, so saroh.in's own footer links here too.
 *
 * The body is in the small Markdown of `lib/legal-markdown.ts`, so it reads
 * like the legal pages beside it. Plain words: Saroh makes the software, the
 * business runs the shop and is responsible for the sale.
 */
export const CUSTOMERS = {
    title: "Bought from a business that uses Saroh?",
    /** The search title: what the page is for, the brand once, last. */
    seoTitle: "For customers: your order, or report a business · Saroh",
    href: "/customers",
    /** The link in saroh.in's footer, beside Privacy and Terms. */
    footerLabel: "Bought from a business on Saroh?",
    description:
        "For customers of a business that uses Saroh: who is responsible for your order or booking, how to reach them, and how to report a business.",
    body: `Saroh makes software that businesses use to run their shop, bookings and website. We don't sell anything on those websites ourselves.

## The business is responsible for your order

The business you bought from, or booked with, runs its own shop. It sets its own prices and policies, takes your payment into its own account, and is responsible for your order or booking.

## Contact the business first

For a question about an order, a booking, a delivery or a refund, contact the business. Their website's Contact page, or the email or phone in its footer, reaches them directly.

Saroh can't refund, change or cancel an order or a booking. The payment went to the business, not to us.

## Report a business

If a business seems to be doing something illegal or fraudulent, tell us below. Reports go to the Saroh team, and we may suspend a business that breaks our terms.`,
    form: {
        title: "Report a business",
        siteLabel: "The business's website address",
        sitePlaceholder: "shop.example.com",
        messageLabel: "What happened",
        messageHint: "What you bought or booked, when, and what went wrong.",
        emailLabel: "Your email",
        emailHint:
            "So we can reach you about your report. We won't add it to any list.",
        phoneLabel: "Your mobile number",
        phoneHint:
            "In case we need to call you about your report. We won't add it to any list.",
        submit: "Send report",
        sending: "Sending…",
        done: "Thank you. We've got your report and we'll look into it. For your order itself, the business is still the one to contact.",
        badSite: "Enter the business's website address, like shop.example.com.",
        shortMessage: "Tell us a little more about what happened.",
        badEmail: "Enter your email, like name@example.com.",
        badPhone: "Enter your mobile number, like +91 98450 12345.",
        rateLimited: "Too many reports from here. Try again later.",
        failed: "We couldn't send your report just now. Try again in a minute.",
    },
} as const;
