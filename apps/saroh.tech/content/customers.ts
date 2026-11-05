import type { ReportField } from "@/lib/business-report";

/**
 * /customers: for someone who bought from, or booked with, a business that
 * uses Saroh. A Free site's footer links here with "Report" (`?site=<its
 * address>` fills the form in); this site's own footer links here too.
 */
export const CUSTOMERS = {
    intro: "Saroh makes software that businesses use to run their shop, bookings and website. We don't sell anything on those websites ourselves.",
    sections: [
        {
            title: "The business is responsible for your order",
            text: "The business you bought from, or booked with, runs its own shop. It sets its own prices and policies, takes your payment itself, and is responsible for your order or booking.",
        },
        {
            title: "Contact the business first",
            text: "For a question about an order, a booking, a delivery or a refund, contact the business. Their website's Contact page, or the email or phone in its footer, reaches them directly. Saroh can't refund, change or cancel an order or a booking. The payment went to the business, not to us.",
        },
        {
            title: "Report a business",
            text: "If a business seems to be doing something illegal or fraudulent, tell us below. Reports go to the Saroh team, and we may suspend a business that breaks our terms.",
        },
    ],
    form: {
        title: "Report a business",
        submit: "Send report",
        sending: "Sending…",
        done: "Thank you. We've got your report and we'll look into it. For your order itself, the business is still the one to contact.",
        rateLimited: "Too many reports from here. Try again later.",
        failed: "We couldn't send your report just now. Try again in a minute.",
    },
} as const;

/** The form's fields, in its order. */
export const REPORT_FIELDS: readonly {
    name: ReportField;
    label: string;
    hint?: string;
    placeholder?: string;
    fault: string;
}[] = [
    {
        name: "site",
        label: "The business's website address",
        placeholder: "shop.example.com",
        fault: "Enter the business's website address, like shop.example.com.",
    },
    {
        name: "message",
        label: "What happened",
        hint: "What you bought or booked, when, and what went wrong.",
        fault: "Tell us a little more about what happened.",
    },
    {
        name: "email",
        label: "Your email",
        hint: "So we can reach you about your report. We won't add it to any list.",
        fault: "Enter your email, like name@example.com.",
    },
    {
        name: "phone",
        label: "Your phone number",
        hint: "With your country code, in case we need to call you about your report. We won't add it to any list.",
        fault: "Enter your phone number with its country code, like +44 20 7946 0958.",
    },
];
