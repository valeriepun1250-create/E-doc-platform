// Export and import — the only way patient data leaves or re-enters a device.
//
// The envelope is what lets import refuse a file that is not ours. Import merges by
// id and never deletes: replace would be one mis-tap from wiping a shared ward iPad,
// so the destructive case simply does not exist. Merged records are written through
// Storage.save() and re-read through Storage.load(), so a file predating a migration
// is migrated on the way in.

import { el } from "./dom.js";
import { State, Storage } from "./state.js";
import { today } from "./util.js";

// The envelope is what lets an import refuse a file that is not ours, and gives a
// version to migrate on if the record shape ever changes again.
export const BACKUP_APP = "ortho-ot";

export const BACKUP_SCHEMA = 1;

// Every case, as a file. Nothing else gets data off the device: a cleared browser or a
// reset iPad is otherwise the end of it.
export function exportAssessments() {
  const blob = new Blob([JSON.stringify({
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    exportedAt: new Date().toISOString(),
    assessments: State.assessments
  }, null, 2)], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: "ortho-assessments-" + today() + ".json" });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking immediately can cancel the download on some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// What an import would do, without doing it. Merge only ever adds or freshens: replace
// would be one mis-tap from wiping a shared ward iPad.
export function planImport(incoming) {
  const plan = { added: [], updated: [], unchanged: [] };
  Object.values(incoming || {}).forEach(rec => {
    if (!rec || !rec.id) return;
    const mine = State.assessments[rec.id];
    if (!mine) plan.added.push(rec);
    else if (new Date(rec.updatedAt) > new Date(mine.updatedAt)) plan.updated.push(rec);
    else plan.unchanged.push(rec);
  });
  return plan;
}

export function describeImport(plan) {
  return "Imported " + plan.added.length + " new, updated " + plan.updated.length +
         ", left " + plan.unchanged.length + " unchanged.";
}

export function importAssessments(text) {
  let file;
  try { file = JSON.parse(text); }
  catch { alert("That file is not readable JSON."); return null; }

  if (!file || file.app !== BACKUP_APP) {
    alert("That file is not an Ortho OT backup" +
          (file && file.app ? " — it says it is from \"" + file.app + "\"." : "."));
    return null;
  }

  const plan = planImport(file.assessments);
  if (!plan.added.length && !plan.updated.length) {
    alert("Nothing to import — all " + plan.unchanged.length +
          " case(s) in that file are already here.");
    return null;
  }
  if (!confirm("Add " + plan.added.length + " new case(s) and update " +
               plan.updated.length + "? Nothing already on this device is deleted.")) {
    return null;
  }

  const merged = Object.assign({}, State.assessments);
  plan.added.concat(plan.updated).forEach(rec => { merged[rec.id] = rec; });
  Storage.save(merged);
  // Re-read rather than assigning: a file may predate any of the migrations, and
  // Storage.load is the only place they run.
  State.assessments = Storage.load();
  return plan;
}
