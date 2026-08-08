/**
 * Built-in self-test / preview templates (S6-004).
 *
 * A tiny, FIXED registry of preview emails a signed-in user can send to their
 * OWN verified account address to see how a template renders. There is no
 * free-form HTML input and no recipient input anywhere in this feature: the
 * caller chooses one of these keys, the body is rendered from server-owned
 * markup, and {@link sendSelfTestEmail} stamps the `[Saroh test]` label on top.
 */

/** The self-test template keys a client may select. */
export const SELF_TEST_TEMPLATES = [
    "welcome",
    "enquiry-notification",
    "receipt",
] as const;

export type SelfTestTemplate = (typeof SELF_TEST_TEMPLATES)[number];

interface RenderedTemplate {
    /** Human-readable label used in the subject (after the `[Saroh test]` tag). */
    label: string;
    /** Server-owned preview markup (no user input is interpolated). */
    html: string;
}

const TEMPLATES: Record<SelfTestTemplate, RenderedTemplate> = {
    welcome: {
        label: "Welcome email preview",
        html: `<h2>Welcome to Saroh</h2>
  <p>This is a preview of the welcome email your customers would receive.</p>
  <p><a href="https://app.saroh.in" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Get started</a></p>`,
    },
    "enquiry-notification": {
        label: "New enquiry notification preview",
        html: `<h2>New enquiry from Jane Doe</h2>
  <p>Jane Doe submitted the "Contact us" form. Open the lead to follow up.</p>
  <p><a href="https://app.saroh.in" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;text-decoration:none;border-radius:6px">View lead</a></p>`,
    },
    receipt: {
        label: "Order receipt preview",
        html: `<h2>Thanks for your order</h2>
  <p>This is a preview of the receipt email a customer receives after checkout.</p>
  <p>Order #PREVIEW-1001 — Total: $42.00</p>`,
    },
};

/** Resolve a selected template key to its server-owned label + markup. */
export function renderSelfTestTemplate(
    template: SelfTestTemplate,
): RenderedTemplate {
    return TEMPLATES[template];
}
