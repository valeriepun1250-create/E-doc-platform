(function () {
  "use strict";

  const BANK = window.OT_PHRASE_BANK;
  const STORAGE_KEY = "otInpatientMedicalCases.v1";
  const STORAGE_BACKUP_KEY = "otInpatientMedicalCases.v1.backup";
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  const AUTOSAVE_LABEL = "Autosaved locally";
  const GDS_COMPLETION_REMINDER = "GDS is not yet completed. Please answer all 15 questions.";
  const NOTE_PART_KEYS = ["greenBox", "common", "problem", "remarks", "recommendation"];
  const HOME_O2_BREATHING_TREATMENT = "Education on Breathing Technique, Handheld Fan and Energy Conservation";
  const HOME_O2_HAGO_TREATMENT = "HaGO Tele-information prescribed";
  const HOME_O2_HAGO_SUMMARY_LABEL = "Prescription of HA Go (Tele information)";
  const HOME_O2_HAGO_TREATMENT_LEGACY = "HaGO Tele-information prescribed";
  const app = document.getElementById("app");

  if (navigator.storage && typeof navigator.storage.persist === "function") {
    navigator.storage.persist().catch(() => {});
  }

  let cases = [];
  let currentCaseId = null;
  let currentSection = 0;
  let currentView = "home";
  let statusMessage = "";
  let homeReminder = {};
  let homeDraft = { ward: "", date: "", form: "" };
  let hdrsRemarkOpen = {};

  function todayISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function uid() {
    return `case-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function h(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPath(obj, path) {
    return path.split(".").reduce((cursor, key) => {
      if (cursor == null) return undefined;
      return cursor[key];
    }, obj);
  }

  function setPath(obj, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    let cursor = obj;
    keys.forEach((key) => {
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
      cursor = cursor[key];
    });
    cursor[last] = value;
  }

  function mergeDeep(defaultValue, storedValue) {
    if (Array.isArray(defaultValue)) return Array.isArray(storedValue) ? storedValue : defaultValue.slice();
    if (!defaultValue || typeof defaultValue !== "object") return storedValue ?? defaultValue;
    const merged = { ...defaultValue };
    if (storedValue && typeof storedValue === "object") {
      Object.keys(storedValue).forEach((key) => {
        merged[key] = mergeDeep(defaultValue[key], storedValue[key]);
      });
    }
    return merged;
  }

  function makeOrientationItems() {
    return BANK.orientationItems.reduce((items, item) => {
      items[item] = true;
      return items;
    }, {});
  }

  function makeAmtAnswers() {
    return BANK.amtItems.reduce((items, item) => {
      items[item.key] = "";
      return items;
    }, {});
  }

  function makeBiState() {
    const state = {};
    Object.keys(BANK.biItems).forEach((key) => {
      state[key] = {
        score: "",
        notAssessed: true,
        stoma: false,
        foley: false,
        bilateralPcn: false,
        feedingRoute: ""
      };
    });
    return state;
  }

  function makePowerGroupState() {
    return {
      pending: false,
      pendingReason: "",
      limbMovement: "",
      power: { rightUl: "", leftUl: "", rightLl: "", leftLl: "" },
      tone: "",
      toneOther: "",
      coordination: "",
      coordinationOther: ""
    };
  }

  function makePressureInjurySite() {
    return {
      side: "",
      areas: [],
      areaOther: "",
      pressureInjury: "",
      stage: "",
      dressing: "",
      dressingSite: "",
      skinConditions: [],
      skinRemarks: {},
      erythemaType: "",
      attachments: [],
      deviceRemark: ""
    };
  }

  function makePressureInjuryData() {
    return {
      skinSites: [makePressureInjurySite()],
      physical: {
        powerGroup: makePowerGroupState(),
        functionStatus: "",
        contracture: { status: "", site: "" },
        sensation: [],
        sensationRemarks: {},
        tactileSensation: "",
        otherInfo: ""
      },
      problem: {
        choices: [],
        other: ""
      },
      management: {
        devicePrescription: "",
        devices: [],
        deviceRemarks: {},
        regimes: {},
        regimeRemarks: {},
        deviceAction: "",
        interventions: [],
        interventionRemarks: {},
        treatmentChecks: [],
        treatmentItems: [],
        treatmentRemarks: {}
      }
    };
  }

  function makeTedPhysicalData() {
    return {
      powerGroup: makePowerGroupState(),
      functionStatus: "",
      sensation: [],
      sensationRemarks: {},
      tactileSensation: "",
      softCalf: { right: "", left: "" },
      calfCircumference: { right: "", left: "" },
      otherInfo: ""
    };
  }

  function makeTedData() {
    return {
      skin: {
        conditions: [],
        conditionRemarks: {},
        pressureInjury: "",
        stage: "",
        swelling: "",
        swellingLimbs: []
      },
      physical: makeTedPhysicalData(),
      risk: {
        patient: [],
        admission: []
      },
      management: {
        tx: [],
        notFitReasons: [],
        notFitOther: "",
        stockingType: "",
        size: "",
        regimes: [],
        regimeOther: "",
        education: false,
        plan: []
      }
    };
  }

  function makePalliativePainEntry(source = {}) {
    return {
      location: source.location || "",
      nrs: source.nrs || "",
      confidence: source.confidence || ""
    };
  }

  function makePalliativeEdemaEntry(source = {}) {
    return {
      site: source.site || "",
      circumference: source.circumference || ""
    };
  }

  function makePalliativePressureInjuryEntry(source = {}) {
    return {
      site: source.site || "",
      skinConditions: Array.isArray(source.skinConditions) ? source.skinConditions : [],
      skinRemarks: source.skinRemarks || {}
    };
  }

  function makeOximetryPoint(source = {}) {
    return {
      sao2: source.sao2 || "",
      pulse: source.pulse || ""
    };
  }

  function makePalliativeO2Test(source = {}) {
    return {
      flow: source.flow || "",
      rest: makeOximetryPoint(source.rest || {}),
      exertion: makeOximetryPoint(source.exertion || {}),
      recovery: makeOximetryPoint(source.recovery || {})
    };
  }

  function makeHomeO2Activity(name = "", custom = false, source = {}) {
    return {
      name: source.name || name,
      custom: !!(source.custom || custom),
      status: source.status || "",
      notCompletedReason: source.notCompletedReason || "",
      beginning: makeOximetryPoint(source.beginning || {}),
      dyspnea: source.dyspnea || "",
      immediate: makeOximetryPoint(source.immediate || {}),
      recovery: makeOximetryPoint(source.recovery || {}),
      assistance: source.assistance || ""
    };
  }

  function makeHomeO2ActivitySet(source = {}) {
    const sourceActivities = Array.isArray(source.activities) ? source.activities : [];
    const activities = BANK.homeO2DefaultActivities.map((name, index) => makeHomeO2Activity(name, false, sourceActivities[index] || {}));
    sourceActivities.slice(BANK.homeO2DefaultActivities.length).forEach((activity) => {
      activities.push(makeHomeO2Activity("", true, activity || {}));
    });
    return {
      rest: makeOximetryPoint(source.rest || {}),
      activities
    };
  }

  function makeHomeO2OximetryTest(source = {}) {
    const oxygen = normalizeHomeO2TestOxygen(source);
    return {
      oxygenMode: oxygen.mode,
      oxygenL: oxygen.litre,
      ...makeHomeO2ActivitySet(source)
    };
  }

  function normalizeHomeO2TestOxygen(source = {}) {
    const mode = BANK.homeO2OximetryOxygenModes.includes(source.oxygenMode) ? source.oxygenMode : "";
    if (mode === "Room Air") return { mode, litre: "" };
    if (mode === "O2") return { mode, litre: source.oxygenL || "" };
    const legacyText = homeO2LegacyOxygenText(source);
    if (/room air/i.test(legacyText)) return { mode: "Room Air", litre: "" };
    if (legacyText && /\b(o2|oxygen)\b/i.test(legacyText)) return { mode: "O2", litre: extractHomeO2Litre(legacyText) };
    if (legacyText && extractHomeO2Litre(legacyText)) return { mode: "O2", litre: extractHomeO2Litre(legacyText) };
    return { mode: "", litre: "" };
  }

  function homeO2LegacyOxygenText(source = {}) {
    const typed = String(source.oxygenUse || source.label || "").trim();
    if (typed) return typed;
    const flow = String(source.flow || "").trim();
    return flow;
  }

  function extractHomeO2Litre(value) {
    const text = String(value || "").trim();
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? match[1] : "";
  }

  function normalizeHomeO2OximetryModes(source = {}) {
    const savedModes = Array.isArray(source.oxygenModes) ? source.oxygenModes : [];
    const validModes = savedModes.filter((mode) => BANK.homeO2OximetryOxygenModes.includes(mode));
    if (validModes.length) return [...new Set(validModes)];
    const derived = [];
    const addMode = (mode) => {
      if (BANK.homeO2OximetryOxygenModes.includes(mode) && !derived.includes(mode)) derived.push(mode);
    };
    (Array.isArray(source.tests) ? source.tests : []).forEach((test) => {
      const oxygen = normalizeHomeO2TestOxygen(test || {});
      addMode(oxygen.mode);
    });
    if (homeO2TaskSetHasInput(source.roomAir)) addMode("Room Air");
    (Array.isArray(source.oxygenFlows) ? source.oxygenFlows : []).forEach((flow) => {
      const flowText = String(flow && flow.flow || "").trim();
      if (homeO2TaskSetHasInput(flow) || (flowText && flowText !== "1")) addMode("O2");
    });
    return derived;
  }

  function makeHomeO2OximetryTests(source = {}) {
    const rawTests = Array.isArray(source.tests) ? source.tests : [];
    if (rawTests.some(homeO2TaskSetHasInput)) return rawTests.map((test) => makeHomeO2OximetryTest(test || {}));
    const legacyTests = [];
    if (homeO2TaskSetHasInput(source.roomAir)) {
      legacyTests.push({ oxygenUse: "Room Air", ...(source.roomAir || {}) });
    }
    (Array.isArray(source.oxygenFlows) ? source.oxygenFlows : []).forEach((flow) => {
      const flowText = String(flow && flow.flow || "").trim();
      if (homeO2TaskSetHasInput(flow) || (flowText && flowText !== "1")) {
        legacyTests.push(flow || {});
      }
    });
    return legacyTests.map((test) => makeHomeO2OximetryTest(test || {}));
  }

  function ensureHomeO2OximetryTestsForModes(oximetry = {}) {
    oximetry.tests = Array.isArray(oximetry.tests) ? oximetry.tests : [];
    oximetry.oxygenModes = Array.isArray(oximetry.oxygenModes)
      ? oximetry.oxygenModes.filter((mode) => BANK.homeO2OximetryOxygenModes.includes(mode))
      : [];
    if (!oximetry.done) return;
    if (oximetry.oxygenModes.includes("Room Air") && !oximetry.tests.some((test) => test.oxygenMode === "Room Air")) {
      oximetry.tests.unshift(makeHomeO2OximetryTest({ oxygenMode: "Room Air" }));
    }
    if (oximetry.oxygenModes.includes("O2") && !oximetry.tests.some((test) => test.oxygenMode === "O2")) {
      oximetry.tests.push(makeHomeO2OximetryTest({ oxygenMode: "O2" }));
    }
  }

  function homeO2VisibleOximetryTests(oximetry = {}, mode = "") {
    if (!oximetry.done) return [];
    const selectedModes = Array.isArray(oximetry.oxygenModes) ? oximetry.oxygenModes : [];
    if (!selectedModes.length) return [];
    const indexedTests = (Array.isArray(oximetry.tests) ? oximetry.tests : []).map((test, index) => ({ test, index }));
    return indexedTests.filter(({ test }) => {
      if (mode) return selectedModes.includes(mode) && test.oxygenMode === mode;
      return selectedModes.includes(test.oxygenMode);
    });
  }

  function normalizeHomeO2AdlSelection(selection) {
    const order = BANK.homeO2AdlAssistanceOrder;
    const values = (Array.isArray(selection) ? selection : []).filter((item) => order.includes(item));
    if (!values.length || values.includes("Not Applicable")) return ["Not Applicable"];
    const ordered = values
      .filter((item, index) => values.indexOf(item) === index)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (ordered.length === 1) return ordered;
    if (ordered.length === 2 && Math.abs(order.indexOf(ordered[0]) - order.indexOf(ordered[1])) === 1) return ordered;
    return ordered.slice(-1);
  }

  function normalizeHomeO2ConsentFunding(value) {
    const rawValues = Array.isArray(value) ? value : value ? [value] : [];
    return rawValues
      .filter((item, index) => BANK.homeO2ConsentFundingOptions.includes(item) && rawValues.indexOf(item) === index)
      .sort((a, b) => BANK.homeO2ConsentFundingOptions.indexOf(a) - BANK.homeO2ConsentFundingOptions.indexOf(b));
  }

  function normalizeHomeO2DecisionDeviceChoices(source = {}, legacySource = {}) {
    const rawValues = Array.isArray(source.deviceChoices) ? source.deviceChoices : [];
    const values = rawValues.filter((item) => BANK.homeO2DecisionDeviceOptions.includes(item));
    if (source.portableOxygenConcentrator || legacySource.portableOxygenConcentrator) values.push("Portable Oxygen Concentrator");
    if (source.conservingDevice || legacySource.conservingDevice) values.push("Conserving Device");
    if (source.accessoriesNeeded || legacySource.accessoriesNeeded || source.accessories || legacySource.accessories) values.push("Accessories");
    return values
      .filter((item, index) => values.indexOf(item) === index)
      .sort((a, b) => BANK.homeO2DecisionDeviceOptions.indexOf(a) - BANK.homeO2DecisionDeviceOptions.indexOf(b));
  }

  function normalizeHomeO2AccessoryChoices(value) {
    const rawValues = Array.isArray(value) ? value : value ? ["Others"] : [];
    return rawValues
      .filter((item, index) => BANK.homeO2AccessoryOptions.includes(item) && rawValues.indexOf(item) === index)
      .sort((a, b) => BANK.homeO2AccessoryOptions.indexOf(a) - BANK.homeO2AccessoryOptions.indexOf(b));
  }

  function normalizeHomeO2NasalCannulaLengths(value) {
    const rawValues = Array.isArray(value) ? value : value ? [value] : [];
    return rawValues
      .filter((item, index) => BANK.homeO2NasalCannulaLengthOptions.includes(item) && rawValues.indexOf(item) === index)
      .sort((a, b) => BANK.homeO2NasalCannulaLengthOptions.indexOf(a) - BANK.homeO2NasalCannulaLengthOptions.indexOf(b));
  }

  function normalizeHomeO2TreatmentChoices(value) {
    const valid = BANK.homeO2TreatmentOptions.map((option) => typeof option === "string" ? option : option.value);
    const rawValues = Array.isArray(value) ? value : [];
    return rawValues.map((item) => item === HOME_O2_HAGO_TREATMENT_LEGACY || item === HOME_O2_HAGO_SUMMARY_LABEL ? HOME_O2_HAGO_TREATMENT : item)
      .filter((item, index, values) => valid.includes(item) && values.indexOf(item) === index);
  }

  function normalizeHomeO2TreatmentPlan(value) {
    const valid = BANK.homeO2TreatmentPlanOptions.map((option) => typeof option === "string" ? option : option.value);
    const rawValues = Array.isArray(value) ? value : [];
    return rawValues.map((item) => item === "Pending Home O2 education" ? "Home O2 education" : item)
      .filter((item, index, values) => valid.includes(item) && values.indexOf(item) === index);
  }

  function normalizeHomeO2RegimeOption(regime = {}) {
    const option = regime.option === "Flow regime"
      ? "Home O2 indicated"
      : regime.option === "Pending after oximetry test completed"
        ? "Pending further oximetry test"
        : regime.option || "";
    return BANK.homeO2OxygenRegimeOptions.some((item) => item.value === option) ? option : "";
  }

  function normalizeHomeO2OverallAdl(value) {
    const values = (Array.isArray(value) ? value : []).filter((item) => BANK.assistanceLevels.includes(item));
    return values
      .filter((item, index) => values.indexOf(item) === index)
      .sort((a, b) => BANK.assistanceLevels.indexOf(a) - BANK.assistanceLevels.indexOf(b));
  }

  function makeHomeO2AssessmentOximetrySet(source = {}) {
    const firstActivity = (Array.isArray(source.activities) ? source.activities : []).find(homeO2ActivityHasInput) || {};
    const status = source.status || firstActivity.status || "Completed";
    return {
      flow: source.flow || source.oxygenL || "",
      status,
      notCompletedReason: source.notCompletedReason || firstActivity.notCompletedReason || "",
      adlTask: source.adlTask || firstActivity.name || "",
      sob: source.sob || firstActivity.sob || firstActivity.dyspnea || "",
      rest: makeOximetryPoint(source.rest || {}),
      exertion: makeOximetryPoint(source.exertion || source.immediate || firstActivity.immediate || {}),
      recovery: makeOximetryPoint(source.recovery || firstActivity.recovery || {})
    };
  }

  function homeO2AssessmentSetHasInput(set) {
    return !!(set && (
      set.flow ||
      set.status && set.status !== "Completed" ||
      set.notCompletedReason ||
      set.adlTask ||
      set.sob ||
      hasOximetrySetInput({
        rest: set.rest,
        exertion: set.exertion,
        recovery: set.recovery
      })
    ));
  }

  function normalizeHomeO2AssessmentOximetryModes(source = {}) {
    const savedModes = Array.isArray(source.oxygenModes) ? source.oxygenModes : [];
    const modes = savedModes.filter((mode) => BANK.homeO2OximetryOxygenModes.includes(mode));
    if (modes.length) return [...new Set(modes)];
    const derived = [];
    const addMode = (mode) => {
      if (BANK.homeO2OximetryOxygenModes.includes(mode) && !derived.includes(mode)) derived.push(mode);
    };
    if (homeO2AssessmentSetHasInput(source.roomAir) || homeO2TaskSetHasInput(source.roomAir)) addMode("Room Air");
    if ((Array.isArray(source.o2Tests) ? source.o2Tests : []).some(homeO2AssessmentSetHasInput)) addMode("O2");
    (Array.isArray(source.tests) ? source.tests : []).forEach((test) => addMode(normalizeHomeO2TestOxygen(test || {}).mode));
    (Array.isArray(source.oxygenFlows) ? source.oxygenFlows : []).forEach((flow) => {
      if (homeO2AssessmentSetHasInput(flow) || homeO2TaskSetHasInput(flow)) addMode("O2");
    });
    return derived;
  }

  function makeHomeO2AssessmentO2Tests(source = {}) {
    const o2Tests = Array.isArray(source.o2Tests) ? source.o2Tests : [];
    if (o2Tests.length) return o2Tests.map((test) => makeHomeO2AssessmentOximetrySet(test || {}));
    const legacyTests = (Array.isArray(source.tests) ? source.tests : [])
      .filter((test) => normalizeHomeO2TestOxygen(test || {}).mode === "O2")
      .map((test) => makeHomeO2AssessmentOximetrySet(test || {}));
    if (legacyTests.length) return legacyTests;
    const legacyFlows = (Array.isArray(source.oxygenFlows) ? source.oxygenFlows : []).map((flow) => makeHomeO2AssessmentOximetrySet(flow || {}));
    return legacyFlows.filter(homeO2AssessmentSetHasInput);
  }

  function ensureHomeO2AssessmentOximetryForModes(oximetry = {}) {
    oximetry.oxygenModes = Array.isArray(oximetry.oxygenModes)
      ? oximetry.oxygenModes.filter((mode) => BANK.homeO2OximetryOxygenModes.includes(mode))
      : [];
    oximetry.o2Tests = Array.isArray(oximetry.o2Tests) ? oximetry.o2Tests : [];
    if (oximetry.done && oximetry.oxygenModes.includes("O2") && !oximetry.o2Tests.length) {
      oximetry.o2Tests.push(makeHomeO2AssessmentOximetrySet());
    }
  }

  function makeHomeO2Data(source = {}) {
    const oximetrySource = source.oximetry || {};
    const remarksSource = source.remarks || {};
    const decisionSource = source.decision || {};
    const data = {
      overallAdl: normalizeHomeO2OverallAdl(source.overallAdl || source.overallAdlStatus),
      adlStatus: BANK.homeO2AdlItems.reduce((status, item) => {
        status[item.key] = normalizeHomeO2AdlSelection(source.adlStatus && source.adlStatus[item.key]);
        return status;
      }, {}),
      oximetry: {
        done: oximetrySource.done == null ? true : !!oximetrySource.done,
        oxygenModes: normalizeHomeO2AssessmentOximetryModes(oximetrySource),
        roomAir: makeHomeO2AssessmentOximetrySet(oximetrySource.roomAir || (oximetrySource.tests || []).find((test) => normalizeHomeO2TestOxygen(test || {}).mode === "Room Air") || {}),
        o2Tests: makeHomeO2AssessmentO2Tests(oximetrySource),
        remarks: oximetrySource.remarks || "",
        regime: {
          option: normalizeHomeO2RegimeOption(oximetrySource.regime || {}),
          sleep: oximetrySource.regime && oximetrySource.regime.sleep || "",
          rest: oximetrySource.regime && oximetrySource.regime.rest || "",
          exertion: oximetrySource.regime && oximetrySource.regime.exertion || ""
        }
      },
      problem: {
        choices: Array.isArray(source.problem && source.problem.choices) ? source.problem.choices : []
      },
      treatment: {
        choices: normalizeHomeO2TreatmentChoices(source.treatment && source.treatment.choices),
        educationStatus: source.treatment && source.treatment.educationStatus || "",
        educationDate: source.treatment && source.treatment.educationDate || remarksSource.homeO2EducationDate || "",
        other: source.treatment && source.treatment.other || "",
        plan: normalizeHomeO2TreatmentPlan(source.treatment && source.treatment.plan),
        pendingEducationDate: source.treatment && source.treatment.pendingEducationDate || ""
      },
      remarks: {
        breathingEducationDate: remarksSource.breathingEducationDate || "",
        haGoDate: remarksSource.haGoDate || "",
        homeO2EducationDate: remarksSource.homeO2EducationDate || ""
      },
      decision: {
        supplier: decisionSource.supplier || remarksSource.supplier || "",
        model: decisionSource.model || remarksSource.model || "",
        cylinderSize: BANK.homeO2CylinderSizeOptions.includes(decisionSource.cylinderSize || remarksSource.cylinderSize) ? decisionSource.cylinderSize || remarksSource.cylinderSize : "",
        cylinderNumber: decisionSource.cylinderNumber || remarksSource.cylinderNumber || "",
        deviceChoices: normalizeHomeO2DecisionDeviceChoices(decisionSource, remarksSource),
        portableOxygenConcentratorModel: decisionSource.portableOxygenConcentratorModel || "",
        conservingDeviceModel: decisionSource.conservingDeviceModel || "",
        accessories: normalizeHomeO2AccessoryChoices(decisionSource.accessories || remarksSource.accessories),
        nasalCannulaLengths: normalizeHomeO2NasalCannulaLengths(decisionSource.nasalCannulaLengths),
        accessoryOther: decisionSource.accessoryOther || (typeof (decisionSource.accessories || remarksSource.accessories) === "string" ? decisionSource.accessories || remarksSource.accessories : ""),
        deliveryStatus: BANK.homeO2DeliveryStatusOptions.includes(decisionSource.deliveryStatus) ? decisionSource.deliveryStatus : "",
        deliveryDate: decisionSource.deliveryDate || "",
        consentSignedBy: BANK.homeO2ConsentSignatoryOptions.includes(decisionSource.consentSignedBy || remarksSource.consentSignedBy) ? decisionSource.consentSignedBy || remarksSource.consentSignedBy : "",
        consentSignedByOther: decisionSource.consentSignedByOther || remarksSource.consentSignedByOther || "",
        consentFunding: normalizeHomeO2ConsentFunding(decisionSource.consentFunding || remarksSource.consentFunding)
      }
    };
    ensureHomeO2AssessmentOximetryForModes(data.oximetry);
    return data;
  }

  function makeFratChecklistState() {
    return BANK.fratChecklist.reduce((state, item) => {
      state[item.key] = "No";
      return state;
    }, {});
  }

  function makeHdrsState() {
    return {
      applicable: false,
      mbi: "",
      moca: "",
      aphasiaNoCognitiveDysfunction: false,
      scores: BANK.hdrsItems.reduce((scores, item) => {
        scores[item.key] = "";
        return scores;
      }, {}),
      remarks: BANK.hdrsItems.reduce((remarks, item) => {
        remarks[item.key] = "";
        return remarks;
      }, {})
    };
  }

  function makeFallIncident(source = {}) {
    return {
      period: source.period || "",
      location: source.location || "",
      reason: source.reason || "",
      reasons: Array.isArray(source.reasons) ? source.reasons : source.reason ? [source.reason] : [],
      reasonOther: source.reasonOther || ""
    };
  }

  function normalizeFratChecklistStatus(status) {
    return status === "Unknown" ? "Not Test" : status || "No";
  }

  function blankData() {
    return {
      vitals: {
        bpSys: "",
        bpDia: "",
        pulse: "",
        spo2: "",
        oxygenMode: "Room Air",
        oxygenL: "",
        fio2: "",
        others: ""
      },
      premorbid: {
        limited: false,
        basic: { choices: [], remarks: {} },
        walk: { status: "", aid: "", aidOther: "", remarks: "" },
        outdoor: { status: "", aid: "", aidOther: "", remarks: "" },
        iadl: "",
        occupationType: "",
        occupation: "",
        cognitive: { unremarkable: false, choices: [], remarks: "" },
        behavioral: { status: "", remarks: "" }
      },
      social: {
        limited: false,
        living: { choices: [], remarks: {} },
        mainCarer: "",
        homeEnv: "",
        homeEnvRemark: "",
        bathing: [],
        bathBy: "",
        bathByRemark: "",
        financial: [],
        socialServices: { choices: [], remarks: {}, homeHelp: [], homeHelpRemarks: {} },
        assistiveDevices: { choices: [], remarks: {} }
      },
      mental: {
        gcs: { e: "", v: "", m: "" },
        consciousness: { choices: [], others: "" },
          command: [],
        orientation: {
          unable: false,
          notAssessedHome: false,
          items: makeOrientationItems()
        },
        cognitive: {
          enabled: false,
          amt: { unable: false, directScore: "", answers: makeAmtAnswers() },
          cdtDone: false,
          cdtUnable: false,
          cdt: "",
          moca: {
            done: false,
            total: "",
            ageRange: "",
            education: "",
            percentile: "",
            subscales: {
              visualExecutive: "",
              naming: "",
              attention: "",
              language: "",
              abstraction: "",
              delayedRecall: "",
              orientation: ""
            }
          },
          impression: ""
        },
        mood: { choices: [], other: "", gdsPerformed: false, gdsAnswers: {} },
        speech: "",
        speechOther: ""
      },
      physical: {
        complaint: "",
        powerGroup: makePowerGroupState(),
        balance: {
          sitting: { pending: false, pendingReason: "", levels: [] },
          standing: { pending: false, pendingReason: "", levels: [] },
          notTestReason: ""
        },
        transfer: {
          lyeToSit: { pending: false, pendingReason: "", levels: [] },
          sitToStand: { pending: false, pendingReason: "", levels: [] },
          ambulation: { pending: false, pendingReason: "", levels: [], aidRemark: "" },
          notTestReason: ""
        },
        visual: { status: "", side: "" },
        hearing: { status: "", side: "" },
        pressure: { status: "", site: "" },
        contracture: { status: "", site: "" },
        otherInfo: "",
        functionalBalance: {
          notApplicable: false,
          singleLegLeft: "",
          singleLegRight: "",
          tug: "",
          reachTrial1: "",
          reachTrial2: ""
        }
      },
      functional: {
        mobilityMode: "mobility",
        bi: makeBiState(),
        overall: [],
        pps: [],
        impression: "",
        carerInterview: {
          date: "",
          carer: "",
          phone: "",
          topics: [],
          remarks: {},
          done: false
        },
        showInterpretation: false,
        lawton: { scores: {}, showInterpretation: false, notTest: false }
      },
      fall: {
        risk: "",
        level: "",
        factors: [],
        factorOther: "",
        frat: {
          scores: {
            recentFall: "",
            medications: "",
            psychological: "",
            cognitive: ""
          },
          automaticHigh: [],
          checklist: makeFratChecklistState(),
          riskFactorRemarks: "",
          overall: ""
        },
        hdrs: makeHdrsState(),
        history: "",
        frequency: "",
        incidents: [makeFallIncident()],
        incidentRemarks: ""
      },
      palliative: {
        symptoms: [],
        remarks: {},
        pain: { location: "", nrs: "", confidence: "", entries: [makePalliativePainEntry()] },
        fatigue: { activityTolerance: "", esas: "", confidence: "" },
        breathlessness: {
          activityTolerance: "",
          oximetryDone: false,
          oxygenModes: [],
          oxygenL: "",
          roomAir: {
            rest: { sao2: "", pulse: "" },
            exertion: { sao2: "", pulse: "" },
            recovery: { sao2: "", pulse: "" }
          },
          oxygen: {
            rest: { sao2: "", pulse: "" },
            exertion: { sao2: "", pulse: "" },
            recovery: { sao2: "", pulse: "" }
          },
          o2Tests: [makePalliativeO2Test()],
          nrsRest: "",
          nrsExertion: "",
          confidence: ""
        },
        edema: { site: "", circumference: "", entries: [makePalliativeEdemaEntry()] },
        pressureInjury: { site: "", skinConditions: [], skinRemarks: {}, entries: [makePalliativePressureInjuryEntry()] }
      },
      pressureInjury: makePressureInjuryData(),
      ted: makeTedData(),
      homeO2: makeHomeO2Data(),
      otComment: {
        majorObservation: "",
        adlRemark: "",
        iadlRemark: "",
        cognitiveRemark: "",
        freeText: ""
      },
      problem: {
        nilMode: "",
        patient: [],
        patientOther: "",
        environmental: [],
        environmentalOther: "",
        social: [],
        socialOther: "",
        others: false,
        othersText: ""
      },
      plan: {
        treatmentChoices: [],
        treatmentRemarks: {},
        treatmentPrograms: {},
        choices: [],
        remarks: {},
        programs: {}
      },
      recommendation: {
        choices: [],
        remarks: {}
      }
    };
  }

  function blankCase(wardBed, assessmentDate, formType) {
    const now = new Date().toISOString();
    return {
      id: uid(),
      wardBed,
      assessmentDate,
      formType: normalizeFormType(formType),
      copiedParts: {},
      noteEdits: {},
      noteEditBases: {},
      createdAt: now,
      updatedAt: now,
      data: blankData()
    };
  }

  function loadCases() {
    try {
      let stored = null;
      try {
        const primaryValue = localStorage.getItem(STORAGE_KEY);
        if (primaryValue !== null) {
          const parsed = JSON.parse(primaryValue);
          if (Array.isArray(parsed)) stored = parsed;
        }
      } catch (error) {
        // Recover from the backup below.
      }
      if (!stored) {
        try {
          const backup = JSON.parse(localStorage.getItem(STORAGE_BACKUP_KEY) || "[]");
          if (Array.isArray(backup)) {
            stored = backup;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
          }
        } catch (error) {
          // Use an empty case list below.
        }
      }
      if (!stored) stored = [];
      const normalized = stored.map((record) => {
        const data = mergeDeep(blankData(), record.data || {});
        normalizeStoredData(data, record.formType);
        return {
          ...record,
          formType: normalizeFormType(record.formType),
          copiedParts: record.copiedParts || {},
          noteEdits: record.noteEdits || {},
          noteEditBases: record.noteEditBases || {},
          data
        };
      });
      const now = Date.now();
      cases = normalized.filter((record) => {
        const savedTimes = [record.updatedAt, record.createdAt]
          .map((value) => new Date(value || "").getTime())
          .filter(Number.isFinite);
        return !savedTimes.length || now - Math.max(...savedTimes) < RETENTION_MS;
      });
      if (cases.length !== normalized.length) {
        saveCases();
        statusMessage = "Cases not saved for 7 days were auto-deleted.";
      } else {
        try {
          if (localStorage.getItem(STORAGE_BACKUP_KEY) === null) {
            localStorage.setItem(STORAGE_BACKUP_KEY, JSON.stringify(cases));
          }
        } catch (error) {
          // The primary case list remains available.
        }
      }
    } catch (error) {
      cases = [];
      statusMessage = "Local browser storage could not be read.";
    }
  }

  function normalizeStoredData(data, formType = "") {
    if (data.premorbid.behavioral.status === "Nil") data.premorbid.behavioral.status = "Unremarkable";
    const cognitive = data.premorbid.cognitive;
    if (!cognitive.choices.length) {
      if (cognitive.unremarkable) cognitive.choices.push("Unremarkable");
      if (cognitive.remarks) cognitive.choices.push("Others");
    }
    cognitive.unremarkable = false;
    Object.keys(data.functional.bi || {}).forEach((key) => {
      const item = data.functional.bi[key];
      if (item && item.score === "" && !item.notAssessed) item.notAssessed = true;
    });
    if (data.social) data.social.financial = [];
    if (data.problem && ["Nil if medically stable", "Overall nil if medically stable", "Overall nil if medicially stable", "Nil"].includes(data.problem.nilMode)) {
      data.problem.nilMode = "";
    }
    if (data.mental && data.mental.cognitive && data.mental.cognitive.amt && data.mental.cognitive.amt.unable == null) {
      data.mental.cognitive.amt.unable = false;
    }
    if (data.mental && !Array.isArray(data.mental.command)) {
      data.mental.command = data.mental.command ? [data.mental.command] : [];
    }
    if (data.mental && Array.isArray(data.mental.command)) {
      data.mental.command = normalizeCommandSelection(data.mental.command);
    }
    if (data.functional) data.functional.pps = normalizePpsSelection(data.functional.pps);
    if (data.physical && data.physical.balance) normalizeSharedPendingReason(data.physical.balance, ["sitting", "standing"]);
    if (data.physical && data.physical.transfer) normalizeSharedPendingReason(data.physical.transfer, ["lyeToSit", "sitToStand", "ambulation"]);
    if (data.mental && data.mental.cognitive && data.mental.cognitive.cdtDone == null) data.mental.cognitive.cdtDone = false;
    if (data.mental && data.mental.cognitive && data.mental.cognitive.moca && data.mental.cognitive.moca.done == null) {
      data.mental.cognitive.moca.done = false;
    }
    if (data.fall && data.fall.frat && data.fall.frat.checklist) {
      Object.keys(data.fall.frat.checklist).forEach((key) => {
        data.fall.frat.checklist[key] = normalizeFratChecklistStatus(data.fall.frat.checklist[key]);
      });
    }
    data.fall.incidents = normalizeEntryList(data.fall.incidents, [], makeFallIncident);
    data.fall.hdrs = mergeDeep(makeHdrsState(), data.fall.hdrs || {});
    if (data.fall.hdrs.moca == null) data.fall.hdrs.moca = "";
    if (!data.fall.hdrs.moca && data.fall.hdrs.mmse) data.fall.hdrs.moca = data.fall.hdrs.mmse;
    ensurePalliativeSymptomData(data);
    data.pressureInjury = mergeDeep(makePressureInjuryData(), data.pressureInjury || {});
    data.pressureInjury.skinSites = (Array.isArray(data.pressureInjury.skinSites) && data.pressureInjury.skinSites.length
      ? data.pressureInjury.skinSites
      : [makePressureInjurySite()]).map((site) => mergeDeep(makePressureInjurySite(), site || {}));
    data.pressureInjury.physical = mergeDeep(makePressureInjuryData().physical, data.pressureInjury.physical || {});
    data.pressureInjury.physical.powerGroup = mergeDeep(makePowerGroupState(), data.pressureInjury.physical.powerGroup || {});
    if (data.pressureInjury.management.devicePrescription === "Not indicated for pressure relieving device at the meantime") {
      data.pressureInjury.management.devicePrescription = "Suggest not for additional pressure relieving device at the moment";
    }
    if (data.pressureInjury.management.devicePrescription === "Suggest not for pressure relieving device at the moment") {
      data.pressureInjury.management.devicePrescription = "Suggest not for additional pressure relieving device at the moment";
    }
    normalizePressureTreatmentPlan(data.pressureInjury.management);
    data.ted = mergeDeep(makeTedData(), data.ted || {});
    data.ted.physical = mergeDeep(makeTedPhysicalData(), data.ted.physical || {});
    data.ted.physical.powerGroup = mergeDeep(makePowerGroupState(), data.ted.physical.powerGroup || {});
    data.homeO2 = makeHomeO2Data(data.homeO2 || {});
    data.functional.carerInterview.done = !!data.functional.carerInterview.done;
    syncMocaDerived(data);
    const choiceMap = {
      "Fall Prevention education": "Fall prevention education / training",
      "Fall Prevention training": "Fall prevention education / training",
      "Carer education": "Carer education / training",
      "Carer training": "Carer education / training",
      "Home safety recommendation": "Home Safety Recommendation / Home visit",
      "Home Visit": "Home Safety Recommendation / Home visit",
      "Not applicable, pending further assessment": "For medical stabilization"
    };
    const mapChoice = (value) => choiceMap[value] || value;
    const remapObject = (source = {}) => Object.entries(source).reduce((mapped, [key, value]) => {
      const nextKey = mapChoice(key);
      if (nextKey !== "1 to 2 days training in QEH" && !mapped[nextKey]) mapped[nextKey] = value;
      return mapped;
    }, {});
    data.plan.choices = [...new Set((data.plan.choices || []).map(mapChoice))].filter((value) => value !== "1 to 2 days training in QEH");
    data.plan.treatmentChoices = [...new Set(data.plan.treatmentChoices || [])];
    data.plan.treatmentRemarks = data.plan.treatmentRemarks || {};
    if (isEmergencyMedicineCase({ formType: normalizeFormType(formType) })) {
      data.plan.treatmentChoices = [...new Set(data.plan.treatmentChoices.map(emergencyTreatmentLabel))];
      data.plan.treatmentRemarks = Object.fromEntries(Object.entries(data.plan.treatmentRemarks).map(([key, value]) => [emergencyTreatmentLabel(key), value]));
    }
    data.recommendation.choices = [...new Set((data.recommendation.choices || []).map(mapChoice))].filter((value) => value !== "1 to 2 days training in QEH");
    data.plan.remarks = remapObject(data.plan.remarks);
    data.plan.programs = remapObject(data.plan.programs);
    data.recommendation.remarks = remapObject(data.recommendation.remarks);
  }

  function ensurePalliativeSymptomData(data) {
    const p = data.palliative = mergeDeep(blankData().palliative, data.palliative || {});
    const legacyPain = p.pain && (p.pain.location || p.pain.nrs || p.pain.confidence) ? [makePalliativePainEntry(p.pain)] : [];
    p.pain.entries = normalizeEntryList(p.pain.entries, legacyPain, makePalliativePainEntry);
    const legacyEdema = p.edema && (p.edema.site || p.edema.circumference) ? [makePalliativeEdemaEntry(p.edema)] : [];
    p.edema.entries = normalizeEntryList(p.edema.entries, legacyEdema, makePalliativeEdemaEntry);
    const legacyPressure = p.pressureInjury && (p.pressureInjury.site || (p.pressureInjury.skinConditions || []).length) ? [makePalliativePressureInjuryEntry(p.pressureInjury)] : [];
    p.pressureInjury.entries = normalizeEntryList(p.pressureInjury.entries, legacyPressure, makePalliativePressureInjuryEntry);
    const legacyO2 = p.breathlessness && (p.breathlessness.oxygenL || hasOximetrySetInput(p.breathlessness.oxygen)) ? [{
      flow: p.breathlessness.oxygenL,
      ...(p.breathlessness.oxygen || {})
    }] : [];
    p.breathlessness.o2Tests = normalizeEntryList(p.breathlessness.o2Tests, legacyO2, makePalliativeO2Test);
  }

  function normalizeEntryList(entries, fallback, factory) {
    const hasEntries = Array.isArray(entries) && entries.length;
    const source = hasEntries && (entryListHasInput(entries) || !fallback.length) ? entries : fallback;
    return (source.length ? source : [{}]).map((item) => factory(item || {}));
  }

  function normalizeSharedPendingReason(section, keys) {
    if (!section) return;
    if (!keys.some((key) => section[key] && section[key].pending)) {
      section.notTestReason = "";
      return;
    }
    if (!section.notTestReason) {
      const reasons = keys
        .map((key) => section[key] && section[key].pendingReason)
        .filter(Boolean)
        .filter((reason, index, list) => list.indexOf(reason) === index);
      section.notTestReason = reasons.join("; ");
    }
  }

  function normalizePressureTreatmentPlan(management) {
    const map = {
      "Bedside limbs maintenance": "Limb function maintenance",
      "ADL training": "ADL training / Mobility training"
    };
    management.treatmentItems = [...new Set((management.treatmentItems || []).map((item) => map[item] || item))];
    management.treatmentRemarks = Object.entries(management.treatmentRemarks || {}).reduce((remarks, [key, value]) => {
      remarks[map[key] || key] = value;
      return remarks;
    }, {});
  }

  function entryListHasInput(entries) {
    return entries.some((entry) => objectHasInput(entry));
  }

  function objectHasInput(value) {
    if (Array.isArray(value)) return value.some((item) => objectHasInput(item));
    if (value && typeof value === "object") return Object.values(value).some((item) => objectHasInput(item));
    return value !== "" && value != null && value !== false;
  }

  function palliativeEntryList(data, key) {
    if (key === "pain") return data.palliative.pain.entries;
    if (key === "edema") return data.palliative.edema.entries;
    if (key === "pressureInjury") return data.palliative.pressureInjury.entries;
    if (key === "o2Tests") return data.palliative.breathlessness.o2Tests;
    return null;
  }

  function makePalliativeEntry(key) {
    if (key === "pain") return makePalliativePainEntry();
    if (key === "edema") return makePalliativeEdemaEntry();
    if (key === "pressureInjury") return makePalliativePressureInjuryEntry();
    if (key === "o2Tests") return makePalliativeO2Test();
    return null;
  }

  function saveCases() {
    try {
      const stored = JSON.stringify(cases);
      localStorage.setItem(STORAGE_KEY, stored);
      try {
        localStorage.setItem(STORAGE_BACKUP_KEY, stored);
      } catch (error) {
        // The primary copy was saved successfully.
      }
    } catch (error) {
      statusMessage = "Local browser storage is full or unavailable.";
    }
  }

  function currentCase() {
    return cases.find((record) => record.id === currentCaseId);
  }

  function persistCurrent(message = AUTOSAVE_LABEL) {
    const record = currentCase();
    if (!record) return;
    record.updatedAt = new Date().toISOString();
    saveCases();
    statusMessage = message;
    refreshStatus();
  }

  function refreshStatus() {
    const node = app.querySelector("[data-status]");
    if (node) node.textContent = statusMessage || AUTOSAVE_LABEL;
  }

  function optionLabel(option) {
    return typeof option === "string" ? option : option.label || option.value;
  }

  function optionValue(option) {
    return typeof option === "string" ? option : option.value;
  }

  function selectedClass(path, value, mode) {
    const data = currentCase().data;
    const current = getPath(data, path);
    if (mode === "multi" || mode === "consecutive") return Array.isArray(current) && current.includes(value) ? " active" : "";
    return current === value ? " active" : "";
  }

  function choiceGroup(path, options, mode = "single", extra = {}) {
    const exclusiveValues = options.filter((option) => option.exclusive).map((option) => option.value);
    const order = extra.order ? ` data-order="${h(extra.order.join("|"))}"` : "";
    const classes = extra.classes ? ` ${extra.classes}` : "";
    return `<div class="choice-grid${classes}">
      ${options.map((option) => {
        const value = optionValue(option);
        const label = optionLabel(option);
        return `<button type="button" class="choice${selectedClass(path, value, mode)}" data-choice-path="${h(path)}" data-choice-value="${h(value)}" data-choice-mode="${h(mode)}" data-exclusive="${option.exclusive ? "true" : "false"}" data-exclusive-values="${h(exclusiveValues.join("|"))}"${order}>${h(label)}</button>`;
      }).join("")}
    </div>`;
  }

  function checkboxField(path, label, help = "") {
    const checked = getPath(currentCase().data, path) ? " checked" : "";
    return `<label class="inline-row"><input type="checkbox" data-bind="${h(path)}"${checked}> <span>${h(label)}</span></label>${help ? `<p class="mini-note">${h(help)}</p>` : ""}`;
  }

  function notTestPillField(path, label = "Not test") {
    const checked = getPath(currentCase().data, path) ? " checked" : "";
    return `<label class="not-test-pill"><input type="checkbox" data-bind="${h(path)}"${checked}> <span>${h(label)}</span></label>`;
  }

  function inputField(path, label, attrs = {}) {
    const value = getPath(currentCase().data, path) ?? "";
    const requestedType = attrs.type || "text";
    const isNumber = requestedType === "number";
    const type = isNumber ? "text" : requestedType;
    const id = fieldId(path);
    const placeholder = attrs.placeholder ? ` placeholder="${h(attrs.placeholder)}"` : "";
    const numberAttrs = isNumber ? ` inputmode="${attrs.decimal ? "decimal" : "numeric"}" data-number="true"${attrs.decimal ? ` data-decimal="true"` : ""}` : "";
    const min = attrs.min != null ? ` data-min="${h(attrs.min)}"` : "";
    const max = attrs.max != null ? ` data-max="${h(attrs.max)}"` : "";
    const step = attrs.step != null ? ` data-step="${h(attrs.step)}"` : "";
    const clamp = attrs.clamp ? ` data-clamp="true"` : "";
    const textAssist = type === "text" ? ` autocapitalize="none" autocorrect="off" spellcheck="false"` : "";
    const span = attrs.span ? " span-2" : "";
    const fieldClass = attrs.fieldClass ? ` ${h(attrs.fieldClass)}` : "";
    return `<div class="field${span}${fieldClass}">
      <label for="${h(id)}">${h(label)}</label>
      <input id="${h(id)}" type="${h(type)}" data-bind="${h(path)}" value="${h(value)}"${placeholder}${numberAttrs}${min}${max}${step}${clamp}${textAssist}>
    </div>`;
  }

  function bpField() {
    const value = formatBpInputValue(currentCase().data.vitals);
    const id = fieldId("vitals.bpCombined");
    return `<div class="field">
      <label for="${h(id)}">Systolic BP / Diastolic BP</label>
      <input id="${h(id)}" type="text" inputmode="text" data-bp-combined="true" value="${h(value)}" placeholder="e.g. 120/70" autocapitalize="none" autocorrect="off" spellcheck="false">
    </div>`;
  }

  function formatBpInputValue(vitals) {
    if (!vitals || (!vitals.bpSys && !vitals.bpDia)) return "";
    return `${vitals.bpSys || ""}${vitals.bpSys || vitals.bpDia ? "/" : ""}${vitals.bpDia || ""}`;
  }

  function syncBpInput(value, data) {
    const text = String(value || "").trim();
    if (!text) {
      data.vitals.bpSys = "";
      data.vitals.bpDia = "";
      return;
    }
    const slashParts = text.split(/[\/\\]/).map((part) => part.trim());
    if (slashParts.length > 1) {
      data.vitals.bpSys = slashParts[0] || "";
      data.vitals.bpDia = slashParts.slice(1).join("/").trim();
      return;
    }
    const numericParts = text.match(/\d+/g);
    if (numericParts && numericParts.length >= 2) {
      data.vitals.bpSys = numericParts[0];
      data.vitals.bpDia = numericParts[1];
      return;
    }
    data.vitals.bpSys = text;
    data.vitals.bpDia = "";
  }

  function textareaField(path, label, attrs = {}) {
    const value = getPath(currentCase().data, path) ?? "";
    const id = fieldId(path);
    const placeholder = attrs.placeholder ? ` placeholder="${h(attrs.placeholder)}"` : "";
    return `<div class="field ${attrs.span ? "span-2" : ""}">
      <label for="${h(id)}">${h(label)}</label>
      <textarea id="${h(id)}" data-bind="${h(path)}"${placeholder} autocapitalize="none" autocorrect="off" spellcheck="false">${h(value)}</textarea>
    </div>`;
  }

  function selectField(path, label, options, attrs = {}) {
    const value = getPath(currentCase().data, path) ?? "";
    const id = fieldId(path);
    const span = attrs.span ? " span-2" : "";
    return `<div class="field${span}">
      <label for="${h(id)}">${h(label)}</label>
      <select id="${h(id)}" data-bind="${h(path)}">
        <option value="">Select</option>
        ${options.map((option) => `<option value="${h(option)}"${value === option ? " selected" : ""}>${h(option)}</option>`).join("")}
      </select>
    </div>`;
  }

  function fieldId(path) {
    return `field-${String(path).replace(/[^a-z0-9_-]+/gi, "-")}`;
  }

  function choiceRemarkInputs(items, selectedPath, remarksPath) {
    const selected = getPath(currentCase().data, selectedPath) || [];
    return items
      .filter((item) => item.remark && selected.includes(item.value))
      .map((item) => inputField(`${remarksPath}.${item.value}`, `${optionLabel(item)} remarks`, { placeholder: item.remark === true ? "Remarks" : item.remark, span: true }))
      .join("");
  }

  function pressureSkinOverInputs(base, selected = []) {
    return selected
      .filter((item) => item !== "NAD" && item !== "Others")
      .map((item) => inputField(`${base}.skinRemarks.${item}`, "over", { placeholder: item, span: true }))
      .join("");
  }

  function homeHelpRemarkInputs() {
    const selected = currentCase().data.social.socialServices.homeHelp || [];
    return ["Meal on wheels", "Personal care", "Household", "Exercise"]
      .filter((item) => selected.includes(item))
      .map((item) => inputField(`social.socialServices.homeHelpRemarks.${item}`, `${item} remarks`, { placeholder: "Details", span: true }))
      .join("");
  }

  function sanitizeDecimalInput(value) {
    let cleaned = String(value || "").replace(/[^\d.]/g, "");
    const dotIndex = cleaned.indexOf(".");
    if (dotIndex >= 0) cleaned = `${cleaned.slice(0, dotIndex + 1)}${cleaned.slice(dotIndex + 1).replace(/\./g, "")}`;
    if (cleaned.startsWith(".")) cleaned = `0${cleaned}`;
    const parts = cleaned.split(".");
    if (parts[1] && parts[1].length > 1) cleaned = `${parts[0]}.${parts[1].slice(0, 1)}`;
    return cleaned;
  }

  function sanitizeGcsInput(value, max, special) {
    const text = String(value || "").trim().toUpperCase();
    if (!text) return "";
    const specialValue = String(special || "").toUpperCase();
    if (specialValue && (text === specialValue || text === specialValue[0])) return specialValue;
    const digit = text.replace(/[^\d]/g, "").slice(0, 1);
    if (!digit) return "";
    const number = Number(digit);
    const maximum = Number(max);
    return number >= 1 && number <= maximum ? digit : "";
  }

  function normalizeStepInput(value, target) {
    if (value === "" || value == null || Number.isNaN(Number(value))) return "";
    const min = target.dataset.min === undefined ? null : Number(target.dataset.min);
    const max = target.dataset.max === undefined ? null : Number(target.dataset.max);
    const step = target.dataset.step === undefined ? null : Number(target.dataset.step);
    let numeric = Number(value);
    if (max !== null && numeric > max) numeric = max;
    if (min !== null && numeric < min) numeric = min;
    if (step) {
      const base = min || 0;
      numeric = base + Math.round((numeric - base) / step) * step;
      numeric = Number(numeric.toFixed(4));
    }
    if (max !== null && numeric > max) numeric = max;
    if (min !== null && numeric < min) numeric = min;
    return Number.isInteger(numeric) ? String(numeric) : String(numeric);
  }

  function rangeOptions(start, end, step) {
    const values = [];
    for (let value = start; value <= end + 0.0001; value += step) {
      values.push(Number(value.toFixed(1)).toString());
    }
    return values;
  }

  function normalizePpsSelection(value) {
    const order = rangeOptions(10, 100, 10);
    const values = Array.isArray(value) ? value : value ? [value] : [];
    const normalized = values
      .map((item) => String(item))
      .filter((item) => order.includes(item));
    const sorted = normalized
      .filter((item, index) => normalized.indexOf(item) === index)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .slice(0, 2);
    if (sorted.length === 2 && Math.abs(order.indexOf(sorted[0]) - order.indexOf(sorted[1])) !== 1) return [sorted[1]];
    return sorted;
  }

  function formatPpsValue(value) {
    const selection = normalizePpsSelection(value);
    if (!selection.length) return "";
    return selection.length === 1 ? selection[0] : `${selection[0]}-${selection[1]}`;
  }

  function formatDate(iso) {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    if (!year || !month || !day) return iso;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(",", "");
  }

  function formatHistoryDate(iso) {
    if (!iso) return "";
    const [year, month, day] = iso.split("-");
    return year && month && day ? `${day}/${month}/${year}` : iso;
  }

  function parseDisplayDate(value) {
    const text = String(value || "").trim();
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) return text;
    const longMatch = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
    if (!longMatch) return "";
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.indexOf(longMatch[2].slice(0, 3).toLowerCase());
    if (monthIndex < 0) return "";
    const day = Number(longMatch[1]);
    if (day < 1 || day > 31) return "";
    return `${longMatch[3]}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function normalizeFormType(formType) {
    if (formType === "General Medical" || formType === "ADL Initial") return "[Medical] ADL Initial";
    if (formType === "TED" || formType === "[Medical] TED" || formType === "DVT prophylaxis" || formType === "[Medical] DVT prophylaxis") return "[Medical] DVT Prophylaxis";
    return formType || "[Medical] ADL Initial";
  }

  function splitFormType(formType) {
    const normalized = normalizeFormType(formType);
    const match = normalized.match(/^\[([^\]]+)\]\s*(.+)$/);
    return match ? { specialty: match[1], form: match[2], label: normalized } : { specialty: "", form: normalized, label: normalized };
  }

  function joinList(items) {
    const filtered = items.filter(Boolean);
    if (filtered.length <= 1) return filtered[0] || "";
    if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
    return `${filtered.slice(0, -1).join(", ")} and ${filtered[filtered.length - 1]}`;
  }

  function commaList(items) {
    return items.filter(Boolean).join(", ");
  }

  function lowerPhrase(text) {
    return String(text || "").toLowerCase();
  }

  function formatConsecutive(values) {
    if (!values || values.length === 0) return "";
    if (values.length === 1) return values[0];
    return `${values[0]} to ${values[1]}`;
  }

  function completionStats(record) {
    const previousId = currentCaseId;
    currentCaseId = record.id;
    const sections = sectionsFor(record);
    const completed = sections.reduce((sum, _section, index) => sum + (isSectionComplete(index) ? 1 : 0), 0);
    currentCaseId = previousId;
    return {
      completed,
      total: sections.length,
      percent: Math.round((completed / sections.length) * 100)
    };
  }

  function copiedCount(record) {
    return notePartKeysFor(record).filter((key) => record.copiedParts && record.copiedParts[key]).length;
  }

  function copiedStatusText(record) {
    const count = copiedCount(record);
    const total = notePartKeysFor(record).length;
    if (count === total) return "All copied";
    if (count > 0) return `${count}/${total} copied`;
    return "Not copied";
  }

  function notePartKeysFor(record = currentCase()) {
    if (isMbiCase(record)) return ["common"];
    if (isHomeO2AssessmentCase(record)) return NOTE_PART_KEYS.slice();
    if (isHomeO2DecisionCase(record)) return ["remarks"];
    const hasRemarks = isPressureInjuryCase(record) || isTedCase(record);
    return NOTE_PART_KEYS.filter((key) => key !== "remarks" || hasRemarks);
  }

  function formToneClass(formType) {
    const index = Math.max(0, BANK.formTypes.indexOf(formType));
    return `tone-${(index % 6) + 1}`;
  }

  function classSlug(value) {
    return String(value || "general").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
  }

  function sectionTone(index) {
    return `tone-${(index % 9) + 1}`;
  }

  function isPalliativeCase(record = currentCase()) {
    return splitFormType(record && record.formType).form === "Palliative Care";
  }

  function isMbiCase(record = currentCase()) {
    return splitFormType(record && record.formType).form === "MBI";
  }

  function isFallAssessmentCase(record = currentCase()) {
    return splitFormType(record && record.formType).form === "Fall Assessment";
  }

  function isEmergencyMedicineCase(record = currentCase()) {
    return splitFormType(record && record.formType).form === "Emergency Medicine";
  }

  function recommendationsFor(record = currentCase()) {
    return BANK.recommendations.map((item) => isEmergencyMedicineCase(record) && item.value === "Short course of training in QEH"
      ? { ...item, value: "Continue 1-2 days ward-based training" }
      : item);
  }

  function isPressureInjuryCase(record = currentCase()) {
    return splitFormType(record && record.formType).form === "Pressure Injury";
  }

  function isTedCase(record = currentCase()) {
    const form = splitFormType(record && record.formType).form;
    return form === "DVT Prophylaxis" || form === "DVT prophylaxis" || form === "TED";
  }

  function isHomeO2Case(record = currentCase()) {
    return isHomeO2AssessmentCase(record) || isHomeO2DecisionCase(record);
  }

  function isHomeO2AssessmentCase(record = currentCase()) {
    const form = splitFormType(record && record.formType).form;
    return form === "Home O2 Assessment" || form === "Home O2";
  }

  function isHomeO2DecisionCase(record = currentCase()) {
    const form = splitFormType(record && record.formType).form;
    return form === "Home O2 Order" || form === "Home O2 Decision";
  }

  function sectionKeysFor(record = currentCase()) {
    if (isMbiCase(record)) return ["mbi"];
    if (isPressureInjuryCase(record)) return ["piMental", "piSkin", "piPhysical", "piProblem", "piPlan"];
    if (isTedCase(record)) return ["tedMental", "tedSkin", "tedPhysical", "tedRisk", "tedPlan"];
    if (isHomeO2AssessmentCase(record)) return ["homeO2SocialAdl", "homeO2Oximetry", "homeO2Problem", "homeO2Plan"];
    if (isHomeO2DecisionCase(record)) return ["homeO2Decision"];
    const keys = ["vitals", "social", "mental", "physical", "functional", "fall", "otComment", "problem", "plan"];
    return isPalliativeCase(record) ? [...keys.slice(0, 6), "symptoms", ...keys.slice(6)] : keys;
  }

  function sectionsFor(record = currentCase()) {
    const labels = {
      vitals: "Vital signs and Premorbid ADL",
      social: "Social History and Home Environment",
      mental: "Mental Function",
      physical: "Physical Assessment",
      functional: "Functional Assessment",
      mbi: "Modified Barthel Index",
      fall: "Fall Assessment",
      symptoms: "Signs and Symptoms",
      otComment: "OT comment",
      problem: "Problem identification",
      plan: "Treatment Plan and Recommendation",
      piMental: "Mental Function",
      piSkin: "Skin Condition",
      piPhysical: "Physical, mobility and function",
      piProblem: "Problem",
      piPlan: "Management and Treatment plan",
      tedMental: "Mental Function",
      tedSkin: "Skin Condition",
      tedPhysical: "Physical and Function",
      tedRisk: "Thrombosis Risk Checklist",
      tedPlan: "Management and Plan",
      homeO2SocialAdl: "Social History and ADL Status",
      homeO2Oximetry: "Oximetry test",
      homeO2Problem: "Problem Identification",
      homeO2Plan: "Treatment Plan",
      homeO2Decision: "Home O2 Order"
    };
    return sectionKeysFor(record).map((key) => labels[key]);
  }

  function treatmentPlanOptions(record = currentCase()) {
    return BANK.treatmentPlan.filter((item) =>
      (!item.palliativeOnly || isPalliativeCase(record)) &&
      (!item.fallOnly || isFallAssessmentCase(record))
    );
  }

  function emergencyTreatmentLabel(value) {
    return ({
      "Basic ADL Training": "ADL Training",
      "Basic ADL maintenance": "ADL maintenance",
      "Cognitive training": "Cognitive Training",
      "Orientation training": "Orientation Training",
      "Home Safety Recommendation / Home visit": "Home Safety Recommendation",
      "Other": "Others"
    })[value] || value;
  }

  function completedTreatmentOptions(record = currentCase()) {
    const existing = BANK.completedTreatmentOptions.filter((item) => !item.fallOnly || isFallAssessmentCase(record));
    if (!isEmergencyMedicineCase(record)) return existing;
    const options = [...existing, ...treatmentPlanOptions(record).filter((item) => item.value !== "Further assessment if stable")];
    const unique = [...new Map(options.map((item) => {
      const value = emergencyTreatmentLabel(item.value);
      return [value, { ...item, value }];
    })).values()];
    const first = ["ADL Assessment done", "ADL Training", "ADL maintenance", "Cognitive Assessment done", "Cognitive Training", "Orientation Training"];
    return [...first.map((value) => unique.find((item) => item.value === value)), ...unique.filter((item) => !first.includes(item.value) && item.value !== "Others"), unique.find((item) => item.value === "Others")];
  }

  function patientFactorOptions(record = currentCase()) {
    return isFallAssessmentCase(record) ? BANK.fallPatientFactors : BANK.patientFactors;
  }

  function renderHome() {
    const sorted = [...cases].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    currentView = "home";
    app.innerHTML = `
      <main class="home-shell">
        <section class="home-header">
          <a class="main-home-link" href="../">Main Home</a>
          <p class="home-subtitle">Queen Elizabeth Hospital</p>
          <h1>OT E-Documentation Platform</h1>
        </section>
        <section class="home-grid">
          <div class="panel">
            <h2>Create New Case</h2>
            <div class="case-create-grid">
              <div class="field">
                <label for="newWard">Ward / Bed number / Initial</label>
                <input id="newWard" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="e.g. R7/12 LCM" value="${h(homeDraft.ward)}">
                ${homeReminder.ward ? `<p class="field-reminder">${h(homeReminder.ward)}</p>` : ""}
              </div>
              <div class="field">
                <div class="label-action-row">
                  <label for="newDate">Assessment Date</label>
                  <button type="button" class="text-btn" data-action="today">Today</button>
                </div>
                <input id="newDate" type="text" inputmode="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="01 May 2026" value="${h(homeDraft.date || formatDate(todayISO()))}">
              </div>
              <div class="field">
                <label for="newForm">Assessment Form</label>
                <select id="newForm">
                  ${renderAssessmentFormOptions()}
                </select>
                ${homeReminder.form ? `<p class="field-reminder">${h(homeReminder.form)}</p>` : ""}
              </div>
              <div class="field create-case-field">
                <label aria-hidden="true">&nbsp;</label>
                <button type="button" class="btn primary" data-action="create-case">Create</button>
              </div>
            </div>
          </div>
          <div class="panel">
            <h2>History</h2>
            ${sorted.length ? `<div class="case-list">${sorted.map(renderCaseCard).join("")}</div>` : `<p class="muted">No saved cases yet.</p>`}
          </div>
        </section>
      </main>`;
  }

  function renderAssessmentFormOptions() {
    return `<option value="">Select assessment form</option>${BANK.specialties.map((specialty) => `
      <optgroup label="${h(specialty)}">
        ${BANK.assessmentForms.map((form) => {
          const value = `[${specialty}] ${form}`;
          return `<option value="${h(value)}"${homeDraft.form === value ? " selected" : ""}>${h(value)}</option>`;
        }).join("")}
      </optgroup>`).join("")}`;
  }

  function renderCaseCard(record) {
    const tone = formToneClass(record.formType);
    const form = splitFormType(record.formType);
    return `<article class="case-card history-card ${tone}">
      <div class="history-row">
        <span class="history-pill specialty-pill specialty-${h(classSlug(form.specialty))}">${h(form.specialty || "General")}</span>
        <div class="history-main">
          <div class="history-name-row">
            <strong>${h(record.wardBed || "Untitled case")}</strong>
            <button type="button" class="history-rename-icon" data-action="rename-case-inline" data-case-id="${h(record.id)}" title="Rename case" aria-label="Rename case">&#9998;</button>
          </div>
          <div class="history-date">${h(formatDate(record.assessmentDate))}</div>
        </div>
        <span class="history-pill form-pill form-${h(classSlug(form.form))}">${h(form.form)}</span>
        <div class="history-actions">
          <button type="button" class="btn primary" data-action="open-case" data-case-id="${h(record.id)}">Open</button>
          <button type="button" class="btn secondary" data-action="export-case-pdf" data-case-id="${h(record.id)}" title="Export assessment as PDF">Export</button>
          <button type="button" class="btn danger" data-action="delete-case" data-case-id="${h(record.id)}">Delete</button>
        </div>
      </div>
    </article>`;
  }

  function renderWork() {
    const record = currentCase();
    if (!record) {
      currentCaseId = null;
      renderHome();
      return;
    }
    currentView = "form";
    const sections = sectionsFor(record);
    if (currentSection >= sections.length) currentSection = sections.length - 1;
    const sectionName = sections[currentSection];
    app.innerHTML = `
      <div class="work-shell">
        <header class="work-header">
          <div class="header-inner">
            <div class="case-heading">
              <h1>${h(record.formType)} · ${h(record.wardBed)}</h1>
              <p>Assessment Date ${h(formatDate(record.assessmentDate))} · Local browser storage only</p>
            </div>
            <div class="button-row">
              <button type="button" class="btn secondary" data-action="summary">Summary</button>
              <button type="button" class="btn secondary" data-action="home">Home</button>
            </div>
          </div>
          <nav class="step-strip" aria-label="Assessment sections" style="--section-count: ${h(sections.length)};">
            ${sections.map((name, index) => `<button type="button" class="step ${sectionTone(index)}${index === currentSection ? " active" : ""}${isSectionComplete(index) ? " complete" : ""}" data-action="go-section" data-section="${index}">${index + 1}. ${h(name)}</button>`).join("")}
          </nav>
        </header>
        <main class="work-main form-only">
          <section class="form-pane">
            <div class="section-panel ${sectionTone(currentSection)}">
              <div class="section-title">
                <div>
                  <h2>${currentSection + 1}. ${h(sectionName)}</h2>
                </div>
                <span class="status-pill${isSectionComplete(currentSection) ? " complete" : ""}">${isSectionComplete(currentSection) ? "Complete" : "In progress"}</span>
              </div>
              ${renderSection(currentSection)}
            </div>
          </section>
        </main>
        <footer class="work-footer">
          <div class="footer-inner">
            <span class="saved-state" data-status>${h(statusMessage || AUTOSAVE_LABEL)}</span>
            <div class="button-row">
              <button type="button" class="btn" data-action="previous" ${currentSection === 0 ? "disabled" : ""}>Previous</button>
              <button type="button" class="btn primary" data-action="save-case">Save</button>
              <button type="button" class="btn" data-action="next" ${currentSection === sections.length - 1 ? "disabled" : ""}>Next</button>
            </div>
          </div>
        </footer>
      </div>`;
  }

  function renderSummary() {
    const record = currentCase();
    if (!record) {
      currentCaseId = null;
      renderHome();
      return;
    }
    currentView = "summary";
    const note = generateNote(record);
    const stats = completionStats(record);
    app.innerHTML = `
      <div class="work-shell summary-shell">
        <header class="work-header">
          <div class="header-inner">
            <div class="case-heading">
              <h1>Generated Summary · ${h(record.wardBed)}</h1>
              <p>${h(record.formType)} · Input ${stats.percent}% · ${h(copiedStatusText(record))}</p>
            </div>
            <div class="button-row">
              <button type="button" class="btn secondary" data-action="back-form">Assessment</button>
              <button type="button" class="btn secondary" data-action="home">Home</button>
            </div>
          </div>
        </header>
        <main class="summary-main">
          ${renderNotePanel(note)}
        </main>
        <footer class="work-footer">
          <div class="footer-inner">
            <span class="saved-state" data-status>${h(statusMessage || AUTOSAVE_LABEL)}</span>
            <div class="button-row">
              <button type="button" class="btn primary" data-action="save-case">Save</button>
              <button type="button" class="btn secondary" data-action="back-form">Back to assessment</button>
            </div>
          </div>
        </footer>
      </div>`;
  }

  function renderNotePanel(note) {
    const record = currentCase();
    const beforeSync = record ? JSON.stringify({ noteEdits: record.noteEdits || {}, noteEditBases: record.noteEditBases || {} }) : "";
    syncEditedNotesWithGenerated(record);
    if (record && beforeSync !== JSON.stringify({ noteEdits: record.noteEdits || {}, noteEditBases: record.noteEditBases || {} })) saveCases();
    const editedNote = cleanSummaryNote({ ...note, ...(record.noteEdits || {}) });
    if (isMbiCase(record)) {
      return `<div class="note-box summary-box">
        <h2>Generated Documentation</h2>
        ${notePart("Common Assessment", "common", editedNote.common, "tone-1")}
      </div>`;
    }
    const parts = notePartKeysFor(record);
    return `<div class="note-box summary-box">
      <h2>Generated Documentation</h2>
      ${isEmergencyMedicineCase(record) && record.data.mental.mood.gdsPerformed && !calculateGds(record.data.mental.mood).complete ? `<p class="warning" role="status">${h(GDS_COMPLETION_REMINDER)}</p>` : ""}
      ${parts.includes("greenBox") ? notePart("Green box", "greenBox", editedNote.greenBox, "tone-7", { editable: true, maxLength: 250 }) : ""}
      ${parts.includes("common") ? notePart("Common Assessment", "common", editedNote.common, "tone-1") : ""}
      ${parts.includes("problem") ? notePart("Problem", "problem", editedNote.problem, "tone-8") : ""}
      ${parts.includes("remarks") ? notePart("Remarks", "remarks", editedNote.remarks, "tone-2") : ""}
      ${parts.includes("recommendation") ? notePart("Recommendation", "recommendation", editedNote.recommendation, "tone-9") : ""}
    </div>`;
  }

  function notePart(title, key, value, tone = "tone-1", options = {}) {
    const record = currentCase();
    const copied = record && record.copiedParts && record.copiedParts[key];
    const length = String(value || "").length;
    const limit = options.maxLength;
    const overLimit = limit && length > limit;
    const readonly = options.editable ? "" : " readonly";
    const limitAttr = limit ? ` data-max-length="${h(limit)}"` : "";
    return `<section class="note-part note-${h(key)} ${tone}">
      <div class="note-toolbar">
        <div>
          <h3>${h(title)}</h3>
          <p class="mini-note">${copied ? "Copied" : "Not copied yet"}</p>
        </div>
        <div class="button-row">
          <button type="button" class="btn secondary" data-action="edit-note" data-edit-target="${h(key)}">Edit</button>
          <button type="button" class="btn secondary" data-action="copy-note" data-copy-target="${h(key)}">Copy</button>
        </div>
      </div>
      <textarea class="note-output${options.editable ? " editing" : ""}"${readonly} data-note-key="${h(key)}"${limitAttr}>${h(value)}</textarea>
      ${limit ? `<p class="note-char-count${overLimit ? " over" : ""}" data-note-count="${h(key)}">${h(length)} / ${h(limit)} characters</p>` : ""}
      ${limit ? `<p class="error-text note-limit-warning${overLimit ? "" : " hidden"}" data-note-limit="${h(key)}">Green box exceeds ${h(limit)} characters (${h(length)}/${h(limit)}).</p>` : ""}
    </section>`;
  }

  function renderSection(index) {
    const renderers = {
      vitals: renderVitalsPremorbid,
      social: renderSocial,
      mental: renderMental,
      physical: renderPhysical,
      functional: renderFunctional,
      mbi: renderMbiAssessment,
      fall: renderFall,
      symptoms: renderPalliativeSymptoms,
      otComment: renderOtComment,
      problem: renderProblem,
      plan: renderPlanRecommendation,
      piMental: renderPressureInjuryMental,
      piSkin: renderPressureInjurySkin,
      piPhysical: renderPressureInjuryPhysical,
      piProblem: renderPressureInjuryProblem,
      piPlan: renderPressureInjuryPlan,
      tedMental: renderPressureInjuryMental,
      tedSkin: renderTedSkin,
      tedPhysical: renderTedPhysical,
      tedRisk: renderTedRisk,
      tedPlan: renderTedPlan,
      homeO2SocialAdl: renderHomeO2SocialAdl,
      homeO2Oximetry: renderHomeO2Oximetry,
      homeO2Problem: renderHomeO2Problem,
      homeO2Plan: renderHomeO2Plan,
      homeO2Decision: renderHomeO2Decision
    };
    return renderers[sectionKeysFor()[index]]();
  }

  function renderVitalsPremorbid() {
    const data = currentCase().data;
    const oxygenDetail = data.vitals.oxygenMode === "O2"
      ? inputField("vitals.oxygenL", "O2 flow L/min", { type: "number", decimal: true, min: 0.5, max: 15, step: 0.5, clamp: true, placeholder: "0.5-15", fieldClass: "vital-oxygen-detail" })
      : data.vitals.oxygenMode === "FiO2"
        ? inputField("vitals.fio2", "FiO2", { type: "number", decimal: true, min: 0.1, max: 0.9, step: 0.1, clamp: true, placeholder: "0.1-0.9", fieldClass: "vital-oxygen-detail" })
        : `<div class="field vital-oxygen-detail empty" aria-hidden="true"><label>&nbsp;</label><div class="empty-input-slot"></div></div>`;
    return `
      <div class="group">
        <h3>Vital signs</h3>
        <div class="vital-signs-row">
          ${bpField()}
          ${inputField("vitals.pulse", "Pulse", { type: "number", placeholder: "e.g. 82" })}
          ${inputField("vitals.spo2", "SpO2 %", { type: "number", min: 1, max: 100, clamp: true, placeholder: "1-100" })}
          <div class="field oxygen-use-field">
            <p class="label">Oxygen use</p>
            ${choiceGroup("vitals.oxygenMode", BANK.oxygenModes, "single", { classes: "two compact" })}
          </div>
          ${oxygenDetail}
        </div>
        <div class="field-grid remark-row">
          ${inputField("vitals.others", "Others", { span: true, placeholder: "Additional information" })}
        </div>
      </div>
      <div class="group">
        <h3>Premorbid ADL</h3>
        ${checkboxField("premorbid.limited", "Limited information from patient")}
        ${data.premorbid.limited ? "" : `
          <div class="group">
            <h3>Basic ADL</h3>
            ${choiceGroup("premorbid.basic.choices", BANK.basicAdlOptions, "multi")}
            <div class="field-grid remark-row">${choiceRemarkInputs(BANK.basicAdlOptions, "premorbid.basic.choices", "premorbid.basic.remarks")}</div>
          </div>
          <div class="group">
            <h3>Indoor mobility</h3>
            ${choiceGroup("premorbid.walk.status", BANK.premorbidStatuses, "single")}
            ${["Independent", "Supervision", "Assisted", "Dependent"].includes(data.premorbid.walk.status) ? `
              <div class="remark-row">
                <p class="label">Indoor aid</p>
                ${choiceGroup("premorbid.walk.aid", data.premorbid.walk.status === "Dependent" ? ["Chairbound", "Bedbound", "Others"] : BANK.mobilityAids, "single")}
                ${data.premorbid.walk.aid === "Others" ? `<div class="remark-row">${inputField("premorbid.walk.aidOther", "Other indoor aid", { span: true })}</div>` : ""}
              </div>
              <div class="remark-row">${inputField("premorbid.walk.remarks", "Indoor mobility remarks", { span: true, placeholder: "Remarks" })}</div>` : ""}
          </div>
          <div class="group">
            <h3>Outdoor mobility</h3>
            ${choiceGroup("premorbid.outdoor.status", BANK.premorbidStatuses, "single")}
            ${["Independent", "Supervision", "Assisted"].includes(data.premorbid.outdoor.status) ? `
              <div class="remark-row">
                <p class="label">Outdoor aid</p>
                ${choiceGroup("premorbid.outdoor.aid", BANK.outdoorAids, "single")}
                ${data.premorbid.outdoor.aid === "Others" ? `<div class="remark-row">${inputField("premorbid.outdoor.aidOther", "Other outdoor aid", { span: true })}</div>` : ""}
              </div>` : ""}
            ${["Independent", "Supervision", "Assisted", "Dependent"].includes(data.premorbid.outdoor.status) ? `<div class="remark-row">${inputField("premorbid.outdoor.remarks", "Outdoor mobility remarks", { span: true, placeholder: "Remarks" })}</div>` : ""}
          </div>
          <div class="group">
            <h3>IADL</h3>
            ${choiceGroup("premorbid.iadl", BANK.iadlStatuses, "single")}
          </div>
          <div class="group">
            <h3>Occupation</h3>
            ${choiceGroup("premorbid.occupationType", ["Occupation", "Retired"], "single", { classes: "two" })}
            ${data.premorbid.occupationType === "Occupation" ? `<div class="remark-row">${inputField("premorbid.occupation", "Occupation", { span: true })}</div>` : ""}
          </div>`}
      </div>
      ${isEmergencyMedicineCase() ? `
        <div class="group">
          <h3>Premorbid Cognitive Function</h3>
          ${choiceGroup("premorbid.cognitive.choices", ["Good", "Fair", "Poor", "Unremarkable", "Others"], "multi", { classes: "five" })}
          ${data.premorbid.cognitive.choices.includes("Others") ? `<div class="remark-row">${textareaField("premorbid.cognitive.remarks", "Cognitive Function remarks", { span: true, placeholder: "Cognitive function / additional remarks" })}</div>` : ""}
        </div>
        <div class="group">
          <h3>Premorbid Behavioral Problem</h3>
          ${choiceGroup("premorbid.behavioral.status", ["Unremarkable", "Yes"], "single", { classes: "two" })}
          ${data.premorbid.behavioral.status === "Yes" ? `<div class="remark-row">${textareaField("premorbid.behavioral.remarks", "Behavioral Problem details", { span: true })}</div>` : ""}
        </div>` : ""}`;
  }

  function renderSocial() {
    const data = currentCase().data;
    return `
      <div class="group">
        ${checkboxField("social.limited", "Limited information from patient")}
      </div>
      ${data.social.limited ? "" : `
        <div class="group">
          <h3>Living status</h3>
          ${choiceGroup("social.living.choices", BANK.livingOptions, "multi")}
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.livingOptions, "social.living.choices", "social.living.remarks")}</div>
          <div class="remark-row">${inputField("social.mainCarer", "Main carer", { placeholder: "Who?", span: true })}</div>
        </div>
        <div class="group">
          <h3>Home environment</h3>
          ${choiceGroup("social.homeEnv", BANK.homeEnvironment, "single")}
          ${["Non-direct lift landing", "No lift"].includes(data.social.homeEnv) ? `<div class="remark-row">${inputField("social.homeEnvRemark", data.social.homeEnv === "No lift" ? "Floor" : "FOS", { type: "number", span: true })}</div>` : ""}
        </div>
        <div class="group">
          <h3>Bathing</h3>
          ${choiceGroup("social.bathing", BANK.bathingFacilities, "multi", { classes: "three" })}
          <div class="remark-row">
            <p class="label">Bath by</p>
            ${choiceGroup("social.bathBy", BANK.bathBy, "single")}
            ${data.social.bathBy === "Sit on" ? `<div class="remark-row">${inputField("social.bathByRemark", "Sit on", { span: true })}</div>` : ""}
          </div>
        </div>
        <div class="group">
          <h3>Social service</h3>
          ${choiceGroup("social.socialServices.choices", BANK.socialServices, "multi")}
          ${data.social.socialServices.choices.includes("Home Help Service") ? `<div class="remark-row subtle-box"><p class="label">Home Help Service</p>${choiceGroup("social.socialServices.homeHelp", ["Meal on wheels", "Personal care", "Household", "Escort", "Exercise"], "multi", { classes: "five" })}</div>` : ""}
          <div class="field-grid remark-row">${homeHelpRemarkInputs()}</div>
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.socialServices, "social.socialServices.choices", "social.socialServices.remarks")}</div>
        </div>
        <div class="group">
          <h3>Assistive devices</h3>
          ${choiceGroup("social.assistiveDevices.choices", BANK.assistiveDevices, "multi")}
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.assistiveDevices, "social.assistiveDevices.choices", "social.assistiveDevices.remarks")}</div>
        </div>`}`;
  }

  function renderMental() {
    const data = currentCase().data;
    const amtScore = calculateAmt();
    const fallCase = isFallAssessmentCase();
    const emergency = isEmergencyMedicineCase();
    const cognitiveOpen = fallCase || emergency || data.mental.cognitive.enabled;
    const cdtUnable = emergency && data.mental.cognitive.cdtUnable;
    const showCdt = (!fallCase || data.mental.cognitive.cdtDone) && !cdtUnable;
    const showMoca = !(fallCase || emergency) || data.mental.cognitive.moca.done;
    const amtComplete = !emergency || hasCompletedAmt(data);
    const cdtScore = data.mental.cognitive.cdt;
    const cdtCutoff = cdtInterpretation(cdtScore);
    const moca = data.mental.cognitive.moca;
    const mocaAgeSelected = !!moca.ageRange;
    const mocaReady = !!(moca.ageRange && moca.education);
    const mocaTotal = mocaAutoTotal(moca);
    const mocaPercentile = mocaPercentileLabel(moca);
    const amtUnable = data.mental.cognitive.amt.unable;
    const notTestLabel = emergency ? "Not test" : "Unable to assess";
    return `
      <div class="group">
        <div class="gcs-row">
          <h3>GCS</h3>
          ${renderGcsFields()}
        </div>
      </div>
      <div class="group">
        <h3>Conscious state</h3>
        ${choiceGroup("mental.consciousness.choices", BANK.consciousness, "multi")}
        ${data.mental.consciousness.choices.includes("Others") ? `<div class="remark-row">${inputField("mental.consciousness.others", "Other conscious state", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Follow command</h3>
        ${choiceGroup("mental.command", BANK.commandFollowing, "consecutive", { classes: "four", order: BANK.commandFollowing })}
      </div>
      <div class="group">
        <h3>Orientation</h3>
        <p class="mini-note">Green = oriented by default. Tap once to mark red = disoriented. Home address can be marked not assessed.</p>
        ${checkboxField("mental.orientation.unable", "Unable to assess")}
        ${data.mental.orientation.unable ? "" : `
          <div class="orientation-grid remark-row">
            ${BANK.orientationItems.map((item) => renderOrientationChoice(item)).join("")}
          </div>
          `}
      </div>
      <div class="group">
        <h3>Speech</h3>
        ${choiceGroup("mental.speech", BANK.speechOptions, "single")}
        ${data.mental.speech === "Others" ? `<div class="remark-row">${inputField("mental.speechOther", "Speech remarks", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Cognitive Assessment</h3>
        ${emergency ? `<p class="mini-note">AMT and Clock Drawing Test are required. Complete each assessment or select Not test. MoCA is optional.</p>` : fallCase ? `<p class="mini-note">AMT can be entered as a FRAT Cognitive Status reference. Therapist selects the FRAT score manually. CDT and MoCA are optional.</p>` : checkboxField("mental.cognitive.enabled", "Cognitive Assessment performed")}
        ${cognitiveOpen ? `
          <div class="group cognitive-test-group">
            <div class="inline-row cognitive-title-row">
              <h3>AMT</h3>
              <span class="score-chip ${amtUnable || !amtComplete ? "mid" : amtScore > 6 ? "good" : amtScore === 6 ? "mid" : "low"}">${amtUnable ? notTestLabel : amtComplete ? `${amtScore} / 10` : "pending further assessment"}</span>
              ${amtUnable || !amtComplete ? "" : `<span class="score-chip mid">${h(amtCutoffStatus(amtScore))}</span>`}
              ${notTestPillField("mental.cognitive.amt.unable", notTestLabel)}
            </div>
            ${amtUnable ? `<p class="mini-note">AMT marked as ${h(notTestLabel)}.</p>` : `
              ${emergency ? `<div class="remark-row">
                <p class="label">Direct AMT score</p>
                ${choiceGroup("mental.cognitive.amt.directScore", Array.from({ length: 11 }, (_, score) => String(score)), "single", { classes: "eleven cdt-score-grid" })}
                <p class="mini-note">Tap a total score, or complete the items below. Selecting a total clears item scores; selecting an item returns to item scoring.</p>
              </div>` : ""}
              <div class="amt-grid">
              ${BANK.amtItems.map((item) => `
                <div class="subtle-box amt-card">
                  <p class="label">${h(item.label)}</p>
                  ${choiceGroup(`mental.cognitive.amt.answers.${item.key}`, ["0", "1"], "single", { classes: "two" })}
                </div>`).join("")}
            </div>`}
            ${amtUnable || !amtComplete ? "" : `<p class="mini-note">${h(amtInterpretation(amtScore))}</p>`}
          </div>
          <div class="group cognitive-test-group">
            <div class="inline-row cognitive-title-row">
              <h3>Clock Drawing Test</h3>
              ${emergency ? notTestPillField("mental.cognitive.cdtUnable", "Not test") : fallCase ? notTestPillField("mental.cognitive.cdtDone", "Done") : ""}
              ${showCdt ? `
                <span class="score-chip" data-cdt-score>${h(cdtScore === "" ? "__" : cdtScore)} / 10</span>
                <span class="score-chip mid" data-cdt-cutoff>${h(cdtCutoff || "Cut-off pending")}</span>` : ""}
            </div>
            ${cdtUnable ? `<p class="mini-note">Clock Drawing Test marked as Not test.</p>` : ""}
            ${showCdt ? `<div class="remark-row">
              ${choiceGroup("mental.cognitive.cdt", ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], "single", { classes: "eleven cdt-score-grid" })}
            </div>` : ""}
          </div>
          <div class="group cognitive-test-group">
            <div class="inline-row cognitive-title-row">
              <h3>MoCA</h3>
              ${fallCase || emergency ? notTestPillField("mental.cognitive.moca.done", "Done") : ""}
              ${showMoca ? `
                <span class="score-chip good" data-moca-total>Total score: ${h(mocaTotal === "" ? "__" : mocaTotal)} / 30</span>
                <span class="score-chip mid" data-moca-percentile>${h(mocaPercentile || "Cut-off pending")}</span>` : ""}
            </div>
            ${showMoca ? `<div class="remark-row">
              <p class="label">Age range</p>
              ${choiceGroup("mental.cognitive.moca.ageRange", BANK.mocaAgeRanges, "single", { classes: "three" })}
            </div>
            ${mocaAgeSelected ? `<div class="remark-row">
              <p class="label">Education level (years)</p>
              ${choiceGroup("mental.cognitive.moca.education", mocaEducationOptions(moca.ageRange), "single", { classes: moca.ageRange === ">=80" ? "two" : "five" })}
            </div>` : ""}
            ${mocaReady ? `
            ${mocaCutoffPills(moca)}
            <div class="moca-subscale-grid remark-row">
              ${BANK.mocaSubscales.map((item) => mocaSubscale(item.key, item.label, item.max)).join("")}
              ${textareaField("mental.cognitive.impression", "Impression", { span: true, placeholder: "Clinical impression" })}
            </div>` : `<p class="mini-note">Select age range and education level before entering MoCA subscores.</p>`}
            ` : ""}
          </div>` : ""}
      </div>
      ${emergency ? renderEmergencyMood() : ""}`;
  }

  function renderEmergencyMood() {
    const mood = currentCase().data.mental.mood;
    const gds = calculateGds(mood);
    return `<div class="group">
      <h3>Mood</h3>
      ${choiceGroup("mental.mood.choices", ["NAD", "Low", "Neutral", "Good", "Others"], "multi", { classes: "five" })}
      ${mood.choices.includes("Others") ? `<div class="remark-row">${textareaField("mental.mood.other", "Other mood details", { span: true })}</div>` : ""}
      <div class="group cognitive-test-group">
        <div class="inline-row cognitive-title-row">
          <h3>Geriatric Depression Scale (GDS)</h3>
          ${notTestPillField("mental.mood.gdsPerformed", "Performed")}
        </div>
        ${mood.gdsPerformed ? `<div class="gds-grid remark-row">
          ${BANK.gdsItems.map((item, index) => `<div class="subtle-box gds-card">
            <div class="assessment-item-copy"><p class="label">${index + 1}. ${h(item.label)}</p></div>
            ${choiceGroup(`mental.mood.gdsAnswers.${item.key}`, [{ value: "Yes", label: `是 (${item.yesScore}分)` }, { value: "No", label: `否 (${1 - item.yesScore}分)` }], "single", { classes: "two" })}
          </div>`).join("")}
        </div>
        ${gds.complete ? `<div class="bi-total" aria-live="polite">Total score: ${gds.total}/15</div>` : `<p class="warning" role="status">${h(GDS_COMPLETION_REMINDER)}</p>`}` : ""}
      </div>
    </div>`;
  }

  function calculateGds(mood) {
    const answered = BANK.gdsItems.filter((item) => ["Yes", "No"].includes(mood.gdsAnswers[item.key]));
    const total = answered.reduce((sum, item) => sum + (mood.gdsAnswers[item.key] === "Yes" ? item.yesScore : 1 - item.yesScore), 0);
    return { total, answered: answered.length, complete: answered.length === BANK.gdsItems.length };
  }

  function calculateLawton(lawton) {
    if (lawton.notTest) return { total: 0, answered: 0, complete: false, notTest: true };
    const answered = BANK.lawtonItems.filter((item) => ["0", "1", "2", "3"].includes(String(lawton.scores[item.key])));
    const total = answered.reduce((sum, item) => sum + Number(lawton.scores[item.key]), 0);
    return { total, answered: answered.length, complete: answered.length === BANK.lawtonItems.length };
  }

  function formatLawtonTotal(result) {
    return result.complete ? `${result.total}/27` : `>= ${result.total}/27, pending further assessment`;
  }

  function renderLawton() {
    const lawton = currentCase().data.functional.lawton;
    const result = calculateLawton(lawton);
    return `<div class="group">
      <div class="inline-row assessment-heading">
        <h3>Chinese Lawton Instrumental Activities of Daily Living Scale (4-point Scale)</h3>
        ${notTestPillField("functional.lawton.notTest", "Not test")}
        ${lawton.notTest ? "" : `<button type="button" class="btn secondary" data-action="toggle-lawton-interpretation" aria-expanded="${lawton.showInterpretation}">${lawton.showInterpretation ? "Hide Interpretation" : "Show Interpretation"}</button>`}
      </div>
      ${lawton.notTest ? `<p class="mini-note">Lawton: Not test</p>` : `
      ${lawton.showInterpretation ? `<div class="subtle-box remark-row"><p class="label">Score interpretation</p><ul class="score-interpretation">
        <li>0 = No assistance required at all</li>
        <li>1 = Can perform by self, but with difficulties during the process</li>
        <li>2 = Requires some assistance</li>
        <li>3 = Cannot perform by self at all</li>
      </ul></div>` : ""}
      <div class="lawton-grid remark-row">
        ${BANK.lawtonItems.map((item) => {
          const score = String(lawton.scores[item.key] ?? "");
          const assessed = ["0", "1", "2", "3"].includes(score);
          const selected = assessed ? score : "NA";
          return `<div class="bi-cell lawton-card">
            <div class="bi-cell-header">
              <div class="bi-title-wrap">
                <h4>${h(item.label)}</h4>
                <span class="bi-current-score">${assessed ? `${score}/3` : "Not assessed"}</span>
              </div>
            </div>
            <div class="bi-score-grid lawton-score-grid" role="group" aria-label="${h(item.label)} score">
              ${["NA", "0", "1", "2", "3"].map((value) => `<button type="button" class="choice bi-choice${selected === value ? " active" : ""}" data-choice-path="functional.lawton.scores.${h(item.key)}" data-choice-value="${value}" data-choice-mode="single" aria-pressed="${selected === value}"><strong>${value}</strong></button>`).join("")}
            </div>
            ${lawton.showInterpretation ? `<p class="mini-note lawton-item-interpretation">${h(item.interpretation)}</p>` : ""}
          </div>`;
        }).join("")}
      </div>
      <div class="bi-total" aria-live="polite">Total score: ${h(formatLawtonTotal(result))}</div>`}
    </div>`;
  }

  function renderGcsFields() {
    return [
      gcsInputField("mental.gcs.e", "E", 4, "NT"),
      gcsInputField("mental.gcs.v", "V", 5, "T"),
      gcsInputField("mental.gcs.m", "M", 6, "NT")
    ].join("");
  }

  function gcsInputField(path, label, max, special) {
    const value = getPath(currentCase().data, path) ?? "";
    const id = fieldId(path);
    return `<div class="field">
      <label for="${h(id)}">${h(label)}</label>
      <input id="${h(id)}" type="text" inputmode="text" data-bind="${h(path)}" value="${h(value)}" placeholder="Free text" autocapitalize="characters" autocorrect="off" spellcheck="false">
    </div>`;
  }

  function renderOrientationChoice(item) {
    const data = currentCase().data;
    const active = data.mental.orientation.items[item];
    const homeNotAssessed = item === "Home Address" && data.mental.orientation.notAssessedHome;
    if (item !== "Home Address") {
      return `<button type="button" class="choice ${active ? "green" : "red"}" data-action="toggle-orientation" data-orientation-item="${h(item)}">${h(item)}</button>`;
    }
    return `<div class="orientation-home">
      <button type="button" class="choice ${homeNotAssessed ? "muted-choice" : active ? "green" : "red"}" data-action="toggle-orientation" data-orientation-item="Home Address" ${homeNotAssessed ? "disabled" : ""}>Home Address</button>
      <button type="button" class="choice small-choice${homeNotAssessed ? " active" : ""}" data-action="toggle-home-not-assessed">Not assessed</button>
    </div>`;
  }

  function mocaSubscale(key, label, max) {
    const value = currentCase().data.mental.cognitive.moca.subscales[key] || "";
    const warning = numericOver(value, max);
    const id = fieldId(`mental.cognitive.moca.subscales.${key}`);
    return `<div class="field">
      <label for="${h(id)}">${h(label)} /${max}</label>
      <input id="${h(id)}" type="text" inputmode="numeric" data-number="true" data-min="0" data-max="${max}" data-clamp="true" data-bind="mental.cognitive.moca.subscales.${h(key)}" value="${h(value)}">
      ${warning ? `<span class="error-text">Maximum ${max}</span>` : ""}
    </div>`;
  }

  function renderPhysical() {
    const data = currentCase().data;
      const group = data.physical.powerGroup;
      return `
        <div class="group">
        ${textareaField("physical.complaint", "Major complaint", { span: true, placeholder: "Optional complaint" })}
      </div>
      <div class="group">
        <div class="part-title-row">
          <h3>Power, Tone and Coordination</h3>
          ${choiceGroup("physical.powerGroup.limbMovement", BANK.pressurePowerMovementOptions, "single", { classes: "two compact subtle-limb-movement" })}
        </div>
        ${group.limbMovement ? "" : `
          <div class="field-grid">
            ${inputField("physical.powerGroup.power.rightUl", "Right UL")}
            ${inputField("physical.powerGroup.power.leftUl", "Left UL")}
            ${inputField("physical.powerGroup.power.rightLl", "Right LL")}
            ${inputField("physical.powerGroup.power.leftLl", "Left LL")}
          </div>
          <div class="group">
            <h3>Tone</h3>
            ${choiceGroup("physical.powerGroup.tone", ["NAD", "Others"], "single", { classes: "two" })}
            ${group.tone === "Others" ? `<div class="remark-row">${inputField("physical.powerGroup.toneOther", "Tone remarks", { span: true })}</div>` : ""}
          </div>
          <div class="group">
            <h3>Coordination</h3>
            ${choiceGroup("physical.powerGroup.coordination", ["NAD", "Others"], "single", { classes: "two" })}
            ${group.coordination === "Others" ? `<div class="remark-row">${inputField("physical.powerGroup.coordinationOther", "Coordination remarks", { span: true })}</div>` : ""}
          </div>`}
      </div>
      <div class="group">
        <h3>Balance</h3>
        ${renderPendingConsecutive("Sitting", "physical.balance.sitting", BANK.balanceLevels, { hidePendingReason: true })}
        ${renderPendingConsecutive("Standing", "physical.balance.standing", BANK.balanceLevels, { hidePendingReason: true })}
        ${hasPendingGroup(data.physical.balance.sitting, data.physical.balance.standing) ? `<div class="remark-row">${inputField("physical.balance.notTestReason", "Not test reason", { span: true, placeholder: "Reason" })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Transfer and Ambulation</h3>
        ${renderPendingConsecutive("Lie to Sit", "physical.transfer.lyeToSit", BANK.assistanceLevels, { hidePendingReason: true })}
        ${renderPendingConsecutive("Sit to Stand", "physical.transfer.sitToStand", BANK.assistanceLevels, { hidePendingReason: true })}
        ${renderPendingConsecutive("Ambulation", "physical.transfer.ambulation", BANK.assistanceLevels, { aidRemark: true, hidePendingReason: true })}
        ${hasPendingGroup(data.physical.transfer.lyeToSit, data.physical.transfer.sitToStand, data.physical.transfer.ambulation) ? `<div class="remark-row">${inputField("physical.transfer.notTestReason", "Not test reason", { span: true, placeholder: "Reason" })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Sensory</h3>
        <div class="subtle-box">
          <p class="label">Visual</p>
          ${choiceGroup("physical.visual.status", ["Normal", "Impaired", "Blind", "Fail to assess"], "single")}
          ${data.physical.visual.status === "Impaired" ? `<div class="remark-row">${choiceGroup("physical.visual.side", BANK.bodySides, "single", { classes: "three" })}</div>` : ""}
        </div>
        <div class="subtle-box remark-row">
          <p class="label">Hearing</p>
          ${choiceGroup("physical.hearing.status", ["Normal", "Impaired", "Deaf", "Fail to assess"], "single", { classes: "four" })}
          ${data.physical.hearing.status === "Impaired" ? `<div class="remark-row">${choiceGroup("physical.hearing.side", BANK.bodySides, "single", { classes: "three" })}</div>` : ""}
        </div>
        <div class="field-grid remark-row">
          <div class="subtle-box">
            <p class="label">Pressure Injury</p>
            ${choiceGroup("physical.pressure.status", ["No", "Yes"], "single", { classes: "two" })}
            ${data.physical.pressure.status === "Yes" ? `<div class="remark-row">${inputField("physical.pressure.site", "Site", { span: true })}</div>` : ""}
          </div>
          <div class="subtle-box">
            <p class="label">Contracture</p>
            ${choiceGroup("physical.contracture.status", ["No", "Yes"], "single", { classes: "two" })}
            ${data.physical.contracture.status === "Yes" ? `<div class="remark-row">${inputField("physical.contracture.site", "Site", { span: true })}</div>` : ""}
          </div>
        </div>
      </div>
      <div class="group">
        ${textareaField("physical.otherInfo", "Others", { span: true, placeholder: "Additional information" })}
      </div>
      ${isFallAssessmentCase() ? renderFunctionalBalanceAssessment() : ""}`;
  }

  function renderPressureInjuryMental() {
    const data = currentCase().data;
    return `
      <div class="group">
        <div class="gcs-row">
          <h3>GCS</h3>
          ${renderGcsFields()}
        </div>
      </div>
      <div class="group">
        <h3>Conscious state</h3>
        ${choiceGroup("mental.consciousness.choices", BANK.consciousness, "multi")}
        ${data.mental.consciousness.choices.includes("Others") ? `<div class="remark-row">${inputField("mental.consciousness.others", "Other conscious state", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Follow command</h3>
        ${choiceGroup("mental.command", BANK.commandFollowing, "consecutive", { classes: "four", order: BANK.commandFollowing })}
      </div>`;
  }

  function renderPressureInjurySkin() {
    const sites = currentCase().data.pressureInjury.skinSites;
    return `
      <div class="group">
        <div class="carer-card-header">
          <h3>Site of assessment</h3>
        </div>
        <div class="pressure-site-list">
          ${sites.map((site, index) => renderPressureInjurySkinSite(site, index, sites.length)).join("")}
        </div>
        <div class="button-row pressure-add-site-row">
          <button type="button" class="btn secondary" data-action="add-pressure-site">Add site</button>
        </div>
      </div>`;
  }

  function renderPressureInjurySkinSite(site, index, total) {
    const base = `pressureInjury.skinSites.${index}`;
    return `<div class="subtle-box pressure-site-card">
      <div class="carer-card-header">
        <h3>Site ${index + 1}</h3>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-pressure-site" data-site-index="${h(index)}">Remove</button>` : ""}
      </div>
      <div class="group">
        <h3>Site of assessment</h3>
        <p class="label">Side</p>
        ${choiceGroup(`${base}.side`, BANK.pressureSiteSides, "single", { classes: "three" })}
        <div class="remark-row">
          <p class="label">Location</p>
          ${choiceGroup(`${base}.areas`, BANK.pressureSiteAreas, "multi", { classes: "six" })}
          ${site.areas.includes("Others") ? `<div class="remark-row">${inputField(`${base}.areaOther`, "Other site", { span: true })}</div>` : ""}
        </div>
      </div>
      <div class="group">
        <h3>Skin condition</h3>
        <div class="subtle-box">
          <p class="label">Pressure Injury</p>
          ${choiceGroup(`${base}.pressureInjury`, ["No", "Yes"], "single", { classes: "two" })}
          ${site.pressureInjury === "Yes" ? `<div class="remark-row">${choiceGroup(`${base}.stage`, BANK.pressureInjuryStages, "single", { classes: "five" })}</div>` : ""}
        </div>
        <div class="subtle-box remark-row">
          <p class="label">Dressing</p>
          ${choiceGroup(`${base}.dressing`, ["Nil", "Yes"], "single", { classes: "two" })}
          ${site.dressing === "Yes" ? `<div class="remark-row">${inputField(`${base}.dressingSite`, "Site", { span: true })}</div>` : ""}
        </div>
        <div class="subtle-box remark-row">
          <p class="label">Skin Condition</p>
          ${choiceGroup(`${base}.skinConditions`, BANK.pressureAssessmentSkinConditions, "multi", { classes: "six" })}
          ${site.skinConditions.includes("Erythema") ? `<div class="remark-row">${choiceGroup(`${base}.erythemaType`, ["Blanchable", "Non-blanchable"], "single", { classes: "two" })}</div>` : ""}
          <div class="field-grid remark-row">
            ${pressureSkinOverInputs(base, site.skinConditions)}
            ${choiceRemarkInputs(BANK.pressureAssessmentSkinConditions, `${base}.skinConditions`, `${base}.skinRemarks`)}
          </div>
        </div>
        <div class="subtle-box remark-row">
          <p class="label">Tube / Drip / Device / Poor hygiene</p>
          ${choiceGroup(`${base}.attachments`, BANK.pressureSiteAttachments, "multi", { classes: "four" })}
          ${site.attachments.includes("Device") ? `<div class="remark-row">${inputField(`${base}.deviceRemark`, "Device", { span: true })}</div>` : ""}
        </div>
      </div>
      </div>`;
  }

  function renderPressureInjuryPhysical() {
    const data = currentCase().data.pressureInjury.physical;
    return `
      <div class="group">
        ${renderPressurePowerFields("pressureInjury.physical.powerGroup", data.powerGroup)}
      </div>
      <div class="group">
        <h3>Function</h3>
        ${choiceGroup("pressureInjury.physical.functionStatus", BANK.pressureFunctionStatuses, "single", { classes: "four" })}
      </div>
      <div class="group">
        <h3>Limbs contracture</h3>
        ${choiceGroup("pressureInjury.physical.contracture.status", ["No", "Yes"], "single", { classes: "two" })}
        ${data.contracture.status === "Yes" ? `<div class="remark-row">${inputField("pressureInjury.physical.contracture.site", "Site", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Sensation</h3>
        ${choiceGroup("pressureInjury.physical.sensation", BANK.pressureSensationOptions, "multi", { classes: "three" })}
        <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureSensationOptions, "pressureInjury.physical.sensation", "pressureInjury.physical.sensationRemarks")}</div>
      </div>
      <div class="group">
        <h3>Tactile sensation</h3>
        ${choiceGroup("pressureInjury.physical.tactileSensation", BANK.pressureTactileSensationOptions, "single", { classes: "four" })}
      </div>
      <div class="group">
        ${textareaField("pressureInjury.physical.otherInfo", "Other information", { span: true, placeholder: "Remarks" })}
      </div>`;
  }

  function renderPressurePowerFields(basePath, group) {
    return `<div class="subtle-box power-entry-box">
      <div class="part-title-row">
        <h3>Power</h3>
        ${choiceGroup(`${basePath}.limbMovement`, BANK.pressurePowerMovementOptions, "single", { classes: "two compact subtle-limb-movement" })}
      </div>
      ${group.limbMovement ? "" : `
        <div class="field-grid remark-row">
          ${inputField(`${basePath}.power.rightUl`, "Right UL")}
          ${inputField(`${basePath}.power.leftUl`, "Left UL")}
          ${inputField(`${basePath}.power.rightLl`, "Right LL")}
          ${inputField(`${basePath}.power.leftLl`, "Left LL")}
        </div>`}
    </div>`;
  }

  function renderPressureInjuryProblem() {
    const data = currentCase().data.pressureInjury.problem;
    return `
      <div class="group">
        <h3>Problem</h3>
        ${choiceGroup("pressureInjury.problem.choices", BANK.pressureProblemOptions, "multi", { classes: "five" })}
        ${data.choices.includes("Others") ? `<div class="remark-row">${inputField("pressureInjury.problem.other", "Other problem", { span: true })}</div>` : ""}
      </div>`;
  }

  function renderPressureInjuryPlan() {
    const data = currentCase().data.pressureInjury.management;
    const prescriptionChosen = data.devicePrescription === "Prescription of pressure relieving device";
    const deviceCheckOptions = data.devices.map((device) => ({ value: device, label: `Check ${pressureDeviceLabel(device, data)}` }));
    return `
      <div class="group">
        <h3>Management</h3>
        <div class="subtle-box">
          <p class="label">Pressure relieving device</p>
          ${choiceGroup("pressureInjury.management.devicePrescription", BANK.pressureDevicePrescriptionOptions, "single", { classes: "one pressure-device-prescription" })}
          ${prescriptionChosen ? `
          <div class="remark-row">
            <p class="label">Type of device</p>
            ${choiceGroup("pressureInjury.management.devices", BANK.pressureDeviceTypes, "multi", { classes: "four" })}
            <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureDeviceTypes, "pressureInjury.management.devices", "pressureInjury.management.deviceRemarks")}</div>
            <div class="pressure-device-list remark-row">
              ${data.devices.map((device) => renderPressureDeviceRegime(device)).join("")}
            </div>
            <div class="remark-row">
              <p class="label">Device status</p>
              ${choiceGroup("pressureInjury.management.deviceAction", BANK.pressureDeviceActions, "single", { classes: "two" })}
            </div>
          </div>` : ""}
          <div class="remark-row">
          ${choiceGroup("pressureInjury.management.interventions", BANK.pressureManagementInterventions, "multi", { classes: "one management-list" })}
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureManagementInterventions, "pressureInjury.management.interventions", "pressureInjury.management.interventionRemarks")}</div>
          </div>
        </div>
      </div>
      <div class="group">
        <h3>Treatment plan</h3>
        ${deviceCheckOptions.length ? `<div class="subtle-box">
          <p class="label">Check device</p>
          ${choiceGroup("pressureInjury.management.treatmentChecks", deviceCheckOptions, "multi", { classes: "three" })}
        </div>` : ""}
        <div class="subtle-box remark-row">
          <p class="label">Plan</p>
          ${choiceGroup("pressureInjury.management.treatmentItems", BANK.pressureTreatmentPlanOptions, "multi", { classes: "five pressure-plan-grid" })}
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureTreatmentPlanOptions, "pressureInjury.management.treatmentItems", "pressureInjury.management.treatmentRemarks")}</div>
        </div>
      </div>`;
  }

  function renderPressureDeviceRegime(device) {
    const data = currentCase().data.pressureInjury.management;
    const label = pressureDeviceLabel(device, data);
    const base = `pressureInjury.management`;
    return `<div class="subtle-box pressure-device-regime">
      <p class="label">Regime - ${h(label)}</p>
      ${choiceGroup(`${base}.regimes.${device}`, BANK.pressureRegimeOptions, "multi", { classes: "six" })}
      <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureRegimeOptions, `${base}.regimes.${device}`, `${base}.regimeRemarks.${device}`)}</div>
    </div>`;
  }

  function renderTedSkin() {
    const skin = currentCase().data.ted.skin;
    return `
      <div class="group">
        <h3>Skin Condition</h3>
        ${choiceGroup("ted.skin.conditions", BANK.tedSkinConditions, "multi", { classes: "three" })}
        <div class="field-grid remark-row">${choiceRemarkInputs(BANK.tedSkinConditions, "ted.skin.conditions", "ted.skin.conditionRemarks")}</div>
      </div>
      <div class="group">
        <h3>Pressure Injury</h3>
        ${choiceGroup("ted.skin.pressureInjury", ["No", "Yes"], "single", { classes: "two" })}
        ${skin.pressureInjury === "Yes" ? `<div class="remark-row">${choiceGroup("ted.skin.stage", BANK.pressureInjuryStages, "single", { classes: "five" })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Swelling</h3>
        ${choiceGroup("ted.skin.swelling", BANK.tedSwellingOptions, "single", { classes: "two" })}
        ${skin.swelling === "Yes" ? `<div class="remark-row">${choiceGroup("ted.skin.swellingLimbs", BANK.tedSwellingLimbs, "multi", { classes: "two" })}</div>` : ""}
      </div>`;
  }

  function renderTedPhysical() {
    const data = currentCase().data.ted.physical;
    return `
      <div class="group">
        ${renderPressurePowerFields("ted.physical.powerGroup", data.powerGroup)}
      </div>
      <div class="group">
        <h3>Function</h3>
        ${choiceGroup("ted.physical.functionStatus", BANK.pressureFunctionStatuses, "single", { classes: "four" })}
      </div>
      <div class="group">
        <h3>Sensation</h3>
        ${choiceGroup("ted.physical.sensation", BANK.pressureSensationOptions, "multi", { classes: "three" })}
        <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureSensationOptions, "ted.physical.sensation", "ted.physical.sensationRemarks")}</div>
      </div>
      <div class="group">
        <h3>Tactile sensation</h3>
        ${choiceGroup("ted.physical.tactileSensation", BANK.pressureTactileSensationOptions, "single", { classes: "four" })}
      </div>
      <div class="group">
        <h3>Soft Calf</h3>
        <div class="field-grid">
          <div class="subtle-box">
            <p class="label">Right</p>
            ${choiceGroup("ted.physical.softCalf.right", ["Yes", "No"], "single", { classes: "two" })}
          </div>
          <div class="subtle-box">
            <p class="label">Left</p>
            ${choiceGroup("ted.physical.softCalf.left", ["Yes", "No"], "single", { classes: "two" })}
          </div>
        </div>
      </div>
      <div class="group">
        <h3>Calf circumference</h3>
        <div class="field-grid">
          ${inputField("ted.physical.calfCircumference.right", "Right (cm)", { type: "number", decimal: true, min: 0 })}
          ${inputField("ted.physical.calfCircumference.left", "Left (cm)", { type: "number", decimal: true, min: 0 })}
        </div>
      </div>
      <div class="group">
        ${textareaField("ted.physical.otherInfo", "Other information", { span: true, placeholder: "Remarks" })}
      </div>`;
  }

  function renderTedRisk() {
    return `
      <div class="group">
        <h3>Thrombosis Risk Checklist</h3>
        <p class="mini-note">The National VTE Prevention Program in England, 2014</p>
      </div>
      <div class="group">
        <h3>Patient related</h3>
        ${choiceGroup("ted.risk.patient", BANK.tedPatientRiskFactors, "multi", { classes: "one management-list" })}
      </div>
      <div class="group">
        <h3>Admission related</h3>
        ${choiceGroup("ted.risk.admission", BANK.tedAdmissionRiskFactors, "multi", { classes: "one management-list" })}
      </div>`;
  }

  function renderTedPlan() {
    const management = currentCase().data.ted.management;
    const notFitSelected = management.tx.includes("Not fit for TED stocking");
    const prescribedSelected = management.tx.includes("Compression stocking prescribed");
    const planOptions = tedPlanOptions(management);
    const notFitDetail = notFitSelected ? `
      <div class="ted-management-detail">
        <p class="label">Due to</p>
        ${choiceGroup("ted.management.notFitReasons", BANK.tedNotFitReasons, "multi", { classes: "four" })}
        ${management.notFitReasons.includes("Others") ? `<div class="remark-row">${inputField("ted.management.notFitOther", "Others", { span: true })}</div>` : ""}
      </div>` : "";
    const prescribedDetail = prescribedSelected ? `
      <div class="ted-management-detail">
        <p class="label">Type of stocking</p>
        ${choiceGroup("ted.management.stockingType", BANK.tedStockingTypes, "single", { classes: "two" })}
        ${management.stockingType === "Commercial type TED stocking" ? `<div class="remark-row">${choiceGroup("ted.management.size", BANK.tedStockingSizes, "single", { classes: "four" })}</div>` : ""}
        ${management.stockingType ? `
          <div class="remark-row">
            <p class="label">Regime</p>
            ${choiceGroup("ted.management.regimes", BANK.tedRegimeOptions, "multi", { classes: "three" })}
            ${management.regimes.includes("Others") ? `<div class="remark-row">${inputField("ted.management.regimeOther", "Others", { span: true })}</div>` : ""}
          </div>
          <div class="remark-row">
            ${checkboxField("ted.management.education", "Patient / Carer Education with pamphlet provided")}
          </div>` : ""}
      </div>` : "";
    return `
      <div class="group">
        <h3>Management</h3>
        <div class="ted-management-list">
          ${renderTedManagementRow(BANK.tedManagementOptions[0], notFitDetail)}
          ${renderTedManagementRow(BANK.tedManagementOptions[1], prescribedDetail)}
          ${renderTedManagementRow(BANK.tedManagementOptions[2])}
        </div>
      </div>
      <div class="group">
        <h3>Plan</h3>
        <div class="subtle-box">
          ${choiceGroup("ted.management.plan", planOptions, "multi", { classes: "one management-list" })}
        </div>
      </div>`;
  }

  function renderTedManagementRow(option, detail = "") {
    return `<div class="subtle-box ted-management-row">
      ${choiceGroup("ted.management.tx", [option], "multi", { classes: "one management-list" })}
      ${detail}
    </div>`;
  }

  function tedPlanOptions(management) {
    const options = [];
    const checkLabel = tedCheckPlanLabel(management);
    if (checkLabel) options.push({ value: checkLabel });
    return [...options, ...BANK.tedPlanOptions];
  }

  function renderHomeO2SocialAdl() {
    return `
      ${renderSocial()}
      <div class="group">
        <h3>Overall ADL status</h3>
        ${choiceGroup("homeO2.overallAdl", BANK.assistanceLevels, "consecutive", { order: BANK.assistanceLevels })}
      </div>`;
  }

  function renderHomeO2Oximetry() {
    const oximetry = currentCase().data.homeO2.oximetry;
    const regime = oximetry.regime;
    const customRegime = regime.option === "Home O2 indicated";
    const o2Tests = oximetry.o2Tests || [makeHomeO2AssessmentOximetrySet()];
    return `
      <div class="group">
        <h3>Oximetry Test</h3>
        <div class="subtle-box remark-row">
          <div class="inline-row home-o2-oximetry-title-row">
            <p class="label">Oximetry</p>
            ${notTestPillField("homeO2.oximetry.done", "Done")}
          </div>
          ${oximetry.done ? `
            <div class="remark-row">
              <p class="label">Oxygen use during oximetry</p>
              ${choiceGroup("homeO2.oximetry.oxygenModes", BANK.homeO2OximetryOxygenModes, "multi", { classes: "two home-o2-oxygen-use-grid" })}
            </div>
            ${oximetry.oxygenModes.includes("Room Air") ? renderHomeO2AssessmentOximetrySet("On Room Air", "homeO2.oximetry.roomAir") : ""}
            ${oximetry.oxygenModes.includes("O2") ? `
              <div class="remark-row">
                <div class="carer-card-header">
                  <p class="label">O2 flow tests</p>
                </div>
                ${o2Tests.map((test, index) => renderHomeO2AssessmentO2Test(test, index, o2Tests.length)).join("")}
                <div class="button-row palliative-add-entry-row">
                  <button type="button" class="btn secondary" data-action="add-home-o2-oximetry-test">Add O2 flow</button>
                </div>
              </div>` : ""}
          ` : ""}
        </div>
      </div>
      <div class="group">
        <h3>Oxygen regime</h3>
        ${choiceGroup("homeO2.oximetry.regime.option", BANK.homeO2OxygenRegimeOptions, "single", { classes: "three home-o2-regime-grid" })}
        ${customRegime ? `
        <div class="home-o2-regime-inputs remark-row">
          ${inputField("homeO2.oximetry.regime.sleep", "At sleep (L O2)", { placeholder: "e.g. 1" })}
          ${inputField("homeO2.oximetry.regime.rest", "At rest (L O2)", { placeholder: "e.g. 1" })}
          ${inputField("homeO2.oximetry.regime.exertion", "On exertion (L O2)", { placeholder: "e.g. 2" })}
        </div>` : ""}
        <div class="remark-row">${textareaField("homeO2.oximetry.remarks", "Remarks", { span: true, placeholder: "Other oximetry remarks" })}</div>
      </div>`;
  }

  function renderHomeO2AssessmentO2Test(test, index, total) {
    const base = `homeO2.oximetry.o2Tests.${index}`;
    return `<div class="subtle-box remark-row">
      ${total > 1 ? `<div class="button-row home-o2-test-action-row"><button type="button" class="btn danger" data-action="remove-home-o2-oximetry-test" data-test-index="${h(index)}">Remove</button></div>` : ""}
      ${inputField(`${base}.flow`, "O2 flow L/min", { type: "number", decimal: true, min: 0.5, max: 15, step: 0.5, clamp: true, placeholder: "0.5-15" })}
      ${renderHomeO2AssessmentOximetrySet("", base, test)}
    </div>`;
  }

  function renderHomeO2AssessmentOximetrySet(label, basePath, set = getPath(currentCase().data, basePath) || {}) {
    const completed = set.status !== "Not completed";
    return `<div class="subtle-box remark-row">
      ${label ? `<p class="label">${h(label)}</p>` : ""}
      <div class="oximetry-grid">
        ${renderOximetryVitals("At rest", `${basePath}.rest`)}
        ${renderHomeO2AssessmentExertionBox(basePath, completed)}
        ${completed ? renderOximetryVitals("At 2 minutes rest", `${basePath}.recovery`) : ""}
      </div>
    </div>`;
  }

  function renderHomeO2AssessmentExertionBox(basePath, completed) {
    const statusOptions = [
      { value: "Completed", label: "Complete" },
      { value: "Not completed", label: "Not Complete" }
    ];
    return `<div class="subtle-box home-o2-exertion-box">
      <div class="home-o2-exertion-header">
        <p class="label">On exertion</p>
        ${choiceGroup(`${basePath}.status`, statusOptions, "single", { classes: "two compact home-o2-status-grid" })}
      </div>
      <div class="remark-row">
        ${inputField(`${basePath}.adlTask`, "ADL task", { placeholder: "e.g. bedside transfer" })}
      </div>
      ${completed ? `
        ${inputField(`${basePath}.exertion.sao2`, "SaO2 %", { type: "number", min: 0, max: 100, clamp: true })}
        <div class="remark-row">${inputField(`${basePath}.exertion.pulse`, "Pulse bpm", { type: "number", min: 0 })}</div>
        <div class="remark-row">
        <p class="label">SOB on exertion</p>
        ${choiceGroup(`${basePath}.sob`, ["Nil", "Mild", "Moderate", "Severe"], "single", { classes: "four" })}
      </div>` : `<div class="remark-row">${inputField(`${basePath}.notCompletedReason`, "Reason", { span: true, placeholder: "Reason not completed" })}</div>`}
    </div>`;
  }

  function renderHomeO2Problem() {
    return `
      <div class="group">
        <h3>Problem Identification</h3>
        ${choiceGroup("homeO2.problem.choices", BANK.homeO2ProblemOptions, "multi", { classes: "two" })}
      </div>`;
  }

  function renderHomeO2Plan() {
    const data = currentCase().data.homeO2;
    const educationSelected = data.treatment.choices.includes("Home O2 education");
    const educationArranged = data.treatment.educationStatus === "Arranged on";
    const planEducation = data.treatment.plan.includes("Home O2 education");
    return `
      <div class="group">
        <h3>Treatment</h3>
        ${choiceGroup("homeO2.treatment.choices", BANK.homeO2TreatmentOptions, "multi", { classes: "five home-o2-treatment-grid" })}
        ${data.treatment.choices.includes(HOME_O2_BREATHING_TREATMENT) ? `<div class="remark-row">${inputField("homeO2.remarks.breathingEducationDate", "Education on Breathing Technique, Handheld Fan and Energy Conservation on", { type: "date", span: true })}</div>` : ""}
        ${educationSelected ? `<div class="subtle-box remark-row">
          <p class="label">Home O2 education</p>
          ${choiceGroup("homeO2.treatment.educationStatus", ["Done", "Arranged on"], "single", { classes: "two" })}
          ${educationArranged ? `<div class="remark-row">${inputField("homeO2.treatment.educationDate", "On", { type: "date", span: true })}</div>` : ""}
        </div>` : ""}
        ${data.treatment.choices.includes(HOME_O2_HAGO_TREATMENT) ? `<div class="remark-row">${inputField("homeO2.remarks.haGoDate", "Prescription of HA Go (Tele information) on", { type: "date", span: true })}</div>` : ""}
        ${data.treatment.choices.includes("Others") ? `<div class="remark-row">${inputField("homeO2.treatment.other", "Others", { span: true, placeholder: "Treatment details" })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Treatment Plan</h3>
        ${choiceGroup("homeO2.treatment.plan", BANK.homeO2TreatmentPlanOptions, "multi", { classes: "three" })}
        ${planEducation ? `<div class="remark-row">${inputField("homeO2.treatment.pendingEducationDate", "On", { type: "date", span: true })}</div>` : ""}
      </div>
      `;
  }

  function renderHomeO2Decision() {
    const decision = currentCase().data.homeO2.decision;
    const hasPortableOxygenConcentrator = decision.deviceChoices.includes("Portable Oxygen Concentrator");
    const hasConservingDevice = decision.deviceChoices.includes("Conserving Device");
    const hasAccessories = decision.deviceChoices.includes("Accessories");
    const hasNasalCannula = decision.accessories.includes("Nasal Cannula");
    const hasAccessoryOther = decision.accessories.includes("Others");
    return `<div class="group">
      <h3>Home O2 Order</h3>
      <div class="field-grid">
        ${inputField("homeO2.decision.supplier", "Supplier", { span: true, placeholder: "Supplier" })}
      </div>
      <div class="field-grid remark-row home-o2-order-model-row">
        ${inputField("homeO2.decision.model", "Model (Oxygen concentrator)", { placeholder: "Model" })}
        <div class="field">
          <p class="label">Cylinder size</p>
          ${choiceGroup("homeO2.decision.cylinderSize", BANK.homeO2CylinderSizeOptions, "single", { classes: "four compact" })}
        </div>
        ${inputField("homeO2.decision.cylinderNumber", "Number of cylinder", { placeholder: "e.g. 1" })}
      </div>
      <div class="remark-row home-o2-order-device-row">
        ${choiceGroup("homeO2.decision.deviceChoices", BANK.homeO2DecisionDeviceOptions, "multi", { classes: "three home-o2-device-grid" })}
      </div>
      ${hasPortableOxygenConcentrator ? `<div class="remark-row">${inputField("homeO2.decision.portableOxygenConcentratorModel", "Model:", { span: true, placeholder: "Portable Oxygen Concentrator model" })}</div>` : ""}
      ${hasConservingDevice ? `<div class="remark-row">${inputField("homeO2.decision.conservingDeviceModel", "Model:", { span: true, placeholder: "Conserving Device model" })}</div>` : ""}
      ${hasAccessories ? `<div class="remark-row">
        <p class="label">Accessories</p>
        ${choiceGroup("homeO2.decision.accessories", BANK.homeO2AccessoryOptions, "multi", { classes: "four home-o2-accessory-grid" })}
        ${hasNasalCannula ? `<div class="remark-row">${choiceGroup("homeO2.decision.nasalCannulaLengths", BANK.homeO2NasalCannulaLengthOptions, "multi", { classes: "three compact" })}</div>` : ""}
        ${hasAccessoryOther ? `<div class="remark-row">${inputField("homeO2.decision.accessoryOther", "Others", { span: true, placeholder: "Accessories" })}</div>` : ""}
      </div>` : ""}
      <div class="remark-row">
        <p class="label">Consent form signed by</p>
        ${choiceGroup("homeO2.decision.consentSignedBy", BANK.homeO2ConsentSignatoryOptions, "single", { classes: "three" })}
        ${decision.consentSignedBy === "Others" ? `<div class="remark-row">${inputField("homeO2.decision.consentSignedByOther", "Others", { span: true, placeholder: "Name / relationship" })}</div>` : ""}
      </div>
      <div class="remark-row">
        <p class="label">Funding</p>
        ${choiceGroup("homeO2.decision.consentFunding", BANK.homeO2ConsentFundingOptions, "multi", { classes: "four home-o2-consent-grid" })}
      </div>
      <div class="remark-row">
        <p class="label">Date of Delivery</p>
        ${choiceGroup("homeO2.decision.deliveryStatus", BANK.homeO2DeliveryStatusOptions, "single", { classes: "two" })}
        ${decision.deliveryStatus === "Arranged on" ? `<div class="remark-row">${inputField("homeO2.decision.deliveryDate", "Arranged on", { type: "date", span: true })}</div>` : ""}
      </div>
    </div>`;
  }

  function renderFunctionalBalanceAssessment() {
    const balance = currentCase().data.physical.functionalBalance;
    return `<div class="group functional-balance-card">
      <div class="carer-card-header">
        <h3>Functional Balance Assessment</h3>
        ${notTestPillField("physical.functionalBalance.notApplicable", "Not applicable")}
      </div>
      ${balance.notApplicable ? "" : `<div class="field-grid">
        ${inputField("physical.functionalBalance.singleLegLeft", "Single leg stance - Left (seconds)", { type: "number", min: 0 })}
        ${inputField("physical.functionalBalance.singleLegRight", "Single leg stance - Right (seconds)", { type: "number", min: 0 })}
        ${inputField("physical.functionalBalance.tug", "Time up and go test (seconds)", { type: "number", min: 0, span: true })}
        ${inputField("physical.functionalBalance.reachTrial1", "Functional reach test - Trial 1 (cm)", { type: "number", decimal: true, min: 0 })}
        ${inputField("physical.functionalBalance.reachTrial2", "Functional reach test - Trial 2 (cm)", { type: "number", decimal: true, min: 0 })}
      </div>`}
    </div>`;
  }

  function renderPendingConsecutive(label, basePath, order, options = {}) {
    const group = getPath(currentCase().data, basePath);
    return `<div class="subtle-box remark-row">
      <div class="inline-row" style="justify-content: space-between;">
        <p class="label">${h(label)}</p>
        ${notTestPillField(`${basePath}.pending`, "Not test")}
      </div>
      ${group.pending ? (options.hidePendingReason ? "" : inputField(`${basePath}.pendingReason`, "Due to", { span: true })) : `
        ${choiceGroup(`${basePath}.levels`, order, "consecutive", { order })}
        ${options.aidRemark ? `<div class="remark-row">${inputField(`${basePath}.aidRemark`, "Aids / remarks", { span: true, placeholder: "e.g. Stick" })}</div>` : ""}`}
    </div>`;
  }

  function hasPendingGroup(...groups) {
    return groups.some((group) => group && group.pending);
  }

  function renderFunctional() {
    const data = currentCase().data;
    const bi = calculateBI();
    const ppsOptions = rangeOptions(10, 100, 10);
    const ppsBlock = isPalliativeCase() ? `
      <div class="group palliative-card">
        <h3>Palliative Performance Scale (PPS)</h3>
        ${choiceGroup("functional.pps", ppsOptions, "consecutive", { classes: "ten score-grid", order: ppsOptions })}
      </div>` : "";
    return `
      ${ppsBlock}
      <div class="group">
        <div class="inline-row" style="justify-content: space-between;">
          <h3>Modified Barthel Index (BI)</h3>
          <button type="button" class="btn secondary" data-action="toggle-bi-interpretation">${data.functional.showInterpretation ? "Hide interpretation" : "Show interpretation"}</button>
        </div>
        <div class="bi-grid">
          ${BANK.biRows.flat().map((key) => renderBiCell(key)).join("")}
        </div>
        <div class="bi-total">Total score: ${h(bi.totalText)} ${bi.level ? `(${h(bi.level)})` : ""}</div>
      </div>
      <div class="group">
        <h3>Overall assistance</h3>
        ${choiceGroup("functional.overall", BANK.assistanceLevels, "consecutive", { order: BANK.assistanceLevels })}
        <div class="remark-row">${textareaField("functional.impression", "Impression", { span: true, placeholder: "Free text impression" })}</div>
      </div>
      ${isEmergencyMedicineCase() ? renderLawton() : ""}
      ${renderCarerInterview()}
      ${isFallAssessmentCase() ? renderHdrsSection() : ""}`;
  }

  function renderMbiAssessment() {
    const data = currentCase().data;
    const bi = calculateBI();
    return `
      <div class="group">
        <div class="inline-row" style="justify-content: space-between;">
          <h3>Modified Barthel Index (MBI)</h3>
          <button type="button" class="btn secondary" data-action="toggle-bi-interpretation">${data.functional.showInterpretation ? "Hide interpretation" : "Show interpretation"}</button>
        </div>
        <div class="bi-grid">
          ${BANK.biRows.flat().map((key) => renderBiCell(key)).join("")}
        </div>
        <div class="bi-total">Total score: ${h(bi.totalText)}</div>
      </div>
      <div class="group">
        <h3>Overall assistance</h3>
        ${choiceGroup("functional.overall", BANK.assistanceLevels, "consecutive", { order: BANK.assistanceLevels })}
      </div>`;
  }

  function renderCarerInterview() {
    const interview = currentCase().data.functional.carerInterview;
    return `<div class="group carer-interview-card">
      <div class="carer-card-header">
        <h3>Carer Interview</h3>
        <button type="button" class="btn secondary carer-status-toggle${interview.done ? " done" : ""}" data-action="toggle-carer-interview">Done</button>
      </div>
      ${interview.done ? `
        <div class="field-grid">
          ${inputField("functional.carerInterview.carer", "Carer", { placeholder: "Who?" })}
          ${inputField("functional.carerInterview.phone", "Phone number", { placeholder: "Phone number" })}
        </div>
        <div class="remark-row">
          <p class="label">Discussion on</p>
          ${choiceGroup("functional.carerInterview.topics", BANK.carerInterviewTopics, "multi", { classes: "five carer-discuss-grid" })}
          <div class="field-grid remark-row">${choiceRemarkInputs(BANK.carerInterviewTopics, "functional.carerInterview.topics", "functional.carerInterview.remarks")}</div>
        </div>` : ""}
    </div>`;
  }

  function renderBiCell(key) {
    const data = currentCase().data;
    const activeKey = key === "mobility" ? data.functional.mobilityMode : key;
    const item = BANK.biItems[activeKey];
    const state = data.functional.bi[activeKey];
    return `<div class="bi-cell">
      <div class="bi-cell-header">
        <div class="bi-title-wrap">
          <h4>${key === "mobility" ? "Mobility / Wheelchair" : h(item.label)}</h4>
          <span class="bi-current-score">${h(biCurrentScore(activeKey))}</span>
        </div>
        ${key === "mobility" ? `${choiceGroup("functional.mobilityMode", [{ value: "mobility", label: "Mobility" }, { value: "wheelchair", label: "Wheelchair" }], "single", { classes: "two compact bi-mode-toggle" })}` : ""}
      </div>
      <div class="bi-score-grid" role="group" aria-label="${h(key === "mobility" ? "Mobility/Wheelchair score" : `${item.label} score`)}">
        ${renderBiScoreButton(activeKey, "NA", "NA", state.notAssessed || state.score === "")}
        ${item.scores.map((score) => renderBiScoreButton(activeKey, String(score.value), score.value, !state.notAssessed && String(state.score) === String(score.value))).join("")}
      </div>
      ${data.functional.showInterpretation ? renderBiItemInterpretation(activeKey) : ""}
      ${state.score !== "" && Number(state.score) === 0 ? renderBiZeroExtraChecks(activeKey, item, state) : ""}
      ${state.score !== "" && Number(state.score) === 0 && item.zeroExtras ? `<div class="bi-extra-row">${item.zeroExtras.map((route) => `<label class="inline-row bi-extra-choice"><input type="checkbox" data-feeding-route="${h(route)}" data-feeding-key="${h(activeKey)}"${state.feedingRoute === route ? " checked" : ""}> <span>${h(route)}</span></label>`).join("")}</div>` : ""}
    </div>`;
  }

  function biZeroExtraChecks(item) {
    const choices = [];
    if (item.extraWhenZero) {
      choices.push({
        key: item.extraWhenZero,
        label: item.extraWhenZero === "foley" ? "Foley" : "Stoma"
      });
    }
    (item.zeroExtraChecks || []).forEach((choice) => choices.push(choice));
    return choices;
  }

  function renderBiZeroExtraChecks(key, item, state) {
    const choices = biZeroExtraChecks(item);
    if (!choices.length) return "";
    return `<div class="bi-extra-row">${choices.map((choice) => `<label class="inline-row bi-extra-choice"><input type="checkbox" data-bind="functional.bi.${h(key)}.${h(choice.key)}"${state[choice.key] ? " checked" : ""}> <span>${h(choice.label)}</span></label>`).join("")}</div>`;
  }

  function biCurrentScore(key) {
    const state = currentCase().data.functional.bi[key];
    const item = BANK.biItems[key];
    if (state.notAssessed || state.score === "") return "Not assessed";
    return `${state.score}/${item.max}`;
  }

  function renderBiScoreButton(key, value, score, active) {
    return `<button type="button" class="choice bi-choice${active ? " active" : ""}" data-bi-choice="true" data-bi-key="${h(key)}" data-bi-value="${h(value)}">
      <strong>${h(score)}</strong>
    </button>`;
  }

  function renderBiItemInterpretation(key) {
    const item = BANK.biItems[key];
    return `<div class="bi-inline-interpretation">
      ${item.scores.map((score) => `<p><strong>${h(score.value)}</strong> ${h(score.label)}</p>`).join("")}
    </div>`;
  }

  function renderBiInterpretation() {
    const orderedKeys = BANK.biRows.flat().map((key) => key === "mobility" ? currentCase().data.functional.mobilityMode : key);
    return `<div class="subtle-box bi-interpretation-page">
      <h3>BI category scoring interpretation</h3>
      ${orderedKeys.map((key) => {
        const item = BANK.biItems[key];
        return `<div class="bi-interpretation-row">
          <h4>${h(item.label)}</h4>
          <div class="bi-interpretation-grid">
            ${item.scores.map((score) => `<p><strong>${h(score.value)}</strong> ${h(score.label)}</p>`).join("")}
          </div>
        </div>`;
      }).join("")}
    </div>`;
  }

  function renderFall() {
    return isFallAssessmentCase() ? renderDetailedFall() : renderSimpleFall();
  }

  function renderSimpleFall() {
    const data = currentCase().data;
    return `
      <div class="group">
        <h3>Fall Risk</h3>
        ${choiceGroup("fall.risk", ["Yes", "No"], "single", { classes: "two" })}
        ${data.fall.risk === "Yes" ? `
          <div class="remark-row">
            <p class="label">Risk level</p>
            ${choiceGroup("fall.level", ["Low", "High"], "single", { classes: "two" })}
          </div>
          <div class="remark-row">
            <p class="label">Risk factors</p>
            ${choiceGroup("fall.factors", BANK.fallRiskFactors, "multi")}
            ${data.fall.factors.includes("Others") ? `<div class="remark-row">${inputField("fall.factorOther", "Other risk factor", { span: true })}</div>` : ""}
          </div>` : ""}
      </div>
      ${isEmergencyMedicineCase() ? renderFallHistory() : `<div class="group">
        <h3>History of Fall in Recent Year</h3>
        ${choiceGroup("fall.history", ["Yes", "No"], "single", { classes: "two" })}
        ${data.fall.history === "Yes" ? `
          <div class="field-grid remark-row">
            ${inputField("fall.frequency", "Frequency", { type: "number" })}
            ${textareaField("fall.incidentRemarks", "Fall Details", { span: true })}
          </div>` : ""}
      </div>`}`;
  }

  function renderDetailedFall() {
    const data = currentCase().data;
    const frat = calculateFrat(data);
    const overall = fallOverallStatus(data);
    const locked = frat.automaticHigh;
    return `
      <div class="group">
        <h3>Part 1: Fall Risk Status</h3>
        <div class="frat-score-list">
          ${BANK.fratScoreItems.map(renderFratScoreRow).join("")}
        </div>
        <div class="frat-total">
          <div>
            <p class="label">FRAT score</p>
            <strong class="frat-total-score">FRAT: ${h(frat.totalText)}</strong>
          </div>
          <div class="frat-score-risk-reference">
            <p class="label">Corresponding fall risk</p>
            <span class="score-chip ${h(fratRiskClass(frat.scoreStatus))}">${h(frat.scoreStatus || "Pending")}</span>
          </div>
        </div>
        <div class="subtle-box remark-row">
          <p class="label">Automatic High Risk Status</p>
          ${choiceGroup("fall.frat.automaticHigh", BANK.fratAutomaticHighRisk, "multi", { classes: "two" })}
        </div>
      </div>
      <div class="group">
        <h3>Part 2: Risk Factor Checklist</h3>
        <div class="frat-checklist">
          ${BANK.fratChecklist.map(renderFratChecklistRow).join("")}
        </div>
        <div class="remark-row">${textareaField("fall.frat.riskFactorRemarks", "Remarks", { span: true, placeholder: "Free text remarks" })}</div>
        <div class="frat-overall-box">
          <div class="frat-overall-heading">
            <p class="label">Overall Fall Risk Status</p>
            <span class="score-chip ${h(fratRiskClass(overall))}${locked && overall === "High Risk" ? " automatic-high-risk-pill" : ""}">${h(overall || "Pending")}</span>
          </div>
          ${locked ? `<p class="mini-note">Automatic High Risk Status selected.</p>` : renderFratOverallChoices(overall)}
        </div>
      </div>
      ${renderFallHistory("Part 3: History of Fall in Recent Year")}`;
  }

  function renderFallHistory(title = "History of Fall in Recent Year") {
    const data = currentCase().data;
    return `
      <div class="group">
        <h3>${h(title)}</h3>
        ${choiceGroup("fall.history", ["No", "Yes"], "single", { classes: "two" })}
        ${data.fall.history === "Yes" ? `
          <div class="field-grid remark-row">
            ${inputField("fall.frequency", "Frequency", { type: "number" })}
          </div>
          <div class="fall-incident-list remark-row">
            ${(data.fall.incidents || [makeFallIncident()]).map((incident, index, list) => renderFallIncident(incident, index, list.length)).join("")}
          </div>
          <div class="button-row remark-row">
            <button type="button" class="btn secondary" data-action="add-fall-incident">Add fall incident</button>
          </div>
          <div class="remark-row">${textareaField("fall.incidentRemarks", "Additional fall details / remarks", { span: true, placeholder: "Optional remarks" })}</div>` : ""}
      </div>`;
  }

  function renderFallIncident(incident, index, total) {
    const base = `fall.incidents.${index}`;
    return `<div class="subtle-box fall-incident-card">
      <div class="fall-incident-header">
        <h4>Fall incident ${h(index + 1)}</h4>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-fall-incident" data-entry-index="${h(index)}">Remove</button>` : ""}
      </div>
      <div class="field-grid">
        ${inputField(`${base}.period`, "Period of fall", { placeholder: "e.g. last month" })}
        ${inputField(`${base}.location`, "Location", { placeholder: "e.g. toilet" })}
      </div>
      <div class="remark-row">
        <p class="label">${isEmergencyMedicineCase() ? "Reasons for fall (select all that apply)" : "Main reason of fall"}</p>
        ${choiceGroup(`${base}.${isEmergencyMedicineCase() ? "reasons" : "reason"}`, BANK.fallIncidentReasons, isEmergencyMedicineCase() ? "multi" : "single")}
        ${(isEmergencyMedicineCase() ? incident.reasons.includes("Other") : incident.reason === "Other") ? `<div class="remark-row">${inputField(`${base}.reasonOther`, "Reason remarks", { span: true, placeholder: "Specify reason" })}</div>` : ""}
      </div>
    </div>`;
  }

  function renderHdrsSection() {
    const data = currentCase().data;
    const hdrs = data.fall.hdrs;
    const result = calculateHdrs(hdrs, data);
    return `<div class="group hdrs-section">
      <div class="part-title-row">
        <h3>Home Discharge Readiness Assessment (HDRS)</h3>
        ${notTestPillField("fall.hdrs.applicable", "NS Team applicable")}
      </div>
      ${hdrs.applicable ? `
        <div class="hdrs-item-list remark-row">
          ${BANK.hdrsItems.map((item) => renderHdrsItem(item)).join("")}
        </div>
        <div class="hdrs-result-box">
          <div>
            <p class="label">Factor scores</p>
            <strong>Patient ${h(result.factorScores.patient || "__")} / Carer ${h(result.factorScores.carer || "__")} / Living Environment ${h(result.factorScores.environment || "__")}</strong>
          </div>
          <div>
            <p class="label">Total Factor Score</p>
            <strong>${h(result.total || "__")} / 15</strong>
          </div>
          <span class="score-chip ${result.level ? "good" : "mid"}">${h(result.level ? `Level ${result.level} ${result.levelLabel}` : "Readiness pending")}</span>
        </div>` : ""}
    </div>`;
  }

  function renderHdrsItem(item) {
    const data = currentCase().data;
    const hdrs = data.fall.hdrs;
    const selected = hdrs.scores[item.key] || "";
    const selectedOption = item.scores.find((score) => score.value === selected);
    const remark = hdrs.remarks && hdrs.remarks[item.key];
    const remarkStateKey = hdrsRemarkStateKey(item.key);
    const remarkOpen = !!remark || !!hdrsRemarkOpen[remarkStateKey];
    return `<div class="hdrs-item-card">
      <div class="hdrs-item-header">
        <div>
          <h4>${h(item.label)}</h4>
          ${item.help ? `<p>${h(item.help)}</p>` : ""}
        </div>
        <div class="hdrs-item-actions">
          <button type="button" class="hdrs-remark-toggle${remarkOpen ? " active" : ""}" data-action="toggle-hdrs-remark" data-hdrs-item="${h(item.key)}">Remarks</button>
          <span class="score-chip ${selected ? "good" : "mid"}">Score ${h(selected || "__")}</span>
        </div>
      </div>
      <div class="hdrs-score-grid">
        ${item.scores.map((score) => renderHdrsScoreButton(item.key, score, selected)).join("")}
      </div>
      ${selectedOption ? `<p class="mini-note hdrs-selected-criteria">${h(selectedOption.description)}</p>` : ""}
      ${remarkOpen ? `<div class="remark-row">${textareaField(`fall.hdrs.remarks.${item.key}`, "Remark", { span: true, placeholder: "Optional remark" })}</div>` : ""}
    </div>`;
  }

  function renderHdrsScoreButton(key, score, selected) {
    return `<button type="button" class="choice hdrs-score-choice${selected === score.value ? " active" : ""}" data-choice-path="fall.hdrs.scores.${h(key)}" data-choice-value="${h(score.value)}" data-choice-mode="single" data-exclusive="false" data-exclusive-values="">
      <strong>${h(score.value)}</strong>
      <span>${h(score.label)}</span>
    </button>`;
  }

  function hdrsRemarkStateKey(itemKey) {
    return `${currentCaseId || "case"}:${itemKey}`;
  }

  function renderFratScoreRow(item) {
    const data = currentCase().data;
    const current = data.fall.frat.scores[item.key];
    const amtReference = item.key === "cognitive" ? fratAmtReferenceText(data) : "";
    return `<div class="frat-score-row">
      <div class="frat-score-header">
        <div>
          <h4>${h(item.label)}</h4>
          ${item.note ? `<p>${h(item.note)}</p>` : ""}
        </div>
        <span class="bi-current-score">${h(current ? `Score ${current}` : "Not assessed")}</span>
      </div>
      ${amtReference ? `<div class="frat-reference-pill-row"><span class="score-chip mid">${h(amtReference)}</span></div>` : ""}
      <div class="frat-score-grid" role="group" aria-label="${h(`${item.label} FRAT score`)}">
        ${item.levels.map((level) => renderFratScoreButton(item.key, level, String(current) === String(level.value))).join("")}
      </div>
    </div>`;
  }

  function fratAmtReferenceText(data) {
    const amt = data.mental.cognitive.amt;
    if (!hasAmtInput(amt)) return "";
    if (amt.unable) return "AMT reference: Fail to assess";
    const score = calculateAmtFromData(data);
    const status = hasCompletedAmt(data) ? amtCutoffStatus(score) : "partial input";
    return `AMT reference: ${score}/10 (${status})`;
  }

  function renderFratScoreButton(key, level, active, disabled = false) {
    return `<button type="button" class="choice frat-score-choice${active ? " active" : ""}" data-frat-score="true" data-frat-key="${h(key)}" data-frat-value="${h(level.value)}"${disabled ? " disabled" : ""}>
      <strong>${h(level.score)}</strong>
      <span>${h(level.label)}</span>
    </button>`;
  }

  function renderFratChecklistRow(item) {
    const data = currentCase().data;
    const current = normalizeFratChecklistStatus(data.fall.frat.checklist[item.key]);
    return `<div class="frat-check-row">
      <strong>${h(item.label)}</strong>
      <span>${h(item.description)}</span>
      <div class="frat-check-actions">
        ${["No", "Yes", "Not Test"].map((status) => renderFratChecklistButton(item.key, status, current)).join("")}
      </div>
    </div>`;
  }

  function renderFratChecklistButton(key, status, current) {
    const active = current === status;
    const tone = active && status === "No" ? " green" : active && status === "Yes" ? " red" : active ? " muted-choice" : "";
    return `<button type="button" class="choice small-choice${tone}" data-frat-checklist="true" data-frat-key="${h(key)}" data-frat-value="${h(status)}">${h(status)}</button>`;
  }

  function renderFratOverallChoices(overall) {
    return `<div class="choice-grid three frat-overall-choices">
      ${["Low Risk", "Medium Risk", "High Risk"].map((status) => `<button type="button" class="choice${overall === status ? " active" : ""}" data-frat-overall="true" data-frat-value="${h(status)}">${h(status)}</button>`).join("")}
    </div>`;
  }

  function renderPalliativeSymptoms() {
    const data = currentCase().data;
    ensurePalliativeSymptomData(data);
    const symptoms = data.palliative.symptoms || [];
    return `
      <div class="group">
        <h3>Symptoms</h3>
        <div class="symptom-list">
          ${BANK.palliativeSymptoms.map((item) => renderPalliativeSymptomRow(item, symptoms)).join("")}
        </div>
      </div>`;
  }

  function scoreChoices() {
    return rangeOptions(1, 10, 1);
  }

  function renderPalliativeSymptomRow(item, symptoms) {
    const value = optionValue(item);
    const selected = symptoms.includes(value);
    return `<div class="symptom-row${selected ? " selected" : ""}">
      ${choiceGroup("palliative.symptoms", [item], "multi", { classes: "one symptom-choice-grid" })}
      ${selected ? renderPalliativeSymptomDetails(value) : ""}
    </div>`;
  }

  function renderPalliativeSymptomDetails(value) {
    if (value === "Pain") return renderPainSymptom();
    if (value === "Fatigue") return renderFatigueSymptom();
    if (value === "Breathlessness") return renderBreathlessnessSymptom();
    if (value === "Edema") return renderEdemaSymptom();
    if (value === "Pressure Injury") return renderPressureInjurySymptom();
    if (value === "Others") return `<div class="symptom-detail">${inputField("palliative.remarks.Others", "Others remarks", { span: true, placeholder: "Remarks" })}</div>`;
    return "";
  }

  function renderPainSymptom() {
    const entries = currentCase().data.palliative.pain.entries || [makePalliativePainEntry()];
    return `<div class="symptom-detail symptom-card">
      <div class="carer-card-header">
        <h3>Pain</h3>
      </div>
      ${entries.map((entry, index) => renderPainEntry(entry, index, entries.length)).join("")}
      <div class="button-row palliative-add-entry-row">
        <button type="button" class="btn secondary" data-action="add-palliative-entry" data-palliative-list="pain">Add location</button>
      </div>
    </div>`;
  }

  function renderPainEntry(entry, index, total) {
    const base = `palliative.pain.entries.${index}`;
    return `<div class="subtle-box remark-row">
      <div class="carer-card-header">
        <p class="label">Location ${index + 1}</p>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-palliative-entry" data-palliative-list="pain" data-entry-index="${h(index)}">Remove</button>` : ""}
      </div>
      ${inputField(`${base}.location`, "Location", { span: true, placeholder: "Remarks" })}
      <div class="remark-row">
        <p class="label">NRS /10</p>
        ${choiceGroup(`${base}.nrs`, scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
      <div class="remark-row">
        <p class="label">Confidence Score /10</p>
        ${choiceGroup(`${base}.confidence`, scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
    </div>`;
  }

  function renderFatigueSymptom() {
    return `<div class="symptom-detail symptom-card">
      <h3>Fatigue</h3>
      ${inputField("palliative.fatigue.activityTolerance", "Activity tolerance", { span: true, placeholder: "Remarks" })}
      <div class="remark-row">
        <p class="label">ESAS /10</p>
        ${choiceGroup("palliative.fatigue.esas", scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
      <div class="remark-row">
        <p class="label">Confidence Score /10</p>
        ${choiceGroup("palliative.fatigue.confidence", scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
    </div>`;
  }

  function renderBreathlessnessSymptom() {
    const breath = currentCase().data.palliative.breathlessness;
    const o2Tests = breath.o2Tests || [makePalliativeO2Test()];
    return `<div class="symptom-detail symptom-card">
      <h3>Breathlessness</h3>
      ${inputField("palliative.breathlessness.activityTolerance", "Activity tolerance", { span: true, placeholder: "Remarks" })}
      <div class="subtle-box remark-row">
        <div class="inline-row" style="justify-content: space-between;">
          <p class="label">Oximetry</p>
          ${notTestPillField("palliative.breathlessness.oximetryDone", "Done")}
        </div>
        ${breath.oximetryDone ? `
          <div class="remark-row">
            <p class="label">Oxygen use during oximetry</p>
            ${choiceGroup("palliative.breathlessness.oxygenModes", ["Room Air", "O2"], "multi", { classes: "two" })}
          </div>
          ${breath.oxygenModes.includes("Room Air") ? renderOximetrySet("Room Air", "palliative.breathlessness.roomAir") : ""}
          ${breath.oxygenModes.includes("O2") ? `
            <div class="remark-row">
              <div class="carer-card-header">
                <p class="label">O2 flow tests</p>
              </div>
              ${o2Tests.map((test, index) => renderO2Test(test, index, o2Tests.length)).join("")}
              <div class="button-row palliative-add-entry-row">
                <button type="button" class="btn secondary" data-action="add-palliative-entry" data-palliative-list="o2Tests">Add O2 flow</button>
              </div>
            </div>` : ""}
        ` : ""}
      </div>
      <div class="remark-row">
        <p class="label">NRS /10 (At rest)</p>
        ${choiceGroup("palliative.breathlessness.nrsRest", scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
      <div class="remark-row">
        <p class="label">NRS /10 (Exertion)</p>
        ${choiceGroup("palliative.breathlessness.nrsExertion", scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
      <div class="remark-row">
        <p class="label">Confidence Score /10</p>
        ${choiceGroup("palliative.breathlessness.confidence", scoreChoices(), "single", { classes: "ten score-grid" })}
      </div>
    </div>`;
  }

  function renderO2Test(test, index, total) {
    const base = `palliative.breathlessness.o2Tests.${index}`;
    return `<div class="subtle-box remark-row">
      <div class="carer-card-header">
        <p class="label">O2 flow ${index + 1}</p>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-palliative-entry" data-palliative-list="o2Tests" data-entry-index="${h(index)}">Remove</button>` : ""}
      </div>
      ${inputField(`${base}.flow`, "O2 flow L/min", { type: "number", decimal: true, min: 0.5, max: 15, step: 0.5, clamp: true, placeholder: "0.5-15" })}
      ${renderOximetrySet("", base)}
    </div>`;
  }

  function renderOximetrySet(label, basePath) {
    return `<div class="subtle-box remark-row">
      ${label ? `<p class="label">${h(label)}</p>` : ""}
      <div class="oximetry-grid">
        ${renderOximetryVitals("At rest", `${basePath}.rest`)}
        ${renderOximetryVitals("Exertional Test", `${basePath}.exertion`)}
        ${renderOximetryVitals("At 2 minutes rest", `${basePath}.recovery`)}
      </div>
    </div>`;
  }

  function renderOximetryVitals(label, basePath) {
    return `<div class="subtle-box">
      <p class="label">${h(label)}</p>
      ${inputField(`${basePath}.sao2`, "SaO2 %", { type: "number", min: 0, max: 100, clamp: true })}
      <div class="remark-row">${inputField(`${basePath}.pulse`, "Pulse bpm", { type: "number", min: 0 })}</div>
    </div>`;
  }

  function renderEdemaSymptom() {
    const entries = currentCase().data.palliative.edema.entries || [makePalliativeEdemaEntry()];
    return `<div class="symptom-detail symptom-card">
      <div class="carer-card-header">
        <h3>Edema</h3>
        <button type="button" class="btn secondary" data-action="add-palliative-entry" data-palliative-list="edema">Add site</button>
      </div>
      ${entries.map((entry, index) => renderEdemaEntry(entry, index, entries.length)).join("")}
    </div>`;
  }

  function renderEdemaEntry(entry, index, total) {
    const base = `palliative.edema.entries.${index}`;
    return `<div class="subtle-box remark-row">
      <div class="carer-card-header">
        <p class="label">Site ${index + 1}</p>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-palliative-entry" data-palliative-list="edema" data-entry-index="${h(index)}">Remove</button>` : ""}
      </div>
      <div class="field-grid">
        ${inputField(`${base}.site`, "Site", { placeholder: "Remarks" })}
        ${inputField(`${base}.circumference`, "Circumference cm", { type: "number", decimal: true, min: 0 })}
      </div>
    </div>`;
  }

  function renderPressureInjurySymptom() {
    const entries = currentCase().data.palliative.pressureInjury.entries || [makePalliativePressureInjuryEntry()];
    return `<div class="symptom-detail symptom-card">
      <div class="carer-card-header">
        <h3>Pressure Injury</h3>
        <button type="button" class="btn secondary" data-action="add-palliative-entry" data-palliative-list="pressureInjury">Add site</button>
      </div>
      ${entries.map((entry, index) => renderPressureInjurySymptomEntry(entry, index, entries.length)).join("")}
    </div>`;
  }

  function renderPressureInjurySymptomEntry(entry, index, total) {
    const base = `palliative.pressureInjury.entries.${index}`;
    return `<div class="subtle-box remark-row">
      <div class="carer-card-header">
        <p class="label">Site ${index + 1}</p>
        ${total > 1 ? `<button type="button" class="btn danger" data-action="remove-palliative-entry" data-palliative-list="pressureInjury" data-entry-index="${h(index)}">Remove</button>` : ""}
      </div>
      ${inputField(`${base}.site`, "Site", { span: true, placeholder: "Remarks" })}
      <div class="remark-row">
        <p class="label">Skin condition</p>
        ${choiceGroup(`${base}.skinConditions`, BANK.pressureSkinConditions, "multi", { classes: "four" })}
        <div class="field-grid remark-row">${choiceRemarkInputs(BANK.pressureSkinConditions, `${base}.skinConditions`, `${base}.skinRemarks`)}</div>
      </div>
    </div>`;
  }

  function renderOtComment() {
    const bi = calculateBI();
    const biLinkedText = formatBiLinkedText(bi);
    const lawton = calculateLawton(currentCase().data.functional.lawton);
    const cognitive = otCommentCognitiveScoreSummary() || "No cognitive score entered";
    const palliative = palliativeGreenBoxText(currentCase().data);
    const fall = fallGreenBoxText(currentCase().data);
    return `
      <div class="group">
        <h3>Observation</h3>
        <div class="subtle-box">
          <div class="ot-comment-score-part">
            ${textareaField("otComment.majorObservation", "Major observation", { span: true, placeholder: "Type major observation" })}
          </div>
          <div class="ot-comment-score-part">
            <p><strong>ADL:</strong> ${h(biLinkedText)}</p>
            <div class="remark-row">${inputField("otComment.adlRemark", "ADL remarks", { span: true, placeholder: "Optional" })}</div>
          </div>
          ${isEmergencyMedicineCase() && lawton.complete ? `<div class="ot-comment-score-part">
            <p><strong>IADL:</strong> Lawton ${lawton.total}/27</p>
            <div class="remark-row">${textareaField("otComment.iadlRemark", "IADL remarks", { span: true, placeholder: "Optional" })}</div>
          </div>` : ""}
          <div class="ot-comment-score-part">
            <p><strong>Cognitive Function:</strong> ${h(cognitive)}</p>
            <div class="remark-row">${inputField("otComment.cognitiveRemark", "Cognitive Function remarks", { span: true, placeholder: "Optional" })}</div>
          </div>
          ${fall ? `<p><strong>Fall risk:</strong> ${h(fall)}</p>` : ""}
          ${palliative ? `<p><strong>Palliative care:</strong> ${h(palliative)}</p>` : ""}
        </div>
      </div>
      <div class="group">
        ${textareaField("otComment.freeText", "Free text", { span: true, placeholder: "No word limit" })}
      </div>`;
  }

  function renderProblem() {
    const data = currentCase().data;
    const patientOptions = patientFactorOptions();
    return `
      <div class="group">
        <h3>Patient Factor</h3>
        ${choiceGroup("problem.patient", patientOptions, "multi")}
        ${data.problem.patient.includes("Others") ? `<div class="remark-row">${inputField("problem.patientOther", "Other patient factor", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Environmental Factor</h3>
        ${choiceGroup("problem.environmental", BANK.environmentalFactors, "multi")}
        ${data.problem.environmental.includes("Others") ? `<div class="remark-row">${inputField("problem.environmentalOther", "Other environmental factor", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        <h3>Social Factor</h3>
        ${choiceGroup("problem.social", BANK.socialFactors, "multi")}
        ${data.problem.social.includes("Others") ? `<div class="remark-row">${inputField("problem.socialOther", "Other social factor", { span: true })}</div>` : ""}
      </div>
      <div class="group">
        ${checkboxField("problem.others", "Other problem")}
        ${data.problem.others ? `<div class="remark-row">${inputField("problem.othersText", "Other problem details", { span: true })}</div>` : ""}
      </div>`;
  }

  function renderPlanRecommendation() {
    const data = currentCase().data;
    const treatmentOptions = completedTreatmentOptions();
    const planOptions = treatmentPlanOptions();
    const recommendations = recommendationsFor();
    return `
      <div class="group">
        <h3>Treatment</h3>
        ${choiceGroup("plan.treatmentChoices", treatmentOptions, "multi", { classes: isEmergencyMedicineCase() ? "emergency-treatment-grid" : treatmentOptions.length >= 5 ? "five" : "four" })}
        <div class="field-grid remark-row">
          ${treatmentOptions.filter((item) => data.plan.treatmentChoices.includes(item.value) && item.program).map((item) => `<div class="subtle-box">
            <p class="label">${h(item.value)}</p>
            ${choiceGroup(`plan.treatmentPrograms.${item.value}`, ["Department training", "Home program"], "single", { classes: "two" })}
          </div>`).join("")}
          ${choiceRemarkInputs(treatmentOptions, "plan.treatmentChoices", "plan.treatmentRemarks")}
        </div>
      </div>
      <div class="group">
        <h3>Treatment Plan</h3>
        ${choiceGroup("plan.choices", planOptions, "multi", { classes: "three" })}
        <div class="field-grid remark-row">
          ${planOptions.filter((item) => data.plan.choices.includes(item.value) && item.program).map((item) => `
            <div class="subtle-box">
              <p class="label">${h(item.label || item.value)}</p>
              ${choiceGroup(`plan.programs.${item.value}`, ["Department training", "Home program"], "single", { classes: "two" })}
            </div>`).join("")}
          ${choiceRemarkInputs(planOptions, "plan.choices", "plan.remarks")}
        </div>
      </div>
      <div class="group">
        <h3>Recommendation</h3>
        ${choiceGroup("recommendation.choices", recommendations, "multi", { classes: "three" })}
        <div class="field-grid remark-row">${choiceRemarkInputs(recommendations, "recommendation.choices", "recommendation.remarks")}</div>
      </div>`;
  }

  function handleHomeAction(action, button) {
    if (action === "today") {
      const date = app.querySelector("#newDate");
      if (date) {
        date.value = formatDate(todayISO());
        homeDraft.date = date.value;
      }
      return;
    }
    if (action === "create-case") {
      const wardBed = app.querySelector("#newWard").value.trim();
      const assessmentDate = parseDisplayDate(app.querySelector("#newDate").value) || todayISO();
      const formType = app.querySelector("#newForm").value;
      homeDraft = {
        ward: wardBed,
        date: app.querySelector("#newDate").value,
        form: formType
      };
      homeReminder = {
        ward: wardBed ? "" : "Please enter the ward / bed number / initial.",
        form: formType ? "" : "Please select an assessment form."
      };
      if (!wardBed || !formType) {
        statusMessage = "";
        const wardInput = app.querySelector("#newWard");
        renderHome();
        const focusTarget = !wardBed ? app.querySelector("#newWard") : app.querySelector("#newForm");
        if (focusTarget) focusTarget.focus();
        return;
      }
      homeReminder = {};
      homeDraft = { ward: "", date: "", form: "" };
      const record = blankCase(wardBed, assessmentDate, formType);
      cases.unshift(record);
      currentCaseId = record.id;
      currentSection = 0;
      currentView = "form";
      statusMessage = "New case created and saved locally.";
      saveCases();
      renderWork();
      return;
    }
    if (action === "open-case") {
      currentCaseId = button.dataset.caseId;
      currentSection = 0;
      currentView = "form";
      statusMessage = AUTOSAVE_LABEL;
      renderWork();
      return;
    }
    if (action === "rename-case-inline") {
      const record = cases.find((item) => item.id === button.dataset.caseId);
      if (!record) return;
      const row = button.closest('.history-name-row');
      if (!row) return;
      import("../inline-rename.js").then(({ startInlineRename }) => startInlineRename(row, record.wardBed || "", async name => {
        record.wardBed = name;
        saveCases();
        renderHome();
      }));
      return;
    }
    if (action === "export-case-pdf") {
      const record = cases.find((item) => item.id === button.dataset.caseId);
      if (!record) return;
      button.disabled = true;
      button.textContent = "Exporting...";
      const previousId = currentCaseId;
      currentCaseId = record.id;
      (async () => {
        try {
          const exportRecord = { ...record, noteEdits: { ...record.noteEdits }, noteEditBases: { ...record.noteEditBases } };
          syncEditedNotesWithGenerated(exportRecord);
          const note = cleanSummaryNote({ ...generateNote(exportRecord), ...exportRecord.noteEdits });
          const titles = { greenBox: "Green box", common: "Common Assessment", problem: "Problem", remarks: "Remarks", recommendation: "Recommendation" };
          const sections = notePartKeysFor(exportRecord).map((key) => ({ title: titles[key], text: note[key] }));
          currentCaseId = previousId;
          downloadAssessmentPdf({ name: record.wardBed, formTitle: splitFormType(record.formType).form, date: formatDate(record.assessmentDate), sections });
        } catch (error) {
          alert(`PDF export failed: ${error.message}`);
        } finally {
          currentCaseId = previousId;
          button.disabled = false;
          button.textContent = "Export";
        }
      })();
      return;
    }
    if (action === "delete-case") {
      cases = cases.filter((record) => record.id !== button.dataset.caseId);
      saveCases();
      statusMessage = "Case deleted from this browser.";
      renderHome();
    }
  }

  function handleWorkAction(action, button) {
    const record = currentCase();
    if (!record) return;
    if (action === "main-home") {
      persistCurrent("Saved locally.");
      window.location.href = "../#shared-history";
      return;
    }
    if (action === "home") {
      persistCurrent("Saved locally.");
      currentCaseId = null;
      currentView = "home";
      if (window.history && window.history.replaceState && window.location.search) {
        window.history.replaceState(null, "", window.location.pathname);
      }
      renderHome();
      return;
    }
    if (action === "save-case") {
      persistCurrent("Saved locally.");
      currentView === "summary" ? renderSummary() : renderWork();
      return;
    }
    if (action === "summary") {
      persistCurrent("Saved locally.");
      renderSummary();
      return;
    }
    if (action === "back-form") {
      persistCurrent("Saved locally.");
      renderWork();
      return;
    }
    if (action === "previous" && currentSection > 0) {
      persistCurrent();
      currentSection -= 1;
      renderWork();
      return;
    }
    if (action === "next" && currentSection < sectionsFor(record).length - 1) {
      persistCurrent();
      currentSection += 1;
      renderWork();
      return;
    }
    if (action === "go-section") {
      persistCurrent();
      currentSection = Number(button.dataset.section);
      renderWork();
      return;
    }
    if (action === "toggle-orientation") {
      const item = button.dataset.orientationItem;
      if (item === "Home Address") record.data.mental.orientation.notAssessedHome = false;
      const path = `mental.orientation.items.${item}`;
      setPath(record.data, path, !getPath(record.data, path));
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "toggle-home-not-assessed") {
      const next = !record.data.mental.orientation.notAssessedHome;
      record.data.mental.orientation.notAssessedHome = next;
      if (next) record.data.mental.orientation.items["Home Address"] = false;
      if (!next) record.data.mental.orientation.items["Home Address"] = true;
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "toggle-lawton-interpretation") {
      record.data.functional.lawton.showInterpretation = !record.data.functional.lawton.showInterpretation;
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "toggle-bi-interpretation") {
      record.data.functional.showInterpretation = !record.data.functional.showInterpretation;
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "toggle-carer-interview") {
      record.data.functional.carerInterview.done = !record.data.functional.carerInterview.done;
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "toggle-hdrs-remark") {
      const key = button.dataset.hdrsItem;
      if (key) {
        const stateKey = hdrsRemarkStateKey(key);
        hdrsRemarkOpen[stateKey] = !hdrsRemarkOpen[stateKey];
      }
      renderWork();
      return;
    }
    if (action === "add-pressure-site") {
      record.data.pressureInjury.skinSites.push(makePressureInjurySite());
      syncEditedNotesWithGenerated(record);
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "remove-pressure-site") {
      const index = Number(button.dataset.siteIndex);
      if (record.data.pressureInjury.skinSites.length > 1 && Number.isInteger(index)) {
        record.data.pressureInjury.skinSites.splice(index, 1);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "add-palliative-entry") {
      const list = palliativeEntryList(record.data, button.dataset.palliativeList);
      const entry = makePalliativeEntry(button.dataset.palliativeList);
      if (list && entry) {
        list.push(entry);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "remove-palliative-entry") {
      const list = palliativeEntryList(record.data, button.dataset.palliativeList);
      const index = Number(button.dataset.entryIndex);
      if (list && list.length > 1 && Number.isInteger(index)) {
        list.splice(index, 1);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "add-home-o2-oximetry-test") {
      const oximetry = record.data.homeO2.oximetry;
      oximetry.done = true;
      oximetry.oxygenModes = Array.isArray(oximetry.oxygenModes) ? oximetry.oxygenModes : [];
      if (!oximetry.oxygenModes.includes("O2")) oximetry.oxygenModes.push("O2");
      oximetry.o2Tests = Array.isArray(oximetry.o2Tests) ? oximetry.o2Tests : [];
      oximetry.o2Tests.push(makeHomeO2AssessmentOximetrySet());
      syncEditedNotesWithGenerated(record);
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "remove-home-o2-oximetry-test") {
      const index = Number(button.dataset.testIndex);
      const tests = record.data.homeO2.oximetry.o2Tests || [];
      if (tests.length > 1 && Number.isInteger(index)) {
        tests.splice(index, 1);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "add-home-o2-test-activity") {
      const test = record.data.homeO2.oximetry.tests[Number(button.dataset.testIndex)];
      if (test) {
        test.activities.push(makeHomeO2Activity("", true));
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "remove-home-o2-test-activity") {
      const test = record.data.homeO2.oximetry.tests[Number(button.dataset.testIndex)];
      const index = Number(button.dataset.activityIndex);
      if (test && Number.isInteger(index) && test.activities[index] && test.activities[index].custom) {
        test.activities.splice(index, 1);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "add-fall-incident") {
      record.data.fall.incidents = record.data.fall.incidents || [makeFallIncident()];
      record.data.fall.incidents.push(makeFallIncident());
      syncEditedNotesWithGenerated(record);
      persistCurrent();
      renderWork();
      return;
    }
    if (action === "remove-fall-incident") {
      record.data.fall.incidents = record.data.fall.incidents || [makeFallIncident()];
      const index = Number(button.dataset.entryIndex);
      if (record.data.fall.incidents.length > 1 && Number.isInteger(index)) {
        record.data.fall.incidents.splice(index, 1);
        syncEditedNotesWithGenerated(record);
        persistCurrent();
        renderWork();
      }
      return;
    }
    if (action === "edit-note") {
      const node = app.querySelector(`[data-note-key="${CSS.escape(button.dataset.editTarget)}"]`);
      if (node) {
        node.removeAttribute("readonly");
        node.classList.add("editing");
        node.focus();
        button.textContent = "Editing";
      }
      return;
    }
    if (action === "copy-note") {
      copyNote(button.dataset.copyTarget);
    }
  }

  function handleChoice(button) {
    const record = currentCase();
    if (!record) return;
    const path = button.dataset.choicePath;
    const value = button.dataset.choiceValue;
    const mode = button.dataset.choiceMode;
    if (mode === "single") {
      const current = getPath(record.data, path);
      setPath(record.data, path, current === value ? "" : value);
    } else if (mode === "multi") {
      const exclusive = button.dataset.exclusive === "true";
      const exclusiveValues = (button.dataset.exclusiveValues || "").split("|").filter(Boolean);
      const current = getPath(record.data, path) || [];
      const selected = current.includes(value);
      let next;
      if (selected) {
        next = current.filter((item) => item !== value);
      } else if (exclusive) {
        next = [value];
      } else {
        next = current.filter((item) => !exclusiveValues.includes(item));
        next.push(value);
      }
      setPath(record.data, path, next);
    } else if (mode === "consecutive") {
      const order = (button.dataset.order || "").split("|").filter(Boolean);
      const exclusiveValues = (button.dataset.exclusiveValues || "").split("|").filter(Boolean);
      const current = getPath(record.data, path) || [];
      setPath(record.data, path, nextConsecutiveSelection(current, value, order, exclusiveValues));
    }
    cleanDependentState(path);
    persistCurrent();
    renderWork();
  }

  function nextConsecutiveSelection(current, value, order, exclusiveValues = []) {
    const exclusives = [...new Set(["Not follow command", ...exclusiveValues])];
    if (exclusives.includes(value)) return current.includes(value) ? [] : [value];
    current = current.filter((item) => !exclusives.includes(item));
    if (current.includes(value)) return current.filter((item) => item !== value);
    const candidate = [...current, value].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (candidate.length === 1) return candidate;
    if (candidate.length === 2 && Math.abs(order.indexOf(candidate[0]) - order.indexOf(candidate[1])) === 1) return candidate;
    return [value];
  }

  function normalizeCommandSelection(commands) {
    const values = Array.isArray(commands) ? commands.filter(Boolean) : commands ? [commands] : [];
    if (values.includes("Not follow command")) return ["Not follow command"];
    const ordered = BANK.commandFollowing.filter((item) => values.includes(item) && item !== "Not follow command");
    if (ordered.length <= 2 && (ordered.length < 2 || Math.abs(BANK.commandFollowing.indexOf(ordered[0]) - BANK.commandFollowing.indexOf(ordered[1])) === 1)) return ordered;
    return ordered.slice(-1);
  }

  function hasCommandInput(commands) {
    return Array.isArray(commands) ? commands.length > 0 : !!commands;
  }

  function formatCommandSummary(commands) {
    const selected = normalizeCommandSelection(commands);
    if (!selected.length) return "";
    if (selected.includes("Not follow command")) return "Not follow command";
    if (selected.includes("Follow 1 step command") && selected.includes("Follow 2 steps command")) return "Follow 1-2 steps command";
    if (selected.includes("Follow 2 steps command") && selected.includes("Follow 3 steps command")) return "Follow 2-3 steps command";
    return selected[0] || "";
  }

  function handleBiChoice(button) {
    const record = currentCase();
    if (!record) return;
    const key = button.dataset.biKey;
    const value = button.dataset.biValue;
    const item = record.data.functional.bi[key];
    if (value === "NA") {
      item.notAssessed = true;
      item.score = "";
    } else if (!item.notAssessed && String(item.score) === String(value)) {
      item.score = "";
      item.notAssessed = true;
    } else {
      item.notAssessed = false;
      item.score = value;
    }
    persistCurrent();
    renderWork();
  }

  function handleFratScoreChoice(button) {
    const record = currentCase();
    if (!record) return;
    const key = button.dataset.fratKey;
    const value = button.dataset.fratValue;
    const scores = record.data.fall.frat.scores;
    scores[key] = String(scores[key]) === String(value) ? "" : value;
    persistCurrent();
    renderWork();
  }

  function handleFratChecklistChoice(button) {
    const record = currentCase();
    if (!record) return;
    const key = button.dataset.fratKey;
    const value = button.dataset.fratValue;
    const current = normalizeFratChecklistStatus(record.data.fall.frat.checklist[key]);
    record.data.fall.frat.checklist[key] = current === value && value !== "No" ? "No" : value;
    persistCurrent();
    renderWork();
  }

  function handleFratOverallChoice(button) {
    const record = currentCase();
    if (!record || calculateFrat(record.data).automaticHigh) return;
    const value = button.dataset.fratValue;
    const current = record.data.fall.frat.overall;
    record.data.fall.frat.overall = current === value ? "" : value;
    persistCurrent();
    renderWork();
  }

  function cleanDependentState(path) {
    const data = currentCase().data;
    if (path === "premorbid.cognitive.choices") {
      const cognitive = data.premorbid.cognitive;
      cognitive.choices = [...cognitive.choices.filter((choice) => choice !== "Others").slice(-1), ...cognitive.choices.filter((choice) => choice === "Others")];
      cognitive.unremarkable = false;
      if (!cognitive.choices.includes("Others")) cognitive.remarks = "";
    }
    if (path.startsWith("functional.lawton.scores.")) data.functional.lawton.notTest = false;
    if (path === "premorbid.behavioral.status" && data.premorbid.behavioral.status !== "Yes") data.premorbid.behavioral.remarks = "";
    if (path === "mental.mood.choices") {
      const choices = data.mental.mood.choices;
      const primary = choices.filter((choice) => choice !== "Others").slice(-1);
      data.mental.mood.choices = [...primary, ...choices.filter((choice) => choice === "Others")];
      if (!choices.includes("Others")) data.mental.mood.other = "";
    }
    if (path === "mental.cognitive.cdtUnable" && data.mental.cognitive.cdtUnable) data.mental.cognitive.cdt = "";
    if (path === "mental.cognitive.cdt" && data.mental.cognitive.cdt !== "") data.mental.cognitive.cdtUnable = false;
    if (path === "vitals.oxygenMode") {
      if (data.vitals.oxygenMode !== "O2") data.vitals.oxygenL = "";
      if (data.vitals.oxygenMode !== "FiO2") data.vitals.fio2 = "";
    }
    if (path === "premorbid.walk.status") {
      if (!["Independent", "Supervision", "Assisted", "Dependent"].includes(data.premorbid.walk.status)) {
        data.premorbid.walk.aid = "";
        data.premorbid.walk.aidOther = "";
        data.premorbid.walk.remarks = "";
      }
      if (data.premorbid.walk.status === "Dependent" && !["Chairbound", "Bedbound", "Others"].includes(data.premorbid.walk.aid)) {
        data.premorbid.walk.aid = "";
        data.premorbid.walk.aidOther = "";
      }
    }
    if (path === "premorbid.outdoor.status" && !["Independent", "Supervision", "Assisted", "Dependent"].includes(data.premorbid.outdoor.status)) {
      data.premorbid.outdoor.aid = "";
      data.premorbid.outdoor.aidOther = "";
      data.premorbid.outdoor.remarks = "";
    }
    if (path === "social.socialServices.choices" && !data.social.socialServices.choices.includes("Home Help Service")) {
      data.social.socialServices.homeHelp = [];
      data.social.socialServices.homeHelpRemarks = {};
    }
    if (path === "social.socialServices.homeHelp") {
      Object.keys(data.social.socialServices.homeHelpRemarks || {}).forEach((key) => {
        if (!data.social.socialServices.homeHelp.includes(key)) delete data.social.socialServices.homeHelpRemarks[key];
      });
    }
    if (path === "functional.mobilityMode") {
      if (data.functional.bi.mobility.score === "") data.functional.bi.mobility.notAssessed = true;
      if (data.functional.bi.wheelchair.score === "") data.functional.bi.wheelchair.notAssessed = true;
    }
    if (path === "physical.powerGroup.limbMovement" && data.physical.powerGroup.limbMovement) {
      data.physical.powerGroup.pending = false;
      data.physical.powerGroup.pendingReason = "";
      data.physical.powerGroup.power = { rightUl: "", leftUl: "", rightLl: "", leftLl: "" };
      data.physical.powerGroup.tone = "";
      data.physical.powerGroup.toneOther = "";
      data.physical.powerGroup.coordination = "";
      data.physical.powerGroup.coordinationOther = "";
    }
    if (path.startsWith("physical.powerGroup.power.") || path === "physical.powerGroup.tone" || path === "physical.powerGroup.coordination") {
      data.physical.powerGroup.limbMovement = "";
      data.physical.powerGroup.pending = false;
      data.physical.powerGroup.pendingReason = "";
    }
    syncPendingAssessmentSection(path, data.physical.balance, "physical.balance", ["sitting", "standing"]);
    syncPendingAssessmentSection(path, data.physical.transfer, "physical.transfer", ["lyeToSit", "sitToStand", "ambulation"]);
    if (path === "physical.functionalBalance.notApplicable" && data.physical.functionalBalance.notApplicable) {
      data.physical.functionalBalance.singleLegLeft = "";
      data.physical.functionalBalance.singleLegRight = "";
      data.physical.functionalBalance.tug = "";
      data.physical.functionalBalance.reachTrial1 = "";
      data.physical.functionalBalance.reachTrial2 = "";
    }
    if (path.startsWith("physical.functionalBalance.") && path !== "physical.functionalBalance.notApplicable") {
      const balance = data.physical.functionalBalance;
      const hasInput = !!(balance.singleLegLeft || balance.singleLegRight || balance.tug || balance.reachTrial1 || balance.reachTrial2);
      if (hasInput) balance.notApplicable = false;
    }
    if (path === "mental.cognitive.amt.unable") {
      if (data.mental.cognitive.amt.unable) {
        data.mental.cognitive.amt.answers = makeAmtAnswers();
        data.mental.cognitive.amt.directScore = "";
      }
    }
    if (path.startsWith("mental.cognitive.amt.answers.")) {
      data.mental.cognitive.amt.unable = false;
      data.mental.cognitive.amt.directScore = "";
    }
    if (path === "mental.cognitive.amt.directScore" && hasDirectAmtScore(data.mental.cognitive.amt)) {
      data.mental.cognitive.amt.unable = false;
      data.mental.cognitive.amt.answers = makeAmtAnswers();
    }
    if (path === "mental.cognitive.cdtDone" && !data.mental.cognitive.cdtDone) {
      data.mental.cognitive.cdt = "";
    }
    if (path === "mental.cognitive.moca.done" && !data.mental.cognitive.moca.done) {
      data.mental.cognitive.moca.total = "";
      data.mental.cognitive.moca.ageRange = "";
      data.mental.cognitive.moca.education = "";
      data.mental.cognitive.moca.percentile = "";
      data.mental.cognitive.impression = "";
      Object.keys(data.mental.cognitive.moca.subscales || {}).forEach((key) => {
        data.mental.cognitive.moca.subscales[key] = "";
      });
    }
    if (path === "fall.risk" && data.fall.risk !== "Yes") {
      data.fall.level = "";
      data.fall.factors = [];
      data.fall.factorOther = "";
    }
    if (path === "fall.factors" && !data.fall.factors.includes("Others")) {
      data.fall.factorOther = "";
    }
    if (path === "fall.history" && data.fall.history !== "Yes") {
      data.fall.frequency = "";
      data.fall.incidents = [makeFallIncident()];
      data.fall.incidentRemarks = "";
    }
    const fallIncidentReasonMatch = path.match(/^fall\.incidents\.(\d+)\.reasons?$/);
    if (fallIncidentReasonMatch) {
      const incident = data.fall.incidents[Number(fallIncidentReasonMatch[1])];
      if (incident && !(isEmergencyMedicineCase() ? incident.reasons.includes("Other") : incident.reason === "Other")) incident.reasonOther = "";
    }
    if (path === "problem.nilMode" && data.problem.nilMode) {
      data.problem.patient = [];
      data.problem.environmental = [];
      data.problem.social = [];
      data.problem.others = false;
      data.problem.patientOther = "";
      data.problem.environmentalOther = "";
      data.problem.socialOther = "";
      data.problem.othersText = "";
    }
    if (["problem.patient", "problem.environmental", "problem.social"].includes(path)) {
      const hasProblemFactor = data.problem.patient.length || data.problem.environmental.length || data.problem.social.length;
      if (hasProblemFactor) data.problem.nilMode = "";
    }
    if (path === "problem.others" && data.problem.others) {
      data.problem.nilMode = "";
    }
    if (path === "plan.treatmentChoices") {
      for (const field of ["treatmentRemarks", "treatmentPrograms"]) {
        Object.keys(data.plan[field]).forEach((key) => {
          if (!data.plan.treatmentChoices.includes(key)) delete data.plan[field][key];
        });
      }
    }
    if (path === "plan.choices") {
      Object.keys(data.plan.remarks || {}).forEach((key) => {
        if (!data.plan.choices.includes(key)) delete data.plan.remarks[key];
      });
    }
    if (path === "recommendation.choices") {
      Object.keys(data.recommendation.remarks || {}).forEach((key) => {
        if (!data.recommendation.choices.includes(key)) delete data.recommendation.remarks[key];
      });
    }
    if (path === "palliative.symptoms") {
      Object.keys(data.palliative.remarks || {}).forEach((key) => {
        if (!data.palliative.symptoms.includes(key)) delete data.palliative.remarks[key];
      });
    }
    if (path === "palliative.breathlessness.oximetryDone" && !data.palliative.breathlessness.oximetryDone) {
      data.palliative.breathlessness.oxygenModes = [];
      data.palliative.breathlessness.oxygenL = "";
      data.palliative.breathlessness.o2Tests = [makePalliativeO2Test()];
    }
    if (path === "palliative.breathlessness.oxygenModes") {
      if (!data.palliative.breathlessness.oxygenModes.includes("O2")) data.palliative.breathlessness.oxygenL = "";
    }
    if (path === "palliative.breathlessness.oxygenModes" && !data.palliative.breathlessness.oxygenModes.includes("O2")) {
      data.palliative.breathlessness.o2Tests = [makePalliativeO2Test()];
    }
    if (path === "homeO2.oximetry.done" && !data.homeO2.oximetry.done) {
      data.homeO2.oximetry.oxygenModes = [];
    }
    if (path === "homeO2.oximetry.oxygenModes" || path === "homeO2.oximetry.done") {
      ensureHomeO2AssessmentOximetryForModes(data.homeO2.oximetry);
    }
    const homeO2OximetryTestModeMatch = path.match(/^homeO2\.oximetry\.tests\.(\d+)\.oxygenMode$/);
    if (homeO2OximetryTestModeMatch) {
      const test = data.homeO2.oximetry.tests[Number(homeO2OximetryTestModeMatch[1])];
      if (test && test.oxygenMode !== "O2") test.oxygenL = "";
    }
    if (path === "palliative.pressureInjury.skinConditions") {
      Object.keys(data.palliative.pressureInjury.skinRemarks || {}).forEach((key) => {
        if (!data.palliative.pressureInjury.skinConditions.includes(key)) delete data.palliative.pressureInjury.skinRemarks[key];
      });
    }
    const palliativePressureEntryMatch = path.match(/^palliative\.pressureInjury\.entries\.(\d+)\.skinConditions$/);
    if (palliativePressureEntryMatch) {
      const entry = data.palliative.pressureInjury.entries[Number(palliativePressureEntryMatch[1])];
      if (entry) {
        Object.keys(entry.skinRemarks || {}).forEach((key) => {
          if (!entry.skinConditions.includes(key)) delete entry.skinRemarks[key];
        });
      }
    }
    const pressureSiteMatch = path.match(/^pressureInjury\.skinSites\.(\d+)\.(.+)$/);
    if (pressureSiteMatch) {
      const site = data.pressureInjury.skinSites[Number(pressureSiteMatch[1])];
      const field = pressureSiteMatch[2];
      if (site) {
        if (field === "areas" && !site.areas.includes("Others")) site.areaOther = "";
        if (field === "pressureInjury" && site.pressureInjury !== "Yes") site.stage = "";
        if (field === "dressing" && site.dressing !== "Yes") site.dressingSite = "";
        if (field === "skinConditions") {
          if (!site.skinConditions.includes("Erythema")) site.erythemaType = "";
          Object.keys(site.skinRemarks || {}).forEach((key) => {
            if (!site.skinConditions.includes(key)) delete site.skinRemarks[key];
          });
        }
        if (field === "attachments" && !site.attachments.includes("Device")) site.deviceRemark = "";
      }
    }
    if (path === "pressureInjury.physical.contracture.status" && data.pressureInjury.physical.contracture.status !== "Yes") {
      data.pressureInjury.physical.contracture.site = "";
    }
    if (path === "pressureInjury.physical.powerGroup.limbMovement" && data.pressureInjury.physical.powerGroup.limbMovement) {
      data.pressureInjury.physical.powerGroup.pending = false;
      data.pressureInjury.physical.powerGroup.pendingReason = "";
      data.pressureInjury.physical.powerGroup.power = { rightUl: "", leftUl: "", rightLl: "", leftLl: "" };
    }
    if (path.startsWith("pressureInjury.physical.powerGroup.power.")) {
      data.pressureInjury.physical.powerGroup.limbMovement = "";
      data.pressureInjury.physical.powerGroup.pending = false;
      data.pressureInjury.physical.powerGroup.pendingReason = "";
    }
    if (path === "pressureInjury.physical.sensation") {
      Object.keys(data.pressureInjury.physical.sensationRemarks || {}).forEach((key) => {
        if (!data.pressureInjury.physical.sensation.includes(key)) delete data.pressureInjury.physical.sensationRemarks[key];
      });
    }
    if (path === "pressureInjury.problem.choices" && !data.pressureInjury.problem.choices.includes("Others")) {
      data.pressureInjury.problem.other = "";
    }
    const pressureManagement = data.pressureInjury.management;
    if (path === "pressureInjury.management.devicePrescription" && pressureManagement.devicePrescription !== "Prescription of pressure relieving device") {
      pressureManagement.devices = [];
      pressureManagement.deviceRemarks = {};
      pressureManagement.regimes = {};
      pressureManagement.regimeRemarks = {};
      pressureManagement.deviceAction = "";
      pressureManagement.treatmentChecks = [];
    }
    if (path === "pressureInjury.management.devices") {
      Object.keys(pressureManagement.deviceRemarks || {}).forEach((key) => {
        if (!pressureManagement.devices.includes(key)) delete pressureManagement.deviceRemarks[key];
      });
      Object.keys(pressureManagement.regimes || {}).forEach((key) => {
        if (!pressureManagement.devices.includes(key)) delete pressureManagement.regimes[key];
      });
      Object.keys(pressureManagement.regimeRemarks || {}).forEach((key) => {
        if (!pressureManagement.devices.includes(key)) delete pressureManagement.regimeRemarks[key];
      });
      pressureManagement.treatmentChecks = (pressureManagement.treatmentChecks || []).filter((key) => pressureManagement.devices.includes(key));
    }
    const regimeMatch = path.match(/^pressureInjury\.management\.regimes\.(.+)$/);
    if (regimeMatch) {
      const device = regimeMatch[1];
      const regimes = pressureManagement.regimes[device] || [];
      if (!regimes.includes("Others") && pressureManagement.regimeRemarks[device]) {
        delete pressureManagement.regimeRemarks[device].Others;
      }
    }
    if (path === "pressureInjury.management.interventions") {
      Object.keys(pressureManagement.interventionRemarks || {}).forEach((key) => {
        if (!pressureManagement.interventions.includes(key)) delete pressureManagement.interventionRemarks[key];
      });
    }
    if (path === "pressureInjury.management.treatmentItems") {
      Object.keys(pressureManagement.treatmentRemarks || {}).forEach((key) => {
        if (!pressureManagement.treatmentItems.includes(key)) delete pressureManagement.treatmentRemarks[key];
      });
    }
    const ted = data.ted;
    if (path === "ted.skin.conditions") {
      Object.keys(ted.skin.conditionRemarks || {}).forEach((key) => {
        if (!ted.skin.conditions.includes(key)) delete ted.skin.conditionRemarks[key];
      });
    }
    if (path === "ted.skin.pressureInjury" && ted.skin.pressureInjury !== "Yes") {
      ted.skin.stage = "";
    }
    if (path === "ted.skin.swelling" && ted.skin.swelling !== "Yes") {
      ted.skin.swellingLimbs = [];
    }
    if (path === "ted.physical.powerGroup.limbMovement" && ted.physical.powerGroup.limbMovement) {
      ted.physical.powerGroup.pending = false;
      ted.physical.powerGroup.pendingReason = "";
      ted.physical.powerGroup.power = { rightUl: "", leftUl: "", rightLl: "", leftLl: "" };
    }
    if (path.startsWith("ted.physical.powerGroup.power.")) {
      ted.physical.powerGroup.limbMovement = "";
      ted.physical.powerGroup.pending = false;
      ted.physical.powerGroup.pendingReason = "";
    }
    if (path === "ted.physical.sensation") {
      Object.keys(ted.physical.sensationRemarks || {}).forEach((key) => {
        if (!ted.physical.sensation.includes(key)) delete ted.physical.sensationRemarks[key];
      });
    }
    if (path === "ted.management.tx") {
      if (!ted.management.tx.includes("Not fit for TED stocking")) {
        ted.management.notFitReasons = [];
        ted.management.notFitOther = "";
      }
      if (!ted.management.tx.includes("Compression stocking prescribed")) {
        ted.management.stockingType = "";
        ted.management.size = "";
        ted.management.regimes = [];
        ted.management.regimeOther = "";
        ted.management.education = false;
      }
      const checkLabel = tedCheckPlanLabel(ted.management);
      ted.management.plan = (ted.management.plan || []).filter((item) => item !== "Check TED stocking" && item !== "Check tailor made stocking" && item !== "Check compression stocking" || item === checkLabel);
    }
    if (path === "ted.management.notFitReasons" && !ted.management.notFitReasons.includes("Others")) {
      ted.management.notFitOther = "";
    }
    if (path === "ted.management.stockingType") {
      if (ted.management.stockingType !== "Commercial type TED stocking") ted.management.size = "";
      ted.management.regimes = [];
      ted.management.regimeOther = "";
      ted.management.education = false;
      const checkLabel = tedCheckPlanLabel(ted.management);
      ted.management.plan = (ted.management.plan || []).filter((item) => item !== "Check TED stocking" && item !== "Check tailor made stocking" && item !== "Check compression stocking" || item === checkLabel);
    }
    if (path === "ted.management.regimes" && !ted.management.regimes.includes("Others")) {
      ted.management.regimeOther = "";
    }
    const homeO2 = data.homeO2;
    if (path === "homeO2.oximetry.regime.option" && homeO2.oximetry.regime.option !== "Home O2 indicated") {
      homeO2.oximetry.regime.sleep = "";
      homeO2.oximetry.regime.rest = "";
      homeO2.oximetry.regime.exertion = "";
    }
    const homeO2TestOxygenMatch = path.match(/^homeO2\.oximetry\.tests\.(\d+)\.oxygenMode$/);
    if (homeO2TestOxygenMatch) {
      const test = getPath(data, `homeO2.oximetry.tests.${homeO2TestOxygenMatch[1]}`);
      if (test && test.oxygenMode !== "O2") test.oxygenL = "";
    }
    const homeO2ActivityStatusMatch = path.match(/^homeO2\.oximetry\.tests\.(\d+)\.activities\.(\d+)\.status$/);
    if (homeO2ActivityStatusMatch) {
      const activity = getPath(data, `homeO2.oximetry.tests.${homeO2ActivityStatusMatch[1]}.activities.${homeO2ActivityStatusMatch[2]}`);
      if (activity) {
        if (activity.status === "Completed") {
          activity.notCompletedReason = "";
        } else if (activity.status === "Not completed") {
          clearHomeO2ActivityMeasurements(activity);
        } else {
          activity.notCompletedReason = "";
          clearHomeO2ActivityMeasurements(activity);
        }
      }
    }
    const homeO2AssessmentStatusMatch = path.match(/^homeO2\.oximetry\.(roomAir|o2Tests\.\d+)\.status$/);
    if (homeO2AssessmentStatusMatch) {
      const set = getPath(data, `homeO2.oximetry.${homeO2AssessmentStatusMatch[1]}`);
      if (set) {
        if (set.status === "Not completed") {
          set.exertion = makeOximetryPoint();
          set.recovery = makeOximetryPoint();
          set.sob = "";
        } else {
          set.notCompletedReason = "";
        }
      }
    }
    if (path === "homeO2.treatment.choices" && !homeO2.treatment.choices.includes("Others")) {
      homeO2.treatment.other = "";
    }
    if (path === "homeO2.treatment.choices") {
      syncHomeO2RemarkDatesFromTreatment(homeO2, currentCase());
      if (!homeO2.treatment.choices.includes("Home O2 education")) {
        homeO2.treatment.educationStatus = "";
        homeO2.treatment.educationDate = "";
      }
    }
    if (path === "homeO2.treatment.educationStatus" && homeO2.treatment.educationStatus !== "Arranged on") {
      homeO2.treatment.educationDate = "";
    }
    if (path === "homeO2.treatment.plan" && !homeO2.treatment.plan.includes("Home O2 education")) {
      homeO2.treatment.pendingEducationDate = "";
    }
    if (path === "homeO2.decision.deviceChoices") {
      if (!homeO2.decision.deviceChoices.includes("Portable Oxygen Concentrator")) {
        homeO2.decision.portableOxygenConcentratorModel = "";
      }
      if (!homeO2.decision.deviceChoices.includes("Conserving Device")) {
        homeO2.decision.conservingDeviceModel = "";
      }
      if (!homeO2.decision.deviceChoices.includes("Accessories")) {
        homeO2.decision.accessories = [];
        homeO2.decision.nasalCannulaLengths = [];
        homeO2.decision.accessoryOther = "";
      }
    }
    if (path === "homeO2.decision.accessories") {
      if (!homeO2.decision.accessories.includes("Nasal Cannula")) {
        homeO2.decision.nasalCannulaLengths = [];
      }
      if (!homeO2.decision.accessories.includes("Others")) {
        homeO2.decision.accessoryOther = "";
      }
    }
    if (path === "homeO2.decision.deliveryStatus" && homeO2.decision.deliveryStatus !== "Arranged on") {
      homeO2.decision.deliveryDate = "";
    }
    if (path === "homeO2.decision.consentSignedBy" && homeO2.decision.consentSignedBy !== "Others") {
      homeO2.decision.consentSignedByOther = "";
    }
    syncMocaDerived(data);
    syncEditedNotesWithGenerated(currentCase());
  }

  function syncHomeO2RemarkDatesFromTreatment(homeO2, record) {
    const choices = homeO2.treatment.choices || [];
    const date = record && record.assessmentDate || todayISO();
    if (choices.includes(HOME_O2_BREATHING_TREATMENT) && !homeO2.remarks.breathingEducationDate) {
      homeO2.remarks.breathingEducationDate = date;
    } else if (!choices.includes(HOME_O2_BREATHING_TREATMENT)) {
      homeO2.remarks.breathingEducationDate = "";
    }
    if (choices.includes(HOME_O2_HAGO_TREATMENT) && !homeO2.remarks.haGoDate) {
      homeO2.remarks.haGoDate = date;
    } else if (!choices.includes(HOME_O2_HAGO_TREATMENT)) {
      homeO2.remarks.haGoDate = "";
    }
  }

  function clearHomeO2ActivityMeasurements(activity) {
    activity.beginning = makeOximetryPoint();
    activity.dyspnea = "";
    activity.immediate = makeOximetryPoint();
    activity.recovery = makeOximetryPoint();
    activity.assistance = "";
  }

  function syncPendingAssessmentSection(path, section, basePath, keys) {
    if (!section || !keys.some((key) => path.startsWith(`${basePath}.${key}.`))) return;
    keys.forEach((key) => {
      const group = section[key];
      if (!group) return;
      const pendingPath = `${basePath}.${key}.pending`;
      const levelsPath = `${basePath}.${key}.levels`;
      if (path === pendingPath) {
        if (group.pending) {
          group.levels = [];
          group.pendingReason = "";
          if ("aidRemark" in group) group.aidRemark = "";
        } else {
          group.pendingReason = "";
        }
      }
      if (path === levelsPath && group.levels && group.levels.length) {
        group.pending = false;
        group.pendingReason = "";
      }
    });
    if (!keys.some((key) => section[key] && section[key].pending)) section.notTestReason = "";
  }

  function handleInput(event) {
    const target = event.target;
    const record = currentCase();
    if (target.dataset.noteKey) {
      if (!record) return;
      const note = generateNote(record);
      record.noteEdits = record.noteEdits || {};
      record.noteEditBases = record.noteEditBases || {};
      record.noteEdits[target.dataset.noteKey] = target.value;
      record.noteEditBases[target.dataset.noteKey] = note[target.dataset.noteKey] || "";
      if (record.copiedParts) delete record.copiedParts[target.dataset.noteKey];
      updateNoteLimitWarning(target);
      persistCurrent();
      return;
    }
    if (!record) return;
    if (target.dataset.bpCombined === "true") {
      syncBpInput(target.value, record.data);
      cleanDependentState("vitals.bpCombined");
      persistCurrent();
      refreshNoteOutputs();
      return;
    }
    if (!target.dataset.bind) return;
    if (!record) return;
    if (target.dataset.number === "true") {
      const cleaned = target.dataset.decimal === "true" ? sanitizeDecimalInput(target.value) : target.value.replace(/[^\d]/g, "");
      if (cleaned !== target.value) target.value = cleaned;
      if (target.dataset.clamp === "true" && target.value !== "" && !(target.dataset.decimal === "true" && target.value.endsWith("."))) {
        const max = target.dataset.max === undefined ? null : Number(target.dataset.max);
        const min = target.dataset.min === undefined ? null : Number(target.dataset.min);
        let numeric = Number(target.value);
        if (max !== null && numeric > max) numeric = max;
        if (target.dataset.decimal !== "true" && min !== null && numeric < min) numeric = min;
        target.value = String(numeric);
      }
    }
    if (target.dataset.gcs === "true") {
      const cleaned = sanitizeGcsInput(target.value, target.dataset.gcsMax, target.dataset.gcsSpecial);
      if (cleaned !== target.value) target.value = cleaned;
    }
    const value = target.type === "checkbox" ? target.checked : target.value;
    setPath(record.data, target.dataset.bind, value);
    cleanDependentState(target.dataset.bind);
    if (target.dataset.bind === "mental.cognitive.cdt") {
      refreshCdtDerivedDisplay(record.data.mental.cognitive.cdt);
    }
    if (target.dataset.bind.startsWith("mental.cognitive.moca.")) {
      refreshMocaDerivedDisplay(record.data.mental.cognitive.moca);
    }
    persistCurrent();
    refreshNoteOutputs();
  }

  function handleChange(event) {
    const target = event.target;
    const record = currentCase();
    if (!record) return;
    if (target.dataset.feedingRoute) {
      const item = record.data.functional.bi[target.dataset.feedingKey];
      item.feedingRoute = target.checked ? target.dataset.feedingRoute : "";
      persistCurrent();
      renderWork();
      return;
    }
    if (target.dataset.bind) {
      if (target.dataset.decimal === "true") {
        target.value = normalizeStepInput(target.value, target);
      }
      const value = target.type === "checkbox" ? target.checked : target.value;
      setPath(record.data, target.dataset.bind, value);
      cleanDependentState(target.dataset.bind);
      persistCurrent();
      if (target.type === "checkbox" || target.tagName === "SELECT") {
        renderWork();
      } else {
        refreshNoteOutputs();
      }
      return;
    }
    if (target.dataset.biScore) {
      const key = target.dataset.biScore;
      const item = record.data.functional.bi[key];
      if (target.value === "NA") {
        item.notAssessed = true;
        item.score = "";
      } else {
        item.notAssessed = false;
        item.score = target.value;
      }
      persistCurrent();
      renderWork();
    }
  }

  function refreshNoteOutputs() {
    const record = currentCase();
    if (!record) return;
    syncEditedNotesWithGenerated(record);
    const note = generateNote(record);
    app.querySelectorAll("[data-note-key]").forEach((node) => {
      const value = record.noteEdits && node.dataset.noteKey in record.noteEdits ? record.noteEdits[node.dataset.noteKey] : note[node.dataset.noteKey] || "";
      node.value = stripSummaryLinePeriods(value);
      updateNoteLimitWarning(node);
    });
  }

  function syncEditedNotesWithGenerated(record) {
    if (!record || !record.noteEdits || !Object.keys(record.noteEdits).length) return;
    const note = generateNote(record);
    record.noteEditBases = record.noteEditBases || {};
    Object.keys(record.noteEdits).forEach((key) => {
      const generated = note[key] || "";
      const base = record.noteEditBases[key] || "";
      const edited = record.noteEdits[key] || "";
      if (edited === generated) {
        delete record.noteEdits[key];
        delete record.noteEditBases[key];
        return;
      }
      const merged = mergeGeneratedChangesIntoEdit(edited, base, generated);
      if (merged !== edited && record.copiedParts) delete record.copiedParts[key];
      record.noteEdits[key] = merged;
      record.noteEditBases[key] = generated;
    });
  }

  function mergeGeneratedChangesIntoEdit(edited, base, generated) {
    if (generated === base) return edited;
    if (!edited || edited === base) return generated;
    const baseLines = splitNoteLines(base);
    const generatedLines = splitNoteLines(generated);
    const baseSet = new Set(baseLines.map(normalizeNoteLine).filter(Boolean));
    const generatedSet = new Set(generatedLines.map(normalizeNoteLine).filter(Boolean));
    const editedLines = String(edited).split("\n");
    const existing = new Set(editedLines.map(normalizeNoteLine).filter(Boolean));
    const removedBaseLines = new Set([...baseSet].filter((line) => !generatedSet.has(line)));
    let firstRemovalIndex = -1;
    const kept = editedLines.filter((line, index) => {
      const normalized = normalizeNoteLine(line);
      const remove = normalized && removedBaseLines.has(normalized);
      if (remove && firstRemovalIndex < 0) firstRemovalIndex = index;
      return !remove;
    });
    const additions = generatedLines.filter((line) => {
      const normalized = normalizeNoteLine(line);
      return normalized && !baseSet.has(normalized) && !existing.has(normalized);
    });
    if (!additions.length) return alignGeneratedSpacingInEditedNote(kept.join("\n").trimEnd(), generated);
    if (firstRemovalIndex >= 0) {
      kept.splice(Math.min(firstRemovalIndex, kept.length), 0, ...additions);
      return alignGeneratedSpacingInEditedNote(kept.join("\n").trimEnd(), generated);
    }
    return alignGeneratedSpacingInEditedNote(`${kept.join("\n").trimEnd()}${kept.join("\n").trimEnd() ? "\n" : ""}${additions.join("\n")}`, generated);
  }

  function alignGeneratedSpacingInEditedNote(edited, generated) {
    const generatedLines = splitNoteLines(generated);
    if (!generatedLines.length) return edited;
    const generatedNormalized = generatedLines.map(normalizeNoteLine);
    const generatedSet = new Set(generatedNormalized);
    const editedLines = splitNoteLines(edited);
    const editedNormalized = editedLines.map(normalizeNoteLine);
    let cursor = 0;
    const extras = [];
    editedNormalized.forEach((line, index) => {
      if (line === generatedNormalized[cursor]) {
        cursor += 1;
      } else if (!generatedSet.has(line)) {
        extras.push(editedLines[index]);
      }
    });
    if (cursor !== generatedNormalized.length) return edited;
    return `${String(generated || "").trimEnd()}${extras.length ? `\n${extras.join("\n")}` : ""}`;
  }

  function splitNoteLines(text) {
    return String(text || "").split("\n").filter((line) => normalizeNoteLine(line));
  }

  function normalizeNoteLine(line) {
    return String(line || "").replace(/\.+\s*$/, "").replace(/\s+/g, " ").trim();
  }

  function updateNoteLimitWarning(node) {
    const limit = node.dataset.maxLength ? Number(node.dataset.maxLength) : 0;
    if (!limit) return;
    const warning = app.querySelector(`[data-note-limit="${CSS.escape(node.dataset.noteKey)}"]`);
    const counter = app.querySelector(`[data-note-count="${CSS.escape(node.dataset.noteKey)}"]`);
    const length = node.value.length;
    if (counter) {
      counter.textContent = `${length} / ${limit} characters`;
      counter.classList.toggle("over", length > limit);
    }
    if (warning) {
      warning.textContent = `Green box exceeds ${limit} characters (${length}/${limit}).`;
      warning.classList.toggle("hidden", length <= limit);
    }
  }

  async function copyNote(key) {
    const record = currentCase();
    if (!record) return;
    const note = generateNote(record);
    const node = app.querySelector(`[data-note-key="${CSS.escape(key)}"]`);
    const rawText = node ? node.value : (record.noteEdits && key in record.noteEdits ? record.noteEdits[key] : note[key] || "");
    const text = normalizeClipboardText(stripSummaryLinePeriods(rawText));
    let copied = false;
    try {
      copied = await copyPlainTextToClipboard(text);
    } catch (error) {
      copied = false;
    }
    if (!copied) {
      statusMessage = "Copy failed. Please select the text and copy manually.";
      refreshStatus();
      return;
    }
    record.copiedParts = record.copiedParts || {};
    record.copiedParts[key] = new Date().toISOString();
    saveCases();
    statusMessage = "Copied.";
    refreshStatus();
    if (currentView === "summary") renderSummary();
  }

  function normalizeClipboardText(text) {
    const value = String(text || "");
    return (typeof value.normalize === "function" ? value.normalize("NFC") : value)
      .replace(/\r\n?/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "");
  }

  async function copyPlainTextToClipboard(text) {
    if (isIosLikeClipboard()) return copyPlainTextFallback(text);
    if (navigator.clipboard && window.isSecureContext) {
      if (navigator.clipboard.write && window.ClipboardItem) {
        try {
          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
          return true;
        } catch (error) {
          // Fall through to writeText or textarea copy.
        }
      }
      if (navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (error) {
          // Fall through to textarea copy.
        }
      }
    }
    return copyPlainTextFallback(text);
  }

  function isIosLikeClipboard() {
    const platform = navigator.platform || "";
    return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  function copyPlainTextFallback(text) {
    const previousActive = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.padding = "0";
    textarea.style.border = "0";
    textarea.style.opacity = "0.01";
    textarea.style.zIndex = "2147483647";
    document.body.appendChild(textarea);
    try {
      textarea.focus({ preventScroll: true });
    } catch (error) {
      textarea.focus();
    }
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    textarea.remove();
    if (previousActive && typeof previousActive.focus === "function") {
      try {
        previousActive.focus({ preventScroll: true });
      } catch (error) {
        previousActive.focus();
      }
    }
    return copied;
  }

  function numericOver(value, max) {
    if (value === "" || value == null) return false;
    return Number(value) > max;
  }

  function calculateAmt() {
    return calculateAmtFromData(currentCase().data);
  }

  function hasDirectAmtScore(amt) {
    return amt.directScore !== "" && amt.directScore != null && Number.isInteger(Number(amt.directScore)) && Number(amt.directScore) >= 0 && Number(amt.directScore) <= 10;
  }

  function calculateAmtFromData(data) {
    const amt = data.mental.cognitive.amt;
    if (amt.unable) return 0;
    if (hasDirectAmtScore(amt)) return Number(amt.directScore);
    return Object.values(amt.answers).reduce((sum, value) => sum + (String(value) === "1" ? 1 : 0), 0);
  }

  function hasAmtInput(amtOrAnswers) {
    const amt = amtOrAnswers && amtOrAnswers.answers ? amtOrAnswers : { unable: false, answers: amtOrAnswers || {} };
    return !!amt.unable || hasDirectAmtScore(amt) || Object.values(amt.answers).some((value) => value !== "" && value != null);
  }

  function hasCompletedAmt(data) {
    const amt = data.mental.cognitive.amt;
    return !!amt.unable || hasDirectAmtScore(amt) || BANK.amtItems.every((item) => amt.answers[item.key] !== "" && amt.answers[item.key] != null);
  }

  function amtInterpretation(score) {
    if (score < 6) return "Lower than cut-off score, indicated further evaluations for possibility of cognitive impairment.";
    if (score === 6) return "Lies on cut-off score.";
    return "Higher than cut-off score.";
  }

  function cdtInterpretation(score) {
    if (score === "" || score == null) return "";
    const number = Number(score);
    if (number > 4) return "lower than cut-off standard";
    if (number === 4) return "lies on cut-off standard";
    return "higher than cut-off standard";
  }

  function mocaEducationOptions(ageRange) {
    return Object.keys(BANK.mocaNorms[ageRange] || {}).map((value) => ({ value, label: value }));
  }

  function mocaNorm(moca) {
    if (!moca || !moca.ageRange || !moca.education) return null;
    return BANK.mocaNorms[moca.ageRange] && BANK.mocaNorms[moca.ageRange][moca.education];
  }

  function mocaHasSubscaleInput(moca) {
    return BANK.mocaSubscales.some((item) => {
      const value = moca.subscales && moca.subscales[item.key];
      return value !== "" && value != null;
    });
  }

  function mocaAutoTotal(moca) {
    if (!moca) return "";
    if (!mocaHasSubscaleInput(moca)) return moca.total !== "" && moca.total != null ? String(moca.total) : "";
    return BANK.mocaSubscales.reduce((sum, item) => {
      const value = moca.subscales && moca.subscales[item.key];
      return sum + (value === "" || value == null ? 0 : Number(value));
    }, 0);
  }

  function mocaPercentileLabel(moca) {
    const norm = mocaNorm(moca);
    const total = mocaAutoTotal(moca);
    if (!norm || total === "" || Number.isNaN(Number(total))) return "";
    const score = Number(total);
    if (score <= norm.p2) return "<= 2nd percentile: DSM-5 major NCD";
    if (score <= norm.p7) return "<= 7th percentile: Petersen MCI";
    if (score <= norm.p16) return "<= 16th percentile: DSM-5 minor NCD";
    return "> 16th percentile";
  }

  function mocaCutoffText(moca) {
    const norm = mocaNorm(moca);
    if (!norm) return "Cut-off pending";
    return `Cut-off: 16th ${norm.p16} | 7th ${norm.p7} | 2nd ${norm.p2}`;
  }

  function mocaCutoffPills(moca) {
    const norm = mocaNorm(moca);
    if (!norm) return "";
    return `<div class="moca-cutoff-pill-row remark-row">
      <span class="score-chip cutoff-chip">16th cut-off: ${h(norm.p16)}</span>
      <span class="score-chip cutoff-chip">7th cut-off: ${h(norm.p7)}</span>
      <span class="score-chip cutoff-chip">2nd cut-off: ${h(norm.p2)}</span>
    </div>`;
  }

  function amtCutoffStatus(score) {
    if (score < 6) return "lower than cut-off";
    if (score === 6) return "on cut-off";
    return "higher than cut-off";
  }

  function syncMocaDerived(data) {
    const moca = data && data.mental && data.mental.cognitive && data.mental.cognitive.moca;
    if (!moca) return;
    moca.subscales = moca.subscales || {};
    BANK.mocaSubscales.forEach((item) => {
      if (moca.subscales[item.key] == null) moca.subscales[item.key] = "";
    });
    if (moca.ageRange) {
      const validEducation = mocaEducationOptions(moca.ageRange).map((item) => item.value);
      if (moca.education && !validEducation.includes(moca.education)) moca.education = "";
    }
    if (mocaHasSubscaleInput(moca)) moca.total = String(mocaAutoTotal(moca));
    moca.percentile = mocaPercentileLabel(moca);
  }

  function refreshMocaDerivedDisplay(moca) {
    const totalNode = app.querySelector("[data-moca-total]");
    const percentileNode = app.querySelector("[data-moca-percentile]");
    if (totalNode) {
      const total = mocaAutoTotal(moca);
      totalNode.textContent = `Total score: ${total === "" ? "__" : total} / 30`;
    }
    if (percentileNode) percentileNode.textContent = mocaPercentileLabel(moca) || "Cut-off pending";
  }

  function refreshCdtDerivedDisplay(score) {
    const scoreNode = app.querySelector("[data-cdt-score]");
    const cutoffNode = app.querySelector("[data-cdt-cutoff]");
    if (scoreNode) scoreNode.textContent = `${score === "" || score == null ? "__" : score} / 10`;
    if (cutoffNode) cutoffNode.textContent = cdtInterpretation(score) || "Cut-off pending";
  }

  function fratScoreStatus(total, pending) {
    if (pending) return "";
    if (total >= 16) return "High Risk";
    if (total >= 12) return "Medium Risk";
    if (total >= 5) return "Low Risk";
    return "";
  }

  function calculateFrat(data = currentCase().data) {
    const frat = data.fall.frat;
    let total = 0;
    let pending = false;
    BANK.fratScoreItems.forEach((item) => {
      const value = frat.scores[item.key];
      const level = item.levels.find((option) => String(option.value) === String(value));
      if (!level) {
        pending = true;
      } else {
        total += Number(level.score);
      }
    });
    const automaticHigh = (frat.automaticHigh || []).length > 0;
    const scoreStatus = fratScoreStatus(total, pending);
    return {
      total,
      pending,
      automaticHigh,
      scoreStatus,
      totalText: pending ? `${total}/20, pending` : `${total}/20`
    };
  }

  function fallOverallStatus(data = currentCase().data) {
    const frat = calculateFrat(data);
    if (frat.automaticHigh) return "High Risk";
    return data.fall.frat.overall || "";
  }

  function hdrsMbiLevel(value) {
    if (value === "" || value == null) return null;
    const score = Number(value);
    if (Number.isNaN(score)) return null;
    if (score <= 20) return { level: 1, key: "1", label: "1 Total dependent" };
    if (score <= 60) return { level: 2, key: "2", label: "2 High dependent" };
    if (score <= 75) return { level: 3, key: "3low", label: "3 Moderate dependent (low end)" };
    if (score <= 90) return { level: 3, key: "3high", label: "3 Moderate dependent (high end)" };
    if (score <= 99) return { level: 4, key: "4", label: "4 Low dependent" };
    return { level: 5, key: "5", label: "5 Total independent" };
  }

  function linkedHdrsMocaScore(data = currentCase() && currentCase().data) {
    const moca = data && data.mental && data.mental.cognitive && data.mental.cognitive.moca;
    const total = mocaAutoTotal(moca);
    return total === "" || total == null ? "" : String(total);
  }

  function hdrsMocaScore(hdrs, data) {
    const linked = linkedHdrsMocaScore(data);
    if (linked !== "") return linked;
    return hdrs && hdrs.moca != null ? hdrs.moca : "";
  }

  function hdrsMocaLevel(value, aphasia) {
    if (aphasia) return { key: "aphasia", label: "Aphasia with no sign of cognitive dysfunction" };
    if (value === "" || value == null) return null;
    const score = Number(value);
    if (Number.isNaN(score)) return null;
    if (score <= 10) return { level: 1, key: "1", label: "1 Severe dysfunction" };
    if (score <= 17) return { level: 2, key: "2", label: "2 Moderate dysfunction" };
    if (score <= 22) return { level: 3, key: "3", label: "3 Mild dysfunction" };
    if (score <= 26) return { level: 4, key: "4", label: "4 Mild cognitive impairment" };
    return { level: 5, key: "5", label: "5 No cognitive dysfunction" };
  }

  function hdrsPatientCompetencyScore(hdrs, data) {
    const mbi = hdrsMbiLevel(hdrs && hdrs.mbi);
    const cognitive = hdrsMocaLevel(hdrsMocaScore(hdrs, data), hdrs && hdrs.aphasiaNoCognitiveDysfunction);
    if (!mbi || !cognitive) {
      return {
        score: "",
        mbiLabel: mbi && mbi.label,
        cognitiveLabel: cognitive && cognitive.label
      };
    }
    const map = {
      "3low:1": "1",
      "2:3": "1",
      "2:2": "1",
      "2:1": "1",
      "1:5": "1",
      "1:4": "1",
      "1:3": "1",
      "1:2": "1",
      "1:1": "1",
      "5:1": "2",
      "4:1": "2",
      "5:2": "2",
      "4:2": "2",
      "3high:1": "2",
      "3low:3": "2",
      "3low:2": "2",
      "2:5": "2",
      "2:4": "2",
      "3high:3": "3",
      "3high:2": "3",
      "3low:5": "3",
      "3low:4": "3",
      "5:4": "4",
      "4:4": "4",
      "5:aphasia": "4",
      "4:aphasia": "4",
      "5:3": "4",
      "4:3": "4",
      "3high:5": "4",
      "3high:4": "4",
      "5:5": "5",
      "4:5": "5"
    };
    return {
      score: map[`${mbi.key}:${cognitive.key}`] || "",
      mbiLabel: mbi.label,
      cognitiveLabel: cognitive.label
    };
  }

  function hdrsItemScore(hdrs, key, data) {
    if (!hdrs) return "";
    return hdrs.scores[key] || "";
  }

  function calculateHdrs(hdrs, data) {
    const itemScores = BANK.hdrsItems.reduce((scores, item) => {
      const value = hdrsItemScore(hdrs, item.key, data);
      scores[item.key] = value ? Number(value) : 0;
      return scores;
    }, {});
    const factorScores = {
      patient: itemScores.patientCompetency && itemScores.patientAttitude ? Math.floor((itemScores.patientCompetency + itemScores.patientAttitude) / 2) : 0,
      carer: itemScores.carerAvailability && itemScores.carerCompetency ? Math.floor((itemScores.carerAvailability + itemScores.carerCompetency) / 2) : 0,
      environment: itemScores.homeSafety && itemScores.physicalEnvironment ? Math.floor((itemScores.homeSafety + itemScores.physicalEnvironment) / 2) : 0
    };
    const complete = factorScores.patient && factorScores.carer && factorScores.environment;
    const total = complete ? factorScores.patient + factorScores.carer + factorScores.environment : 0;
    let level = 0;
    if (complete) {
      if (total <= 5) level = 1;
      else if (total <= 7) level = 2;
      else if (total <= 9) level = 3;
      else if (total <= 11) level = 4;
      else if (total <= 13) level = 5;
      else level = 6;
      if ([factorScores.patient, factorScores.carer, factorScores.environment].includes(1) && level > 1 && level < 5) level -= 1;
    }
    const levelLabels = {
      1: "Very Low",
      2: "Low",
      3: "Moderate Low",
      4: "Moderate High",
      5: "High",
      6: "Very High"
    };
    return { itemScores, factorScores, total, level, levelLabel: levelLabels[level] || "" };
  }

  function fratRiskClass(status) {
    if (status === "High Risk") return "risk-high";
    if (status === "Medium Risk") return "risk-medium";
    if (status === "Low Risk") return "risk-low";
    return "";
  }

  function calculateBI() {
    const data = currentCase().data.functional;
    const activeOrder = BANK.biOrder.map((key) => key === "mobility" ? data.mobilityMode : key);
    let total = 0;
    let pending = false;
    activeOrder.forEach((key) => {
      const item = data.bi[key];
      if (item.notAssessed || item.score === "") {
        pending = true;
      } else {
        total += Number(item.score);
      }
    });
    const level = formatConsecutive(data.overall);
    return {
      total,
      totalText: pending ? `>=${total}/100, pending further assessment` : `${total}/100`,
      level
    };
  }

  function formatBiLevelLabel(level) {
    if (!level) return "";
    const map = {
      Independent: "Independent",
      Supervision: "Supervision",
      Dependent: "Dependent"
    };
    const parts = String(level).split(" to ").map((part) => map[part] || part);
    return parts.join(" to ");
  }

  function formatBiLinkedText(bi) {
    const level = formatBiLevelLabel(bi.level);
    return `MBI ${bi.totalText}${level ? ` (${level})` : ""}`;
  }

  function biLineFor(key) {
    const data = currentCase().data.functional;
    const activeKey = key === "mobility" ? data.mobilityMode : key;
    const item = BANK.biItems[activeKey];
    const state = data.bi[activeKey];
    const label = key === "mobility" ? "Mobility/Wheelchair" : item.label;
    if (state.notAssessed || state.score === "") return `${label}: not assessed`;
    let extra = "";
    const zeroExtraLabels = Number(state.score) === 0
      ? biZeroExtraChecks(item).filter((choice) => state[choice.key]).map((choice) => choice.label)
      : [];
    if (zeroExtraLabels.length) extra = ` (${commaList(zeroExtraLabels)})`;
    if (Number(state.score) === 0 && item.zeroExtras && state.feedingRoute) extra = ` (${state.feedingRoute})`;
    return `${label}: ${state.score}/${item.max}${extra}`;
  }

  function cognitiveScoreSummary() {
    const mental = currentCase().data.mental;
    if (isEmergencyMedicineCase()) return emergencyCognitiveScoreSummary(mental);
    if (!mental.cognitive.enabled && !isFallAssessmentCase() && !isEmergencyMedicineCase()) return "";
    const parts = [];
    if (!hasCompletedAmt({ mental })) {
      parts.push("AMT: pending");
    } else {
      const amtScore = calculateAmt();
      parts.push(mental.cognitive.amt.unable ? "AMT: Fail to assess" : `AMT ${amtScore}/10 (${amtCutoffStatus(amtScore)})`);
    }
    if ((!isFallAssessmentCase() || mental.cognitive.cdtDone) && mental.cognitive.cdt !== "") parts.push(`CDT ${mental.cognitive.cdt}/10 (${cdtInterpretation(mental.cognitive.cdt)})`);
    const mocaTotal = mocaAutoTotal(mental.cognitive.moca);
    const mocaPercentile = mocaPercentileLabel(mental.cognitive.moca);
    if ((!(isFallAssessmentCase() || isEmergencyMedicineCase()) || mental.cognitive.moca.done) && mocaTotal !== "") parts.push(`MoCA ${mocaTotal}/30${mocaPercentile ? ` (${mocaPercentile})` : ""}`);
    return parts.join("; ");
  }

  function otCommentCognitiveScoreSummary() {
    return conciseCognitiveScoreSummary();
  }

  function conciseCognitiveScoreSummary() {
    const mental = currentCase().data.mental;
    if (isEmergencyMedicineCase()) return emergencyCognitiveScoreSummary(mental);
    if (!mental.cognitive.enabled && !isFallAssessmentCase() && !isEmergencyMedicineCase()) return "";
    const parts = [];
    if (!hasCompletedAmt({ mental })) {
      parts.push("AMT: pending");
    } else {
      parts.push(mental.cognitive.amt.unable ? "AMT: Fail to assess" : `AMT ${calculateAmt()}/10`);
    }
    if ((!isFallAssessmentCase() || mental.cognitive.cdtDone) && mental.cognitive.cdt !== "") {
      parts.push(`CDT ${mental.cognitive.cdt}/10`);
    }
    const mocaTotal = mocaAutoTotal(mental.cognitive.moca);
    const mocaPercentile = mocaPercentileLabel(mental.cognitive.moca);
    if ((!(isFallAssessmentCase() || isEmergencyMedicineCase()) || mental.cognitive.moca.done) && mocaTotal !== "") {
      parts.push(`MoCA ${mocaTotal}/30${mocaPercentile ? ` (${mocaPercentile})` : ""}`);
    }
    return parts.join("; ");
  }

  function isSectionComplete(index) {
    const d = currentCase().data;
    switch (sectionKeysFor()[index]) {
      case "piMental":
        return !!(d.mental.gcs.e && d.mental.gcs.v && d.mental.gcs.m && d.mental.consciousness.choices.length && hasCommandInput(d.mental.command));
      case "piSkin":
        return d.pressureInjury.skinSites.some((site) => site.side && site.areas.length && site.pressureInjury && site.dressing && site.skinConditions.length);
      case "piPhysical":
        return !!((d.pressureInjury.physical.powerGroup.pending ||
          d.pressureInjury.physical.powerGroup.limbMovement ||
          d.pressureInjury.physical.powerGroup.power.rightUl ||
          d.pressureInjury.physical.powerGroup.power.leftUl ||
          d.pressureInjury.physical.powerGroup.power.rightLl ||
          d.pressureInjury.physical.powerGroup.power.leftLl) &&
          d.pressureInjury.physical.functionStatus &&
          d.pressureInjury.physical.contracture.status &&
          d.pressureInjury.physical.sensation.length &&
          d.pressureInjury.physical.tactileSensation);
      case "piProblem":
        return d.pressureInjury.problem.choices.length > 0;
      case "piPlan":
        return !!((d.pressureInjury.management.devicePrescription || d.pressureInjury.management.interventions.length) &&
          (d.pressureInjury.management.treatmentChecks.length || d.pressureInjury.management.treatmentItems.length));
      case "tedMental":
        return !!(d.mental.gcs.e && d.mental.gcs.v && d.mental.gcs.m && d.mental.consciousness.choices.length && hasCommandInput(d.mental.command));
      case "tedSkin":
        return !!(d.ted.skin.conditions.length && d.ted.skin.pressureInjury && d.ted.skin.swelling);
      case "tedPhysical":
        return !!((d.ted.physical.powerGroup.pending ||
          d.ted.physical.powerGroup.limbMovement ||
          d.ted.physical.powerGroup.power.rightUl ||
          d.ted.physical.powerGroup.power.leftUl ||
          d.ted.physical.powerGroup.power.rightLl ||
          d.ted.physical.powerGroup.power.leftLl) &&
          d.ted.physical.functionStatus &&
          d.ted.physical.sensation.length &&
          d.ted.physical.tactileSensation &&
          d.ted.physical.softCalf.right &&
          d.ted.physical.softCalf.left &&
          d.ted.physical.calfCircumference.right &&
          d.ted.physical.calfCircumference.left);
      case "tedRisk":
        return !!(d.ted.risk.patient.length || d.ted.risk.admission.length);
      case "tedPlan":
        return !!(d.ted.management.tx.length || d.ted.management.plan.length);
      case "homeO2SocialAdl":
        return (d.social.limited || !!(d.social.living.choices.length && d.social.homeEnv && d.social.bathing.length && d.social.bathBy && d.social.socialServices.choices.length && d.social.assistiveDevices.choices.length)) &&
          d.homeO2.overallAdl.length > 0;
      case "homeO2Oximetry":
        return !!(formatHomeO2Oximetry(d) || formatHomeO2OxygenRegime(d.homeO2.oximetry.regime));
      case "homeO2Problem":
        return d.homeO2.problem.choices.length > 0;
      case "homeO2Plan":
        return !!(d.homeO2.treatment.choices.length || d.homeO2.treatment.plan.length);
      case "homeO2Decision":
        return !!(d.homeO2.decision.supplier || d.homeO2.decision.model || d.homeO2.decision.cylinderSize || d.homeO2.decision.consentSignedBy || d.homeO2.decision.consentFunding.length);
      case "mbi":
        return BANK.biOrder.every((key) => {
          const activeKey = key === "mobility" ? d.functional.mobilityMode : key;
          const item = d.functional.bi[activeKey];
          return !item.notAssessed && item.score !== "";
        }) && d.functional.overall.length > 0;
      case "vitals":
        return !!(d.vitals.bpSys && d.vitals.bpDia && d.vitals.pulse && d.vitals.spo2 && d.vitals.oxygenMode) &&
          (d.premorbid.limited || !!(d.premorbid.basic.choices.length && d.premorbid.walk.status && d.premorbid.outdoor.status && d.premorbid.iadl && d.premorbid.occupationType));
      case "social":
        return d.social.limited || !!(d.social.living.choices.length && d.social.homeEnv && d.social.bathing.length && d.social.bathBy && d.social.socialServices.choices.length && d.social.assistiveDevices.choices.length);
      case "mental":
        return !!(d.mental.consciousness.choices.length && hasCommandInput(d.mental.command) && d.mental.speech) &&
          (!isEmergencyMedicineCase() || (hasCompletedAmt(d) && (d.mental.cognitive.cdtUnable || d.mental.cognitive.cdt !== "") && (!d.mental.mood.gdsPerformed || calculateGds(d.mental.mood).complete)));
      case "physical":
        return !!((d.physical.powerGroup.pending || d.physical.powerGroup.limbMovement || (d.physical.powerGroup.tone && d.physical.powerGroup.coordination)) &&
          (d.physical.balance.sitting.pending || d.physical.balance.sitting.levels.length) &&
          (d.physical.balance.standing.pending || d.physical.balance.standing.levels.length) &&
          (d.physical.transfer.lyeToSit.pending || d.physical.transfer.lyeToSit.levels.length) &&
          (d.physical.transfer.sitToStand.pending || d.physical.transfer.sitToStand.levels.length) &&
          (d.physical.transfer.ambulation.pending || d.physical.transfer.ambulation.levels.length) &&
          d.physical.visual.status && d.physical.hearing.status && d.physical.pressure.status && d.physical.contracture.status);
      case "functional":
        return BANK.biOrder.every((key) => {
          const activeKey = key === "mobility" ? d.functional.mobilityMode : key;
          const item = d.functional.bi[activeKey];
          return item.notAssessed || item.score !== "";
        }) && d.functional.overall.length > 0 && (!isPalliativeCase() || !!formatPpsValue(d.functional.pps)) &&
          (!isEmergencyMedicineCase() || d.functional.lawton.notTest || BANK.lawtonItems.every((item) => ["NA", "0", "1", "2", "3"].includes(String(d.functional.lawton.scores[item.key]))));
      case "fall":
        if (isFallAssessmentCase()) {
          return BANK.fratScoreItems.every((item) => !!d.fall.frat.scores[item.key]) && !!d.fall.history;
        }
        return !!(d.fall.risk && d.fall.history);
      case "symptoms":
        return !isPalliativeCase() || d.palliative.symptoms.length > 0;
      case "otComment":
        return true;
      case "problem":
        return !!(d.problem.nilMode || d.problem.patient.length || d.problem.environmental.length || d.problem.social.length || d.problem.others);
      case "plan":
        return !!(d.plan.choices.length && d.recommendation.choices.length);
      default:
        return false;
    }
  }

  function generateNote(record) {
    if (isMbiCase(record)) {
      return cleanSummaryNote({
        common: formatMbiSummary(record.data)
      });
    }

    if (isPressureInjuryCase(record)) {
      return cleanSummaryNote({
        greenBox: formatPressureInjuryGreenBox(record.data),
        common: formatPressureInjuryCommon(record.data),
        problem: formatPressureInjuryProblem(record.data),
        recommendation: formatPressureInjuryRecommendation(record.data),
        remarks: formatPressureInjuryRemarks(record)
      });
    }

    if (isTedCase(record)) {
      return cleanSummaryNote({
        greenBox: formatTedGreenBox(record.data),
        common: formatTedCommon(record.data),
        problem: formatTedProblem(record.data),
        recommendation: formatTedRecommendation(record.data),
        remarks: formatTedRemarks(record)
      });
    }

    if (isHomeO2AssessmentCase(record)) {
      return cleanSummaryNote({
        greenBox: formatHomeO2GreenBox(record.data),
        common: formatHomeO2Common(record.data),
        problem: formatHomeO2Problem(record.data),
        recommendation: formatHomeO2Recommendation(record.data),
        remarks: formatHomeO2Remarks(record.data)
      });
    }

    if (isHomeO2DecisionCase(record)) {
      return cleanSummaryNote({
        remarks: formatHomeO2DecisionRemarks(record.data)
      });
    }

    const common = [
      formatVitals(record.data),
      formatPremorbid(record.data),
      formatSocial(record.data),
      formatMental(record.data),
      formatPhysical(record.data),
      formatFunctional(record.data),
      formatFall(record.data),
      isPalliativeCase(record) ? formatPalliativeSymptoms(record.data) : "",
      formatCarerInterview(record.data.functional.carerInterview),
      formatOtComment(record.data)
    ].filter((line) => line !== "").join("\n\n");

    return cleanSummaryNote({
      greenBox: formatGreenBox(record.data),
      common,
      problem: formatProblem(record.data),
      recommendation: formatPlanRecommendation(record.data)
    });
  }

  function cleanSummaryNote(note) {
    return NOTE_PART_KEYS.reduce((cleaned, key) => {
      cleaned[key] = stripSummaryLinePeriods(note[key] || "");
      return cleaned;
    }, {});
  }

  function stripSummaryLinePeriods(text) {
    return String(text || "").split("\n").map((line) => line.replace(/\.+\s*$/, "").trimEnd()).join("\n");
  }

  function pressureDeviceLabel(device, management) {
    if (device === "Others" && management && management.deviceRemarks && management.deviceRemarks.Others) {
      return management.deviceRemarks.Others;
    }
    return device;
  }

  function pressureDeviceLabels(management) {
    return (management.devices || []).map((device) => pressureDeviceLabel(device, management)).filter(Boolean);
  }

  function pressureRegimeLabels(management, device) {
    return (management.regimes[device] || []).map((item) => pressureRemarkLabel(item, management.regimeRemarks[device] || {})).filter(Boolean);
  }

  function pressureRemarkLabel(value, remarks = {}) {
    return value === "Others" && remarks[value] ? remarks[value] : value;
  }

  function pressureSkinConditionLabel(value, site) {
    const remarks = site.skinRemarks || {};
    if (value === "Others") return remarks[value] || value;
    const label = value === "Erythema" && site.erythemaType ? `Erythema (${site.erythemaType})` : value;
    return value !== "NAD" && remarks[value] ? `${label} over ${remarks[value]}` : label;
  }

  function withSentencePeriod(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return "";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
  }

  function formatPressureInjuryGreenBox(data) {
    const management = data.pressureInjury.management;
    if (management.devicePrescription !== "Prescription of pressure relieving device" || !management.devices.length) return "";
    return management.devices.map((device) => {
      const label = pressureDeviceLabel(device, management);
      const regime = commaList(pressureRegimeLabels(management, device));
      const forText = regime ? `, for ${regime}` : "";
      if (management.deviceAction === "Device issued") return `${label} issued${forText}.`;
      if (management.deviceAction === "Measurement taken for the device") return `Measurement taken for ${label}${forText}.`;
      return `${label}${forText}.`;
    }).join(" ");
  }

  function formInputDateLabel(record) {
    return formatDate(record && record.assessmentDate) || "__";
  }

  function formatPressureInjuryRemarks(record) {
    const management = record.data.pressureInjury.management;
    if (management.devicePrescription !== "Prescription of pressure relieving device" || !management.devices.length) return "";
    const date = formInputDateLabel(record);
    return management.devices.map((device) => {
      const label = pressureDeviceLabel(device, management);
      const regime = commaList(pressureRegimeLabels(management, device)) || "__";
      return label ? `${label} was fitted on ${date} with ${regime}` : "";
    }).filter(Boolean).join("\n");
  }

  function formatPressureInjuryCommon(data) {
    return [
      formatPressureInjuryMental(data),
      formatPressureInjurySkin(data),
      formatPressureInjuryPhysical(data)
    ].filter(Boolean).join("\n\n");
  }

  function formatPressureInjuryMental(data) {
    const mental = data.mental;
    const lines = [];
    const gcs = formatGcsSummary(mental.gcs);
    if (gcs) lines.push(`GCS: ${gcs}`);
    const mentalState = [];
    const command = formatCommandSummary(mental.command);
    if (mental.consciousness.choices.length) {
      const choices = mental.consciousness.choices.map((item) => item === "Others" && mental.consciousness.others ? mental.consciousness.others : item);
      mentalState.push(`${commaList(choices)}.`);
    }
    if (command) mentalState.push(`${command}.`);
    if (mentalState.length) lines.push(`Mental state: ${mentalState.join(" ")}`);
    return lines.length ? `Mental Function:\n${lines.join("\n")}` : "";
  }

  function formatPressureInjurySkin(data) {
    const sites = data.pressureInjury.skinSites || [];
    const blocks = sites.map((site, index) => {
      const label = formatPressureSiteAssessmentLabel(site);
      const lines = [];
      if (label) lines.push(`Site of Assessment: ${label}`);
      if (site.pressureInjury) {
        const stage = site.pressureInjury === "Yes" && site.stage ? `, ${site.stage} pressure injury` : "";
        lines.push(`Pressure injury / wound: ${site.pressureInjury}${stage}`);
      }
      if (site.dressing) {
        lines.push(`Dressing: ${site.dressing === "Yes" && site.dressingSite ? site.dressingSite : site.dressing}`);
      }
      if (site.skinConditions.length) {
        const conditions = site.skinConditions.map((item) => {
          return pressureSkinConditionLabel(item, site);
        });
        lines.push(`Skin condition: ${commaList(conditions)}`);
      }
      if (site.attachments.length) {
        const attachments = site.attachments.map((item) => item === "Device" && site.deviceRemark ? `Device (${site.deviceRemark})` : item);
        lines.push(`Others: ${commaList(attachments)}`);
      }
      if (!lines.length) return "";
      return `${sites.length > 1 ? `Site ${index + 1}:\n` : ""}${lines.map(withSentencePeriod).join("\n")}`;
    }).filter(Boolean);
    return blocks.length ? `Skin Condition:\n${blocks.join("\n")}` : "";
  }

  function formatPressureSiteAssessmentLabel(site) {
    const areas = (site.areas || []).map((area) => area === "Others" && site.areaOther ? site.areaOther : lowerPhrase(area)).filter(Boolean);
    if (site.side && areas.length) return commaList([`${site.side} ${areas[0]}`, ...areas.slice(1)]);
    return site.side || commaList(areas);
  }

  function formatPressureInjuryPhysical(data) {
    const physical = data.pressureInjury.physical;
    const lines = [
      formatPressurePower(physical.powerGroup)
    ].filter(Boolean);
    if (physical.functionStatus) lines.push(`Function: ${physical.functionStatus}.`);
    if (physical.contracture.status) {
      lines.push(`Limbs contracture: ${physical.contracture.status}${physical.contracture.status === "Yes" && physical.contracture.site ? `, ${physical.contracture.site}` : ""}.`);
    }
    if (physical.sensation.length) {
      const sensation = physical.sensation.map((item) => {
        const remark = physical.sensationRemarks && physical.sensationRemarks[item];
        return remark ? `${item}, present in ${remark}` : item;
      });
      lines.push(`Sensation: ${sensation.join("; ")}.`);
    }
    if (physical.tactileSensation) lines.push(`Tactile sensation: ${physical.tactileSensation}.`);
    if (physical.otherInfo) lines.push(`Others: ${withSentencePeriod(physical.otherInfo)}`);
    return lines.length ? `Physical, mobility and function:\n${lines.join("\n")}` : "";
  }

  function formatPressurePower(group) {
    if (!group) return "";
    if (group.limbMovement) return `Power: ${group.limbMovement}.`;
    if (group.pending) return `Power: ${formatPendingText(group)}.`;
    const rows = formatPowerRows(group.power || {});
    return rows.length ? `Power:\n${rows.join("\n")}` : "";
  }

  function formatPressureInjuryProblem(data) {
    const problem = data.pressureInjury.problem;
    const items = problem.choices.map((item) => item === "Others" && problem.other ? problem.other : item).filter(Boolean);
    return items.length ? commaList(items) : "";
  }

  function formatPressureInjuryRecommendation(data) {
    const management = data.pressureInjury.management;
    const treatmentLines = [];
    if (management.devicePrescription === "Suggest not for additional pressure relieving device at the moment") {
      treatmentLines.push("Suggest not for additional pressure relieving device at the moment");
    }
    if (management.devicePrescription === "Prescription of pressure relieving device") {
      const prescription = [];
      const devices = pressureDeviceLabels(management);
      if (devices.length) prescription.push(`- Type of device: ${commaList(devices)}`);
      const regimeGroups = (management.devices || []).map((device) => {
        const regimes = pressureRegimeLabels(management, device);
        if (!regimes.length) return "";
        return management.devices.length === 1 ? commaList(regimes) : `${pressureDeviceLabel(device, management)}: ${commaList(regimes)}`;
      }).filter(Boolean);
      if (regimeGroups.length) prescription.push(`- Regime: ${regimeGroups.join("; ")}`);
      if (management.deviceAction) prescription.push(`- ${management.deviceAction}`);
      treatmentLines.push("Prescription of pressure relieving device");
      treatmentLines.push(...prescription);
    }
    (management.interventions || []).forEach((item) => {
      const remark = management.interventionRemarks && management.interventionRemarks[item];
      treatmentLines.push(`${item}${remark ? `: ${remark}` : ""}`);
    });
    const planLines = [
      ...(management.treatmentChecks || []).map((device) => `Check ${pressureDeviceLabel(device, management)}`),
      ...(management.treatmentItems || []).map((item) => pressureRemarkLabel(item, management.treatmentRemarks || {}))
    ].filter(Boolean);
    const lines = [];
    if (treatmentLines.length) lines.push(`Treatment:\n${treatmentLines.join("\n")}`);
    if (planLines.length) lines.push(`Treatment Plan:\n${commaList(planLines)}`);
    return lines.join("\n\n");
  }

  function tedStockingSummaryLabel(management) {
    if (!management || !management.stockingType) return "";
    if (management.stockingType === "Commercial type TED stocking") {
      return `TED stocking${management.size ? ` (${management.size})` : ""}`;
    }
    if (management.stockingType === "Tailor made stocking") return "Tailor made stocking";
    return management.stockingType;
  }

  function tedCheckPlanLabel(management) {
    if (!management || !management.stockingType) return "";
    if (management.stockingType === "Commercial type TED stocking") return "Check TED stocking";
    if (management.stockingType === "Tailor made stocking") return "Check tailor made stocking";
    return "Check compression stocking";
  }

  function formatTedGreenBox(data) {
    const management = data.ted.management;
    if (!management.tx.includes("Compression stocking prescribed")) return "";
    const stocking = tedStockingSummaryLabel(management);
    return stocking ? `${stocking} prescribed.` : "";
  }

  function tedRegimeLabels(management) {
    return (management.regimes || []).map((item) => item === "Others" && management.regimeOther ? management.regimeOther : item).filter(Boolean);
  }

  function formatTedRemarks(record) {
    const management = record.data.ted.management;
    if (!management.tx.includes("Compression stocking prescribed")) return "";
    const stocking = tedStockingSummaryLabel(management);
    if (!stocking) return "";
    const regime = commaList(tedRegimeLabels(management)) || "__";
    return `${stocking} was fitted on ${formInputDateLabel(record)} with ${regime}`;
  }

  function formatTedCommon(data) {
    return [
      formatPressureInjuryMental(data),
      formatTedSkin(data),
      formatTedPhysicalSummary(data),
      formatTedRisk(data)
    ].filter(Boolean).join("\n\n");
  }

  function formatTedSkin(data) {
    const skin = data.ted.skin;
    const lines = [];
    if (skin.conditions.length) {
      const conditions = skin.conditions.map((item) => {
        const remark = skin.conditionRemarks && skin.conditionRemarks[item];
        return remark ? `${item} over ${remark}` : item;
      });
      lines.push(`Skin condition: ${commaList(conditions)}.`);
    }
    if (skin.pressureInjury) {
      const stage = skin.pressureInjury === "Yes" && skin.stage ? `, ${skin.stage} pressure injury` : "";
      lines.push(`Pressure injury / wound: ${skin.pressureInjury}${stage}.`);
    }
    if (skin.swelling) {
      if (skin.swelling === "Yes") {
        lines.push(`Swelling over ${formatTedSwellingLimbs(skin.swellingLimbs)}.`);
      } else {
        lines.push(`Swelling: ${skin.swelling}.`);
      }
    }
    return lines.length ? `Skin Condition:\n${lines.join("\n")}` : "";
  }

  function formatTedSwellingLimbs(limbs) {
    const selected = limbs || [];
    if (selected.includes("Left limb") && selected.includes("Right limb")) return "bilateral limbs";
    if (selected.includes("Left limb")) return "left limb";
    if (selected.includes("Right limb")) return "right limb";
    return "__";
  }

  function formatTedPhysicalSummary(data) {
    const physical = data.ted.physical;
    const lines = [
      formatPressurePower(physical.powerGroup)
    ].filter(Boolean);
    if (physical.functionStatus) lines.push(`Function: ${physical.functionStatus}.`);
    if (physical.sensation.length) {
      const sensation = physical.sensation.map((item) => {
        const remark = physical.sensationRemarks && physical.sensationRemarks[item];
        return remark ? `${item}, present in ${remark}` : item;
      });
      lines.push(`Sensation: ${sensation.join("; ")}.`);
    }
    if (physical.tactileSensation) lines.push(`Tactile sensation: ${physical.tactileSensation}.`);
    const softCalf = formatTedSoftCalf(physical.softCalf);
    if (softCalf) lines.push(softCalf);
    const calfCircumference = formatTedCalfCircumference(physical.calfCircumference);
    if (calfCircumference) lines.push(calfCircumference);
    if (physical.otherInfo) lines.push(`Others: ${withSentencePeriod(physical.otherInfo)}`);
    return lines.length ? `Physical and Function:\n${lines.join("\n")}` : "";
  }

  function formatTedSoftCalf(softCalf = {}) {
    if (!softCalf.right && !softCalf.left) return "";
    return `Soft Calf: Right: ${softCalf.right || "__"}; Left: ${softCalf.left || "__"}.`;
  }

  function formatTedCalfCircumference(calf = {}) {
    if (!calf.right && !calf.left) return "";
    return `Calf circumference: Right: ${calf.right || "__"} cm; Left: ${calf.left || "__"} cm.`;
  }

  function formatTedRisk(data) {
    const risk = data.ted.risk;
    const blocks = [];
    if (risk.patient.length) blocks.push(`Patient related:\n${risk.patient.map((item) => `- ${item}`).join("\n")}`);
    if (risk.admission.length) blocks.push(`Admission related:\n${risk.admission.map((item) => `- ${item}`).join("\n")}`);
    return blocks.length ? `Thrombosis Risk Checklist:\n${blocks.join("\n")}` : "";
  }

  function formatTedProblem(data) {
    const risk = data.ted.risk;
    return risk.patient.length || risk.admission.length ? "consider at risk of DVT." : "";
  }

  function formatTedRecommendation(data) {
    const management = data.ted.management;
    const treatmentLines = [];
    if (management.tx.includes("Not fit for TED stocking")) {
      const reasons = (management.notFitReasons || []).map((item) => item === "Others" && management.notFitOther ? management.notFitOther : item);
      treatmentLines.push(`Not fit for TED stocking${reasons.length ? ` due to ${commaList(reasons)}` : ""}`);
    }
    if (management.tx.includes("Compression stocking prescribed")) {
      treatmentLines.push("Compression stocking prescribed");
      const stocking = tedStockingSummaryLabel(management);
      if (stocking) treatmentLines.push(`- Type of stocking: ${stocking}`);
      const regimes = tedRegimeLabels(management);
      if (regimes.length) treatmentLines.push(`- Regime: ${commaList(regimes)}`);
      if (management.education) treatmentLines.push("- Patient / Carer Education with pamphlet provided");
    }
    if (management.tx.includes("Limb function training / maintenance")) {
      treatmentLines.push("Limb function training / maintenance");
    }
    const planLines = management.plan || [];
    const lines = [];
    if (treatmentLines.length) lines.push(`Treatment:\n${treatmentLines.join("\n")}`);
    if (planLines.length) lines.push(`Treatment Plan:\n${commaList(planLines)}`);
    return lines.join("\n\n");
  }

  function formatHomeO2GreenBox(data) {
    const regime = formatHomeO2OxygenRegime(data.homeO2.oximetry.regime);
    const plan = formatHomeO2TreatmentPlanItems(data.homeO2.treatment);
    return [
      regime ? `Oxygen regime: ${regime}` : "",
      plan.length ? `Treatment plan: ${sentenceList(plan)}` : ""
    ].filter(Boolean).join("\n");
  }

  function formatHomeO2Common(data) {
    const social = stripGeneratedSectionTitle(formatSocial(data), "Social History and Home Environment");
    const adl = formatHomeO2OverallAdl(data);
    const oximetry = formatHomeO2Oximetry(data);
    return [
      `Social History and Home Environment\n${social || "Pending input."}`,
      `Overall ADL status\n${adl || "Pending input."}`,
      `Oximetry Test\n${oximetry || "Pending input."}`
    ].join("\n\n");
  }

  function stripGeneratedSectionTitle(text, title) {
    const value = String(text || "");
    const prefix = `${title}:\n`;
    return value.startsWith(prefix) ? value.slice(prefix.length) : value;
  }

  function formatHomeO2OverallAdl(data) {
    const overall = formatConsecutive(data.homeO2.overallAdl || []);
    return overall ? `Overall ADL status: ${overall.toLowerCase()}` : "";
  }

  function formatHomeO2Oximetry(data) {
    const oximetry = data.homeO2.oximetry;
    if (!oximetry.done) return "";
    const blocks = [];
    if ((oximetry.oxygenModes || []).includes("Room Air")) {
      const summary = formatHomeO2AssessmentOximetrySet("On Room Air", oximetry.roomAir || {});
      if (summary) blocks.push(summary);
    }
    if ((oximetry.oxygenModes || []).includes("O2")) {
      (oximetry.o2Tests || []).forEach((test) => {
        const summary = formatHomeO2AssessmentOximetrySet(`On ${formatHomeO2FlowLabel(test.flow)}O2`, test);
        if (summary) blocks.push(summary);
      });
    }
    const regime = formatHomeO2OxygenRegime(oximetry.regime);
    if (regime) blocks.push(`Oxygen Regime: ${regime}.`);
    if (oximetry.remarks) blocks.push(`Remarks: ${oximetry.remarks}.`);
    return blocks.join("\n\n");
  }

  function formatHomeO2AssessmentOximetrySet(title, set) {
    if (!homeO2AssessmentSetHasInput(set)) return "";
    const adlTask = set.adlTask || "__";
    const lines = [
      `${title}:`,
      `- At rest ${formatHomeO2OximetryPoint(set.rest)};`
    ];
    if (set.status === "Not completed") {
      lines.push(`- On exertion (${adlTask}), not completed${set.notCompletedReason ? ` due to ${set.notCompletedReason}` : ""};`);
    } else {
      lines.push(`- On exertion (${adlTask}), ${formatHomeO2OximetryPoint(set.exertion)}; ${set.sob || "__"} SOB on exertion;`);
      lines.push(`- After 2 minutes rest ${formatHomeO2OximetryPoint(set.recovery)}`);
    }
    return lines.join("\n");
  }

  function homeO2TaskSetHasInput(set) {
    return !!(set && (set.oxygenMode || set.oxygenL || set.oxygenUse) || hasOximetrySetInput(set && { rest: set.rest }) || (set && set.activities || []).some(homeO2ActivityHasInput));
  }

  function homeO2ActivityHasInput(activity) {
    return !!(activity && (
      activity.status ||
      activity.notCompletedReason ||
      activity.dyspnea ||
      activity.assistance ||
      hasOximetrySetInput({
        rest: activity.beginning,
        exertion: activity.immediate,
        recovery: activity.recovery
      }) ||
      (activity.custom && activity.name)
    ));
  }

  function formatHomeO2ActivitySummary(activity) {
    if (!homeO2ActivityHasInput(activity)) return "";
    const name = activity.name || "Other activity";
    if (activity.status === "Not completed") {
      return `- ${name}: Not completed${activity.notCompletedReason ? ` due to ${activity.notCompletedReason}` : ""}.`;
    }
    if (activity.status !== "Completed") return `- ${name}: Pending completion status.`;
    return [
      `- ${name}:`,
      `  Beginning: ${formatHomeO2OximetryPoint(activity.beginning)};`,
      `  Dyspneic Level: ${activity.dyspnea || "__"};`,
      `  Immediate Post-Activity: ${formatHomeO2OximetryPoint(activity.immediate)};`,
      `  Recovery Post 2 Minutes: ${formatHomeO2OximetryPoint(activity.recovery)}.`,
      `  Level of assistance: ${activity.assistance ? activity.assistance.toLowerCase() : "__"}.`
    ].join("\n");
  }

  function formatHomeO2OximetryPoint(point = {}) {
    return `SaO2 ${formatValueWithUnit(point.sao2, "%")}, pulse ${formatValueWithUnit(point.pulse, "bpm")}`;
  }

  function formatValueWithUnit(value, unit) {
    const text = String(value || "").trim();
    if (!text) return "__";
    if (unit === "%" && text.includes("%")) return text;
    if (unit === "bpm" && /[a-z]/i.test(text)) return text;
    return unit === "%" ? `${text}%` : `${text} ${unit}`;
  }

  function formatHomeO2FlowLabel(value) {
    const text = String(value || "").trim().replace(/\s*(o2|oxygen)\s*$/i, "").trim();
    if (!text) return "__L";
    const normalized = text.match(/^(.+?)\s*l(?:\/min)?$/i);
    if (normalized) return `${normalized[1].trim()}L`;
    return `${text}L`;
  }

  function formatHomeO2TestLabel(test = {}) {
    if (test.oxygenMode === "Room Air") return "On Room Air";
    if (test.oxygenMode === "O2") return `On ${formatHomeO2LitresValue(test.oxygenL)} litres of O2`;
    const text = homeO2LegacyOxygenText(test);
    if (!text) return "Oxygen use not specified";
    if (/^\d+(?:\.\d+)?\s*(?:l(?:\/min)?)?$/i.test(text)) return `On ${formatHomeO2LitresValue(text)} litres of O2`;
    return /^on\b/i.test(text) ? text : `On ${text}`;
  }

  function formatHomeO2LitresValue(value) {
    const text = String(value || "")
      .replace(/\s*(o2|oxygen)\s*$/i, "")
      .replace(/\s*l(?:itres?|\/min)?\s*$/i, "")
      .trim();
    return text || "__";
  }

  function formatHomeO2OxygenRegime(regime = {}) {
    if (regime.option === "Pending further oximetry test" || regime.option === "Not indicated for Home O2 at the moment") return regime.option;
    if (regime.option === "Home O2 indicated") {
      const sleep = formatHomeO2FlowLabel(regime.sleep);
      const rest = formatHomeO2FlowLabel(regime.rest);
      const exertion = formatHomeO2FlowLabel(regime.exertion);
      if (sleep === rest) return `${sleep} O2 at sleep, at rest; ${exertion} O2 on exertion`;
      return `${sleep} O2 at sleep; ${rest} O2 at rest; ${exertion} O2 on exertion`;
    }
    return "";
  }

  function formatHomeO2Problem(data) {
    const choices = data.homeO2.problem.choices || [];
    return choices.length ? commaList(choices) : "Pending input.";
  }

  function formatHomeO2Recommendation(data) {
    const treatment = formatHomeO2TreatmentItems(data.homeO2.treatment);
    const plan = formatHomeO2TreatmentPlanItems(data.homeO2.treatment);
    return [
      "Treatment:",
      treatment.length ? sentenceList(treatment) : "Pending input.",
      "",
      "Treatment plan:",
      plan.length ? sentenceList(plan) : "Pending input."
    ].join("\n");
  }

  function formatHomeO2TreatmentItems(treatment) {
    return (treatment.choices || []).map((item) => {
      if (item === "Others") return treatment.other;
      if (item === "Home O2 education") {
        if (treatment.educationStatus === "Done") return "Home O2 education done";
        if (treatment.educationStatus === "Arranged on") {
          return treatment.educationDate ? `Home O2 education arranged on ${formatInputDate(treatment.educationDate)}` : "Home O2 education arranged";
        }
      }
      return item;
    }).filter(Boolean);
  }

  function formatHomeO2TreatmentPlanItems(treatment) {
    return (treatment.plan || []).map((item) => {
      if (item === "Home O2 education") {
        return treatment.pendingEducationDate ? `Pending Home O2 education on ${formatInputDate(treatment.pendingEducationDate)}` : "Pending Home O2 education";
      }
      return item;
    }).filter(Boolean);
  }

  function formatHomeO2Remarks(data) {
    const remarks = data.homeO2.remarks;
    return [
      `Education on Breathing technique, Handheld fan and energy conservation on ${formatInputDate(remarks.breathingEducationDate) || "__"}`,
      `Home O2 education arranged on ${formatInputDate(data.homeO2.treatment.educationDate) || "__"}`,
      `${HOME_O2_HAGO_SUMMARY_LABEL} on ${formatInputDate(remarks.haGoDate) || "__"}`
    ].join("\n");
  }

  function formatHomeO2DecisionRemarks(data) {
    const decision = data.homeO2.decision;
    return [
      `Supplier: ${decision.supplier || "__"}`,
      `Model (Oxygen concentrator): ${formatHomeO2ModelSummary(decision)}`,
      `Consent form signed by ${formatHomeO2ConsentSignedBy(decision)}`,
      formatHomeO2ConsentFunding(decision.consentFunding) || "Self paid / DA / CSSA / Funding support",
      formatHomeO2DeliverySummary(decision)
    ].filter(Boolean).join("\n");
  }

  function formatHomeO2ModelSummary(decision) {
    const parts = [decision.model || "__"];
    const cylinder = formatHomeO2CylinderSummary(decision);
    if (cylinder) parts.push(cylinder);
    if ((decision.deviceChoices || []).includes("Portable Oxygen Concentrator")) {
      parts.push(`Portable Oxygen Concentrator${decision.portableOxygenConcentratorModel ? ` (${decision.portableOxygenConcentratorModel})` : ""}`);
    }
    if ((decision.deviceChoices || []).includes("Conserving Device")) {
      parts.push(`Conserving Device${decision.conservingDeviceModel ? ` (${decision.conservingDeviceModel})` : ""}`);
    }
    if ((decision.deviceChoices || []).includes("Accessories")) {
      parts.push(`Accessories: ${formatHomeO2Accessories(decision) || "__"}`);
    }
    return parts.join(" + ");
  }

  function formatHomeO2Accessories(decision) {
    return (decision.accessories || []).map((item) => {
      if (item === "Nasal Cannula") {
        return `Nasal Cannula${decision.nasalCannulaLengths && decision.nasalCannulaLengths.length ? ` (${decision.nasalCannulaLengths.join(" / ")})` : ""}`;
      }
      if (item === "Others") return decision.accessoryOther || "Others";
      return item;
    }).filter(Boolean).join(" / ");
  }

  function formatHomeO2DeliverySummary(decision) {
    if (decision.deliveryStatus === "Pending arrangement") return "Date of Delivery: Pending arrangement";
    if (decision.deliveryStatus === "Arranged on") return `Date of Delivery: arranged on ${formatInputDate(decision.deliveryDate) || "__"}`;
    return "";
  }

  function formatHomeO2CylinderSummary(remarks) {
    if (!remarks.cylinderSize && !remarks.cylinderNumber) return "";
    const size = remarks.cylinderSize || "__";
    const count = remarks.cylinderNumber || "__";
    return `${size}-size cylinder (${count} ${String(count) === "1" ? "cylinder" : "cylinders"})`;
  }

  function formatHomeO2ConsentSignedBy(remarks) {
    if (remarks.consentSignedBy === "Others") return remarks.consentSignedByOther || "others";
    return remarks.consentSignedBy ? remarks.consentSignedBy.toLowerCase() : "__";
  }

  function formatHomeO2ConsentFunding(value) {
    return normalizeHomeO2ConsentFunding(value).join(" / ");
  }

  function formatInputDate(value) {
    if (!value) return "";
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value;
  }

  function formatVitals(data) {
    const pieces = [];
    if (data.vitals.bpSys || data.vitals.bpDia) pieces.push(`BP ${data.vitals.bpSys || "__"}/${data.vitals.bpDia || "__"} mmHg`);
    if (data.vitals.pulse) pieces.push(`Pulse ${data.vitals.pulse}/minute`);
    if (data.vitals.spo2) {
      let oxygen = data.vitals.oxygenMode;
      if (oxygen === "O2" && data.vitals.oxygenL) oxygen = `${data.vitals.oxygenL} L O2`;
      if (oxygen === "FiO2" && data.vitals.fio2) oxygen = `${data.vitals.fio2} FiO2`;
      pieces.push(`SpO2 ${data.vitals.spo2}% ${oxygen}`);
    }
    if (data.vitals.others) pieces.push(`Others: ${data.vitals.others}`);
    return pieces.length ? `Vital signs: ${pieces.join(", ")}.` : "";
  }

  function formatWithRemarks(values, remarks = {}, prefixMap = {}) {
    return values.map((value) => {
      const remark = remarks[value];
      const label = prefixMap[value] || value;
      return remark ? `${label} ${remark}` : label;
    });
  }

  function formatWithParentheticalRemarks(values, remarks = {}) {
    return values.map((value) => {
      const remark = remarks[value];
      return remark ? `${value} (${remark})` : value;
    });
  }

  function formatPremorbid(data) {
    const p = data.premorbid;
    const emergencyDetails = isEmergencyMedicineCase() ? [
      p.cognitive.choices.length ? `Cognitive Function: ${p.cognitive.choices.map((choice) => choice === "Others" && p.cognitive.remarks ? p.cognitive.remarks : choice).join("; ")}` : "",
      p.behavioral.status ? `Behavioral Problem: ${p.behavioral.status}${p.behavioral.status === "Yes" && p.behavioral.remarks ? `; ${p.behavioral.remarks}` : ""}` : ""
    ].filter(Boolean) : [];
    if (p.limited) return ["Premorbid ADL: limited information from patient.", ...emergencyDetails.map(withSentencePeriod)].join("\n");
    const firstLine = [];
    if (p.basic.choices.length) firstLine.push(`Basic ADL: ${joinList(formatWithRemarks(p.basic.choices, p.basic.remarks))}`);
    const indoor = formatPremorbidMobility("Indoor mobility", p.walk);
    if (indoor) firstLine.push(indoor);
    const outdoor = formatPremorbidMobility("Outdoor mobility", p.outdoor);
    if (outdoor) firstLine.push(outdoor);
    const secondLine = [];
    if (p.iadl) secondLine.push(`IADL: ${p.iadl}`);
    if (p.occupationType === "Retired") secondLine.push("Occupation: retired");
    if (p.occupationType === "Occupation" && p.occupation) secondLine.push(`Occupation: ${p.occupation}`);
    const lines = [firstLine.join("    "), secondLine.join("    "), ...emergencyDetails].filter(Boolean).map(withSentencePeriod);
    return lines.length ? `Premorbid ADL:\n${lines.join("\n")}` : "";
  }

  function formatPremorbidMobility(label, state) {
    if (!state || !state.status) return "";
    const aid = state.aid === "Others" ? state.aidOther : state.aid;
    return `${label}: ${state.status}${aid ? ` (${aid})` : ""}${state.remarks ? `; ${state.remarks}` : ""}`;
  }

  function formatSocial(data) {
    const s = data.social;
    if (s.limited) return "Social History and Home Environment:\nLimited information from patient.";
    const lines = [];
    if (s.living.choices.length) {
      const living = commaList(orderLivingSummaryChoices(s.living.choices).map((item) => formatLivingSummaryItem(item, s.living.remarks || {})));
      const mainCarer = s.mainCarer ? ` Main carer: ${s.mainCarer}` : "";
      lines.push(`${living}.${mainCarer}`);
    } else if (s.mainCarer) {
      lines.push(`Main carer: ${s.mainCarer}.`);
    }
    if (s.homeEnv) {
      lines.push(`${formatHomeEnvironmentSummary(s)}.`);
    }
    const bathing = formatBathingSummary(s);
    if (bathing) lines.push(bathing);
    if (s.socialServices.choices.length) {
      const services = s.socialServices.choices.map((item) => formatSocialServiceSummary(item, s.socialServices));
      if (s.socialServices.choices.includes("Home Help Service") && s.socialServices.homeHelp.length) {
        const index = services.indexOf("Home Help Service");
        const homeHelp = formatWithParentheticalRemarks(s.socialServices.homeHelp, s.socialServices.homeHelpRemarks || {});
        if (index >= 0) services[index] = `Home Help Service (${joinList(homeHelp)})`;
      }
      lines.push(`Social service: ${commaList(services)}.`);
    }
    if (s.assistiveDevices.choices.length) lines.push(`Assistive Device: ${commaList(formatWithParentheticalRemarks(s.assistiveDevices.choices, s.assistiveDevices.remarks))}.`);
    return lines.length ? `Social History and Home Environment:\n${lines.join("\n")}` : "";
  }

  function formatLivingSummaryItem(item, remarks = {}) {
    const remark = remarks[item];
    if (item === "Lives with") return `Lives with ${remark || "__"}`;
    if (item === "Live alone") return "Lives alone";
    if (item === "Day time alone") return "daytime alone";
    if (item === "Night time alone") return "nighttime alone";
    if (item === "Hostel") return "Lives in hostel";
    if (item === "Others" && remark) return remark;
    return remark ? `${item} ${remark}` : item;
  }

  function orderLivingSummaryChoices(choices) {
    const aloneTiming = new Set(["Day time alone", "Night time alone"]);
    return [
      ...choices.filter((item) => !aloneTiming.has(item)),
      ...choices.filter((item) => aloneTiming.has(item))
    ];
  }

  function formatHomeEnvironmentSummary(s) {
    if (s.homeEnv === "Non-direct lift landing" && s.homeEnvRemark) return `Non-direct lift landing, ${s.homeEnvRemark} FOS`;
    if (s.homeEnv === "No lift" && s.homeEnvRemark) return `No lift, ${s.homeEnvRemark}/F`;
    return s.homeEnv;
  }

  function formatBathingSummary(s) {
    const parts = [];
    if (s.bathing.length) parts.push(joinList(s.bathing));
    if (s.bathBy) {
      if (s.bathBy === "Sit on") {
        parts.push(`Sit on${s.bathByRemark ? ` ${s.bathByRemark}` : ""}`);
      } else {
        parts.push(s.bathBy);
      }
    }
    return parts.length ? `Bathing: ${parts.join(". ")}.` : "";
  }

  function formatSocialServiceSummary(item, socialServices) {
    const remark = socialServices.remarks && socialServices.remarks[item];
    if (item === "Others" && remark) return remark;
    return remark ? `${item} (${remark})` : item;
  }

  function formatMental(data) {
    const m = data.mental;
    const lines = [];
    const gcs = formatGcsSummary(m.gcs);
    const command = formatCommandSummary(m.command);
    const orientationTouched = m.orientation.unable || m.orientation.notAssessedHome || Object.values(m.orientation.items).some((value) => !value);
    const hasOtherMentalInput = !!(gcs || m.consciousness.choices.length || command || m.cognitive.enabled || isFallAssessmentCase() || m.speech);
    if (gcs) lines.push(`GCS: ${gcs}.`);
    if (m.consciousness.choices.length) {
      const choices = m.consciousness.choices.map((item) => item === "Others" && m.consciousness.others ? m.consciousness.others : item);
      const consciousText = formatConsciousnessSummary(choices);
      lines.push(`${consciousText}${command ? `. ${command}` : ""}.`);
    } else if (command) {
      lines.push(`${command}.`);
    }
    const orientation = orientationTouched || hasOtherMentalInput ? formatOrientation(m) : "";
    if (orientation) lines.push(orientation);
    if (m.speech) {
      const speech = m.speech === "Others" && m.speechOther ? m.speechOther : lowerPhrase(m.speech);
      lines.push(`Speech: ${speech}.`);
    }
    const blocks = [];
    if (lines.length) blocks.push(`Mental Function:\n${lines.filter(Boolean).join("\n")}`);
    if (m.cognitive.enabled || isFallAssessmentCase() || isEmergencyMedicineCase()) {
      const cognitive = formatCognitive(m);
      if (cognitive) blocks.push(`Cognitive Assessment:\n${cognitive}`);
    }
    if (isEmergencyMedicineCase()) {
      const mood = formatEmergencyMood(m.mood);
      if (mood) blocks.push(mood);
    }
    return blocks.join("\n\n");
  }

  function formatConsciousnessSummary(choices) {
    if (!choices.length) return "";
    if (choices.length === 2 && choices.includes("Alert")) {
      const other = choices.find((item) => item !== "Alert");
      return `Alert but ${lowerPhrase(other)}`;
    }
    const phrase = joinList(choices.map((item, index) => index === 0 ? item : lowerPhrase(item)));
    return phrase;
  }

  function formatGcsSummary(gcs) {
    if (!gcs) return "";
    return [
      formatGcsPart("E", gcs.e),
      formatGcsPart("V", gcs.v),
      formatGcsPart("M", gcs.m)
    ].filter(Boolean).join(" ");
  }

  function formatGcsPart(label, value) {
    if (!value) return "";
    const text = String(value).trim();
    return /^\d+$/.test(text) ? `${label}${text}` : `${label} ${text}`;
  }

  function formatOrientation(mental) {
    if (mental.orientation.unable) return "Unable to assess orientation.";
    const items = BANK.orientationItems.filter((item) => !(item === "Home Address" && mental.orientation.notAssessedHome));
    const oriented = items.filter((item) => mental.orientation.items[item]);
    const disoriented = items.filter((item) => !mental.orientation.items[item]);
    if (!items.length) return "";
    if (oriented.length === items.length) return `Oriented to ${joinList(items.map(lowerPhrase))}.`;
    if (disoriented.length === items.length) return `Disoriented to ${joinList(items.map(lowerPhrase))}.`;
    return `Oriented to ${joinList(oriented.map(lowerPhrase))}; Disoriented to ${joinList(disoriented.map(lowerPhrase))}.`;
  }

  function formatCognitive(mental) {
    if (isEmergencyMedicineCase()) return formatEmergencyCognitive(mental);
    const c = mental.cognitive;
    const lines = [];
    if (!hasCompletedAmt({ mental })) {
      lines.push("AMT: pending.");
      if (hasAmtInput(c.amt)) lines.push(formatAmtSubscores(c.amt));
    } else if (c.amt.unable) {
      lines.push("Abbreviated Mental Test (AMT): Fail to assess.");
    } else {
      const score = Object.values(c.amt.answers).filter((v) => String(v) === "1").length;
      lines.push(`Abbreviated Mental Test (AMT): ${score}/10 (cut off <6 indicated further evaluations for possibility of cognitive impairment)`);
      lines.push(formatAmtSubscores(c.amt));
    }
    if ((!isFallAssessmentCase() || c.cdtDone) && c.cdt !== "") lines.push(`Clock Drawing Test (CDT): ${c.cdt}/10 (cut off 3/4; Lower score indicated higher cognitive function).`);
    const moca = c.moca;
    const mocaTotal = mocaAutoTotal(moca);
    const mocaPercentile = mocaPercentileLabel(moca);
    if ((!(isFallAssessmentCase() || isEmergencyMedicineCase()) || moca.done) && (mocaTotal !== "" || mocaPercentile)) {
      const headline = [`HK-Montreal Cognitive Assessment (MoCA): ${mocaTotal || "__"}/30`];
      if (mocaPercentile) headline.push(mocaPercentile);
      lines.push(`${headline.join(", ")}.`);
      const sub = moca.subscales;
      const subline = BANK.mocaSubscales.map((item) => `${item.label}: ${sub[item.key] || "__"}/${item.max}`).join("; ");
      lines.push(subline);
    }
    if (c.impression) lines.push(`Impression: ${c.impression}.`);
    return lines.join("\n");
  }

  function formatEmergencyCognitive(mental) {
    const c = mental.cognitive;
    const answered = BANK.amtItems.filter((item) => ["0", "1"].includes(String(c.amt.answers[item.key]))).length;
    const score = calculateAmtFromData({ mental });
    const amt = c.amt.unable ? "Not test" : hasCompletedAmt({ mental }) ? `${score}/10 (cut off <6 indicated further evaluations for possibility of cognitive impairment)` : "pending";
    const cdt = c.cdtUnable ? "Not test" : c.cdt === "" ? "Pending assessment" : `${c.cdt}/10 (cut off 3/4; Lower score indicated higher cognitive function)`;
    const lines = [amt === "pending" ? "AMT: pending." : `Abbreviated Mental Test (AMT): ${amt}.`];
    if (!c.amt.unable && !hasDirectAmtScore(c.amt) && answered) lines.push(formatAmtSubscores(c.amt));
    lines.push(`Clock Drawing Test (CDT): ${cdt}.`);
    if (c.moca.done) {
      const total = mocaAutoTotal(c.moca);
      const percentile = mocaPercentileLabel(c.moca);
      lines.push(`HK-Montreal Cognitive Assessment (MoCA): ${total === "" ? "__" : total}/30${percentile ? `, ${percentile}` : ""}.`);
      lines.push(BANK.mocaSubscales.map((item) => `${item.label}: ${c.moca.subscales[item.key] === "" ? "__" : c.moca.subscales[item.key]}/${item.max}`).join("; "));
      if (c.impression) lines.push(`Impression: ${c.impression}.`);
    }
    return lines.join("\n");
  }

  function emergencyCognitiveScoreSummary(mental) {
    const c = mental.cognitive;
    const score = calculateAmtFromData({ mental });
    const parts = [c.amt.unable ? "AMT: Not test" : hasCompletedAmt({ mental }) ? `AMT ${score}/10` : "AMT: pending",
      c.cdtUnable ? "CDT: Not test" : c.cdt !== "" ? `CDT ${c.cdt}/10` : "CDT: pending"];
    const moca = mocaAutoTotal(c.moca);
    if (c.moca.done && moca !== "") parts.push(`MoCA ${moca}/30`);
    return parts.join("; ");
  }

  function formatEmergencyMood(mood) {
    const parts = [];
    const choices = mood.choices.map((choice) => choice === "Others" && mood.other ? mood.other : choice);
    if (choices.length) parts.push(`Mood: ${choices.join("; ")}`);
    if (mood.gdsPerformed) {
      const score = calculateGds(mood);
      parts.push(`Geriatric Depression Scale (GDS): ${score.complete ? `${score.total}/15 (score >8 suggestive suffering from Depression)` : "not yet completed; please answer all 15 questions"}`);
    }
    return parts.join("; ");
  }

  function formatLawton(lawton) {
    if (lawton.notTest) return "";
    const score = calculateLawton(lawton);
    const total = formatLawtonTotal(score);
    const items = BANK.lawtonItems.map((item) => `${item.label}: ${["0", "1", "2", "3"].includes(String(lawton.scores[item.key])) ? `${lawton.scores[item.key]}/3` : "not assessed"}`);
    return `Chinese Lawton Instrumental Activities of Daily Living Scale (4-point Scale): ${total}.\n${items.slice(0, 3).join("  ")}\n${items.slice(3, 6).join("  ")}\n${items.slice(6).join("  ")}`;
  }

  function formatAmtSubscores(amt) {
    return BANK.amtItems.map((item) => {
      const value = amt.unable ? "0" : amt.answers[item.key] || "__";
      return `${summaryLabel(item.label)}: ${value}/1`;
    }).join("; ");
  }

  function summaryLabel(label) {
    return String(label || "").replace(/^\d+[a-z]?\.\s*/i, "");
  }

  function formatPhysical(data) {
    const p = data.physical;
    const lines = [];
    if (p.complaint) lines.push(`Major complaint: ${p.complaint}.`);
    if (p.powerGroup.limbMovement) {
      lines.push(`Power: ${p.powerGroup.limbMovement}.`);
    } else if (p.powerGroup.pending) {
      lines.push(`Power, tone and coordination: ${formatPendingText(p.powerGroup)}.`);
    } else {
      const powerRows = formatPowerRows(p.powerGroup.power || {});
      if (powerRows.length) {
        lines.push(`Power:\n${powerRows.join("\n")}`);
      }
      if (p.powerGroup.tone) lines.push(`Tone: ${p.powerGroup.tone === "Others" && p.powerGroup.toneOther ? p.powerGroup.toneOther : p.powerGroup.tone}.`);
      if (p.powerGroup.coordination) lines.push(`Coordination: ${p.powerGroup.coordination === "Others" && p.powerGroup.coordinationOther ? p.powerGroup.coordinationOther : p.powerGroup.coordination}.`);
    }
    const balance = formatSummaryGroupLine("Balance", [
      ["Sitting", p.balance.sitting],
      ["Standing", p.balance.standing]
    ], p.balance.notTestReason);
    if (balance) lines.push(balance);
    const transfer = formatSummaryGroupLine("Transfer", [
      ["Lie to Sit", p.transfer.lyeToSit],
      ["Sit to Stand", p.transfer.sitToStand]
    ], p.transfer.notTestReason);
    if (transfer) lines.push(transfer);
    const ambulation = formatAmbulationLine(p.transfer.ambulation, p.transfer.notTestReason);
    if (ambulation) lines.push(ambulation);
    if (p.visual.status) lines.push(`Visual: ${p.visual.status}${p.visual.status === "Impaired" && p.visual.side ? ` (${p.visual.side})` : ""}.`);
    if (p.hearing.status) lines.push(`Hearing: ${p.hearing.status}${p.hearing.status === "Impaired" && p.hearing.side ? ` (${p.hearing.side})` : ""}.`);
    if (p.pressure.status) lines.push(`Pressure Injury: ${p.pressure.status}${p.pressure.status === "Yes" && p.pressure.site ? `, site: ${p.pressure.site}` : ""}.`);
    if (p.contracture.status) lines.push(`Contracture: ${p.contracture.status}${p.contracture.status === "Yes" && p.contracture.site ? `, site: ${p.contracture.site}` : ""}.`);
    if (p.otherInfo) lines.push(`Others: ${withSentencePeriod(p.otherInfo)}`);
    const blocks = [];
    if (lines.length) blocks.push(`Physical Assessment:\n${lines.join("\n")}`);
    const functionalBalance = formatFunctionalBalance(p.functionalBalance);
    if (functionalBalance) blocks.push(functionalBalance);
    return blocks.join("\n\n");
  }

  function formatFunctionalBalance(balance) {
    if (!balance) return "";
    if (balance.notApplicable) return "";
    const hasInput = !!(balance.singleLegLeft || balance.singleLegRight || balance.tug || balance.reachTrial1 || balance.reachTrial2);
    if (!hasInput) return "";
    const lines = [];
    if (balance.singleLegLeft || balance.singleLegRight) {
      lines.push(`Single leg stance: Left ${balance.singleLegLeft || "__"} seconds; Right ${balance.singleLegRight || "__"} seconds.`);
    }
    if (balance.tug) lines.push(`Time up and go test: ${balance.tug} seconds.`);
    if (balance.reachTrial1 || balance.reachTrial2) {
      lines.push(`Functional reach test: Trial 1 ${balance.reachTrial1 || "__"} cm; Trial 2 ${balance.reachTrial2 || "__"} cm.`);
    }
    return lines.length ? `Functional Balance Assessment:\n${lines.join("\n")}` : "";
  }

  function formatPendingText(group, sharedReason = "") {
    const reason = sharedReason || group.pendingReason || "";
    return `Not test${reason ? ` due to ${reason}` : ""}`;
  }

  function formatPendingOrLevels(group, sharedReason = "") {
    if (!group) return "";
    if (group.pending) return formatPendingText(group, sharedReason);
    return group.levels && group.levels.length ? formatConsecutive(group.levels) : "";
  }

  function formatSummaryGroupLine(title, items, sharedReason = "") {
    const parts = [];
    let pendingLabels = [];
    let pendingReason = "";
    const flushPending = () => {
      if (!pendingLabels.length) return;
      parts.push(`${pendingLabels.join(", ")}: ${formatPendingText({ pendingReason }, sharedReason)}`);
      pendingLabels = [];
      pendingReason = "";
    };
    items.forEach(([label, group]) => {
      if (!group) return;
      if (group.pending) {
        pendingLabels.push(label);
        if (!pendingReason && group.pendingReason) pendingReason = group.pendingReason;
        return;
      }
      flushPending();
      const text = formatPendingOrLevels(group);
      if (text) parts.push(`${label}: ${text}`);
    });
    flushPending();
    return parts.length ? `${title}: ${parts.join("; ")}.` : "";
  }

  function formatAmbulationLine(group, sharedReason = "") {
    const text = formatPendingOrLevels(group, sharedReason);
    if (!text) return "";
    const aid = !group.pending && group.aidRemark ? ` (${group.aidRemark})` : "";
    return `Ambulation: ${text}${aid}.`;
  }

  function formatPowerRows(power) {
    const rows = [];
    const rightUl = power.rightUl || "";
    const leftUl = power.leftUl || "";
    const rightLl = power.rightLl || "";
    const leftLl = power.leftLl || "";
    if (!rightUl && !leftUl && !rightLl && !leftLl) return rows;
    const rightWidth = Math.max(1, String(rightUl || "__").length, String(rightLl || "__").length);
    const leftWidth = Math.max(1, String(leftUl || "__").length, String(leftLl || "__").length);
    if (rightUl || leftUl) rows.push(`${String(rightUl || "__").padStart(rightWidth, " ")} | ${String(leftUl || "__").padStart(leftWidth, " ")}`);
    if (rightLl || leftLl) rows.push(`${String(rightLl || "__").padStart(rightWidth, " ")} | ${String(leftLl || "__").padStart(leftWidth, " ")}`);
    return rows;
  }

  function formatFunctional(data) {
    const bi = calculateBI();
    const functional = data.functional;
    const activeOrder = BANK.biOrder.map((key) => key === "mobility" ? functional.mobilityMode : key);
    const hdrs = isFallAssessmentCase() && data.fall.hdrs && data.fall.hdrs.applicable ? formatHdrsSummary(data.fall.hdrs, data) : "";
    const ppsText = formatPpsValue(functional.pps);
    const hasFunctionalInput = !!ppsText || functional.overall.length || functional.impression || !!hdrs || activeOrder.some((key) => functional.bi[key].notAssessed || functional.bi[key].score !== "");
    if (!hasFunctionalInput) return "";
    const lines = [];
    if (isPalliativeCase() && ppsText) lines.push(`PPS: ${ppsText}%.`);
    const biLevel = formatBiLevelLabel(bi.level);
    lines.push(`Modified Barthel Index (MBI): ${bi.totalText}${biLevel ? ` (${biLevel})` : ""}.`);
    const row1 = BANK.biRows[0].map(biLineFor).filter(Boolean).join("  ");
    const row2 = BANK.biRows[1].map(biLineFor).filter(Boolean).join("  ");
    if (row1) lines.push(row1);
    if (row2) lines.push(row2);
    if (!isPalliativeCase() && ppsText) lines.push(`PPS: ${ppsText}%.`);
    if (functional.impression) lines.push(`Impression: ${functional.impression}.`);
    if (hdrs) lines.push(`\nHome Discharge Readiness Assessment (HDRS)\n${hdrs}`);
    if (isEmergencyMedicineCase()) {
      const lawton = formatLawton(functional.lawton);
      if (lawton) lines.push(`\n${lawton}`);
    }
    return `Functional Assessment:\n${lines.join("\n")}`;
  }

  function formatMbiSummary(data) {
    const bi = calculateBI();
    const level = formatBiLevelLabel(bi.level).toLowerCase();
    const row1 = BANK.biRows[0].map(biLineFor).filter(Boolean).join("  ");
    const row2 = BANK.biRows[1].map(biLineFor).filter(Boolean).join("  ");
    return [
      `MBI ${bi.totalText}${level ? ` (${level})` : ""}`,
      row1,
      row2
    ].filter(Boolean).join("\n");
  }

  function formatCarerInterview(interview) {
    if (!interview || !interview.done) return "";
    const lines = [];
    const contact = [`Carer: ${interview.carer || "__"}`, `Phone number: ${interview.phone || "__"}`];
    if (interview.carer || interview.phone) lines.push(contact.join("; ") + ".");
    if (interview.topics && interview.topics.length) {
      const topics = formatWithParentheticalRemarks(interview.topics, interview.remarks || {});
      lines.push(`Discussion on: ${topics.join(", ")}.`);
    }
    return lines.length ? `Carer Interview:\n${lines.join("\n")}` : "";
  }

  function formatFall(data) {
    if (isFallAssessmentCase()) return formatDetailedFall(data);
    const f = data.fall;
    const lines = [];
    if (f.risk) {
      let line = `Fall Risk: ${f.risk}`;
      if (f.risk === "Yes") {
        if (f.level) line += ` (${f.level})`;
        const factors = f.factors.map((item) => item === "Others" && f.factorOther ? f.factorOther : item);
        if (factors.length) line += `; risk factors: ${commaList(factors)}`;
      }
      lines.push(`${line}.`);
    }
    if (f.history) {
      let line = `History of fall in recent year: ${f.history}`;
      if (f.history === "Yes") {
        if (f.frequency) line += `; frequency: ${f.frequency}`;
      }
      lines.push(`${line}.`);
      if (f.history === "Yes" && isEmergencyMedicineCase()) {
        const incidents = (f.incidents || []).filter(fallIncidentHasInput).map(formatFallIncidentSummary);
        if (incidents.length) lines.push(`Fall Details:\n${incidents.join("\n")}`);
      }
      if (f.history === "Yes" && f.incidentRemarks) lines.push(`${isEmergencyMedicineCase() ? "Additional fall details / remarks" : "Fall Details"}: ${f.incidentRemarks}.`);
    }
    return lines.length ? `Fall Assessment:\n${lines.join("\n")}` : "";
  }

  function findFratLevel(item, value) {
    return item.levels.find((level) => String(level.value) === String(value));
  }

  function fratItemMax(item) {
    return Math.max(...item.levels.map((level) => Number(level.score)));
  }

  function fallSummaryRow(label, value, detail = "") {
    const labelColumn = String(label || "__").padEnd(20, " ");
    const valueColumn = String(value || "__").padEnd(12, " ");
    return `${labelColumn}${valueColumn}${detail}`;
  }

  function formatDetailedFall(data) {
    const f = data.fall;
    const frat = calculateFrat(data);
    const overall = fallOverallStatus(data);
    const lines = [];
    const scoreLines = BANK.fratScoreItems.map((item) => {
      const level = findFratLevel(item, f.frat.scores[item.key]);
      const score = level ? `${level.score}/${fratItemMax(item)}` : `__/${fratItemMax(item)}`;
      return fallSummaryRow(item.label, score, level ? level.label : "Pending");
    });
    scoreLines.push(fallSummaryRow("FRAT score", frat.totalText));
    lines.push(`Part 1 - Fall Risk Status:\n${scoreLines.join("\n")}`);
    if (f.frat.automaticHigh.length) lines.push(`Automatic High Risk Status: ${joinList(f.frat.automaticHigh)}.`);
    const checklist = BANK.fratChecklist.map((item) => {
      const status = normalizeFratChecklistStatus(f.frat.checklist[item.key]);
      return fallSummaryRow(item.label, status, status === "Yes" ? `(${item.description})` : "");
    });
    lines.push(`Part 2 - Risk Factor Checklist:\n${checklist.join("\n")}`);
    if (f.frat.riskFactorRemarks) lines.push(`Risk Factor Checklist remarks: ${f.frat.riskFactorRemarks}.`);
    lines.push(`Overall Fall Risk Status: ${overall || "Pending"}.`);
    if (f.history) {
      const historyLines = [];
      let history = `History of Fall in Recent Year: ${f.history}`;
      if (f.history === "Yes" && f.frequency) history += `; frequency: ${f.frequency}`;
      historyLines.push(history);
      const incidents = (f.incidents || []).filter(fallIncidentHasInput).map(formatFallIncidentSummary);
      if (f.history === "Yes" && incidents.length) historyLines.push(`Fall Details:\n${incidents.join("\n")}`);
      if (f.history === "Yes" && f.incidentRemarks) historyLines.push(`Remarks: ${f.incidentRemarks}.`);
      lines.push(`Part 3 - History of Fall in Recent Year\n${historyLines.join("\n")}`);
    }
    return `Fall Assessment:\n${lines.join("\n")}`;
  }

  function fallIncidentHasInput(incident) {
    return !!(incident && (incident.period || incident.location || incident.reason || (incident.reasons || []).length || incident.reasonOther));
  }

  function fallIncidentReasonText(incident) {
    if (!incident) return "";
    if (isEmergencyMedicineCase()) return (incident.reasons || []).map((reason) => reason === "Other" ? incident.reasonOther || "Other" : reason).join(", ");
    if (incident.reason === "Other") return incident.reasonOther || "";
    return incident.reason || "";
  }

  function formatFallIncidentSummary(incident) {
    return `${incident.period || "__"}, location: ${incident.location || "__"}; ${isEmergencyMedicineCase() ? "Reasons for fall" : "Main reason of fall"}: ${fallIncidentReasonText(incident) || "__"}`;
  }

  function formatHdrsSummary(hdrs, data) {
    const result = calculateHdrs(hdrs, data);
    const groups = [
      { key: "patient", label: "Factor 1 (Patient)", items: ["patientAttitude", "patientCompetency"] },
      { key: "carer", label: "Factor 2 (Carer)", items: ["carerAvailability", "carerCompetency"] },
      { key: "environment", label: "Factor 3 (Environment)", items: ["homeSafety", "physicalEnvironment"] }
    ];
    const factorLines = groups.map((group) => {
      const rating = result.factorScores[group.key] ? `${result.factorScores[group.key]}/5` : "__/5";
      const details = group.items.map((key) => `${hdrsSummaryItemLabel(key)}: ${hdrsItemScore(hdrs, key, data) || "__"}/5`).join("  ");
      return `${group.label} - Rating: ${rating}  [${details}]`;
    });
    factorLines.push(`Level of Readiness: ${result.level ? `Level ${result.level} (${result.levelLabel})` : "Pending"}`);
    return factorLines.join("\n");
  }

  function hdrsSummaryItemLabel(key) {
    const labels = {
      patientAttitude: "Patient attitude",
      patientCompetency: "Patient sense of competency",
      carerAvailability: "Availability of carer",
      carerCompetency: "Carer attitude and competency",
      homeSafety: "Specific home safety",
      physicalEnvironment: "Specific home environment"
    };
    return labels[key] || key;
  }

  function formatPalliativeSymptoms(data) {
    ensurePalliativeSymptomData(data);
    const p = data.palliative;
    if (!p || !p.symptoms.length) return "";
    const lines = [];
    if (p.symptoms.includes("Pain")) {
      const bullets = (p.pain.entries || []).map(formatPainSummaryEntry).filter(Boolean);
      lines.push(bullets.length ? `Pain:\n${bullets.join("\n")}` : "Pain");
    }
    if (p.symptoms.includes("Fatigue")) {
      const details = [];
      if (p.fatigue.activityTolerance) details.push(`activity tolerance: ${p.fatigue.activityTolerance}`);
      if (p.fatigue.esas) details.push(`ESAS ${p.fatigue.esas}/10`);
      if (p.fatigue.confidence) details.push(`confidence score ${p.fatigue.confidence}/10`);
      lines.push(details.length ? `Fatigue:\n- ${details.join("; ")}` : "Fatigue");
    }
    if (p.symptoms.includes("Breathlessness")) {
      const bullets = formatBreathlessnessSummaryBullets(p.breathlessness);
      lines.push(bullets.length ? `Breathlessness:\n${bullets.join("\n")}` : "Breathlessness");
    }
    if (p.symptoms.includes("Edema")) {
      const bullets = (p.edema.entries || []).map(formatEdemaSummaryEntry).filter(Boolean);
      lines.push(bullets.length ? `Edema:\n${bullets.join("\n")}` : "Edema");
    }
    if (p.symptoms.includes("Pressure Injury")) {
      const bullets = (p.pressureInjury.entries || []).map(formatPressureInjurySymptomSummaryEntry).filter(Boolean);
      lines.push(bullets.length ? `Pressure Injury:\n${bullets.join("\n")}` : "Pressure Injury");
    }
    BANK.palliativeSymptoms.forEach((item) => {
      const value = item.value;
      if (["Pain", "Fatigue", "Breathlessness", "Edema", "Pressure Injury"].includes(value)) return;
      if (!p.symptoms.includes(value)) return;
      if (value === "Others") {
        if (p.remarks && p.remarks.Others) lines.push(p.remarks.Others);
        return;
      }
      lines.push(value);
    });
    return lines.length ? `Signs and Symptoms:\n${lines.join("\n")}` : "";
  }

  function formatPainSummaryEntry(entry) {
    const details = [];
    if (entry.location) details.push(`location: ${entry.location}`);
    if (entry.nrs) details.push(`NRS ${entry.nrs}/10`);
    if (entry.confidence) details.push(`confidence score ${entry.confidence}/10`);
    return details.length ? `- ${details.join("; ")}` : "";
  }

  function formatBreathlessnessSummaryBullets(breath) {
    const bullets = [];
    if (breath.activityTolerance) bullets.push(`- activity tolerance: ${breath.activityTolerance};`);
    if (breath.oximetryDone) {
      if ((breath.oxygenModes || []).includes("Room Air")) {
        const roomAir = formatOximetrySetBullet("On Room Air", breath.roomAir);
        if (roomAir) bullets.push(roomAir);
      }
      if ((breath.oxygenModes || []).includes("O2")) {
        (breath.o2Tests || []).forEach((test) => {
          const oxygen = formatOximetrySetBullet(formatO2FlowLabel(test.flow), test);
          if (oxygen) bullets.push(oxygen);
        });
      }
    }
    const nrs = [];
    if (breath.nrsRest) nrs.push(`NRS at rest ${breath.nrsRest}/10`);
    if (breath.nrsExertion) nrs.push(`NRS on exertion ${breath.nrsExertion}/10`);
    if (breath.confidence) nrs.push(`confidence score ${breath.confidence}/10`);
    if (nrs.length) bullets.push(`- ${nrs.join("; ")}`);
    return bullets;
  }

  function formatOximetrySetBullet(label, set) {
    if (!hasOximetrySetInput(set)) return "";
    const items = [
      formatOximetryPoint("At rest", set.rest),
      formatOximetryPoint("On exertion", set.exertion),
      formatOximetryPoint("After 2 minutes rest", set.recovery)
    ].filter(Boolean);
    return items.length ? `- ${label}: ${items.join("; ")};` : "";
  }

  function hasOximetrySetInput(set = {}) {
    return ["rest", "exertion", "recovery"].some((key) => {
      const point = set[key] || {};
      return !!(point.sao2 || point.pulse);
    });
  }

  function formatO2FlowLabel(flow) {
    const value = String(flow || "").trim().replace(/\s*l(?:\/min)?\s*$/i, "");
    return value ? `On ${value}LO2` : "On O2";
  }

  function formatOximetryPoint(label, point = {}) {
    if (!point.sao2 && !point.pulse) return "";
    return `${label} SaO2 ${point.sao2 || "__"}%, pulse ${point.pulse || "__"} bpm`;
  }

  function formatEdemaSummaryEntry(entry) {
    const details = [];
    if (entry.site) details.push(`site: ${entry.site}`);
    if (entry.circumference) details.push(`circumference ${entry.circumference} cm`);
    return details.length ? `- ${details.join("; ")}` : "";
  }

  function formatPressureInjurySymptomSummaryEntry(entry) {
    const details = [];
    if (entry.site) details.push(`site: ${entry.site}`);
    if ((entry.skinConditions || []).length) details.push(`skin condition: ${commaList(formatWithRemarks(entry.skinConditions, entry.skinRemarks || {}))}`);
    return details.length ? `- ${details.join("; ")}` : "";
  }

  function palliativeGreenBoxText(data) {
    if (!isPalliativeCase()) return "";
    ensurePalliativeSymptomData(data);
    const parts = [];
    const ppsText = formatPpsValue(data.functional.pps);
    if (ppsText) parts.push(`PPS ${ppsText}%`);
    const symptoms = formatPalliativeGreenBoxSymptoms(data.palliative);
    if (symptoms.length) parts.push(`Symptoms: ${joinList(symptoms)}`);
    return parts.join("; ");
  }

  function formatPalliativeGreenBoxSymptoms(p) {
    const symptoms = [];
    if (p.symptoms.includes("Pain")) {
      const locations = (p.pain.entries || []).map((entry) => entry.location).filter(Boolean);
      symptoms.push(locations.length ? `Pain over ${commaList(locations)}` : "Pain");
    }
    if (p.symptoms.includes("Fatigue")) symptoms.push("Fatigue");
    if (p.symptoms.includes("Breathlessness")) symptoms.push("Breathlessness");
    if (p.symptoms.includes("Edema")) {
      const sites = (p.edema.entries || []).map((entry) => entry.site).filter(Boolean);
      symptoms.push(sites.length ? `Edema over ${commaList(sites)}` : "Edema");
    }
    if (p.symptoms.includes("Pressure Injury")) {
      const sites = (p.pressureInjury.entries || []).map((entry) => entry.site).filter(Boolean);
      symptoms.push(sites.length ? `Pressure Injury over ${commaList(sites)}` : "Pressure Injury");
    }
    BANK.palliativeSymptoms.forEach((item) => {
      const value = item.value;
      if (["Pain", "Fatigue", "Breathlessness", "Edema", "Pressure Injury"].includes(value)) return;
      if (!p.symptoms.includes(value)) return;
      if (value === "Others") {
        if (p.remarks && p.remarks.Others) symptoms.push(p.remarks.Others);
        return;
      }
      symptoms.push(value);
    });
    return symptoms;
  }

  function fallGreenBoxText(data) {
    if (!isFallAssessmentCase()) return "";
    const frat = calculateFrat(data);
    const overall = fallOverallStatus(data);
    const parts = [`FRAT: ${frat.totalText}`];
    const risk = fallRiskGreenBoxLabel(overall);
    if (risk) {
      const automaticReasons = data.fall.frat.automaticHigh || [];
      parts.push(`${risk}${automaticReasons.length ? ` (${joinList(automaticReasons)})` : ""}`);
    }
    return parts.join("; ");
  }

  function fallRiskGreenBoxLabel(status) {
    if (!status) return "";
    if (status === "High Risk") return "High Fall Risk";
    if (status === "Medium Risk") return "Medium Fall Risk";
    if (status === "Low Risk") return "Low Fall Risk";
    return status;
  }

  function formatGreenBox(data) {
    const bi = calculateBI();
    const lines = [`ADL: ${formatMbiGreenBoxText(bi)};`];
    const cognitive = conciseCognitiveScoreSummary();
    if (cognitive) lines.push(`Cognition: ${cognitive};`);
    const fall = fallGreenBoxText(data);
    if (fall) lines.push(`Fall Risk: ${fall}`);
    const palliative = palliativeGreenBoxText(data);
    if (palliative) lines.push(palliative);
    const recommendation = formatRecommendationBrief(data);
    if (recommendation) lines.push(`Suggestion: ${recommendation}`);
    return lines.join("\n");
  }

  function formatMbiGreenBoxText(bi) {
    const level = formatBiLevelLabel(bi.level).toLowerCase();
    return `MBI ${bi.totalText}${level ? `, ${level}` : ""}`;
  }

  function formatRecommendationBrief(data) {
    const recommendation = sentenceList(formatRecommendationItems(data));
    return recommendation;
  }

  function formatOtComment(data) {
    const lines = [];
    if (data.otComment.majorObservation) lines.push(`Major observation: ${data.otComment.majorObservation}.`);
    const adlRemark = data.otComment.adlRemark ? ` ${data.otComment.adlRemark}.` : "";
    lines.push(`ADL: ${formatBiLinkedText(calculateBI())}.${adlRemark}`);
    const lawton = calculateLawton(data.functional.lawton);
    if (isEmergencyMedicineCase() && lawton.complete) {
      lines.push(`IADL: Lawton ${lawton.total}/27.${data.otComment.iadlRemark ? ` ${data.otComment.iadlRemark}.` : ""}`);
    }
    const cognitive = otCommentCognitiveScoreSummary();
    if (cognitive) {
      const cognitiveRemark = data.otComment.cognitiveRemark ? ` ${data.otComment.cognitiveRemark}.` : "";
      lines.push(`Cognitive Function: ${cognitive}.${cognitiveRemark}`);
    }
    const fall = fallGreenBoxText(data);
    if (fall) lines.push(`Fall risk: ${fall}.`);
    const palliative = palliativeGreenBoxText(data);
    if (palliative) lines.push(`Palliative care: ${palliative}.`);
    if (data.otComment.freeText) lines.push(data.otComment.freeText);
    return lines.length ? `OT comment:\n${lines.join("\n")}` : "";
  }

  function factorLine(label, values, other) {
    if (!values.length) return "";
    const items = values.map((item) => item === "Others" && other ? other : item);
    return `${label}: ${commaList(items)}.`;
  }

  function formatProblem(data) {
    const p = data.problem;
    const lines = [
      factorLine("Patient Factor", p.patient, p.patientOther),
      factorLine("Environmental Factor", p.environmental, p.environmentalOther),
      factorLine("Social Factor", p.social, p.socialOther)
    ].filter(Boolean);
    if (p.others && p.othersText) lines.push(`Others: ${p.othersText}.`);
    return lines.length ? lines.join("\n") : "Pending input.";
  }

  function formatPlanRecommendation(data) {
    const plan = formatTreatmentPlanItems(data);
    const recs = formatRecommendationItems(data);
    const treatment = formatSelectedTreatment(data);
    return [
      "Treatment:",
      treatment.length ? sentenceList(treatment) : "Pending input.",
      "",
      "Treatment plan:",
      plan.length ? sentenceList(plan) : "Pending input.",
      "",
      "Recommendation:",
      recs.length ? sentenceList(recs) : "Pending input."
    ].join("\n");
  }

  function sentenceList(items) {
    return items.map((item) => String(item || "").trim().replace(/\.+$/, "")).filter(Boolean).join(". ");
  }

  function formatSelectedTreatment(data) {
    const allowedTreatment = completedTreatmentOptions().map((item) => item.value);
    return (data.plan.treatmentChoices || []).filter((item) => allowedTreatment.includes(item)).map((item) => {
      const remark = data.plan.treatmentRemarks && data.plan.treatmentRemarks[item];
      if (item === "Other" || item === "Others") return remark || "";
      const program = data.plan.treatmentPrograms[item];
      const details = [program, remark].filter(Boolean).join("; ");
      return details ? `${item} (${details})` : item;
    }).filter(Boolean);
  }

  function formatTreatmentPlanItems(data) {
    const allowedPlan = treatmentPlanOptions().map((item) => item.value);
    return data.plan.choices.filter((item) => allowedPlan.includes(item)).map((item) => {
      const program = data.plan.programs[item];
      const remark = data.plan.remarks[item];
      if (item === "Others" || item === "Other") return remark || "";
      if (program && remark) return `${item} (${program}; ${remark})`;
      if (program) return `${item} (${program})`;
      if (remark) return `${item} (${remark})`;
      return item;
    }).filter(Boolean);
  }

  function formatRecommendationItems(data) {
    return data.recommendation.choices.map((item) => {
      const remark = data.recommendation.remarks[item];
      if (item === "Others" || item === "Other") return remark || "";
      return remark ? `${item} ${remark}` : item;
    }).filter(Boolean);
  }

  app.addEventListener("click", (event) => {
    const biChoice = event.target.closest("[data-bi-choice]");
    if (biChoice) {
      handleBiChoice(biChoice);
      return;
    }
    const fratScore = event.target.closest("[data-frat-score]");
    if (fratScore) {
      handleFratScoreChoice(fratScore);
      return;
    }
    const fratChecklist = event.target.closest("[data-frat-checklist]");
    if (fratChecklist) {
      handleFratChecklistChoice(fratChecklist);
      return;
    }
    const fratOverall = event.target.closest("[data-frat-overall]");
    if (fratOverall) {
      handleFratOverallChoice(fratOverall);
      return;
    }
    const choice = event.target.closest("[data-choice-path]");
    if (choice) {
      handleChoice(choice);
      return;
    }
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (currentCaseId) handleWorkAction(action, button);
    else handleHomeAction(action, button);
  });

  app.addEventListener("input", handleInput);
  app.addEventListener("change", handleChange);

  loadCases();
  const params = new URLSearchParams(window.location.search);
  const requestedCaseId = params.get("case");
  if (params.get("pdfExport") === "1" && window.parent !== window) {
    const record = cases.find((item) => item.id === requestedCaseId);
    let sections = null;
    if (record) {
      currentCaseId = record.id;
      const exportRecord = { ...record, noteEdits: { ...record.noteEdits }, noteEditBases: { ...record.noteEditBases } };
      syncEditedNotesWithGenerated(exportRecord);
      const note = cleanSummaryNote({ ...generateNote(exportRecord), ...exportRecord.noteEdits });
      const titles = { greenBox: "Green box", common: "Common Assessment", problem: "Problem", remarks: "Remarks", recommendation: "Recommendation" };
      sections = notePartKeysFor(exportRecord).map((key) => ({ title: titles[key], text: note[key] }));
    }
    window.parent.postMessage({ type: "edoc-pdf-report", id: requestedCaseId, sections }, window.location.origin);
  } else if (requestedCaseId && cases.some((record) => record.id === requestedCaseId)) {
    currentCaseId = requestedCaseId;
    currentView = "form";
    currentSection = 0;
    renderWork();
  } else {
    renderHome();
  }

  if (!window.OT_STANDALONE && "serviceWorker" in navigator && window.location.protocol !== "file:") {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      statusMessage = "Offline install support could not start in this browser.";
      refreshStatus();
    });
  }
})();
