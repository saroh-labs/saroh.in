---
type: feat
status: active
date: 2026-10-20
decision: DEC-176
issue: 1160
---

# GST rate as buttons, not a dropdown

## Problem

The GST rate is never typed today. Every rate field picks from one fixed
list (`apps/app.saroh.in/lib/invoices/gst.ts`, which the API checks again in
`apps/api.saroh.in/src/modules/invoices/gst.ts`). Most screens show that list
as a dropdown, though. That costs two taps and hides the choices, for a
question with a handful of answers that a merchant answers on every product,
service and invoice line. The invoice paper editor (#1127) already shows the
rates as chips, so the app has two ways of asking the same question.

## Decision (owner, 20 Oct 2026, DEC-176)

- One shared rate picker, shown as buttons, on every screen that asks for a
  GST rate.
- **The main buttons are 0%, 5%, 18% and 40%,** the slabs since GST 2.0
  (22 Sep 2025). 0% keeps its words: "nil-rated or exempt".
- **"Other rate"** opens the rest, in place: 3% (gold and silver), 0.25%
  (rough diamonds), 1.5% (cut and polished diamonds, which is new), and 12%
  and 28% (older rates, and 28% on tobacco and pan masala).
- **Nothing saved changes.** A product, service, line or invoice saved at 12%
  or 28% keeps its rate. Its picker opens with "Other rate" expanded and that
  rate chosen. Issued invoices are never touched.
- A field that may be left empty (a product whose business isn't known to be
  registered) also offers **Not set**. A field that must be answered doesn't,
  and says `GST_RATE_NEEDED` until a rate is chosen, as it does today.
- There is no new "usual rate" setting. A business has none today (only the
  rate on delivery), and adding one is a separate decision.

## Scope

In:
- the picker
- 1.5% added to both rate lists
- the picker on all six places that ask for a rate

Out:
- a business default rate
- HSN-based rate suggestions
- changing any saved rate

## Units

### U1. 1.5% is a rate GST has

- **API:** `apps/api.saroh.in/src/modules/invoices/gst.ts` adds `"1.5"` to
  `GST_RATES` (in order: 0, 0.25, 1.5, 3, 5, 12, 18, 28, 40).
- **App:** `apps/app.saroh.in/lib/invoices/gst.ts` adds `{ value: "1.5", label:
  "1.5%" }` to `GST_RATE_OPTIONS`. Check that the import and CSV paths taking
  a rate accept it (`gst-rates.service.ts`, the product import).
- **Tests:**
  - `isGstRate("1.5")` and `("1.50")` are true.
  - `rateToBps("1.5") === 150` and `bpsToRate(150) === "1.5"`.
  - An intra-state line at 1.5% splits into 0.75% CGST and 0.75% SGST, and the
    paise add up to the total (`gst.spec.ts`, beside the 0.25% case).
  - A product and an invoice line saved at 1.5% read back as 1.5 (db spec).
  - 1.4% is still refused.

### U2. The shared picker

- Create `apps/app.saroh.in/components/shared/gst-rate-picker.tsx`.
- **Built on:** `ChipGroup` from `components/shared/choice-group.tsx`, so it
  keeps the chips' keyboard, focus and size rules (44px on a coarse pointer).
- **Props:** `value`, `onChange`, `optional` (adds Not set), `disabled`,
  `labelledBy`, and `invalid` for the error state under it.
- **Rows:**
  - Main row: [Not set], 0%, 5%, 18%, 40%, Other rate.
  - "Other rate" shows a second row in place, with no popover: 0.25%, 1.5%,
    3%, 12%, 28%. Choosing one keeps the row open and that chip chosen.
  - A value from the second row opens with that row shown.
- **Words:** 0% reads "0%" on the chip, with "nil-rated or exempt" as its
  tip and in its accessible name.
- **Lists:** both rows come from `GST_RATE_OPTIONS`, split by a
  `MAIN_GST_RATES` list in `lib/invoices/gst.ts`, so there is one list of
  rates.
- **Tests** in `gst-rate-picker.test.tsx`:
  - each main rate chosen and changed
  - Other rate opens, chooses 12, and stays open
  - a saved "28.00" opens with Other shown and 28 chosen
  - Not set only when optional
  - the needed message only when required and empty
  - keyboard arrows move through the chips
  - nothing is lost when switching between rows

### U3. The picker everywhere a rate is asked

Replace the dropdown (`OptionSelect`) or chips with `GstRatePicker`, keeping
each screen's labels, help text, autosave and errors:

- the product editor's GST rate (`commerce/product-editor-v2/basics-section.tsx`), optional when `gstRateNeeded` is false
- the service editor (`services/service-editor/gst-fields.tsx`)
- the GST rates sheet, for its bulk rows (`gst-rates/gst-rates-sheet.tsx`). A
  row of chips per item must still fit a phone: the chips wrap, and the sheet
  is checked at 390px.
- the delivery rate in business tax settings (`organizations/business-tax-fields.tsx`)
- the new invoice's lines (`invoices/new-invoice/lines-table.tsx`)
- the paper editor's line (`invoices/paper-editor/part-popover.tsx`), whose `RATE_CHIPS` gives way to the picker

Keep every capability: each field keeps "Not set" exactly where it has it
today.

**Tests:**
- Update each screen's unit tests to choose rates by button.
- e2e: update the specs that pick a rate through the dropdown. The new
  invoice, the paper editor, the product editor and the GST rates sheet
  specs each choose 5%, then Other → 12%, on desk and phone.
- One new spec (`gst-rate-picker.spec.ts`, `@serial`, Northwind) saves a
  product at 1.5% and issues an invoice line at 1.5%, and reads the paper's
  CGST and SGST at 0.75% each.

## Order

1. Cut the batch from development after the invoices release (Release 2)
   merges, because the new-invoice form and the paper editor arrive with it.
2. Build U1 and U2 in parallel, then U3.

## Risks

- **The rates sheet on a phone:** a dozen rows of chips is taller than a
  dozen dropdowns. If it reads worse at 390px, the sheet keeps a compact chip
  row per item, with Other in its own sheet. Decide on the screen, with a
  screenshot for the owner.
- **Specs choosing by dropdown:** every spec that picks a rate through the
  dropdown changes. `git grep "Choose a rate"` and the `/GST rate/` label
  finds them.

## Also in this batch (#1161)

### U4. An invoice issued before GST registration carries no GSTIN

- **Today:** the seller block reads the business as it is now, while the footer reads the GST details frozen on the invoice at issue. An invoice issued unregistered says "not registered for GST" under today's GSTIN.
- **Fix:** the seller block reads what was frozen at issue (name, address, and the GSTIN only on a tax invoice), on the details sheet's paper, the full page, the PDF and the customer's pay page.
- **Tests:** issued unregistered, then a GSTIN added: no GSTIN on its paper, and the "not registered" line kept. A new invoice shows the GSTIN. A db spec and a paper unit test.

### U5. The paper editor's wide-screen gap

- Keep the Style panel beside the paper on a wide screen, as on the INVNewEdit board. Check at 1280, 1440 and 1920.
