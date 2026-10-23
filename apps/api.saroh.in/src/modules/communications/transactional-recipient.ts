// Who a transactional message goes to, on its own so the notice files can
// name it without importing the communications service (which imports the
// notice registry back).

/**
 * Who a transactional message may go to — only ever one of four
 * addresses (D17): the bill-to email the invoice kept when it was issued,
 * the email a customer verified when they made their site account, a
 * contact's own email for a notice about their own booking or order
 * (DEC-174 D1; their account's address winning, A2), or (a
 * review invitation, D11) the email the order's storefront customer gave
 * when they ordered. (The team's own alerts go from Saroh, not this path:
 * `notifications/team-alert.handler.ts`, DEC-011 amended 2026-10-07.) Never an address the caller typed, so the path cannot be
 * turned into a way to email anyone.
 *
 * ORDER_CUSTOMER mirrors INVOICE_BILL_TO: the address is the one the record
 * already holds, read here by the record's id in this business. A review
 * invitation is about an order, and an order names a storefront customer,
 * not a contact or a site account, so neither of those kinds fits it.
 */
export type TransactionalRecipient =
    | { kind: "INVOICE_BILL_TO"; invoiceId: string }
    | { kind: "SITE_ACCOUNT"; contactId: string }
    /**
     * A customer notice about their own booking, order or waitlist place
     * (DEC-174 D1, U2): the contact's own email, a live site account's
     * verified address winning (A2, `contactNoticeAddress`).
     */
    | { kind: "CONTACT"; contactId: string }
    | { kind: "ORDER_CUSTOMER"; orderId: string }
    /**
     * "Tell me when it's back" (DEC-174 U23): the address the person gave
     * on the business's site when they asked, which the watch holds; the
     * contact that already had it, if any, for consent.
     */
    | { kind: "STOCK_WATCH"; watchId: string };
