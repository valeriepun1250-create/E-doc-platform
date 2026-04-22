# Edoc — Form JSON Import Guide

This document describes the JSON format accepted by the **Import .json** button in the Edoc
admin panel. You can hand-craft these files, or paste this guide into an AI assistant along
with your form content and ask it to produce a valid JSON file ready to import.

---

## 1. Top-level shape

An import file is a single JSON object with one key, `form`:

```json
{
  "form": {
    "specialty": "Medical",
    "title": "Stroke admission clerking",
    "description": "Initial neuro admission form.",
    "schema": {
      "sections": [ /* ... */ ]
    }
  }
}
```

| Field          | Required | Description                                                   |
|----------------|----------|---------------------------------------------------------------|
| `specialty`    | yes      | One of `"Medical"`, `"NS"`, `"Ortho"` (exact case).           |
| `title`        | yes      | Shown in the form list.                                        |
| `description`  | no       | Short blurb shown under the title.                             |
| `schema.sections` | yes   | Array of section objects (see §2).                             |

---

## 2. Section

```json
{
  "title": "Social history",
  "description": "Optional extra guidance for the user.",
  "questions": [ /* ... */ ]
}
```

| Field          | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `title`        | yes      | Shown as the section heading.                |
| `description`  | no       | Optional muted-grey guidance paragraph.      |
| `questions`    | yes      | Array of question objects (see §3).          |

Put related items together in the same section. Typical section titles:
*Social history*, *Premorbid function*, *Mental state*, *Physical examination*,
*Investigations*, *Impression & plan*.

---

## 3. Question

Every question has:

| Field            | Required | Description                                                              |
|------------------|----------|--------------------------------------------------------------------------|
| `id`             | yes      | Unique within the form — use `snake_case` like `gcs_total`.              |
| `label`          | yes      | The question itself, shown to the user.                                  |
| `type`           | yes      | One of the types in §4.                                                  |
| `required`       | no       | `true` / `false`. Shown with a `*` but currently not hard-enforced.      |
| `hint`           | no       | Small grey text shown below the label.                                   |
| `reportTemplate` | no       | Custom line for the generated report; use `{answer}` as the placeholder. |

### How `reportTemplate` works

When the user clicks **Save & Copy**, Edoc assembles a text report. For each answered
question it prints either:

- the `reportTemplate` with `{answer}` substituted (e.g. `"GCS on arrival: {answer}"`), or
- the fallback `"<label>: <answer>"` if no template is given.

Use `reportTemplate` when you want the report to read like free-text prose rather
than a Q:A list. Example:

```json
{ "id": "smoker", "label": "Smoker?", "type": "yes_no",
  "reportTemplate": "Smoking status: {answer}." }
```

---

## 4. Question types

### `short_text`
Single-line text input.
```json
{ "id": "occupation", "label": "Occupation", "type": "short_text" }
```

### `long_text`
Multi-line textarea.
```json
{ "id": "hpi", "label": "History of presenting illness", "type": "long_text" }
```

### `number`
Numeric input.
```json
{ "id": "age", "label": "Age (years)", "type": "number" }
```

### `date`
Date picker (ISO `YYYY-MM-DD`).
```json
{ "id": "admit_date", "label": "Admission date", "type": "date" }
```

### `yes_no`
Two-button Yes / No.
```json
{ "id": "diabetes", "label": "Known diabetes?", "type": "yes_no" }
```

### `multiple_choice`
Single-select radio list. Requires non-empty `options`.
```json
{
  "id": "handedness", "label": "Handedness", "type": "multiple_choice",
  "options": ["Right", "Left", "Ambidextrous"]
}
```

### `checkbox`
Multi-select. Requires non-empty `options`. The report joins selections with commas.
```json
{
  "id": "comorbidities", "label": "Comorbidities", "type": "checkbox",
  "options": ["HTN", "DM", "IHD", "CKD", "AF"]
}
```

### `rating`
Integer scale between `min` and `max` (inclusive). `min` **must** be less than `max`.
The report renders as `"n/max"`.
```json
{
  "id": "pain", "label": "Pain score", "type": "rating",
  "min": 0, "max": 10,
  "reportTemplate": "Pain: {answer}"
}
```

---

## 5. Validation rules (enforced on import)

- `specialty` must be one of `"Medical" | "NS" | "Ortho"`.
- `schema.sections` must be an array; every section needs `title` and `questions`.
- Every question needs `id`, `label`, and a valid `type`.
- `multiple_choice` and `checkbox` require a non-empty `options` array.
- `rating` requires numeric `min` and `max` with `min < max`.

If any rule fails, the import is rejected with an error message — nothing is saved.

---

## 6. Full minimal example

```json
{
  "form": {
    "specialty": "NS",
    "title": "Head injury — ED assessment",
    "description": "Quick neuro screen for adult head trauma.",
    "schema": {
      "sections": [
        {
          "title": "Social history",
          "questions": [
            { "id": "occupation", "label": "Occupation", "type": "short_text" },
            { "id": "smoker", "label": "Smoker?", "type": "yes_no",
              "reportTemplate": "Smoking status: {answer}." },
            { "id": "etoh_units", "label": "Alcohol (units/week)", "type": "number" }
          ]
        },
        {
          "title": "Premorbid function",
          "questions": [
            {
              "id": "mrs",
              "label": "Modified Rankin Score (premorbid)",
              "type": "multiple_choice",
              "options": ["0", "1", "2", "3", "4", "5"],
              "reportTemplate": "Premorbid mRS {answer}."
            }
          ]
        },
        {
          "title": "Mental state",
          "questions": [
            {
              "id": "gcs", "label": "GCS on arrival", "type": "rating",
              "min": 3, "max": 15, "reportTemplate": "GCS {answer}/15 on arrival."
            },
            { "id": "orientation", "label": "Oriented to TPP?", "type": "yes_no" }
          ]
        },
        {
          "title": "Physical examination",
          "questions": [
            {
              "id": "pupils",
              "label": "Pupils",
              "type": "checkbox",
              "options": ["R reactive", "L reactive", "R sluggish", "L sluggish",
                          "R fixed", "L fixed"],
              "reportTemplate": "Pupils: {answer}."
            },
            { "id": "focal_deficit", "label": "Focal neurological deficit",
              "type": "long_text" }
          ]
        }
      ]
    }
  }
}
```

Save this as `form.json`, then in the Edoc admin panel click **Import .json** and pick it.

---

## 7. Prompt snippet for AI generation

Paste something like the following to an AI assistant, replacing the `<<<content>>>`
block with your own draft (bullet points, a paragraph, anything):

> You are helping me build an Edoc assessment form. Read the Edoc Form JSON Import Guide
> I attached and produce a single valid JSON file that conforms to it. The specialty is
> `"<<<Medical|NS|Ortho>>>"`. Group items into sensible sections (social history,
> premorbid function, mental, physical exam, etc.). Use `reportTemplate` for any field
> whose report line should read as prose rather than "Label: answer". Use
> `snake_case` IDs. Output **only** the JSON, no commentary.
>
> Form content:
> <<<content>>>
