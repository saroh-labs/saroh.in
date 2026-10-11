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

**Current** — **A short editor saves once** (E2): the Service Editor
(`components/services/service-editor/`) has one Save in its sticky header,
as its design draws. The page holds one draft; its rules, the problems
strip, what Save sends and the leave dialog's section names are pure
functions in `lib/services/service-editor.ts`, tested with vitest. It
replaced the service dialog and the two react-hook-form service forms.

**Current** — **One Save may be several calls, and says so when one
fails** (10 Oct). The Service Editor's Save sends the service, then who
takes it, then its own weekly hours (`PUT …/rules`, which replaces the
set). The hours are rows of the same draft
(`lib/services/service-hours-draft.ts`, `hours-field.tsx`): there is no
"Save availability". A new service starts from the business's opening
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

**Current** — **One sheet, one dialog, one confirm** (UX audit, 10 Oct).
Every overlay in `app.saroh.in` is one of three components, by the size of
the task. Never write a `SheetContent`, a `DialogContent` or an
`AlertDialog` and a footer by hand for something that saves:
`components/shared/overlay-frames.test.ts` reads the app and fails a copy
(what is not a form, such as a quick look or a picker, is on its short
list with its reason).

| Component       | For                                | File                                   |
| --------------- | ---------------------------------- | -------------------------------------- |
| `FormSheet`     | More than three fields             | `components/shared/form-sheet.tsx`     |
| `FormDialog`    | One to three fields, or one choice | `components/shared/form-dialog.tsx`    |
| `ConfirmDialog` | Only what cannot be undone         | `components/shared/confirm-dialog.tsx` |

The sheet and the dialog share one set of rules
(`components/shared/overlay-form.tsx`):

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
  Editor, the discount code form, Availability, the QR maker). Verb and
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

**Current** — **Nobody is sent away from an overlay.** A task finishes in
the sheet or dialog that opened. Add a lead and Add contact stay on the
list, and the toast has the way to the new record
(`showSuccess(message, description, { label, onClick })`). A link out that
has to stay (a product's full editor, a record to compare) is the quiet
action at the far side of the foot, never the main one.

**Current** — **A settings row is read first and edited in a side sheet**
(owner, 10 Oct): a location's tabs (`components/stores/`) and every tab of
Settings › Business (`components/organizations/`) draw `Row`s from
`components/sites/settings-rows.tsx` — label, a sentence of what is saved,
Edit — and each Edit opens its own `FormSheet` with one Save
(`PlaceSheetFrame` names it by a location's row): the fields scroll, Cancel
then Save sit at the foot, nothing saves until Save, a refusal keeps the
sheet open with what was typed, Cancel, Escape and the close button drop
the draft, it can't be dismissed while saving, each opening is a fresh
draft (a `key` per opening) and the keyboard returns to the row's Edit. A link opens one with `?edit=` (`lib/stores/place-rows.ts`).
Product settings' lists (`components/commerce/product-settings/`) are the
same rule for a list you manage: `NameDialog`
(`components/shared/name-dialog.tsx`, a `FormDialog` with one field) for a
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
(`components/shared/use-draft-changed.ts`: boxes, ticks, chips, what a
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
the sheet, never fields left open under the rows. Where the screen has its
own Save bar (Availability's Time off, `add-time-off-sheet.tsx`), the
sheet's button adds to the page's draft and the sheet says so. One or two
short choices inside a dense grid (a time range in a week's row,
`weekly-hours.tsx`) open in a popover over the row, so no other row moves.
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
sits in the sheet itself (`components/shared/logo-upload.tsx`, a logo field
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
  form's one submit is Save as draft. Where the primary is reversible (a
  course), it is the submit, so Enter runs it.
- **Current** — **One leave guard, one question** (UX audit, 10 Oct). Every
  create and edit flow mounts `useLeaveGuard({ dirty, lost, save? })` from
  `components/shared/use-leave-guard.tsx` and draws its `dialog`: "Leave
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
  `components/shared/use-hold.ts` is the one way: "Sending in 10 seconds",
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

    | Piece         | For                                              | File                                 |
    | ------------- | ------------------------------------------------ | ------------------------------------ |
    | `Segmented`   | A two- or three-way switch of view or mode       | `@saroh/ui/segmented`                |
    | `ChipGroup`   | A short list of short names (a kind, a courier)  | `components/shared/choice-group.tsx` |
    | `RadioCards`  | Choices that are a sentence, or carry a note     | `components/shared/choice-group.tsx` |
    | `ChoiceGroup` | The same group drawn the screen's own way        | `components/shared/choice-group.tsx` |
    | `CheckRow`    | A tick with its words (`SwitchRow` for a switch) | `components/shared/check-row.tsx`    |

    `ChoiceGroup` is for what the first three can't draw (colour swatches,
    photo thumbnails, times under day headings with `layout`, a card with
    its own contents); it carries the keyboard, the names and the off
    state, and the caller only the look. A filter that is on or off is
    `Chip as="toggle"`. Never a hand-made `role="radio"`, `role="checkbox"`
    or `role="switch"` button.

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
