/**
 * saroh.in's free tools the email gate can name, slug → name, as each
 * tool's page names it (`packages/search-pages/content/tools/<slug>.mdx`).
 *
 * The gate's email names the tool and links to it, so the name comes from
 * here and never from the request: a slug not in this list is refused
 * (`dto.ts`). A test in `@saroh/search-pages` (`tool-names.test.ts`) reads
 * this file as text and holds every tool page's slug and name to it, so
 * keep one `"slug": "Name",` per line.
 */
export const TOOL_NAMES: Readonly<Record<string, string>> = {
    "qr-code-maker": "QR code maker",
    "link-preview": "Link preview tool",
    "no-show-cost-calculator": "No-show cost calculator",
    "gst-calculator": "GST calculator",
    "gst-invoice-generator": "GST invoice generator",
    "bill-of-supply-generator": "Bill of supply generator",
    "receipt-maker": "Receipt maker",
    "quotation-maker": "Quotation maker",
    "profit-margin-calculator": "Profit margin calculator",
    "break-even-calculator": "Break-even calculator",
    "staff-commission-calculator": "Staff commission calculator",
    "gym-membership-plan-calculator": "Gym membership plan calculator",
    "gstin-checker": "GSTIN format checker",
    "hsn-sac-code-finder": "HSN/SAC code finder",
    "upi-qr-code-generator": "UPI QR code generator",
    "review-qr-code-generator": "Google review QR code generator",
    "menu-qr-code-generator": "Menu QR code generator",
    "wifi-qr-code-generator": "Wi-Fi QR code generator",
    "business-card-qr-generator": "Business card QR (vCard) generator",
    "link-in-bio-page-maker": "Link-in-bio page maker",
    "whatsapp-link-generator": "WhatsApp link generator",
    "whatsapp-message-templates": "WhatsApp message templates",
    "refund-policy-generator": "Refund policy generator",
    "cancellation-policy-generator": "Cancellation policy generator",
    "salon-rate-card-maker": "Salon rate card maker",
    "gift-voucher-maker": "Gift voucher maker",
    "loyalty-card-maker": "Loyalty stamp card maker",
};

/** The slugs the gate takes. */
export const TOOL_SLUGS = Object.keys(TOOL_NAMES);
