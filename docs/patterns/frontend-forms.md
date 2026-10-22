# Forms

> **Read when:** building or changing a form in any app.
> Adapted from claude-patterns `frontend/03-forms.md`. Field and label rules
> also appear in `docs/design-system/07_STYLE_GUIDE.md` §4 and
> `13_ACCESSIBILITY_GUIDE.md` §5.

## The stack in `app.saroh.in`

**Current** — React Hook Form, `zodResolver`, and the `@saroh/ui/form`
primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage`), made
the standard in #109. Nine forms in `app.saroh.in` use it, plus the `saroh.in`
waitlist; `components/stores/product-form.tsx` is the reference for a single
form.

**Current** — **A long editor saves by section** (DEC-022):
`components/commerce/product-editor-v2/` is the reference. Each section keeps
its own react-hook-form (or a draft for lists like photos and variants) and
reports two things through `useSection` — whether it is dirty, and the first
thing it must fix. The shell turns those into the section's chip, border and
save bar, the header's hint, the jump dots, Save all and the leave dialog.
Section patches send only their own fields; the API judges the whole product
after the patch.

**Current** — **A short create saves once; a saved record is changed a
part at a time** (E2, U16 #1032). New service
(`components/services/service-editor/new-service.tsx`) asks five plain
questions with a live line saying whether customers could book it, keeps
everything else under More details (a row each, opening its own panel
whose button puts the panel's draft back into the page's: "Use this"), and
has one sticky Discard / Add service; Discard asks "Discard what you
typed?" once something is typed. A saved service (`edit-service.tsx`) is
read first: three cards, each opening a side panel (`detail-panel.tsx`, a
`FormSheet bottomOnPhone`) with its own Save, so there is never a page of
unsaved changes. What takes effect as it is pressed is not part of any
Save: "Who can book it" (DEC-170, Q5) is two ticks that save at once with
Undo (`use-taking-bookings.ts` `setBookers`), and More's Pause unticks
both. The rules, the live line, the rows and what Save sends are pure, in
`lib/services/service-editor.ts` and `lib/services/service-form.ts`. A
length people mostly pick from a few values is chips with Other
(`length-field.tsx`), over the same string the number field held.

**Current** — **One Save may be several calls, and says so when one
fails** (10 Oct). The Service Editor's Save sends the service, then who
takes it, then its own weekly hours (`PUT …/rules`, which replaces the
set). The hours are rows of the same draft
(`lib/services/service-hours-draft.ts`, `hours-field.tsx`, the 12-hour
picker of Hours and time off): there is no "Save availability". They sit
under "When it can be booked" (a More details row on a new service, the
Time and place panel on a saved one), which says whose hours a one-to-one
someone does books in, with the way to Hours and time off. A new service starts from the business's opening
hours where its own hours are what gives it times (nobody on the diary
takes it, or it is a class); a one-to-one someone takes starts with none,
because its own hours only narrow that person's. When the service is saved
and its hours are not, the page says exactly that in a notice with Try
again, keeps the hours typed, stays where it is (a new service is not sent
to its own page until all of it is saved) and Try again sends only what is
left: `changedParts` compares the draft with what the server now has. Do
the same for any Save that spans calls: the first call is the record, each
later one is idempotent, and `saved` is moved forward one call at a time.

**Current** — **A published record's editor autosaves on the shared shell**
(D6, DEC-043): `components/editor-shell/editor-shell.tsx`, for the Plan
Editor (D7) and the Pack Editor (E18), and Courses later. The record type
passes an adapter of Server Actions (`EditorAdapter` in
`lib/editor-shell/types.ts`: create, save draft, publish, discard, delete,
load), its words and rules, and draws its sections from the values the
shell hands it. The shell owns autosave (about 800 ms, flushed on blur,
before Publish and on leaving), the banner and actions per status (Draft ·
Live · Live with unpublished changes), "Not saved" with Try again, and the
409 conflict state with Reload. Its rules are pure in
`lib/editor-shell/state.ts` and `autosave.ts`; a record service reads a
refused write with `editorFailure` (`lib/editor-shell/result.ts`) so a stale
revision becomes the conflict state. Don't give a record type its own save
loop. The Pack Editor (`components/class-packs/pack-editor/`, E18) and the
Plan Editor (`components/subscriptions/plan-editor/`, D7) are the reference
consumers. The Pack Editor's rules are pure in `lib/class-packs/pack-editor.ts`:
`problemsOf` receives the last record (for a rule against what is live, such
as a sold pack's kind), `viewable` says when "View" shows, and what an
autosave sends leaves out a field the API would refuse ("4500.", 5 days) so
the rest still saves while that field's problem keeps Publish off. The Plan
Editor's rules (problems, the save blocker, "When you publish" lines) are pure
in `lib/subscriptions/plan-editor.ts`, and `plan-editor-adapter.ts` turns the
typed form into the API's values and back.

**Current** — **A form with no publish step saves as it is typed on the
shell's autosave alone** (New invoice A, DEC-173 U14 #1126). An invoice
draft has no revision and nothing to publish, so it doesn't take the whole
`EditorShell`: `components/invoices/new-invoice/use-invoice-draft.ts`
drives the shell's `Autosave` (`lib/editor-shell/autosave.ts`) from the
react-hook-form's `watch`, sends nothing while the zod schema refuses the
values (the form says what, on leaving a field, as before), makes the
draft on the first save and changes it after, and puts the draft's own
address in the bar (`/billing/invoices/<id>/edit`) with
`history.replaceState`, so a reload never starts a second draft. The pill
beside the title is the save state ("Draft · saved", "Saving…", "Not
saved" with Try again). The leave guard takes `flush` (and `save`, which
says what is wrong), so leaving asks only when the save can't go. Save
draft and Issue flush first and then go on with the draft the server has.
A live preview beside such a form is drawn from the typed values with the
API's rule mirrored in a pure module (`lib/invoices/new-invoice-lines.ts`
`previewSums`), never sent.

**Current** — **A record edited "on the paper" is the same form, pressed
where it prints** (New invoice on the paper, DEC-173 U15 #1127).
`?mode=paper` (`useTabParam`, "Form" / "On the paper" in the header) swaps
the form's columns for `components/invoices/paper-editor/`, under the same
`useForm` and the same autosave, so switching keeps everything typed and
the draft's address keeps the mode. The paper (`PaperPreview`) takes an
`editing` seam: each part is wrapped in a control laid OVER it (the words
stay the paper's for a screen reader; the press has its own name, "Change
line 2: Butter croissant") that opens the part's editor in a popover on
the desk and a sheet from the foot of a phone (`HeaderOverlay`). Each
editor writes the form's own fields (`register`, `setValue`), so the paper,
the totals and the save follow every keystroke; a line typed but not yet
priced is drawn as "Set its quantity and price" so it can be finished.
What the record can't change here says where it comes from instead (the
seller, the number). A particular the law requires (CGST Rule 46) carries
a label on the paper ("Next in series", "Set from the customer",
"Required") and has no way off in any style. What the paper changes for
the whole business (the logo, How to pay us, the default look) opens that
setting's own sheet in place, for those who may (`org:update`), and is
never a link away mid-task.

**Current** — **An editor never opens in an error state over a rule newer
than the record** (UX audit, 12 Oct). A plan or pack published before a GST
rate was asked for opens with a plain note beside the field ("This plan has
no GST rate yet. Choose one before you publish again."): no red field, no
alert, no count beside Publish. It becomes the error it always was once the
field is left or Publish is pressed, with the keyboard on the field, and
Publish stays refused throughout. A rule gives its problem a `note`
(`EditorProblem` in `lib/editor-shell/types.ts`); the shell holds back only
what a published record was opened with (`heldAtOpen`, `sayProblems` in
`state.ts`) and hands the sections `notes` and `leave`. A draft's problems
and a new record's are said as before. Give any new publish rule a `note`.

**Current** — **One sheet, one dialog, one confirm** (UX audit, 10 Oct).
Every overlay in `app.saroh.in` is one of three components, by the size of
the task. Never write a `SheetContent`, a `DialogContent` or an
`AlertDialog` and a footer by hand for something that saves:
`components/shared/forms/overlay-frames.test.ts` reads the app and fails a copy
(what is not a form, such as a quick look or a picker, is on its short
list with its reason).

| Component       | For                                | File                                           |
| --------------- | ---------------------------------- | ---------------------------------------------- |
| `FormSheet`     | More than three fields             | `components/shared/forms/form-sheet.tsx`       |
| `FormDialog`    | One to three fields, or one choice | `components/shared/forms/form-dialog.tsx`      |
| `ConfirmDialog` | Only what cannot be undone         | `components/shared/confirm/confirm-dialog.tsx` |

The sheet and the dialog share one set of rules
(`components/shared/forms/overlay-form.tsx`):

- **Width.** A sheet is the screen on a phone and 448px beside the page,
  512px with `wide`. A dialog is `size="sm" | "md" | "lg"` (420, 460,
  560px), in `@saroh/ui/dialog`. No other widths.
- **Head.** The title (`font-display`, 18px) is a row's name or verb and
  thing ("Add note"), with one sentence under it, always.
- **Foot.** Pinned, with a rule above it in a sheet: the way out (outline),
  then the overlay's own button (ink), on the right. On a phone they stack
  full width with the button on top. **This replaces "Save then Cancel on
  the left".**
- **Labels.** "Save" for an edit, on a page as in an overlay (the Service
  Editor, the discount code form, the QR maker). Verb and
  thing for a create or an action
  ("Add note", "Send invite"). Never "Save changes", "Update" or "Done",
  except `doneOnly` on a sheet that only lists things. The way out is
  "Cancel", or "Keep order" beside a button that cancels (`cancelLabel`).
- **Saving.** The label says so ("Saving…"), both buttons wait, and nothing
  closes it. A refusal keeps it open with what was typed. Success closes it.
- **The button is never off for "nothing changed" or "not filled in yet".**
  An edit that says its draft is unchanged (`dirty={false}`) just closes.
  What is wrong is said when the button is pressed, clears as each field is
  fixed, and the keyboard goes to the first field marked `aria-invalid`.
  (`saveOff` is for a button waiting on something in the overlay, such as
  an upload or a check that is running.)
- **Ways out.** A press outside closes it only while nothing has changed.
  Cancel, Escape and the close button are decisions: they drop the draft
  unasked. There is no "You have changes that are not saved" prompt.
- **Keyboard.** It starts in the first field and goes back to what opened
  it (`trigger`, else whatever had focus or was last pressed, else
  `returnFocusTo`).
- **A fresh draft per opening:** a `key`, or a draft component under the
  frame. A draft that is a component of its own draws `FormSheetBody` and
  `FormSheetFoot` (or `FormDialogFoot`) inside the frame, and says its
  save is on its way with the foot's `pending`.

`ConfirmDialog` waits for `onConfirm` (a promise): it shows the busy label
("Deleting…"), blocks dismissal, stays open with the reason on a refusal
and closes only on success. `tone="neutral"` for a step that destroys
nothing ("Turn on Track stock", "Make a new link"). The title is "Verb
thing?" with no quotes round a name, the body says what goes, what stays
and "This cannot be undone.", and the buttons are "Keep {thing}" (which
has the keyboard first) then the verb and thing.

**Current** — **Undo or confirm, never both, never neither** (UX audit,
10 Oct). What can be put back is done at once with `showUndo` and asks
nothing (a product category, a note). What cannot is the one confirm. What
has no way back in the API but need not be final is **held**: gone at once,
written when its ten seconds are up (`useHold`, an invitation cancelled, a
course session removed). See `frontend-error-feedback.md`.

**Current** — **Money recorded by hand is one sheet, written at once
with Undo** (DEC-173, U10 #1122). Record payment
(`components/invoices/payments/record-payment-sheet.tsx`) is the one way an
invoice's payment is written down, opened from the page, the details
sheet, the list and the customer's Invoices tab; it takes an invoice
already read (`PaymentTarget`, `paymentTargetOf`) or an id, and reads the
rest on opening. The amount starts at what is left; less is a part
payment and says what stays to pay; more is refused on Record with what
was typed kept and the way out beside it ("Record ₹8,400"). The button
names the amount. The write happens at once and `showUndo` removes it;
the receipt is held by the API past the Undo window (`RECEIPT_HOLD_MS`),
so the sheet never holds it. It opens through the details' seam
(`useRecordPaymentFlow` in `components/invoices/details/flows.tsx`). A
cheque's next steps are `cheque-dialogs.tsx`: in the bank is a
`FormDialog` (with no email provider its toast offers the receipt on
WhatsApp), Bounced is the one confirm, since the API can't take it back,
with "Tell Vivek on WhatsApp after"; Remove payment is the details'
`remove-payment-dialog.tsx`, whose Undo records it again. WhatsApp is opened on the
press (`whatsapp-share.ts`), so a tab is never blocked; Saroh sends
nothing itself. The words and rules are pure, in
`lib/invoices/record-payment.ts`.

**Current** — **Nobody is sent away from an overlay.** A task finishes in
the sheet or dialog that opened. Add a lead and Add contact stay on the
list, and the toast has the way to the new record
(`showSuccess(message, description, { label, onClick })`). A link out that
has to stay (a product's full editor, a record to compare) is the quiet
action at the far side of the foot, never the main one.

**Current** — **A record's details open from its row in a side sheet, and
its page draws the same view** (DEC-173, invoices U9 #1121). An invoice's
row opens `components/invoices/details/invoice-details-sheet.tsx`
(`QuickLook` widened to 512px, the whole screen on a phone, `?invoice=` in
the address so a reload keeps it); `/billing/invoices/[id]` renders the
same `InvoiceDetailsView` as a page, from the same server read
(`lib/invoices/details.ts`), so a deep link and the sheet can't differ.
Which buttons a state has is `actionsFor` (one main, what sits beside it,
Share, More); what each does is one hook (`use-details-actions.tsx`), and
every action opens its own frame over the details and comes back to them:
after a write the sheet reads the record again in place and the list
behind it refreshes. Flows other units own are opened through one seam
each (`details/flows.tsx`: `useRecordPaymentFlow`, `useShareFlow`,
`useCancelFlow`, each `open(…)` plus `overlays`), so a new sheet replaces
the hook's body and nothing in the view changes. Previous and Next walk
the list as filtered without closing. The money card says one thing and
holds at most one note.

**Current** — **A settings row is read first and edited in a side sheet**
(owner, 10 Oct): a location's tabs (`components/stores/`) and every tab of
Settings › Business (`components/organizations/`) draw `Row`s from
`components/shared/page/settings-rows.tsx` — label, a sentence of what is saved,
Edit — and each Edit opens its own `FormSheet` with one Save
(`PlaceSheetFrame` names it by a location's row): the fields scroll, Cancel
then Save sit at the foot, nothing saves until Save, a refusal keeps the
sheet open with what was typed, Cancel, Escape and the close button drop
the draft, it can't be dismissed while saving, each opening is a fresh
draft (a `key` per opening) and the keyboard returns to the row's Edit. A link opens one with `?edit=` (`lib/stores/place-rows.ts`).
Product settings' lists (`components/commerce/product-settings/`) are the
same rule for a list you manage: `NameDialog`
(`components/shared/forms/name-dialog.tsx`, a `FormDialog` with one field) for a
one-field add or rename, a `FormSheet` with a `trigger` for anything with
more (an option's name and values, a field, a merge), so the keyboard
returns to the button that opened it. A delete that can be undone asks
nothing and offers Undo.
No row turns into a form, and the task finishes inside what opened.

**Current** — **A stray press outside never drops typed work** (UX audit,
10 Oct). In every sheet and dialog a press outside closes it only while
nothing has changed. Once the draft differs from what it opened with, a
press outside does nothing, and Cancel, Escape and the close button are the
ways out. The frame reads that from its own fields
(`components/shared/forms/use-draft-changed.ts`: boxes, ticks, chips, what a
picker shows, a picture, a rich text box), so an overlay passes nothing.
One whose work the fields can't show passes `dirty`, or calls
`useFormSheetDraft` / `useFormSheetDirty` from a draft under the frame.

A record's page is the same rule: Order Detail
(`components/commerce/order-detail/`) shows status, items, payments and
the timeline, and each change (hand to courier, tracking, edit, refund,
how it's fulfilled, cancel) opens its own sheet, one at a time.
`OrderSheet` in `order-sheet.tsx` is that frame, a thin name for
`FormSheet` drawn by its parts: the fields scroll (`OrderSheetBody`) and
what the change does to the money stays at the foot with the button that
makes it (`OrderSheetFoot`), `wide` where a list of lines needs it. Its
way out reads "Cancel" unless the sheet's own button cancels something
(`cancelLabel="Keep order"`). A sheet opened from more
than one button has no single trigger, so `useOrderPanel` remembers the
button pressed and gives the keyboard back to it. A change that is held
ten seconds (a refund, a cancel) closes its sheet into the hold card on
the page, where its Undo is.

The same goes for adding to a list: the list, then one button that opens
the sheet, never fields left open under the rows. One or two short
choices inside a dense grid open in a popover over the row, so no other
row moves.

**Current** — **Hours and time off save as they change** (U17, DEC-170):
no Save bar and no draft on the page. A day row opens its sheet
(`components/bookings/availability/hours-panel.tsx`: a bottom sheet on a
phone, a right-hand panel on a desk), each control in it saves the
person's week at once with a toast and Undo (`use-hours.ts`), and "Done"
closes it; a save that is refused puts the control back and says nothing
has changed. Adding something with several fields (time off, several days
at once) is still a `FormSheet` whose button saves, with Undo after.
Two addresses that show the same records are one screen with a segmented
switch on both (`bookings-view-switch.tsx`, `leads-view-switch.tsx`), not a
loose button to the other. And a small job is finished where it started:
a button that only needs a name or a choice opens its dialog there
(the calendar's "Add someone") instead of sending the merchant to another
page.

Website › Settings follows it (`components/sites/settings/`): it draws the
same `FormSheet` (`settings-sheet.tsx` there keeps only the note
and problem type and `useSheetControl`), and its links are
`settingsEditHref` in `lib/sites/settings-edit.ts`. Whatever the row needs
is done inside its sheet or dialog (the share image and the site icon are
uploaded there, Add domain shows its DNS records there); an Edit never
sends the merchant to another page to finish. Where the value belongs to
another screen, that screen's own sheet opens here: Contact and social
(DEC-128) opens the business's phone, email and social links sheets
(`BusinessFieldSheet`, `SocialLinksSheet`) in place, so there is one
implementation of each, and its Address sheet edits each visited
location's address inside the open sheet with the location's own fields
(`LocationAddressFields`) and save. A sheet that only lists things with
their own Edits ends in one Done (`doneOnly`), never a Save with nothing
to save. A sheet built to be opened elsewhere takes only
what it needs (the saved value, `returnTo`, `onSaved`), not the page's
state.

the row's Edit. A link opens one with `?edit=` (`lib/stores/place-rows.ts`,
`lib/organizations/business-rows.ts`; build a Business link with
`businessEditHref`). With the draft in a sheet, the page needs no
leave-with-unsaved-changes guard. **What a row needs is done in its sheet**
(owner, 10 Oct): an Edit never sends someone to another page, so an upload
sits in the sheet itself (`components/shared/fields/logo-upload.tsx`, a logo field
with no page state; a location's own logo uses it too, with the business
logo standing in until it has one, DEC-123) and a field another row owns
joins the sheet that needs it (turning GST on asks for the registered
address there). The same goes for a prompt on another screen: the QR
maker's "Add your logo" opens the business logo's sheet in place
(`components/qr/qr-add-logo.tsx`), never a link to Settings. Where a preview
sits beside the rows it shows what is saved; the sheet draws the same
preview under its fields, from the draft.

## Rules

- **Current** — **Schema first.** A `z.object` at the top defines validation and
  the type (`z.infer`), with `defaultValues` set (`product-form.tsx`).
- **Current** — **Submit through a Server Action and read its result.**

    ```ts
    const res = await createProduct(storeId, input);
    if (!res.ok) {
        if (
            res.field === "name" ||
            res.field === "slug" ||
            res.field === "price"
        ) {
            form.setError(res.field, { message: res.error });
        } else {
            showError(res.error);
        }
        return;
    }
    showSuccess("Product created");
    router.push(`/stores/${storeId}/products/${res.data.id}`);
    ```

    A server error that names a field goes on that field; anything else is a
    toast of the API's guarded message. Never hold a server error in `useState`.

- **Adopted** (2026-10-05) — **The schema checks what the API's DTO
  checks.** A class-validator refusal reaches the app as a bare
  "Validation failed" with no field, so it can only be a toast. An empty or
  malformed value is caught by zod and shown under its field first, e.g.
  `lib/discounts/value.ts` in the discount form.
- **Current** — **Enter runs the form's first submit button, so that button
  is the reversible one** (UX audit, 10 Oct). A step that can't be taken
  back (issuing an invoice numbers it and locks its lines) is a
  `type="button"` with its own press, never the form's submit: the invoice
  form's one submit is Save draft. Where the primary is reversible (a
  course), it is the submit, so Enter runs it.
- **Current** — **One leave guard, one question** (UX audit, 10 Oct). Every
  create and edit flow mounts `useLeaveGuard({ dirty, lost, save? })` from
  `components/shared/forms/use-leave-guard.tsx` and draws its `dialog`: "Leave
  without saving?", one sentence saying what would be lost (`lostNew`,
  `lostChanges`, or the flow's own), then Stay (the default) or Leave, and
  Save and leave only where a draft can be kept. It catches every link, the
  command menu and Search settings (`lib/nav/leave-request.ts`), and tab
  close; the browser's back button is not caught. `dirty` is true only when
  something changed (`formState.isDirty`, or a compare with what was
  loaded). An editor that saves by itself passes `flush`: a way out saves
  first, and asks only when that save can't go. A link that stays on the
  same screen passes through `keeps` (the stock count's filters). Never
  write a leave dialog or a `beforeunload` of a flow's own:
  `leave-guard-flows.test.ts` lists the flows and fails one that does.
- **Current** — **A confirm that cancels something offers "Keep …" as its
  way out** (UX audit, 10 Oct): "Keep order", "Keep booking", "Keep
  enrolment", "Keep subscription", "Keep autopay", "Keep invoice", never
  "Cancel" beside "Cancel order", and the same words wherever the same
  action is asked from (`cancel-way-out.test.ts`). A reversible Cancel (a
  stock count in progress) asks nothing and offers Undo (`useCountMode`).
- **Current** — **Money stays a string** from input to API
  (`price: values.price.trim()`). The API computes in cents.
- **Current** — **The submit button is busy while the action runs:**
  `<Button type="submit" busy={isSubmitting} busyLabel="Saving…">`, never
  `disabled` with a swapped label (`frontend-design-system.md`). The
  overlay frames' foot and `ConfirmDialog` do it for their own button.
- **Current** — **One `Field`** (`@saroh/ui/field`):
  `<Field label hint? error? optional?>` with the control as its child. The
  label sits above at the one label size (`Label`'s default, 12.5px), the
  hint under, and an error takes the hint's place as an alert (`FieldError`,
  the same line `FormMessage` draws). The child gets its `id`,
  `aria-describedby` and `aria-invalid`. A control inside a wrapper is wired
  by hand: pass `htmlFor`, and the line under it is `${id}-note`. Several
  controls under one label are a group. It needs no form library.
- **Current** — **Only what is optional is marked,** as "(optional)" in the
  label (`optional` on `Field`). Never the word "Required", an "Optional"
  chip, an "Optional." hint or an "Optional" placeholder.
- **Current** — **A page checks a field on leaving it and on submit, and
  puts the keyboard on the first one in error.** A sheet checks when its
  Save is pressed. With react-hook-form it is two words
  (`lib/hooks/page-form.ts`):
  `useForm({ resolver, ...PAGE_FORM, defaultValues })` and
  `form.handleSubmit(onSubmit, toFirstError)`. `PAGE_FORM` is `onTouched`
  (the first blur, then every change) and turns the library's own focus
  off, since it only knows fields it holds a ref for; `toFirstError` goes
  to the first `aria-invalid` field in the form, a select or a chip set
  included. On it: New customer, the business setup form, the invoice
  form, New location, the discount code form, New site and the course
  form. A form in steps checks one step at a time: its Continue calls
  `form.trigger` with that step's fields and then `toFirstErrorIn(form)`
  (setup, `saroh-product.md` → How the stepper is built). A draft that is not react-hook-form keeps a set of fields that
  have been left and shows a field's problem from then on (the Service
  Editor: `serviceFieldProblems`, `problemFor`), and calls
  `focusFirstError(form)` when Save is pressed. The product editor's Basics
  says what is wrong once a field is left (`seen`). Gap: its Details,
  Description and Made-by sections still check as you type.
- **Current** — **A main button is never off without saying why.** A short
  form keeps it on and explains on submit (Create location, Create site,
  Add service). Where it must wait for something, the reason is beside it
  and named by `aria-describedby` (a new course's Save and open).
- **Current** — **One money field:** `MoneyInput` (`@saroh/ui/money-input`),
  `{ currency, value, onValueChange, allowDecimals? }`. The sign is a fixed
  prefix inside the box (never "Price (₹)" in the label or a "₹" that
  vanishes with the first digit), the keyboard is the decimal pad, and the
  currency is the business's: a form never asks which. Order Detail's
  sheets are handed the order's currency (`OrderSheets currency`), and a
  label never says "in rupees". Where the currency can be unknown for a
  moment (a new order before its location is read) the box is a plain
  decimal `Input` until it is. Gap: a lead's Worth has no sign, because a
  lead has no currency (the Leads list draws none either).
- **Current** — **One phone field** (#1036): `PhoneInput`
  (`@saroh/ui/phone-input`) in the workspace, accounts, admin and saroh.in,
  and `SitePhoneInput` (`packages/site-blocks/src/phone-input.tsx`) on a
  merchant's site, drawn with the `--site-*` tokens only. Both are a
  country-code picker (the business's country, else India) and the number
  as typed; a whole number pasted ("+44 …", "0091 …", "098765 43210")
  picks its country. The value is E.164 ("+919876543210") or "". In
  `app.saroh.in` use `BusinessPhoneInput`
  (`components/shared/fields/business-phone-input.tsx`), which starts on the
  active business's country. What a number means is one pure module,
  `packages/block-contract/src/phone.ts` (`normalisePhoneNumber`,
  `phoneNumberProblem`, `phoneLabel`), which the API's
  `normalisePublicPhone` re-exports; `PHONE_CASES` there pins the API and
  both fields to the same answers. A saved number is shown with
  `phoneLabel`, grouped ("+91 98765 43210"). An edit checks a phone only
  once it is changed (`phoneSchemaKeeping`), so one saved before numbers
  were checked never stops the rest saving. Never a bare `type="tel"`.
- **Current** — **Saving from the keyboard**
  (`lib/hooks/keyboard-save.ts`): Cmd/Ctrl+Enter sends the form the
  keyboard is in (`submitOnModEnter` on a `<form>`; the overlay frames
  carry it), and Cmd/Ctrl+S saves in an editor (`useSaveShortcut`:
  product, service, plan, pack, post). Both go through the form's own
  submit, so neither reaches a step that can't be taken back.
- **Current** — **Defaults instead of questions.** One person on the diary
  takes a new service without being asked for. A product asks for a GST rate
  and an HSN code only when the business is GST-registered. A course and a
  discount code are priced in the business's currency.
- **Adopted** — **Every field has a visible label; a placeholder is never the
  label** (13 §5). Not measured.
- **Current** — **Anything that tells a customer waits ten seconds with
  Undo** (UX audit, 10 Oct): a reminder or an invoice sent, a message, a
  team or location invite, review invitations, a booking or an order
  cancelled from a list, a subscription cancelled. `useHold().send` in
  `components/shared/undo/use-hold.ts` is the one way: "Sending in 10 seconds",
  then "Sent to {name}.". The overlay closes keeping what was typed, and a
  refusal or an Undo opens it again with that. Money out stays as built.
- **Current** — **shadcn controls, never native pickers.** A list is a
  `Select` — `@saroh/ui/option-select` wraps it for flat option
  lists and maps a `""` "None" value, which Radix reserves. A time of day is
  `@saroh/ui/time-select` (fixed steps, value stays "HH:MM"); a date is
  `@saroh/ui/date-picker` (Popover + Calendar). No `<select>`,
  `type="date"`, `type="time"` or `type="datetime-local"` remains inside
  an overlay in `app.saroh.in` (the Orders filter bar's two date boxes and
  two selects on pages are the gap); with react-hook-form, drive them through `Controller` or
  `FormField`, not `register`.
- **Current** — **Form primitives, not raw inputs.** ESLint fails a raw
  `<input>`, `<textarea>`, `<select>`, `<button>` or `<label>` in
  `app.saroh.in` (`frontend-design-system.md`). No native `<select>`,
  text `<textarea>` or raw `<label>` is left but one (the autopay timing
  card, a radio card with a timeline in it). A label is `Field`, or
  `Label` with `htmlFor` where it sits beside its control in one row.
- **Current** — **A choice is one of five pieces, by what is chosen**
  (10 Oct). All but the tick are a radio group to a screen reader and a
  keyboard: one tab stop, and the arrows move the choice.

    | Piece         | For                                              | File                                        |
    | ------------- | ------------------------------------------------ | ------------------------------------------- |
    | `Segmented`   | A two- or three-way switch of view or mode       | `@saroh/ui/segmented`                       |
    | `ChipGroup`   | A short list of short names (a kind, a courier)  | `components/shared/fields/choice-group.tsx` |
    | `RadioCards`  | Choices that are a sentence, or carry a note     | `components/shared/fields/choice-group.tsx` |
    | `ChoiceGroup` | The same group drawn the screen's own way        | `components/shared/fields/choice-group.tsx` |
    | `CheckRow`    | A tick with its words (`SwitchRow` for a switch) | `components/shared/fields/check-row.tsx`    |

    `ChoiceGroup` is for what the first three can't draw (colour swatches,
    photo thumbnails, times under day headings with `layout`, a card with
    its own contents); it carries the keyboard, the names and the off
    state, and the caller only the look. A filter that is on or off is
    `Chip as="toggle"`. Never a hand-made `role="radio"`, `role="checkbox"`
    or `role="switch"` button.

- **Current** — **A GST rate is always chosen with `GstRatePicker`**
  (`components/shared/fields/gst-rate-picker.tsx`, DEC-176, 20 Oct), never a
  dropdown, a typed box or chips of a screen's own. Its main row is GST's
  slabs since GST 2.0, 0%, 5%, 18% and 40% (`MAIN_GST_RATES`); "Other
  rate" is a disclosure beside them (`aria-expanded`, not a radio) that
  opens 0.25%, 1.5%, 3%, 12% and 28% in place. The chosen rate's own chip
  is the one lit, in whichever row it sits, and a saved rate from the
  second row opens with that row shown. `optional` adds "Not set" for a
  field that may be left empty, and only there. Inside a `Field`, use its
  function child with `pickerWiring(control)` so the label, the hint and
  the one error line are the Field's. Unit tests press rates with
  `gst-rate-picker.testing.ts`, browser specs with `e2e/fixtures/gst-rate.ts`.
  `lib/consistency/shared-pieces.test.ts` fails a file outside
  `lib/invoices/gst.ts` that reads `GST_RATE_OPTIONS` or `GST_RATE_CHOICES`.
- **Current** — **A chip set in error takes the keyboard.**
  `focusFirstError` puts it on a radio group's one tab stop (the chosen
  chip, else the first), so a missing rate is reached like a missing box.
- **Current** — **The label is above a choice strip, and the strip is as
  wide as its words.** `Segmented` is a block of its own (`flex w-fit`),
  so after a label it drops to the next line and in a grid or a stacked
  form it does not stretch; `block` is the one way to fill the row. It is
  never wider than its parent, and its options wrap on a phone.
  `ChipGroup` wraps the same way.
- **Current** — **Controls meet the touch target on a phone,** and fields
  are 16px there (`frontend-design-system.md`).

## Elsewhere — all **Current**

- `accounts.saroh.in` forms are hand-rolled client components against
  `authClient`, and that app does not depend on React Hook Form. Keep a new
  accounts form consistent with its neighbours unless you are migrating them
  all.
- `packages/site-blocks` enquiry and booking forms run on merchant sites and
  manage their own state; the package does not depend on `@saroh/ui`.
- Eight `app.saroh.in` components with a `<form>` still hold fields in `useState`
  — inline managers such as `categories-manager` and `pages-panel`. Migrate
  one when you are already changing it (`members-manager` went when a
  location's people became a tab: its invite is `invite-person-sheet.tsx`,
  on the stack above).
