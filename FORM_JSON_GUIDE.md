# Edoc — Form JSON Guide

This is the **complete, authoritative spec** for the form JSON files used by Edoc,
the offline clinical assessment platform. An AI assistant should be able to read
**only this file** plus a clinician's draft and produce a JSON file that the
runtime loads cleanly.

Edoc now runs as a **pure front-end app**. There is no admin, no database, no
import endpoint. Form files live as plain JSON under `public/forms/` and are
listed by name in `public/forms/index.json`. The runtime fetches those files
directly when the user picks a form.

---

## 1. End-to-end picture

A form is a clinical assessment template (e.g. *Initial holistic assessment*,
*Fall risk screen*, *Stroke clerking*) belonging to one of three specialties
(Medical, NS, Ortho). It contains an ordered list of **sections**, each with an
ordered list of **questions**.

When the clinician uses the form:

- Sections are shown as **tabs** at the top — one section on screen at a time
  (no long scroll). The user moves between sections with the tabs or with
  Prev / Next.
- The user fills in answers, optionally adds an "Other" comment per question.
- Suspended questions, removable AMT/CDT/MoCA blocks, and section-skip
  checkboxes (§ 7.2) all let the user adapt the same template to one patient.
- They click **Save & Generate Report** → a compact text report is rendered
  in three copy-friendly panels (Common Assessment / Problem Identification /
  Recommendation) and saved to History (browser localStorage).

The report format is described in § 9 — your JSON design should anticipate how
each question's answer will appear there.

---

## 2. Where forms live

Each form is one JSON file inside `public/forms/`. A flat manifest lists which
files to load.

```
public/forms/
├── index.json                       ← array of filenames
├── ns-initial-assessment.json
├── fall-assessment-template.json
└── ...
```

`public/forms/index.json`:

```json
[
  "ns-initial-assessment.json",
  "fall-assessment-template.json"
]
```

To add a form: drop the file into `public/forms/` and add its filename to
`index.json`.

---

## 3. Top-level shape

A form file is a single JSON object — **no `{ "form": { ... } }` wrapper**.

```json
{
  "specialty": "NS",
  "title": "NS Initial Assessment",
  "description": "Neurosurgery initial assessment.",
  "schema": {
    "sections": [ /* see § 4 */ ]
  }
}
```

| Field             | Required | Description                                                        |
|-------------------|----------|--------------------------------------------------------------------|
| `specialty`       | yes      | Exactly `"Medical"`, `"NS"`, or `"Ortho"` (case-sensitive).        |
| `title`           | yes      | Form name shown in the form list and dropdowns.                    |
| `description`     | no       | Short subtitle in the form list.                                   |
| `schema.sections` | yes      | Non-empty array of section objects.                                |

The form's `id` at runtime is its filename (e.g. `"ns-initial-assessment.json"`).
That id is what saved history entries reference.

---

## 4. Sections

A section is a logical grouping of questions, displayed as one tab.

```json
{
  "title": "Premorbid ADL",
  "description": "Optional one-line guidance shown under the section header.",
  "reportTitle": "B. Premorbid ADL",
  "hideQuestionsIf": {
    "questionId": "social_limited",
    "equals": "Limited information from patient, pending further assess"
  },
  "questions": [ /* see § 5 */ ]
}
```

| Field             | Required | Description                                                        |
|-------------------|----------|--------------------------------------------------------------------|
| `title`           | yes      | Tab text shown to the user.                                        |
| `description`     | no       | Short paragraph rendered under the tab title in the fill view.     |
| `reportTitle`     | no       | Title used in the generated report. Defaults to `title`. Convention: prefix with `A.`, `B.`, … so the report reads as a numbered clerking note. |
| `hideQuestionsIf` | no       | When the condition matches, **all questions in this section except the trigger** are hidden in the fill view and skipped in the report. Same shape as `showIf` (§ 8). Used for "Limited information from patient" tickboxes that collapse a whole section. |
| `questions`       | yes      | Array of question objects.                                         |

### 4.1 Recommended section flow

For most clinical templates use this sequence; insert disease-specific tools as
extra sections at the appropriate point:

1. Vital Signs
2. Premorbid ADL
3. Social History and Home Environment
4. Mental & Cognitive Function
5. Physical Assessment
6. Functional Assessment (Modified Barthel Index, etc.)
7. Fall / Risk Assessment (if relevant)
8. Home Discharge Readiness Assessment (HDRS) (if relevant)
9. OT Comment
10. Problem Identification
11. Recommendation

Aim for **3–8 questions per section** so each tab fits roughly one screen.

---

## 5. Questions — common fields (apply to every type)

| Field               | Required | Description                                                                       |
|---------------------|----------|-----------------------------------------------------------------------------------|
| `id`                | yes      | Unique within the form. `snake_case`.                                             |
| `label`             | yes      | Question text shown to the user and used in the default report line.              |
| `type`              | yes      | One of the types in § 6.                                                          |
| `required`          | no       | Boolean. Visual `*` marker only; not enforced at submit.                          |
| `hint`              | no       | Small grey text rendered under the label.                                         |
| `width`             | no       | Layout width in the section grid: `"half"` (one column) or `"full"` (span both). Default `half`. |
| `hideLabel`         | no       | Render the question without its label (compact tickbox rows, vital signs block).  |
| `removable`         | no       | Adds a small **Clear** button on the question header. Clicking deletes the answer and re-renders the widget; the question itself stays visible. Used on AMT/CDT/MoCA. |
| `mergeUp`           | no       | Boolean. The widget is rendered **inside the previous question's box** instead of its own (visual grouping). The merged child still has its own answer and label. |
| `allowComment`      | no       | Adds a collapsible **Other** textarea under the question. See § 7.                |
| `commentLabel`      | no       | Override the default `"Other"` label.                                             |
| `commentPlaceholder`| no       | Placeholder text inside the comment textarea.                                     |
| `allowOther`        | no       | For `multiple_choice` / `checkbox` / `rating`: appends an inline `Other: ___` row. See § 7. |
| `otherPlaceholder`  | no       | Placeholder text for the inline `Other:` input.                                   |
| `allowSuspend`      | no       | Adds a small "Suspend assessment — reason: \_\_" row. When ticked, the question's normal answer is omitted from the report and one combined sentence ("Suspended further assessment due to <reason>.") is appended at the section's end. |
| `showIf`            | no       | Conditional visibility — see § 8.                                                 |
| `headerInputs`      | no       | Array of small inline inputs rendered next to the question label. Each `{ id, label, placeholder?, inputType?, reportTemplate? }`. Stored at top-level `answers[id]`. Used for things like the **Education** field beside MoCA. |
| `prefillFromQuestions` | no    | Array of `{ questionId, label }` rendered as a read-only "Auto:" preview line in the fill view. Lets the user see what other questions are showing while filling this one. |
| `forceInReport`     | no       | Emit a report line even when the user's own input is empty — useful when a custom report or `prefillFromQuestions` adds context. Also implied automatically when `prefillFromQuestions` is set. |
| `hideInReport`      | no       | Always skip this question in the report. Use when a sibling question's `customReport` already covers it. |
| `hideInReportIf`    | no       | Conditional report skip. Same shape as `showIf`. |
| `reportTemplate`    | no       | Custom report line. Placeholders: `{answer}`, `{partId}` (for composite parts), `{q:otherQuestionId}` (cross-question reference, see § 9). |
| `customReport`      | no       | Named composer that replaces the default report line for this question. See § 9.4. |

### 5.1 Section layout

The fill view places each section's questions into a 2-column grid on wide
screens (collapses to 1 column on mobile). Use `width: "half"` for short fields
(short text, multiple_choice with few options, ratings, yes_no) and
`width: "full"` for things that need horizontal room (long_text, checkbox lists,
sub_score tables, composite vitals/power blocks). Mixing the two reduces
vertical scrolling significantly.

Use `mergeUp: true` on a follow-up question (e.g. *Indoor aid* under *Indoor
mobility*, *Bath by* under *Bathing setup*) to fold it into the previous box —
the child's label is rendered above the child's chips with the same weight as
the parent label, separated by a thin divider.

---

## 6. Question types

Eleven types are supported. Anything else fails validation.

### 6.1 `short_text` — single line
```json
{ "id": "outdoor_note", "label": "Outdoor mobility note", "type": "short_text" }
```

### 6.2 `long_text` — multi-line textarea
```json
{ "id": "hpi", "label": "History of presenting illness", "type": "long_text" }
```

### 6.3 `number`
```json
{ "id": "etoh_units", "label": "Alcohol (units/week)", "type": "number" }
```

### 6.4 `date` — ISO `YYYY-MM-DD`
```json
{ "id": "admit_date", "label": "Admission date", "type": "date" }
```

### 6.5 `yes_no` — two-button toggle
```json
{ "id": "diabetes", "label": "Known diabetes?", "type": "yes_no" }
```

### 6.6 `multiple_choice` — single-select (requires `options[]`)

Each option is **either a plain string or an option object** with inline
sub-options (§ 6.6.1). Mixing both shapes in the same `options` array is fine.

```json
{
  "id": "home_access", "label": "Home access", "type": "multiple_choice",
  "options": ["Direct lift-landing", "Non-direct lift-landing", "No lift-landing"],
  "allowComment": true,
  "commentLabel": "Floor / stairs detail"
}
```

#### 6.6.1 Inline sub-options

When a particular choice should reveal a follow-up question **inline directly
under the radio that triggered it**, use an option object:

```json
{
  "id": "premorbid_walk",
  "label": "Premorbid walking status",
  "type": "multiple_choice",
  "options": [
    "Walk unaided",
    {
      "value": "With aid",
      "subOptions": ["Stick", "Quad stick", "Frame", "Rollator", "Trolley"],
      "subAllowOther": true
    },
    "Chair bound",
    "Bed bound"
  ]
}
```

| Option-object field | Description                                                                       |
|---------------------|-----------------------------------------------------------------------------------|
| `value`             | Displayed text and stored value.                                                  |
| `subOptions`        | Array of strings (or sub-option objects — see § 6.7.2), rendered as **checkboxes** inset under this radio. |
| `subAllowOther`     | Adds an `Other: ___` text input alongside the sub-checkboxes.                     |

Stored answer:
- Plain option selected → string.
- Option-object selected → `{ value, sub: [...], other: "" }`.

> **Use sub-options instead of `showIf` whenever the follow-up belongs to one
> specific answer of the parent question.** Reserve `showIf` for follow-ups
> that span a different question.

### 6.7 `checkbox` — multi-select (requires `options[]`)

Stored as an array of selected entries (strings or objects).

```json
{
  "id": "lives_with",
  "label": "Lives with",
  "type": "checkbox",
  "options": ["Live alone", "Spouse", "Child(ren)", "Domestic helper", "OAHR", "Hostel"],
  "allowOther": true
}
```

#### 6.7.1 Per-option `detail` input

```json
{ "value": "Day Care centre", "detail": true, "detailPlaceholder": "name / frequency" }
```

Renders an inline text input next to the checkbox. Stored as
`{ value, detail }`. Default report shape is `Day Care centre: 2x/week`.

For non-default formatting:

| Field           | Description                                                  |
|-----------------|--------------------------------------------------------------|
| `detailJoiner`  | String inserted between value and detail. Default `": "`.    |
| `detailSuffix`  | String appended after the detail. Used to build phrases that read naturally, e.g. `"Refer to OT department for"` + joiner `" "` + detail + suffix `" training"` → `Refer to OT department for ADL training`. |

#### 6.7.2 Per-option `subOptions` (nested checkbox group)

```json
{
  "id": "problems",
  "label": "Problems",
  "type": "checkbox",
  "customReport": "problems_factors",
  "options": [
    "Nil",
    {
      "value": "Patient Factor",
      "subOptions": ["NAD", "Not applicable", "Impaired ADL function", "Impaired cognition"],
      "subAllowOther": true
    }
  ]
}
```

Sub-options can also be objects with their own `detail`, e.g. for the
**Home Help Service** group where each sub-item has its own frequency input:

```json
{
  "value": "Home Help Service",
  "subOptions": [
    { "value": "Meal on wheels", "detail": true, "detailPlaceholder": "frequency" },
    { "value": "Personal care",  "detail": true, "detailPlaceholder": "frequency" },
    { "value": "Household",      "detail": true, "detailPlaceholder": "frequency" },
    { "value": "Escort",         "detail": true, "detailPlaceholder": "frequency" }
  ],
  "subAllowOther": true
}
```

Stored as `{ value, sub: [ "...", { value, detail } ... ], other? }`.

#### 6.7.3 `combineAdjacent` — render two adjacent picks as "X to Y"

For ordinal scales (Good / Fair / Poor; Independent / Supervision / … / Dependent)
where clinicians often straddle two adjacent levels.

```json
{
  "id": "balance_sit",
  "label": "Balance — Sitting",
  "type": "checkbox",
  "options": ["Good", "Fair", "Poor"],
  "combineAdjacent": true,
  "maxSelect": 2,
  "consecutiveOnly": true
}
```

| Field              | Effect                                                                       |
|--------------------|------------------------------------------------------------------------------|
| `combineAdjacent`  | Two adjacent picks render in the report as **worse to better** (e.g. picking "Mild Assistance" + "Moderate Assistance" → `Moderate to Mild Assistance`). One pick renders as that single value; three or more falls back to comma-joined. |
| `maxSelect`        | Cap the number of picks (typically `2` when `combineAdjacent` is set). The UI blocks an additional check and alerts. |
| `consecutiveOnly`  | When `maxSelect: 2`, the two picks must be adjacent in the option list. The UI blocks non-adjacent pairs. |

### 6.8 `rating` — integer scale (requires `min` and `max`, `min < max`)

Renders as a row of buttons from `min` to `max`. Report shows `n/max`.

```json
{
  "id": "cdt", "label": "Clock Drawing Test", "type": "rating",
  "min": 0, "max": 10,
  "allowOther": true,
  "otherPlaceholder": "describe instead of rating"
}
```

`allowOther` puts an inline `Other: ___` input alongside the chips. Typing
into it overrides the numeric pick; clicking a number clears the Other text.

### 6.9 `sub_score` — composite score with auto-summed total

Use this for any standardised tool composed of multiple sub-items: **MBI, MoCA,
AMT, MMSE, Morse Fall Scale, Berg Balance, etc.**

| Field                      | Description                                                                  |
|----------------------------|------------------------------------------------------------------------------|
| `mode`                     | `"options"` for fixed allowed values per item; `"max"` for free integer 0..max input. |
| `items`                    | Array of sub-items (see below).                                              |
| `totalMax`                 | Override total ceiling. Defaults to the sum of per-item maxes.               |
| `showBreakdown`            | Default `true`. Set `false` to suppress per-item lines in the report.        |
| `breakdownPosition`        | `"after"` (default) or `"before"` — render breakdown lines before the total in the report. mBI uses `"before"`. |
| `breakdownItemsPerLine`    | Force exactly N items per breakdown line (overrides char-width wrap). mBI uses `5`. |
| `breakdownSep`             | Separator between items on a row. Default `"  "`. mBI uses `"      "` (6 spaces). |
| `includeNAInBreakdown`     | When `true`, items with NA values appear in the breakdown as `<label>: Not assessed`. Otherwise NA items are omitted. |
| `naLabel`                  | Override the `"Not assessed"` text.                                          |
| `combineItems`             | Array of `{ ids: [...], label }`. Collapses a set of items into one breakdown row showing whichever is rated (or NA if both/all are NA). mBI uses this for Mobility / Wheelchair. |
| `pendingPolicy`            | `{ ignoreItems: [...], pendingText: "..." }`. When any non-ignored item is unrated/NA, total renders as `≥X/Y, pending further assessment later` instead of `X/Y`. |
| `totalExtras`              | Array of `{ id, label, suffix?, inputType?, placeholder? }`. Extra inputs rendered on the **total row** of the table, bound to top-level `answers[id]`. Used for the MoCA cut-off input that lives inline next to "Total: 24/30". |
| `headerInputs`             | See § 5 — useful here for things like the MoCA Education field shown next to the question title. |

**Item shape — `mode: "options"`** (e.g. mBI items where only `0/2/5/8/10` are
allowed):

```json
{
  "id": "bowels", "label": "Bowels", "options": [0, 2, 5, 8, 10],
  "allowNA": true, "defaultNA": true,
  "qualifier": { "id": "bowels_stoma", "label": "Stoma" }
}
```

**Item shape — `mode: "max"`**:

```json
{ "id": "naming", "label": "Naming", "max": 3 }
```

| Item field        | Description                                                                       |
|-------------------|-----------------------------------------------------------------------------------|
| `id`              | Required. Stored as `answers[<question.id>][<item.id>]`.                          |
| `label`           | Required. Used on the row and in the report breakdown.                            |
| `options`         | `mode: "options"` only — array of allowed integer values.                         |
| `max`             | `mode: "max"` only — integer ceiling for free input.                              |
| `allowNA`         | Adds a **Not assessed** chip to the row. Sets the value to the string `"NA"`.     |
| `defaultNA`       | When `allowNA` is set, the item starts as `"NA"` instead of unrated.              |
| `exclusiveWith`   | Item id of a partner. Rating this item auto-sets the partner to `"NA"`. Used for *Mobility* ↔ *Wheelchair* in mBI. |
| `qualifier`       | `{ id, label }` — adds an inline tickbox (e.g. **Stoma**, **Foley**, **R/T**). Stored at top-level `answers[qualifier.id]` as a boolean. **Ticking the qualifier auto-sets the item's score to 0**, since clinically the qualifier implies dependence. The breakdown line gets `(<label>)` appended. |

#### Example A — Modified Barthel Index

```json
{
  "id": "mbi", "label": "Modified Barthel Index", "type": "sub_score",
  "mode": "options", "totalMax": 100, "width": "full",
  "pendingPolicy": {
    "ignoreItems": ["wheelchair"],
    "pendingText": ", pending further assessment later"
  },
  "includeNAInBreakdown": true,
  "breakdownPosition": "before",
  "breakdownItemsPerLine": 5,
  "breakdownSep": "      ",
  "combineItems": [
    { "ids": ["mobility", "wheelchair"], "label": "Mobility/Wheelchair" }
  ],
  "items": [
    { "id": "bowels",     "label": "Bowels",     "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true, "qualifier": { "id": "bowels_stoma",  "label": "Stoma" } },
    { "id": "bladder",    "label": "Bladder",    "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true, "qualifier": { "id": "bladder_foley", "label": "Foley" } },
    { "id": "grooming",   "label": "Grooming",   "options": [0,1,3,4,5],    "allowNA": true, "defaultNA": true },
    { "id": "toileting",  "label": "Toileting",  "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true },
    { "id": "feeding",    "label": "Feeding",    "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true, "qualifier": { "id": "feeding_rt", "label": "R/T" } },
    { "id": "dressing",   "label": "Dressing",   "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true },
    { "id": "bathing",    "label": "Bathing",    "options": [0,1,3,4,5],    "allowNA": true, "defaultNA": true },
    { "id": "transfer",   "label": "Transfer",   "options": [0,3,8,12,15],  "allowNA": true, "defaultNA": true },
    { "id": "mobility",   "label": "Mobility",   "options": [0,3,8,12,15],  "allowNA": true, "defaultNA": true, "exclusiveWith": "wheelchair" },
    { "id": "wheelchair", "label": "Wheelchair", "options": [0,1,3,4,5],    "allowNA": true, "defaultNA": true, "exclusiveWith": "mobility" },
    { "id": "stairs",     "label": "Stairs",     "options": [0,2,5,8,10],   "allowNA": true, "defaultNA": true }
  ],
  "reportTemplate": "Modified Barthel Index (mBI): {answer}"
}
```

#### Example B — MoCA with Education + Cut-off + Interpretation

```json
{
  "id": "moca", "label": "HK-Montreal Cognitive Assessment (MoCA)",
  "type": "sub_score", "mode": "max", "totalMax": 30,
  "removable": true, "width": "full",
  "headerInputs": [
    { "id": "moca_education", "label": "Education", "placeholder": "e.g. F.6" }
  ],
  "totalExtras": [
    { "id": "moca_cutoff", "label": "Cut-off", "suffix": "/30", "inputType": "number", "placeholder": "26" }
  ],
  "items": [
    { "id": "visuospatial", "label": "Visuospatial / Executive", "max": 5 },
    { "id": "naming",       "label": "Naming",                   "max": 3 },
    { "id": "attention",    "label": "Attention",                "max": 6 },
    { "id": "language",     "label": "Language",                 "max": 3 },
    { "id": "abstraction",  "label": "Abstraction",              "max": 2 },
    { "id": "recall",       "label": "Delayed Recall",           "max": 5 },
    { "id": "orientation",  "label": "Orientation",              "max": 6 }
  ],
  "customReport": "moca_full",
  "showIf": { "questionId": "cog_status", "equals": "Performed" }
}
```

### 6.10 `composite` — multi-input single field

Renders a row of small labelled inputs (or a 2×2 grid) stored as one object and
joined into one report line. Vital signs, GCS, limb power.

| Field         | Description                                                                |
|---------------|----------------------------------------------------------------------------|
| `parts`       | Array of `{ id, label?, placeholder?, prefix?, suffix?, wide?, extraWide?, inputType? }`. |
| `layout`      | `"inline"` (default) or `"grid-2x2"` (needs exactly 4 parts).             |
| `rowHeaders`  | grid layout: `["Upper", "Lower"]`.                                        |
| `colHeaders`  | grid layout: `["Right", "Left"]`.                                         |
| `joinWith`    | Separator used when joining filled parts in the default report. Default `"; "`. |

Per-part width:
- `wide: true` → ~110 px input (e.g. for "Room Air / L O2" notes).
- `extraWide: true` → input stretches to fill remaining row width, min 280 px (e.g. **Care plan** in HDRS).

`reportTemplate` placeholders work two ways:
- `{answer}` is replaced with all filled parts joined by `joinWith`.
- `{partId}` pulls a specific part value, e.g.
  `"Power:\n{rul} | {lul}\n{rll} | {lll}"`.

Empty parts are dropped from `{answer}` and from `{partId}` (the surrounding
text is preserved).

#### Inline — Vital signs

```json
{
  "id": "vitals", "label": "Vital signs", "hideLabel": true,
  "type": "composite", "width": "full",
  "parts": [
    { "id": "bp_sys", "label": "BP", "placeholder": "120", "suffix": "/" },
    { "id": "bp_dia", "label": "",   "placeholder": "80",  "suffix": " mmHg" },
    { "id": "p",      "label": "Pulse", "placeholder": "78", "suffix": "/min" },
    { "id": "spo2",   "label": "SpO2", "placeholder": "98", "suffix": "%" },
    { "id": "o2",     "label": "",     "placeholder": "Room Air / L O2", "wide": true }
  ],
  "joinWith": "  ",
  "reportTemplate": "Vital signs: BP {bp_sys}/{bp_dia} mmHg  P {p}/min  SpO2 {spo2}% ({o2})"
}
```

#### 2×2 grid — Power

```json
{
  "id": "power", "label": "Power", "type": "composite",
  "layout": "grid-2x2", "width": "half",
  "rowHeaders": ["Upper", "Lower"], "colHeaders": ["Right", "Left"],
  "parts": [
    { "id": "rul" }, { "id": "lul" },
    { "id": "rll" }, { "id": "lll" }
  ],
  "reportTemplate": "Power:\n{rul} | {lul}\n{rll} | {lll}"
}
```

### 6.11 `fthue_grade` — visualised FTHUE 1–7 selector

Renders a small reference table (Level | Task) followed by two button rows
(Right / Left) with chips 1–7. Stored as `{ r, l }`.

```json
{
  "id": "fthue", "label": "Hand function — FTHUE", "type": "fthue_grade",
  "width": "full",
  "hint": "Functional Test for the Hemiplegic Upper Extremity (1–7 each side).",
  "reportTemplate": "Hand function (FTHUE): Right: {r}/7  Left: {l}/7"
}
```

The default reference levels match the standard FTHUE manual (None; A/B; C/D;
E/F; G/H; I/J; K/L1/L2). Pass `levels: [{ n, task }, ...]` to customise.

### 6.12 `hdrs_table` — Home Discharge Readiness Scale

Specialised three-factor / two-element-per-factor table with auto-computed
factor scores (floor-mean of two elements) and a final **Level of Readiness**
(1–6 with the standard "any factor = 1 ⇒ downgrade by 1 level" exception).
Standard usage:

```json
{
  "id": "hdrs", "type": "hdrs_table",
  "label": "Home Discharge Readiness Scale (HDRS)",
  "hideLabel": true, "width": "full"
}
```

The default factor / element layout matches the Feb 2024 manual; pass
`factors: [...]` to override.

---

## 7. "Other" inputs vs comments — when to use which

Both attach free-text to a question, but they're for different jobs.

- **`allowOther: true`** — adds an inline `Other: ___` row to a `multiple_choice`,
  `checkbox`, or `rating` question. Use when the user might pick a value not in
  the predefined list (occupation, mobility aid not listed, etc.). The "Other"
  value becomes part of the answer.
- **`allowComment: true`** — adds a collapsible **Other** textarea (the summary
  text is configurable via `commentLabel`) under any question. Use for
  *additional* context that doesn't replace the primary answer (pain location
  next to a pain score, environmental notes next to mobility).

Both can be set on the same question.

### 7.1 Suspended assessments

Set `"allowSuspend": true` on questions a clinician sometimes can't perform
(Balance, Transfers, Ambulation, …). The fill view adds a small
"Suspend assessment — reason: \_\_" row. When ticked:

- The question's normal report line is **omitted**.
- One sentence is appended at the section's end:
  `Suspended further assessment due to <reason>.`
  Multiple suspended questions in the same section dedupe their reasons and
  join with `" / "`.

### 7.2 Section-skip tickbox (`hideQuestionsIf`)

For "Limited information from patient, pending further assess" toggles that
collapse a whole section, give the section a `hideQuestionsIf` (§ 4) and put
a single-option `checkbox` question at its top:

```json
{
  "id": "social_limited",
  "label": "Limited information",
  "hideLabel": true,
  "type": "checkbox",
  "width": "full",
  "options": ["Limited information from patient, pending further assess"],
  "reportTemplate": "Limited information from patient, pending further assessment."
}
```

When ticked: every other question in that section is hidden in the fill view
and skipped in the report; only the trigger's report line is emitted. To
collapse two adjacent sections from one tickbox, give each section its own
`hideQuestionsIf` referencing the same question id.

---

## 8. Conditional visibility — `showIf` / `hideInReportIf`

Show a question only when **another question's** answer matches a condition. Use
this when a follow-up depends on a *different* question; for follow-ups under a
single specific option, prefer inline sub-options (§ 6.6.1).

```json
"showIf": {
  "questionId": "<id of the source question>",
  "equals": "<value the source must equal>"
}
```

| Variant     | Behaviour                                                                              |
|-------------|----------------------------------------------------------------------------------------|
| `equals`    | Source answer === value. For `checkbox` sources, treats array `.includes(value)` as match. For option-object answers (`{ value, sub }`), matches `value`. |
| `anyOf`     | Source answer matches *any* value in the array.                                        |
| `notEquals` | Source answer is *not* the given value.                                                |
| `itemId`    | Drill into a `sub_score` item value, e.g. `{ questionId: "mbi", itemId: "bladder", equals: 0 }`. |

When the condition is false, the dependent widget's outer wrapper is hidden in
the UI and the question is skipped in report generation. The stored answer is
**not** deleted (so toggling visibility doesn't lose data on aggregate widgets
like `sub_score`).

`hideInReportIf` has the same shape as `showIf` but only affects the report —
the widget stays visible in the fill view. Useful for things like
`cog_status` whose UI value should always be picked, but whose default report
line is suppressed when the value is "Performed" (the AMT/MoCA blocks below
carry the actual content).

---

## 9. The generated report — design your form for this

The report is the primary artefact users care about. Design `label`s,
`reportTemplate`s, and section ordering with the output in mind.

### 9.1 Format

```
<reportTitle of section 1>
<line>
<line>

<reportTitle of section 2>
<line>
<line>
```

The report does **not** include the form title or a Ward/Bed/Date banner —
that metadata is shown above the copy panel in the report view, not in the
copyable text. The user typically pastes the body directly into a clerking
note.

The report is split across three copy panels:

- **Common Assessment** — every section whose `reportTitle` is not Problem
  Identification or Recommendation.
- **Problem Identification** — section whose `reportTitle` matches `/problem\s*identification/i`.
- **Recommendation** — section whose `reportTitle` matches `/recommendation/i`.

### 9.2 Empty-skipping rules

The report only includes content the user actually filled in:

- A blank question is omitted entirely.
- A blank question with a comment typed → single comment-only line:
  `<Question label> — <commentLabel>: <comment text>`.
- A section with zero filled questions and zero suspended reasons → dropped
  entirely (no empty section header).
- `showIf`-hidden, `hideInReport`, and `hideInReportIf` questions are skipped.

### 9.3 Per-type formatting

| Type              | Report rendering                                                                  |
|-------------------|-----------------------------------------------------------------------------------|
| `short_text`, `long_text`, `number`, `date` | Raw value as typed.                                |
| `yes_no`          | `Yes` or `No`.                                                                    |
| `multiple_choice` | The chosen option's value. Sub-options append in parens: `With aid (Stick)`.      |
| `checkbox`        | Selected entries joined with `, `. With `combineAdjacent` and exactly two adjacent picks → `<worse> to <better>`. |
| `rating`          | `n/max` (e.g. `7/10`).                                                            |
| `sub_score`       | `X/Y` total (or `≥X/Y, pending …` per `pendingPolicy`); breakdown rendered before/after the total per `breakdownPosition`. |
| `composite`       | Filled parts joined by `joinWith`, or substituted into `reportTemplate`.          |
| `fthue_grade`     | Substituted into `reportTemplate` via `{r}` / `{l}`.                              |
| `hdrs_table`      | One factor-rating line per factor, plus the level-of-readiness line.              |

### 9.4 `customReport` — named composer

When a question's report needs custom logic (combine multiple questions on one
line, conditional formatting, multi-line output, etc.), set
`"customReport": "<name>"` and let the runtime supply the line. The composer
returns a string (which may contain `\n` for multi-line) or `null` to skip.

Built-in composers shipped with the runtime:

| Name                | Use case                                                                                |
|---------------------|-----------------------------------------------------------------------------------------|
| `premorbid_adl`     | Compact two-line summary of BADL/IADL/walk/aid/occupation. Attach to one question (typically `premorbid_badl`) and `hideInReport: true` on the others. |
| `social_lives_home` | One-line "Lives with X. Home access: Y." — bare for "Live alone" / "OAHR", "Live in Hostel" for "Hostel". Combines `lives_with` + `home_access` + their comments. |
| `bathing_combo`     | One-line "Bathing setup: X. Bath by: Y." (from `bathing_setup` + `bath_method`).        |
| `mental_followcmd`  | One-line "Mental state: X. Follow command: Y." (from `mental_state` + `follow_cmd`).    |
| `cog_status_header` | Emits `Cognitive assessment:` (just the header) when status is `Performed`; otherwise `Cognitive assessment: <reason>.` |
| `moca_full`         | Multi-line MoCA block: total + cut-off + Education on first line; sub-score breakdown; Interpretation; Cognitive impression. |
| `cognitive`         | OT Comment cognitive line: `Cognitive: AMT n/10 (Cut-off 6/10); CDT n/10 (Cut-off 4); MoCA n/30 (Cut-off n/30, <interpretation>).` Skips empty assessments. When `cog_status` ≠ `Performed`, emits just `Cognitive assessment: <reason>.` |
| `balance_combo`     | `Balance: Sitting: <a>; Standing: <b>` from `balance_sit` + `balance_stand`.            |
| `transfer_combo`    | `Transfer: Lie to sit: <a>; Sit to stand: <b>` from `transfer_lie_sit` + `transfer_sit_stand`. |
| `ambulation_combo`  | `Ambulation: <level> (Aid: <aid>)` from `ambulation` + `ambulation_aid`. Aid suffix only when set. |
| `problems_factors`  | One factor per line; sub-options stay in parens. Used on the `problems` checkbox.       |
| `carer_interview`   | Two-line block: `Carer interview :  Contact person/Phone no.: ...` then ` Care plan: ...`. |

To extend, add a new entry to `customReportFns` in `public/app.js`. Each
function receives `(question, answer, allQuestions, answers)` and should return
a string, multi-line string, or `null`.

### 9.5 Cross-question references — `{q:id}` in `reportTemplate`

Inside any `reportTemplate`, `{q:<otherQuestionId>}` is replaced with the
formatted answer of that question (using its own report formatting rules).
Empty references render as `—`.

```json
{
  "id": "ot_adl", "label": "ADL", "type": "short_text", "width": "full",
  "prefillFromQuestions": [
    { "questionId": "mbi", "label": "BI" },
    { "questionId": "mbi_overall", "label": "Level" }
  ],
  "reportTemplate": "ADL: mBI {q:mbi}; Level: {q:mbi_overall}. {answer}"
}
```

`prefillFromQuestions` here adds a read-only "Auto: BI 75/100  •  Level: Independent"
preview line in the fill view so the clinician sees the upstream values while
typing the supplementary note.

### 9.6 Custom `reportTitle` letters

The runtime does not number sections automatically. By convention, prefix each
section's `reportTitle` with `A.`, `B.`, … so the report reads as a numbered
clerking note. Re-letter when sections are added or split.

---

## 10. Validation rules

The runtime is permissive — invalid forms simply fail to render, with the error
in the browser console. Make sure the JSON satisfies all of these:

- `specialty` is exactly `"Medical" | "NS" | "Ortho"`.
- `title` is a non-empty string.
- `schema.sections` is a non-empty array.
- Each section has a `title` (string) and `questions` array.
- Each question has `id`, `label`, and a valid `type`.
- `multiple_choice` and `checkbox` require non-empty `options[]`. Option
  objects must include `value`; `subOptions` must be an array.
- `composite` requires non-empty `parts[]`; each part needs an `id`.
- `rating` requires numeric `min` and `max` with `min < max`.
- `sub_score` requires `items[]` with at least one item; each item needs `id`
  and `label`. `mode: "max"` items need numeric `max`. `mode: "options"` items
  need a numeric `options[]` array.
- `showIf` / `hideInReportIf` / `hideQuestionsIf` need a `questionId` referring
  to a real question in the same form.
- `customReport` should reference a name that exists in `customReportFns` (or
  the line is silently skipped).

---

## 11. Complete annotated minimum form

A short, valid form demonstrating the most common patterns: section flow,
inline sub-options, `allowOther` / `allowComment`, `showIf`, `mergeUp`,
section-skip via `hideQuestionsIf`, both `sub_score` modes, `customReport`,
and `prefillFromQuestions`.

```json
{
  "specialty": "Medical",
  "title": "Holistic assessment (compact template)",
  "description": "Minimal but complete starter form.",
  "schema": {
    "sections": [
      {
        "title": "Vital Signs",
        "reportTitle": "A. Vital Signs",
        "questions": [
          {
            "id": "vitals", "label": "Vital signs", "hideLabel": true,
            "type": "composite", "width": "full",
            "parts": [
              { "id": "bp_sys", "label": "BP", "placeholder": "120", "suffix": "/" },
              { "id": "bp_dia", "label": "",   "placeholder": "80",  "suffix": " mmHg" },
              { "id": "p",      "label": "Pulse", "placeholder": "78", "suffix": "/min" }
            ],
            "joinWith": "  ",
            "reportTemplate": "Vital signs: BP {bp_sys}/{bp_dia} mmHg  P {p}/min"
          }
        ]
      },
      {
        "title": "Premorbid ADL",
        "reportTitle": "B. Premorbid ADL",
        "hideQuestionsIf": {
          "questionId": "limited_info",
          "equals": "Limited information from patient, pending further assess"
        },
        "questions": [
          {
            "id": "limited_info", "label": "Limited information", "hideLabel": true,
            "type": "checkbox", "width": "full",
            "options": ["Limited information from patient, pending further assess"],
            "reportTemplate": "Limited information from patient, pending further assessment."
          },
          {
            "id": "premorbid_adl_level",
            "label": "Premorbid ADL", "type": "multiple_choice", "width": "half",
            "options": ["Independent", "Required Assistance", "Dependent"],
            "reportTemplate": "Premorbid ADL: {answer}."
          },
          {
            "id": "premorbid_walk",
            "label": "Premorbid walking status", "type": "multiple_choice", "width": "half",
            "options": [
              "Walk unaided",
              { "value": "With aid", "subOptions": ["Stick", "Frame"], "subAllowOther": true },
              "Chair bound", "Bed bound"
            ],
            "reportTemplate": "Premorbid mobility: {answer}."
          }
        ]
      },
      {
        "title": "Mental & Cognitive Function",
        "reportTitle": "C. Mental Function",
        "questions": [
          {
            "id": "mental_state", "label": "Mental state", "type": "multiple_choice",
            "width": "half",
            "options": ["Alert", "Confused", "Drowsy", "Stupor"]
          },
          {
            "id": "follow_cmd", "label": "Follow command", "type": "multiple_choice",
            "width": "half",
            "options": ["1 step", "2 steps", "3 steps", "Not follow command"]
          },
          {
            "id": "amt", "label": "Abbreviated Mental Test (AMT)", "type": "sub_score",
            "mode": "options", "totalMax": 10, "removable": true, "width": "full",
            "items": [
              { "id": "age",  "label": "Age",  "options": [0, 1] },
              { "id": "time", "label": "Time", "options": [0, 1] }
            ],
            "reportTemplate": "AMT: Total score: {answer} (Cut-off 6/10)"
          }
        ]
      },
      {
        "title": "Functional Assessment",
        "reportTitle": "D. Functional Assessment",
        "questions": [
          {
            "id": "mbi", "label": "Modified Barthel Index", "type": "sub_score",
            "mode": "options", "totalMax": 100, "width": "full",
            "pendingPolicy": { "ignoreItems": ["wheelchair"], "pendingText": ", pending further assessment later" },
            "includeNAInBreakdown": true,
            "breakdownPosition": "before",
            "breakdownItemsPerLine": 5,
            "breakdownSep": "      ",
            "combineItems": [{ "ids": ["mobility", "wheelchair"], "label": "Mobility/Wheelchair" }],
            "items": [
              { "id": "bowels",     "label": "Bowels",     "options": [0,2,5,8,10],  "allowNA": true, "defaultNA": true, "qualifier": { "id": "bowels_stoma", "label": "Stoma" } },
              { "id": "bladder",    "label": "Bladder",    "options": [0,2,5,8,10],  "allowNA": true, "defaultNA": true, "qualifier": { "id": "bladder_foley", "label": "Foley" } },
              { "id": "mobility",   "label": "Mobility",   "options": [0,3,8,12,15], "allowNA": true, "defaultNA": true, "exclusiveWith": "wheelchair" },
              { "id": "wheelchair", "label": "Wheelchair", "options": [0,1,3,4,5],   "allowNA": true, "defaultNA": true, "exclusiveWith": "mobility" }
            ],
            "reportTemplate": "Modified Barthel Index (mBI): {answer}"
          },
          {
            "id": "mbi_overall", "label": "Overall functional level", "type": "checkbox",
            "width": "full",
            "options": ["Independent", "Supervision", "Mild Assistance", "Moderate Assistance", "Maximal Assistance", "Dependent"],
            "combineAdjacent": true, "maxSelect": 2, "consecutiveOnly": true,
            "reportTemplate": "Overall: ADL {answer}."
          }
        ]
      },
      {
        "title": "OT Comment",
        "reportTitle": "E. OT comment",
        "questions": [
          {
            "id": "ot_adl", "label": "ADL", "type": "short_text", "width": "full",
            "prefillFromQuestions": [
              { "questionId": "mbi", "label": "BI" },
              { "questionId": "mbi_overall", "label": "Level" }
            ],
            "reportTemplate": "ADL: mBI {q:mbi}; Level: {q:mbi_overall}. {answer}"
          }
        ]
      },
      {
        "title": "Problem Identification",
        "reportTitle": "F. Problem Identification",
        "questions": [
          {
            "id": "problems", "label": "Problems", "type": "checkbox", "width": "full",
            "customReport": "problems_factors",
            "options": [
              "Nil",
              { "value": "Patient Factor", "subOptions": ["NAD", "Not applicable", "Impaired ADL function"] },
              { "value": "Environmental Factor", "subOptions": ["NAD", "Not applicable", "Limited accessibility"] }
            ],
            "allowOther": true
          }
        ]
      },
      {
        "title": "Recommendation",
        "reportTitle": "G. Recommendation",
        "questions": [
          {
            "id": "rec", "label": "Recommendation", "type": "checkbox", "width": "full",
            "options": [
              "Functionally fit home",
              { "value": "Home with carer / maid / supervision", "detail": true, "detailPlaceholder": "from whom" },
              "Convalescent rehabilitation",
              { "value": "Refer to occupational therapy department out-patient department for", "detail": true, "detailPlaceholder": "e.g. ADL", "detailJoiner": " ", "detailSuffix": " training" }
            ],
            "allowOther": true
          }
        ]
      }
    ]
  }
}
```

---

## 12. Authoring checklist

- [ ] No `{ "form": { ... } }` wrapper — top level is the form object directly.
- [ ] `specialty` is exactly `Medical`, `NS`, or `Ortho`.
- [ ] Sections follow the recommended flow (or have a clinically valid reason not to).
- [ ] Every `id` is `snake_case` and unique within the form.
- [ ] No section exceeds ~8 visible questions (split or use `mergeUp`).
- [ ] Use **inline sub-options** (not `showIf`) when a follow-up belongs to one option.
- [ ] Use **`mergeUp: true`** to visually pair tightly-related follow-ups
      (Indoor walk + Indoor aid, Bathing setup + Bath by, Balance — Sitting + Standing, …).
- [ ] Use **`sub_score`** for any composite score; consider `allowNA + defaultNA`,
      `exclusiveWith`, `pendingPolicy`, `qualifier`, `totalExtras`,
      `breakdownItemsPerLine` / `breakdownSep` / `breakdownPosition`,
      `includeNAInBreakdown`, and `combineItems` where they apply.
- [ ] Use **`customReport`** when the report line should combine multiple
      questions, format conditionally, or span multiple lines. List the
      built-ins in § 9.4 before inventing a new one.
- [ ] Use **`hideInReport: true`** on questions whose content is already
      emitted by a sibling's `customReport`.
- [ ] Use **`allowComment: true`** for clinically common free-text annotations.
- [ ] Use **`allowOther: true`** for picklists where listed options may not
      cover everything.
- [ ] Use **`allowSuspend: true`** on physical-assessment items the clinician
      sometimes can't perform.
- [ ] Use **`hideQuestionsIf`** at the section level (with a single-option
      tickbox at the top of the section) to model "Limited information…" patterns.
- [ ] Use **`reportTitle`** with `A.`, `B.`, … prefixes for clean numbered output.
- [ ] Mentally walk the report for a half-filled form — does it read like a
      usable clerking note? Adjust labels and templates if not.
- [ ] Validate against § 10.

---

## 13. Prompt snippet for AI generation

> You are generating an Edoc clinical assessment form. **Read the entire
> attached Edoc Form JSON Guide** and produce a single valid JSON file matching
> it (no `{ "form": { ... } }` wrapper — top level is the form object directly).
>
> Constraints:
> - Specialty: `"<<<Medical|NS|Ortho>>>"`.
> - Follow the recommended section flow unless content clearly belongs elsewhere.
> - Use **inline sub-options** when a follow-up belongs to one specific answer
>   of the parent question. Use `showIf` only for cross-question conditions.
> - Use **`mergeUp: true`** to visually group tightly-related follow-ups in the
>   same box (e.g. an Aid question after a Walk question).
> - Use **`sub_score`** for every composite scoring tool mentioned. Consider
>   `allowNA + defaultNA`, `exclusiveWith`, `pendingPolicy`, `qualifier`, and
>   `combineItems` where clinically appropriate.
> - Use **`customReport`** when the report needs combining or multi-line output;
>   prefer the built-in names listed in § 9.4 of the guide.
> - Use **`hideInReport: true`** on questions whose content is already covered
>   by a sibling's `customReport`.
> - Add **`allowComment: true`** to questions where free-text context is common.
> - Add **`allowOther: true`** to picklists where options may not cover all cases.
> - Use **`allowSuspend: true`** on physical/transfer/balance/ambulation items.
> - Use **`hideQuestionsIf`** + a single-option tickbox at the top of a section
>   for "Limited information from patient, pending further assess" patterns.
> - Use **`reportTitle`** with `A.`, `B.`, … prefixes.
> - Use **`reportTemplate`** (with `{answer}`, `{partId}`, and `{q:otherId}` as
>   needed) when the default `Label: answer` reads clumsily.
> - `id`s in `snake_case`, unique within the form.
> - 3–8 visible questions per section.
> - Validate against § 10 before responding.
> - Output **only** the JSON document, no commentary, no Markdown fences.
>
> Form content:
> <<<paste the clinician's draft here>>>
