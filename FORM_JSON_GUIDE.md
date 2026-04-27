# Edoc — Form JSON Import Guide

This is the **complete, authoritative spec** for forms imported into Edoc, the offline
clinical assessment platform. An AI assistant should be able to read **only this file**
plus a draft of form content from a clinician, and produce a JSON file that imports
cleanly via the Admin → **Paste JSON** or **Import .json file** button.

A valid file is a single JSON document. If anything fails the validation rules in §10,
the entire import is rejected with an error message — nothing partial is saved.

---

## 1. What an Edoc form is, end-to-end

A form is a clinical assessment template (e.g. *Initial holistic assessment*, *Fall risk
screen*, *Stroke clerking*) belonging to one of three specialties (Medical, NS, Ortho).
It contains an ordered list of **sections**, each with an ordered list of **questions**.

When a visitor uses the form:

- Sections are presented as **tabs** at the top — one section on screen at a time
  (no long scroll). The user moves between sections with the tabs or with Prev / Next.
- Every section has a small **✕ Remove section** button — the user can hide
  irrelevant sections for that patient. Hidden sections become chips above the tabs;
  one click restores them. (You don't need anything in JSON to enable this.)
- The user fills in answers, optionally adds an "Other:" comment per question.
- They click **Save & Copy** → a compact text **report** is generated, copied to the
  clipboard, and saved into browser **History** (localStorage). The report can be
  pasted directly into a clerking note.

The report format is described in §8 — your JSON design should anticipate how each
question's answer will appear there.

---

## 2. Top-level shape

```json
{
  "form": {
    "specialty": "Medical",
    "title": "Neuro rehab initial assessment",
    "description": "First-visit holistic assessment for stroke / TBI inpatients.",
    "schema": {
      "sections": [ /* array of sections — see §3 */ ]
    }
  }
}
```

| Field              | Required | Description                                                          |
|--------------------|----------|----------------------------------------------------------------------|
| `specialty`        | yes      | Exactly `"Medical"`, `"NS"`, or `"Ortho"` (case-sensitive).          |
| `title`            | yes      | Shown in the form list and as the report header.                     |
| `description`      | no       | Short subtitle shown under the title in the form list.               |
| `schema.sections`  | yes      | Non-empty array of section objects.                                  |

---

## 3. Sections

A section is a logical grouping of questions, displayed as one tab.

```json
{
  "title": "Social History, Home Environment & Premorbid ADL",
  "description": "Optional one-line guidance shown under the section header.",
  "questions": [ /* array of questions — see §4 */ ]
}
```

### Recommended section flow

Edoc's typical clinical sequence — use this unless the form content clearly belongs
to a different flow:

1. **Social History, Home Environment & Premorbid ADL**
2. **Mental & Cognitive Function**
3. **Physical Assessment**
4. **Functional Assessment**
5. **Problem Identification**
6. **Recommendation**

Disease-specific tools (Fall Assessment, Sensory-Motor Chart, Stroke-specific
sub-scores, etc.) can be inserted as additional sections at the appropriate point.

Aim for **3–8 questions per section** so each tab fits roughly one screen — that's the
whole point of tabs. If a section grows huge, split it.

---

## 4. Questions — common fields (apply to every type)

| Field              | Required | Description                                                                       |
|--------------------|----------|-----------------------------------------------------------------------------------|
| `id`               | yes      | Unique within the form. Use `snake_case` (e.g. `live_with`, `cog_screen`).        |
| `label`            | yes      | The question text shown to the user and used in the report.                       |
| `type`             | yes      | One of the types in §5.                                                           |
| `required`         | no       | Boolean. Shown with a `*`. Not hard-enforced today (no submit-blocking).          |
| `hint`             | no       | Small grey text rendered under the label.                                         |
| `width`            | no       | Layout width inside the section grid: `"half"` (one column) or `"full"` (span both). Default is half on wide screens. |
| `removable`        | no       | Boolean. Adds a small ✕ button on the question header so the user can dismiss this question for the current visit (e.g. AMT/CDT/MoCA when a tool isn't applicable). Hidden questions are skipped in the report. |
| `allowComment`     | no       | Boolean. Adds a collapsible **Other** textarea under the question. See §6.        |
| `commentLabel`     | no       | Override the default `"Other"` label for the comment summary and report.          |
| `commentPlaceholder` | no     | Placeholder text inside the comment textarea.                                     |
| `allowOther`       | no       | For `multiple_choice` / `checkbox`: appends an inline `Other: ___` row. See §6.   |
| `otherPlaceholder` | no       | Placeholder text for the inline `Other:` input.                                   |
| `reportTemplate`   | no       | Custom report line; `{answer}` is replaced with the formatted answer. For `composite`, `{partId}` is also substituted. See §8. |
| `showIf`           | no       | Conditional visibility — see §7.                                                  |

### 4.1 Section layout

The fill view places each section's questions into a **2-column grid** on wide
screens (collapses to 1 column on mobile). Use `width: "half"` for short fields
(short text, multiple_choice with few options, ratings, yes_no) and
`width: "full"` for things that need horizontal room (long_text, checkbox lists,
sub_score tables, composite vitals/power blocks). Mixing the two reduces vertical
scrolling significantly.

---

## 5. Question types

Nine types are supported. **Stick to these** — anything else fails validation.

### 5.1 `short_text` — single line
```json
{ "id": "occupation_note", "label": "Occupation note", "type": "short_text" }
```

### 5.2 `long_text` — multi-line textarea
Use for free-text prose like history of presenting illness, problem lists,
recommendations.
```json
{ "id": "hpi", "label": "History of presenting illness", "type": "long_text" }
```

### 5.3 `number`
```json
{ "id": "etoh_units", "label": "Alcohol (units/week)", "type": "number" }
```

### 5.4 `date` — ISO `YYYY-MM-DD`
```json
{ "id": "admit_date", "label": "Admission date", "type": "date" }
```

### 5.5 `yes_no` — two-button toggle
```json
{ "id": "diabetes", "label": "Known diabetes?", "type": "yes_no" }
```

### 5.6 `multiple_choice` — single-select radio (requires `options[]`)

Each item in `options` is **either a plain string or an option object** with inline
sub-options (see §5.6.1). Mixing the two in the same `options` array is fine.

```json
{
  "id": "lift_landing", "label": "Home access", "type": "multiple_choice",
  "options": ["Direct lift-landing", "Non-direct lift-landing", "No lift-landing"],
  "allowComment": true,
  "commentLabel": "Floor / stairs detail"
}
```

#### 5.6.1 Inline sub-options (option objects)

When a particular choice should reveal a follow-up question **inline directly under
the radio that triggered it**, use an option object. This avoids cluttering the form
with a separate question that only sometimes applies.

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

| Option-object field | Required | Description                                                                       |
|---------------------|----------|-----------------------------------------------------------------------------------|
| `value`             | yes      | The displayed text and stored value.                                              |
| `subOptions`        | no       | Array of strings, rendered as **checkboxes** beneath this radio when selected.    |
| `subAllowOther`     | no       | Adds an `Other: ___` text input alongside the sub-checkboxes.                     |

Stored answer:
- Plain option selected → string, e.g. `"Walk unaided"`.
- Option-object selected → `{ "value": "With aid", "sub": ["Stick"], "other": "" }`.

In the report it becomes: `Premorbid walking status: With aid (Stick)` — or with
`other`: `With aid (Stick; Other: weak grip)`.

> **Use sub-options instead of `showIf` whenever the follow-up belongs to one specific
> answer of the parent question.** Reserve `showIf` (§7) for follow-ups that span a
> different question or apply to multiple answers.

### 5.7 `checkbox` — multi-select (requires `options[]`)

Stored answer is an array of selected entries. Each entry is either a plain string
or an object `{ value, detail?, sub?, other? }` when extras are filled in.
```json
{
  "id": "live_with",
  "label": "Live with",
  "type": "checkbox",
  "options": ["Alone", "Spouse", "Child(ren)", "Parent(s)", "Sibling(s)", "Domestic helper"],
  "allowOther": true
}
```

#### 5.7.1 Per-option `detail` input (inline text next to the box)

Use when a checked option needs a small free-text qualifier (frequency, name,
quantity). Stored as `{ value, detail }`; rendered in the report as
`Day Care centre: 2x/week`.

```json
{
  "id": "social_service",
  "label": "Social service",
  "type": "checkbox",
  "options": [
    "Nil",
    { "value": "Day Care centre", "detail": true, "detailPlaceholder": "name / frequency" },
    { "value": "Elderly Centre",  "detail": true, "detailPlaceholder": "name / frequency" },
    { "value": "Home Help — Meal on wheels", "detail": true, "detailPlaceholder": "frequency" }
  ]
}
```

#### 5.7.2 Per-option `subOptions` (nested checkbox group)

Mirrors §5.6.1 but for checkboxes — useful for hierarchical lists (e.g. *Patient
Factor → Impaired ADL / Cognition / …*). When the parent is checked, the
sub-checkboxes appear inset; `subAllowOther: true` adds an inline `Other: ___` row.

```json
{
  "id": "problems",
  "label": "Problems",
  "type": "checkbox",
  "options": [
    "Nil",
    {
      "value": "Patient Factor",
      "subOptions": ["Impaired ADL function", "Impaired cognition", "Impaired physical stability"],
      "subAllowOther": true
    },
    {
      "value": "Environmental Factor",
      "subOptions": ["Limited accessibility", "Risky home environment"],
      "subAllowOther": true
    }
  ]
}
```

Stored as `{ value: "Patient Factor", sub: ["Impaired ADL function"], other: "..." }`.

#### 5.7.3 `combineAdjacent` — render two adjacent picks as "X to Y"

For ordinal scales like balance (Good / Fair / Poor) where clinicians often
straddle two adjacent levels. Set `combineAdjacent: true`; if the user picks
exactly two adjacent options, the report renders e.g. `Fair to Good`. One pick
renders as that single value; three or more falls back to comma-joined.

```json
{
  "id": "balance_sit",
  "label": "Balance — Sitting",
  "type": "checkbox",
  "options": ["Good", "Fair", "Poor"],
  "combineAdjacent": true
}
```

### 5.8 `rating` — integer scale (requires `min` and `max`, `min < max`)

Renders as a row of buttons from `min` to `max`. Report shows `n/max`.
```json
{ "id": "pain", "label": "Pain score (NRS)", "type": "rating",
  "min": 0, "max": 10, "reportTemplate": "Pain {answer}." }
```

### 5.9 `sub_score` — composite score with auto-summed total

Use this for any standardised assessment tool composed of multiple sub-items that
sum to a total: **MBI, MMSE, MoCA, AMT, Morse Fall Scale, Berg Balance, etc.** The
running total is computed and displayed live as the user fills items in.

| Field            | Required | Description                                                                            |
|------------------|----------|----------------------------------------------------------------------------------------|
| `mode`           | yes      | `"options"` for fixed allowed values per item; `"max"` for free integer 0..max input.  |
| `items`          | yes      | Array of sub-items (see below).                                                        |
| `totalMax`       | no       | Override total ceiling. Defaults to the sum of per-item maxes.                         |
| `showBreakdown`  | no       | Default `true`. Set `false` to suppress the per-item lines in the report (total only). |

**Item shape — `mode: "options"`** (e.g. MBI items where only `0/2/5/8/10` are allowed):
```json
{ "id": "bowels", "label": "Bowels", "options": [0, 2, 5, 8, 10] }
```

**Item shape — `mode: "max"`** (e.g. cognitive screen items):
```json
{ "id": "naming", "label": "Naming", "max": 3 }
```

#### Example A — Modified Barthel Index (Surya Shah, 1989)
```json
{
  "id": "mbi",
  "label": "Modified Barthel Index (Surya Shah, 1989)",
  "type": "sub_score",
  "mode": "options",
  "totalMax": 100,
  "items": [
    { "id": "bowels",     "label": "Bowels",     "options": [0, 2, 5, 8, 10] },
    { "id": "bladder",    "label": "Bladder",    "options": [0, 2, 5, 8, 10] },
    { "id": "grooming",   "label": "Grooming",   "options": [0, 1, 3, 4, 5] },
    { "id": "toileting",  "label": "Toileting",  "options": [0, 2, 5, 8, 10] },
    { "id": "feeding",    "label": "Feeding",    "options": [0, 2, 5, 8, 10] },
    { "id": "dressing",   "label": "Dressing",   "options": [0, 2, 5, 8, 10] },
    { "id": "bathing",    "label": "Bathing",    "options": [0, 1, 3, 4, 5] },
    { "id": "transfer",   "label": "Transfer",   "options": [0, 3, 8, 12, 15] },
    { "id": "mobility",   "label": "Mobility",   "options": [0, 3, 8, 12, 15] },
    { "id": "wheelchair", "label": "Wheelchair", "options": [0, 1, 3, 4, 5] },
    { "id": "stairs",     "label": "Stairs",     "options": [0, 2, 5, 8, 10] }
  ],
  "reportTemplate": "MBI {answer}"
}
```

#### Example B — Cognitive sub-score (max-mode)
```json
{
  "id": "cog_screen",
  "label": "Cognitive screening",
  "type": "sub_score",
  "mode": "max",
  "items": [
    { "id": "age",           "label": "Age",              "max": 1 },
    { "id": "dob",           "label": "Date of birth",    "max": 1 },
    { "id": "year",          "label": "Year",             "max": 1 },
    { "id": "month",         "label": "Month",            "max": 1 },
    { "id": "recall",        "label": "Address recall",   "max": 5 },
    { "id": "orientation_s", "label": "Orientation",      "max": 10 },
    { "id": "naming",        "label": "Naming",           "max": 3 },
    { "id": "comprehension", "label": "Comprehension",    "max": 3 }
  ],
  "reportTemplate": "Cognitive screen: {answer}"
}
```

### 5.10 `composite` — multi-input single field (e.g. GCS E/V/M, BP/P/SpO2, Power 2×2)

Renders a row of small labelled inputs (or a 2×2 grid) that are stored as one
object and joined into one report line. Use this for fields that clinicians read
as a single unit — vital signs, GCS, limb power.

| Field         | Required | Description                                                        |
|---------------|----------|--------------------------------------------------------------------|
| `parts`       | yes      | Array of `{ id, label?, placeholder?, prefix?, suffix?, wide? }`.  |
| `layout`      | no       | `"inline"` (default) or `"grid-2x2"` (needs exactly 4 parts).      |
| `rowHeaders`  | grid     | `["Upper", "Lower"]` for the 2×2 layout.                           |
| `colHeaders`  | grid     | `["Right", "Left"]` for the 2×2 layout.                            |
| `joinWith`    | no       | Separator used when joining filled parts in the report (default `"; "`). |

Stored as `{ partId: value, ... }`. Empty parts are omitted. Use `reportTemplate`
with `{answer}` to wrap the joined value, OR with `{partId}` placeholders to
pull individual parts (e.g. `"Power — R UL: {rul}; L UL: {lul}"`).

#### Inline — Vital signs
```json
{
  "id": "vitals", "label": "Vital signs", "type": "composite",
  "parts": [
    { "id": "bp_sys", "label": "BP", "placeholder": "120", "suffix": "/" },
    { "id": "bp_dia", "label": "",   "placeholder": "80",  "suffix": " mmHg" },
    { "id": "p",      "label": "P",  "placeholder": "78",  "suffix": "/min" },
    { "id": "spo2",   "label": "SpO2", "placeholder": "98", "suffix": "%" },
    { "id": "o2",     "label": "",   "placeholder": "Room Air / L O2", "wide": true }
  ],
  "joinWith": "  ",
  "reportTemplate": "Vital signs: {answer}"
}
```

#### Inline — GCS
```json
{
  "id": "gcs", "label": "GCS", "type": "composite",
  "parts": [
    { "id": "e", "label": "E", "placeholder": "1-4" },
    { "id": "v", "label": "V", "placeholder": "1-5" },
    { "id": "m", "label": "M", "placeholder": "1-6" }
  ],
  "joinWith": " ",
  "reportTemplate": "GCS: {answer}"
}
```

#### 2×2 grid — Power
```json
{
  "id": "power", "label": "Power", "type": "composite", "layout": "grid-2x2",
  "rowHeaders": ["Upper", "Lower"], "colHeaders": ["Right", "Left"],
  "parts": [
    { "id": "rul" }, { "id": "lul" },
    { "id": "rll" }, { "id": "lll" }
  ],
  "reportTemplate": "Power — R UL: {rul}; L UL: {lul}; R LL: {rll}; L LL: {lll}"
}
```

---

## 6. "Other" inputs vs comments — when to use which

Both attach free-text to a question, but they're for different jobs.

- **`allowOther: true`** — adds an inline `Other: ___` row to a `multiple_choice` /
  `checkbox` question. Use when the user might pick a value that doesn't fit any
  predefined option (e.g. occupation, mobility aid not listed). The "Other" value
  becomes part of the answer.

- **`allowComment: true`** — adds a collapsible **Other** textarea (the summary text
  is configurable via `commentLabel`) under any question. Use for *additional*
  context that doesn't replace the primary answer (e.g. pain location next to a
  pain score, environmental notes next to mobility).

It is fine to use both on the same question.

#### Example: Occupation = Retired or Other
```json
{
  "id": "occupation",
  "label": "Occupation",
  "type": "multiple_choice",
  "options": ["Retired"],
  "allowOther": true,
  "otherPlaceholder": "occupation"
}
```

The user sees two rows: **Retired** and **Other: [text input]**.

---

## 7. Conditional visibility — `showIf`

Show a question only when **another question's** answer matches a condition. Use this
when a follow-up depends on the answer to a *different* question; for follow-ups under
a single specific option of the same question, prefer inline sub-options (§5.6.1).

```json
"showIf": {
  "questionId": "<id of the source question>",
  "equals": "<value the source must equal>"
}
```

| Variant       | Behaviour                                                                              |
|---------------|----------------------------------------------------------------------------------------|
| `equals`      | Source answer === value. For `checkbox` sources, treats array `.includes(value)` as match. |
| `anyOf`       | Source answer matches *any* value in the array.                                        |
| `notEquals`   | Source answer is *not* the given value.                                                |
| `itemId`      | Drill into a `sub_score` item value, e.g. `{ questionId: "mbi", itemId: "bladder", equals: 0 }` shows a follow-up only when the MBI bladder item is 0. |

When the condition is false:
- The dependent question is hidden in the UI.
- Its stored answer is cleared (so stale data doesn't leak into the report).
- It is skipped during report generation.

```json
{
  "id": "fall_injury_detail",
  "label": "Describe the injury",
  "type": "long_text",
  "showIf": { "questionId": "fall_injury", "equals": "Yes" }
}
```

#### 7.1 Reacting to a sub-score item value (`itemId`)

When a follow-up depends on an individual `sub_score` item rather than the whole
question, drill in with `itemId`. The classic case is MBI: if the bladder
sub-item is 0, ask whether the patient has a Foley catheter.

```json
{
  "id": "mbi_bladder_foley",
  "label": "Bladder qualifier",
  "type": "checkbox",
  "options": ["Foley"],
  "allowOther": true,
  "showIf": { "questionId": "mbi", "itemId": "bladder", "equals": 0 }
}
```

---

## 8. The generated report — design your form for this

When the user clicks **Save & Copy**, Edoc walks the form and produces a compact text
report. **Design your `label`s, `reportTemplate`s, and section ordering with this
output in mind** — it is the primary artefact your users care about.

### 8.1 Format

```
<Form title>

<Section 1 title>
<Question label or reportTemplate line>
<Question label or reportTemplate line>
<… sub-score breakdown if applicable …>

<Section 2 title>
<…>
```

- **No `==` decoration.** Section titles are plain text on their own line.
- **One blank line between sections.** None inside a section.
- **No `Date:` or `Specialty:` header line.** Just the form title.

### 8.2 Empty-skipping rules (very important)

The report **only includes content the user actually filled in**:

- A blank question is **omitted entirely**.
- A blank question with a comment typed shows as a single comment-only line:
  `<Question label> — Other: <comment text>`.
- A section with **zero filled questions and zero comments is dropped entirely** —
  no empty section header.
- Hidden sections (✕ Remove section) and `showIf`-hidden questions are skipped.

This means: **make liberal use of optional questions.** A 60-item template that
collapses to a focused 12-line report when only 12 things are clinically relevant
is exactly what we want.

### 8.3 Per-type formatting

| Type              | Report rendering of the answer                                                |
|-------------------|-------------------------------------------------------------------------------|
| `short_text`, `long_text`, `number`, `date` | The raw value as typed.                            |
| `yes_no`          | `Yes` or `No`.                                                                |
| `multiple_choice` | The chosen option's value. Sub-options append in parens: `With aid (Stick)`. |
| `checkbox`        | Selected options joined with `, ` (commas). `Other: ___` selections appear as `Other: <text>`. |
| `rating`          | `n/max` (e.g. `7/10`).                                                        |
| `sub_score`       | `total/totalMax` on one line, then a soft-wrapped per-item breakdown using `; ` separators. |

### 8.4 Sub-score breakdown — inline & wrapped

Sub-score questions emit two pieces:

- **Total line** — typically rendered via `reportTemplate` (e.g. `MBI {answer}` →
  `MBI 95/100`).
- **Breakdown line(s)** — `Item: n/max; Item: n/max; …` joined with `; `, soft-wrapped
  at ~90 characters. So an MBI breakdown looks like:

```
MBI 95/100
Bowels: 10/10; Bladder: 10/10; Grooming: 5/5; Toileting: 10/10; Feeding: 10/10;
Dressing: 10/10; Bathing: 5/5; Transfer: 15/15; Mobility: 15/15; Stairs: 10/10
```

Set `"showBreakdown": false` if you only want the total line.

### 8.5 `reportTemplate` — when to use it

Default report line is `<label>: <answer>`. Use `reportTemplate` when that doesn't
read clinically:

- For prose: `"reportTemplate": "Smoking status: {answer}."`
- To match an existing scoring tool's standard wording: `"MBI {answer}"`.
- To compress: `"AMT {answer}"` is tighter than `"AMT score: {answer}"`.

### 8.6 Realistic sample output

For a holistic assessment with the typical sections, a filled-in report looks like:

```
Initial holistic assessment

Social History, Home Environment & Premorbid ADL
Live with: Spouse, Child(ren); Other: caregiver visits weekly
Home access: Direct lift-landing
Premorbid ADL: Independent.
Premorbid mobility: With aid (Stick).
Occupation: Retired

Mental & Cognitive Function
Oriented to Time / Place / Person: Time, Place, Person
Cognitive screen: 22/25
Age: 1/1; Date of birth: 1/1; Year: 1/1; Month: 1/1; Address recall: 4/5;
Orientation: 9/10; Naming: 3/3; Comprehension: 2/3

Functional Assessment (Modified Barthel Index)
MBI 95/100
Bowels: 10/10; Bladder: 10/10; Grooming: 5/5; Toileting: 10/10; Feeding: 10/10;
Dressing: 10/10; Bathing: 5/5; Transfer: 15/15; Mobility: 15/15; Stairs: 10/10
Overall functional level: Independent

Recommendation
Rehab plan: Daily PT, gait re-training
```

Notes:
- Physical Assessment and Problem Identification sections were left blank by the user
  → **omitted entirely** from the output.
- Comment on `live_with` rendered inline with `; Other: …`.

---

## 9. Worked examples — common cognitive tools

These are drop-in `sub_score` blocks for the standard tools that show up in the
sample reports we generate. Copy whole and tune labels / item lists if your local
version differs.

### 9.1 Abbreviated Mental Test (AMT) — 10 items × `0/1`

Use `mode: "options"` so each item is a 0/1 button pair, with a `totalMax: 10`.
The cut-off line is best added as a `hint` so it appears under the question label
in the form, and as part of the `reportTemplate` so it lands in the report too.

```json
{
  "id": "amt",
  "label": "Abbreviated Mental Test (AMT)",
  "type": "sub_score",
  "mode": "options",
  "totalMax": 10,
  "hint": "Cut-off <6 indicates further evaluation for possible cognitive impairment.",
  "items": [
    { "id": "age",        "label": "Age",                                  "options": [0, 1] },
    { "id": "time",       "label": "Time",                                 "options": [0, 1] },
    { "id": "addr",       "label": "Address for recall",                   "options": [0, 1] },
    { "id": "year",       "label": "Current year",                         "options": [0, 1] },
    { "id": "place",      "label": "Place",                                "options": [0, 1] },
    { "id": "recog",      "label": "Recognition of two persons",           "options": [0, 1] },
    { "id": "dob",        "label": "Date of birth",                        "options": [0, 1] },
    { "id": "festival",   "label": "Date of mid-Autumn festival",          "options": [0, 1] },
    { "id": "leader",     "label": "Name of present Governor / leader",    "options": [0, 1] },
    { "id": "count_back", "label": "Count from 20 to 1 backwards",         "options": [0, 1] }
  ],
  "reportTemplate": "Abbreviated Mental Test (AMT): Total score: {answer}\n(Cut-off <6 indicates further evaluation for possibility of cognitive impairment)"
}
```

Renders in the report as:

```
Abbreviated Mental Test (AMT): Total score: 10/10
(Cut-off <6 indicates further evaluation for possibility of cognitive impairment)
Age: 1/1; Time: 1/1; Address for recall: 1/1; Current year: 1/1; Place: 1/1;
Recognition of two persons: 1/1; Date of birth: 1/1; Date of mid-Autumn festival: 1/1;
Name of present Governor / leader: 1/1; Count from 20 to 1 backwards: 1/1
```

### 9.2 Clock Drawing Test — single rating

A single 0-10 score with the cut-off note. `rating` is the right type — no
breakdown needed.

```json
{
  "id": "clock_draw",
  "label": "Clock Drawing Test",
  "type": "rating",
  "min": 0,
  "max": 10,
  "hint": "Cut-off 3/4; lower score indicates higher cognitive impairment.",
  "reportTemplate": "Clock Drawing Test: {answer} (Cut-off 3/4; lower score indicates higher cognitive impairment)"
}
```

Report line: `Clock Drawing Test: 4/10 (Cut-off 3/4; lower score indicates higher cognitive impairment)`.

### 9.3 HK-Montreal Cognitive Assessment (MoCA) — `mode: "max"`

Seven cognitive domains summing to 30. Use `mode: "max"` since each domain accepts
any integer from 0 to its ceiling.

```json
{
  "id": "moca",
  "label": "HK-Montreal Cognitive Assessment (MoCA)",
  "type": "sub_score",
  "mode": "max",
  "totalMax": 30,
  "items": [
    { "id": "executive",   "label": "Executive Function", "max": 5 },
    { "id": "naming",      "label": "Naming",             "max": 3 },
    { "id": "attention",   "label": "Attention",          "max": 6 },
    { "id": "language",    "label": "Language",           "max": 3 },
    { "id": "abstraction", "label": "Abstraction",        "max": 2 },
    { "id": "recall",      "label": "Delayed Recall",     "max": 5 },
    { "id": "orientation", "label": "Orientation",        "max": 6 }
  ],
  "reportTemplate": "HK-Montreal Cognitive Assessment (MoCA): {answer}",
  "allowComment": true,
  "commentLabel": "Percentile band / interpretation"
}
```

The percentile classification (`>16th percentile`, `≤16th percentile: DSM-5 minor
NCD`, etc.) is best left as the comment (`allowComment`) rather than encoded as
options, because the clinician usually annotates a single line by hand. If you
want it as a structured pick instead, swap the comment for a sibling
`multiple_choice` question with those four bands as options and a
`reportTemplate` of `"Interpretation: {answer}"`.

Report lines:

```
HK-Montreal Cognitive Assessment (MoCA): 24/30
Executive Function: 5/5; Naming: 3/3; Attention: 3/6; Language: 3/3;
Abstraction: 2/2; Delayed Recall: 2/5; Orientation: 6/6
```

### 9.4 Wiring all three together

Put these three inside one **Mental & Cognitive Function** section so the report
groups them naturally. Add a short `multiple_choice` (e.g. *Educational level*)
above them with `reportTemplate: "[Educational level: {answer}]"` if your unit
records that — it then appears as a clean header line above the AMT block.

---

## 10. Validation rules (enforced on import)

If any rule is violated, the import is rejected with a single error message and
**nothing is saved**. Make sure your generated JSON satisfies all of these before
sending it.

- `specialty` must be exactly `"Medical" | "NS" | "Ortho"`.
- `title` must be a non-empty string.
- `schema.sections` must be a non-empty array.
- Each section must have a `title` (string) and a `questions` array.
- Each question must have `id`, `label`, and a valid `type` (one of the nine in §5).
- `multiple_choice` and `checkbox` require non-empty `options[]`.
  - Any option object must include a `value`; `subOptions` if present must be an array.
- `composite` requires non-empty `parts[]`; each part needs an `id`.
- `rating` requires numeric `min` and `max` with `min < max`.
- `sub_score` requires `items[]` with at least one item; each item needs `id` and
  `label`. `mode: "max"` items need numeric `max`. `mode: "options"` items need a
  numeric `options[]` array (all numbers).
- `showIf` requires a `questionId` (string). It should reference an existing question
  in the same form.

---

## 11. Complete annotated minimum form

A short, valid form you can import and edit from. Demonstrates every common pattern:
typical section flow, inline sub-options, `allowOther`, `allowComment`, `showIf`,
and both `sub_score` modes.

```json
{
  "form": {
    "specialty": "Medical",
    "title": "Holistic assessment (compact template)",
    "description": "Minimal but complete starter form.",
    "schema": {
      "sections": [
        {
          "title": "Social History, Home Environment & Premorbid ADL",
          "questions": [
            {
              "id": "live_with", "label": "Live with", "type": "checkbox",
              "options": ["Alone", "Spouse", "Child(ren)", "Domestic helper"],
              "allowOther": true, "allowComment": true
            },
            {
              "id": "lift_landing", "label": "Home access", "type": "multiple_choice",
              "options": ["Direct lift-landing", "Non-direct lift-landing", "No lift-landing"]
            },
            {
              "id": "premorbid_adl", "label": "Premorbid ADL status",
              "type": "multiple_choice",
              "options": ["Independent", "Required Assistance", "Dependent"],
              "reportTemplate": "Premorbid ADL: {answer}."
            },
            {
              "id": "premorbid_walk", "label": "Premorbid walking status",
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
              ],
              "reportTemplate": "Premorbid mobility: {answer}."
            },
            {
              "id": "occupation", "label": "Occupation", "type": "multiple_choice",
              "options": ["Retired"], "allowOther": true,
              "otherPlaceholder": "occupation"
            }
          ]
        },
        {
          "title": "Mental & Cognitive Function",
          "questions": [
            {
              "id": "cog_screen", "label": "Cognitive screening",
              "type": "sub_score", "mode": "max",
              "items": [
                { "id": "age",           "label": "Age",            "max": 1 },
                { "id": "dob",           "label": "Date of birth",  "max": 1 },
                { "id": "year",          "label": "Year",           "max": 1 },
                { "id": "month",         "label": "Month",          "max": 1 },
                { "id": "recall",        "label": "Address recall", "max": 5 },
                { "id": "orientation_s", "label": "Orientation",    "max": 10 },
                { "id": "naming",        "label": "Naming",         "max": 3 },
                { "id": "comprehension", "label": "Comprehension",  "max": 3 }
              ],
              "reportTemplate": "Cognitive screen: {answer}",
              "allowComment": true
            }
          ]
        },
        {
          "title": "Physical Assessment",
          "questions": [
            { "id": "bp", "label": "BP (mmHg)", "type": "short_text" },
            { "id": "hr", "label": "HR", "type": "number" },
            {
              "id": "pain", "label": "Pain score (NRS)", "type": "rating",
              "min": 0, "max": 10,
              "allowComment": true, "commentLabel": "Location / character"
            },
            { "id": "neuro", "label": "Neuro exam", "type": "long_text" }
          ]
        },
        {
          "title": "Functional Assessment (Modified Barthel Index)",
          "questions": [
            {
              "id": "mbi", "label": "Modified Barthel Index (Surya Shah, 1989)",
              "type": "sub_score", "mode": "options", "totalMax": 100,
              "items": [
                { "id": "bowels",     "label": "Bowels",     "options": [0, 2, 5, 8, 10] },
                { "id": "bladder",    "label": "Bladder",    "options": [0, 2, 5, 8, 10] },
                { "id": "grooming",   "label": "Grooming",   "options": [0, 1, 3, 4, 5] },
                { "id": "toileting",  "label": "Toileting",  "options": [0, 2, 5, 8, 10] },
                { "id": "feeding",    "label": "Feeding",    "options": [0, 2, 5, 8, 10] },
                { "id": "dressing",   "label": "Dressing",   "options": [0, 2, 5, 8, 10] },
                { "id": "bathing",    "label": "Bathing",    "options": [0, 1, 3, 4, 5] },
                { "id": "transfer",   "label": "Transfer",   "options": [0, 3, 8, 12, 15] },
                { "id": "mobility",   "label": "Mobility",   "options": [0, 3, 8, 12, 15] },
                { "id": "wheelchair", "label": "Wheelchair", "options": [0, 1, 3, 4, 5] },
                { "id": "stairs",     "label": "Stairs",     "options": [0, 2, 5, 8, 10] }
              ],
              "reportTemplate": "MBI {answer}"
            },
            {
              "id": "mbi_overall", "label": "Overall functional level",
              "type": "multiple_choice",
              "options": ["Independent", "Supervision", "Mild", "Moderate", "Maximal", "Dependent"]
            }
          ]
        },
        {
          "title": "Problem Identification",
          "questions": [
            { "id": "problems", "label": "Problem list", "type": "long_text",
              "hint": "One per line." }
          ]
        },
        {
          "title": "Recommendation",
          "questions": [
            { "id": "rec_rehab",     "label": "Rehab plan",          "type": "long_text" },
            { "id": "rec_discharge", "label": "Discharge planning",  "type": "long_text" },
            { "id": "rec_followup",  "label": "Follow-up",           "type": "long_text" }
          ]
        }
      ]
    }
  }
}
```

---

## 12. Authoring checklist

Before producing the final JSON, verify each item:

- [ ] Top level is `{ "form": { ... } }` — single key.
- [ ] `specialty` is exactly `Medical`, `NS`, or `Ortho`.
- [ ] Sections follow the recommended flow (or have a clinically valid reason not to).
- [ ] Every `id` is `snake_case` and unique within the form.
- [ ] No section exceeds ~8 questions (split if needed).
- [ ] For each `multiple_choice` / `checkbox`, decide whether to add `allowOther`.
- [ ] Use **inline sub-options** (not `showIf`) when a follow-up belongs to a single option.
- [ ] Use **`sub_score`** for any composite score (MBI, MMSE, AMT, MoCA, Morse, Berg, …).
  - Use `mode: "options"` when the tool defines specific allowed values per item.
  - Use `mode: "max"` when items are scored as integers `0..max`.
- [ ] Use `reportTemplate` for any field whose default `Label: answer` reads clumsily.
- [ ] Use `allowComment: true` on items where free-text context is clinically common.
- [ ] Mentally walk the report (§8) for a half-filled form — does it read like a usable
      clerking note? If not, adjust labels and templates.
- [ ] Validate that all rules in §10 pass.

---

## 13. Prompt snippet for AI generation

Paste this verbatim to another AI session along with the contents of this file and the
clinician's draft form content:

> You are generating an Edoc clinical assessment form. **Read the entire attached
> Edoc Form JSON Import Guide** and produce a single valid JSON file matching it.
>
> Constraints:
> - Specialty: `"<<<Medical|NS|Ortho>>>"`.
> - Follow the recommended section flow unless the content clearly belongs elsewhere.
> - Use **inline sub-options** (option objects with `subOptions`) whenever a follow-up
>   belongs to one specific answer of the parent question. Use `showIf` only for
>   cross-question conditions.
> - Use **`sub_score`** for every composite scoring tool mentioned (MBI, MMSE, MoCA,
>   AMT, Morse Fall Scale, Berg Balance, etc.) — pick `mode: "options"` or
>   `mode: "max"` as appropriate.
> - Add **`"allowComment": true`** to questions where the clinician may want to add
>   free-text context.
> - Add **`"allowOther": true`** to single/multi-select questions where the listed
>   options may not cover everything.
> - Use **`reportTemplate`** on any item whose default `Label: answer` would not read
>   well in a pasted clerking note.
> - Use `snake_case` `id`s, unique within the form.
> - Keep each section to roughly 3–8 questions.
> - Validate against §10 of the guide before responding.
> - Output **only** the JSON document, no commentary, no Markdown fences.
>
> Form content:
> <<<paste the clinician's draft here>>>
