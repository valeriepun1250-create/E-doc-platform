(function () {
  "use strict";

  const assistanceLevels = [
    "Independent",
    "Supervision",
    "Mild Assistance",
    "Moderate Assistance",
    "Maximal Assistance",
    "Dependent"
  ];

  const basicAdlOptions = [
    { value: "Independent", label: "Independent" },
    { value: "Independent up to", label: "Independent up to", remark: true },
    { value: "Supervision in", label: "Supervision in", remark: true },
    { value: "Assisted in", label: "Assisted in", remark: true },
    { value: "Dependent", label: "Dependent" },
    { value: "Others", label: "Others", remark: true }
  ];

  const mobilityAids = [
    "Unaided",
    "Stick",
    "Quadripod",
    "Frame",
    "Rollator",
    "Trolley",
    "Chairbound",
    "Bedbound",
    "Wheelchair",
    "Others"
  ];

  const orientationItems = [
    "Name",
    "Age",
    "Home Address",
    "Time",
    "Place",
    "Person"
  ];

  const amtItems = [
    { key: "age", label: "1. Age" },
    { key: "time", label: "2. Time" },
    { key: "addressRecall", label: "3. Address to recall" },
    { key: "currentYear", label: "4. Current year" },
    { key: "place", label: "5. Place" },
    { key: "recognition", label: "6. Recognition of two persons" },
    { key: "dateOfBirth", label: "7. Date of birth" },
    { key: "midAutumn", label: "8. Date of Mid-Autumn Festival" },
    { key: "leader", label: "9. Name of present Governor or Chinese leader" },
    { key: "backwards", label: "10. Count from 20 to 1 backwards" }
  ];

  const biItems = {
    bowels: {
      label: "Bowels",
      max: 10,
      extraWhenZero: "stoma",
      scores: [
        { value: 0, label: "Bowel incontinent" },
        { value: 2, label: "Needs help to assume appropriate position" },
        { value: 5, label: "Can assume position but with frequent accident" },
        { value: 8, label: "Supervision with use of enema and occasional accidents" },
        { value: 10, label: "Bowel continent and can take enema if necessary" }
      ]
    },
    bladder: {
      label: "Bladder",
      max: 10,
      extraWhenZero: "foley",
      zeroExtraChecks: [
        { key: "bilateralPcn", label: "Bilateral PCN" }
      ],
      scores: [
        { value: 0, label: "Incontinent, dependent in bladder management" },
        { value: 2, label: "Incontinent but able to assist with device" },
        { value: 5, label: "Dry at day but not night, needs assistance with device" },
        { value: 8, label: "Dry at day and night, occasional accident" },
        { value: 10, label: "Continent and independent with devices" }
      ]
    },
    grooming: {
      label: "Grooming",
      max: 5,
      scores: [
        { value: 0, label: "Dependent in all aspects, unable to attend to hygiene" },
        { value: 1, label: "Assistance in all steps of hygiene" },
        { value: 3, label: "Some assistance in one or more steps of hygiene" },
        { value: 4, label: "Able to conduct but needs minimal assistance" },
        { value: 5, label: "Independent" }
      ]
    },
    toileting: {
      label: "Toileting",
      max: 10,
      scores: [
        { value: 0, label: "Fully dependent in toileting" },
        { value: 2, label: "Assistance required in all aspects of toileting" },
        { value: 5, label: "Assistance required in clothing, transferring, or washing hands" },
        { value: 8, label: "Supervision required for safety with normal toilet" },
        { value: 10, label: "Independent in transferring, managing clothes and hygiene" }
      ]
    },
    feeding: {
      label: "Feeding",
      max: 10,
      zeroExtras: ["R/T", "TPN"],
      scores: [
        { value: 0, label: "Dependent in all aspects and needs to be fed" },
        { value: 2, label: "Can manipulate eating device, but needs active assistance" },
        { value: 5, label: "Able to feed self with supervision" },
        { value: 8, label: "Independent in feeding with prepared tray" },
        { value: 10, label: "Can feed self and put on device if needed" }
      ]
    },
    dressing: {
      label: "Dressing",
      max: 10,
      scores: [
        { value: 0, label: "Dependent in all aspects of dressing" },
        { value: 2, label: "Able to participate to some degree" },
        { value: 5, label: "Assistance needed in putting on and/or removing clothes" },
        { value: 8, label: "Minimal assistance required with fastening clothes" },
        { value: 10, label: "Independent in all aspects" }
      ]
    },
    bathing: {
      label: "Bathing",
      max: 5,
      scores: [
        { value: 0, label: "Totally dependent in bathing self" },
        { value: 1, label: "Assistance required in all aspects of bathing" },
        { value: 3, label: "Assistance required with transfer, washing, or drying" },
        { value: 4, label: "Supervision for safety in water temperature or transfer" },
        { value: 5, label: "Independent to do all steps" }
      ]
    },
    transfer: {
      label: "Transfer",
      max: 15,
      scores: [
        { value: 0, label: "Unable to participate in transfer" },
        { value: 3, label: "Able to participate but maximal assistance required" },
        { value: 8, label: "Assistance of one person in any aspect of transfer" },
        { value: 12, label: "Supervision for safety required" },
        { value: 15, label: "Independent in all phases of transfer" }
      ]
    },
    mobility: {
      label: "Mobility",
      max: 15,
      scores: [
        { value: 0, label: "Dependent in ambulation" },
        { value: 3, label: "Constant presence of one or more assistant in ambulation" },
        { value: 8, label: "One person required to offer assistance" },
        { value: 12, label: "Independent in less than 50 metres, supervision for safety" },
        { value: 15, label: "Independent in ambulation and using aids if necessary" }
      ]
    },
    wheelchair: {
      label: "Wheelchair",
      max: 5,
      scores: [
        { value: 0, label: "Dependent in wheelchair ambulation" },
        { value: 1, label: "Can propel short distance but needs help in all steps" },
        { value: 3, label: "Presence of one person for chair to table/bed" },
        { value: 4, label: "Can propel self for a reasonable duration" },
        { value: 5, label: "Can propel wheelchair independently for at least 50 metres" }
      ]
    },
    stairs: {
      label: "Stairs",
      max: 10,
      scores: [
        { value: 0, label: "Unable to climb stairs" },
        { value: 2, label: "Assistance in all aspects of stair climbing" },
        { value: 5, label: "Able to ascend and descend but unable to carry aids" },
        { value: 8, label: "Generally needs supervision for safety" },
        { value: 10, label: "Able to go up and down stairs without help" }
      ]
    }
  };

  const biOrder = [
    "bowels",
    "bladder",
    "grooming",
    "toileting",
    "feeding",
    "dressing",
    "bathing",
    "transfer",
    "mobility",
    "stairs"
  ];

  const specialties = ["Medical"];
  const assessmentForms = ["ADL Initial", "Emergency Medicine", "Fall Assessment", "Palliative Care", "Pressure Injury", "DVT Prophylaxis", "Home O2 Assessment", "Home O2 Order", "MBI"];
  const formTypes = specialties.flatMap((specialty) => assessmentForms.map((form) => `[${specialty}] ${form}`));

  const mocaAgeRanges = [
    { value: "65-69", label: "Age 65-69" },
    { value: "70-79", label: "Age 70-79" },
    { value: ">=80", label: "Age >=80" }
  ];

  const mocaNorms = {
    "65-69": {
      "0-3": { p16: 17, p7: 14, p2: 9 },
      "4-6": { p16: 19, p7: 18, p2: 13 },
      "7-9": { p16: 21, p7: 19, p2: 16 },
      "10-12": { p16: 22, p7: 20, p2: 17 },
      ">12": { p16: 25, p7: 23, p2: 21 }
    },
    "70-79": {
      "0-3": { p16: 15, p7: 14, p2: 11 },
      "4-6": { p16: 18, p7: 15, p2: 10 },
      "7-9": { p16: 20, p7: 18, p2: 15 },
      "10-12": { p16: 22, p7: 19, p2: 18 },
      ">12": { p16: 22, p7: 20, p2: 16 }
    },
    ">=80": {
      "0-6": { p16: 13, p7: 13, p2: 10 },
      ">6": { p16: 17, p7: 15, p2: 13 }
    }
  };

  const mocaSubscales = [
    { key: "visualExecutive", label: "Visuospatial / Executive", max: 5 },
    { key: "naming", label: "Naming", max: 3 },
    { key: "attention", label: "Attention", max: 6 },
    { key: "language", label: "Language", max: 3 },
    { key: "abstraction", label: "Abstraction", max: 2 },
    { key: "delayedRecall", label: "Delayed recall", max: 5 },
    { key: "orientation", label: "Orientation", max: 6 }
  ];

  const bank = {
    gdsItems: [
  {
    "key": "q1",
    "label": "你對生活基本感到滿意嗎？",
    "yesScore": 0
  },
  {
    "key": "q2",
    "label": "你有沒有放棄了很多過往常常參與的活動和興趣嗎？",
    "yesScore": 1
  },
  {
    "key": "q3",
    "label": "你感到自己的生活空虛嗎？",
    "yesScore": 1
  },
  {
    "key": "q4",
    "label": "你常常感到生活沉悶嗎？",
    "yesScore": 1
  },
  {
    "key": "q5",
    "label": "你大部分時間心情都是好嗎？",
    "yesScore": 0
  },
  {
    "key": "q6",
    "label": "你擔心有些不幸的事將會在你身上發生嗎？",
    "yesScore": 1
  },
  {
    "key": "q7",
    "label": "你大部分時間都是快樂嗎？",
    "yesScore": 0
  },
  {
    "key": "q8",
    "label": "你是否感到缺乏幫助？",
    "yesScore": 1
  },
  {
    "key": "q9",
    "label": "你是否寧願留在家中，也不願出外做些新的事？",
    "yesScore": 1
  },
  {
    "key": "q10",
    "label": "你是否覺得你比一般老人家有更多記憶力的問題？",
    "yesScore": 1
  },
  {
    "key": "q11",
    "label": "你生存到現在覺得美好嗎？",
    "yesScore": 0
  },
  {
    "key": "q12",
    "label": "你是否覺得自己現時毫無價值？",
    "yesScore": 1
  },
  {
    "key": "q13",
    "label": "你是否感到精力充沛？",
    "yesScore": 0
  },
  {
    "key": "q14",
    "label": "你是否覺得你現時的處境沒有希望？",
    "yesScore": 1
  },
  {
    "key": "q15",
    "label": "你是否覺得大部分人的景況比你好？",
    "yesScore": 1
  }
],
    lawtonItems: [
  {
    "key": "telephone",
    "label": "Use of telephone",
    "interpretation": "包括找電話號碼、打及接聽電話"
  },
  {
    "key": "transportation",
    "label": "Transportation",
    "interpretation": "包括自己上到正確的車，比車錢/買車票，上/落車（假設必須要搭交通工具去一個遠的地方，例如探朋友 / 睇醫生）"
  },
  {
    "key": "shopping",
    "label": "Shopping",
    "interpretation": "包括自己選貨品、給錢和拿回家（假設必須要到附近商店買食物或日用品）"
  },
  {
    "key": "mealPreparation",
    "label": "Meal Preparation",
    "interpretation": "包括自己想吃甚麼、準備材料、煮熟食物及放入碗碟中（假設你必須要自己準備兩餐）"
  },
  {
    "key": "housework",
    "label": "Housework",
    "interpretation": "包括簡單家務（如抹檯、收拾床鋪、洗碗）及較重的家務（如抹地/抹窗）（假設你必須要自己做家務）"
  },
  {
    "key": "handyman",
    "label": "Handyman Work",
    "interpretation": "例如換燈泡、維修檯及上緊螺絲等（假設你必須要自己做）"
  },
  {
    "key": "laundry",
    "label": "Laundry",
    "interpretation": "包括清洗及曬自己衫、被、床單等（假設你必須要洗自己的衫、被、床單等）"
  },
  {
    "key": "medication",
    "label": "Medication Management",
    "interpretation": "包括能依照指示在正確的時間內服用正確的份量（假設你必須要自己塗藥油或吃藥）"
  },
  {
    "key": "money",
    "label": "Money Management",
    "interpretation": "包括日常金錢的找贖、交租金/水電費及到銀行提款（假設你必須要買東西、自己交租金/水電費及需要將錢放進銀行）"
  }
],
    specialties,
    assessmentForms,
    formTypes,
    mocaAgeRanges,
    mocaNorms,
    mocaSubscales,
    sections: [
      "Vital signs and Premorbid ADL",
      "Social History and Home Environment",
      "Mental Function",
      "Physical Assessment",
      "Functional Assessment",
      "Fall Assessment",
      "OT comment",
      "Problem identification",
      "Treatment Plan and Recommendation"
    ],
    oxygenModes: ["Room Air", "O2", "FiO2", "Intubated"],
    assistanceLevels,
    balanceLevels: ["Good", "Fair", "Poor"],
    basicAdlOptions,
    premorbidStatuses: ["Independent", "Supervision", "Assisted", "Dependent"],
    iadlStatuses: ["Independent", "Supervision", "Assisted", "Dependent"],
    mobilityAids,
    outdoorAids: mobilityAids.filter((aid) => aid !== "Chairbound" && aid !== "Bedbound"),
    livingOptions: [
      { value: "Lives with", label: "Lives with", remark: "Who?" },
      { value: "Live alone", label: "Live alone" },
      { value: "Day time alone", label: "Day time alone" },
      { value: "Night time alone", label: "Night time alone" },
      { value: "OAHR", label: "OAHR" },
      { value: "Hostel", label: "Hostel" },
      { value: "Others", label: "Others", remark: "Details" }
    ],
    homeEnvironment: [
      { value: "Direct lift landing", label: "Direct lift landing" },
      { value: "Non-direct lift landing", label: "Non-direct lift landing", remark: "FOS" },
      { value: "No lift", label: "No lift", remark: "Floor" }
    ],
    bathingFacilities: ["Tub", "Shower", "Hot water system"],
    bathBy: [
      { value: "Stand", label: "Stand" },
      { value: "Squat", label: "Squat" },
      { value: "Sit on", label: "Sit on", remark: "What?" },
      { value: "Bedbath", label: "Bedbath" }
    ],
    financialOptions: [
      "Family support or saving",
      "Public allowance",
      "Comprehensive Social Security Assistance",
      "Disability Allowance",
      "Old Age Allowance",
      "Old Age Living Allowance"
    ],
    socialServices: [
      { value: "Nil", label: "Nil", exclusive: true },
      { value: "Day Care centre", label: "Day Care centre", remark: "e.g. 3 times per week" },
      { value: "Elderly Centre", label: "Elderly Centre", remark: "e.g. 3 times per week" },
      { value: "Respite Services", label: "Respite Services", remark: "e.g. for 1 month" },
      { value: "Home Help Service", label: "Home Help Service", subchoices: ["Meal on wheels", "Personal care", "Household", "Escort"] },
      { value: "Others", label: "Others", remark: "Details" }
    ],
    assistiveDevices: [
      { value: "Nil", label: "Nil", exclusive: true },
      { value: "Safety alarm", label: "Safety alarm" },
      { value: "Commode", label: "Commode" },
      { value: "Handrail", label: "Handrail", remark: "Details" },
      { value: "Walking aids", label: "Walking aids", remark: "e.g. stick" },
      { value: "Wheelchair", label: "Wheelchair" },
      { value: "Others", label: "Others", remark: "Details" }
    ],
    consciousness: [
      { value: "Alert", label: "Alert" },
      { value: "Confused", label: "Confused" },
      { value: "Drowsy", label: "Drowsy" },
      { value: "Stupor", label: "Stupor" },
      { value: "Others", label: "Others", remark: true }
    ],
    commandFollowing: [
      "Follow 1 step command",
      "Follow 2 steps command",
      "Follow 3 steps command",
      "Not follow command"
    ],
    orientationItems,
    amtItems,
    speechOptions: [
      { value: "Normal", label: "Normal" },
      { value: "Expressive Dysphasia", label: "Expressive Dysphasia" },
      { value: "Receptive Dysphasia", label: "Receptive Dysphasia" },
      { value: "Dysarthria", label: "Dysarthria" },
      { value: "Others", label: "Others", remark: true }
    ],
    bodySides: ["Left", "Right", "Bilateral"],
    biItems,
    biOrder,
    biRows: [
      ["bowels", "bladder", "grooming", "toileting", "feeding"],
      ["dressing", "bathing", "transfer", "mobility", "stairs"]
    ],
    biInterpretation: [
      { range: "0-20", label: "Total Assistance" },
      { range: "21-60", label: "Severe Assistance" },
      { range: "61-90", label: "Moderate Assistance" },
      { range: "91-99", label: "Slight Assistance" },
      { range: "100", label: "Independent" }
    ],
    fallRiskFactors: [
      "Dizziness",
      "LL weakness",
      "Cognitive problem",
      "Gait disturbance",
      "History of fall",
      "Poor Safety Awareness",
      "Others"
    ],
    fratScoreItems: [
      {
        key: "recentFall",
        label: "Recent Fall",
        levels: [
          { value: "2", score: 2, label: "None in last 12 months" },
          { value: "4", score: 4, label: "One or more between 3 and 12 months ago" },
          { value: "6", score: 6, label: "One or more in last 3 months" },
          { value: "8", score: 8, label: "One or more in last 3 months whilst inpatient / resident" }
        ]
      },
      {
        key: "medications",
        label: "Medications",
        note: "Sedatives, anti-depressants, anti-Parkinson's, diuretics, anti-hypertensive, hypnotics",
        levels: [
          { value: "1", score: 1, label: "Not taking any of these" },
          { value: "2", score: 2, label: "Taking one" },
          { value: "3", score: 3, label: "Taking two" },
          { value: "4", score: 4, label: "Taking more than two" }
        ]
      },
      {
        key: "psychological",
        label: "Psychological",
        note: "Anxiety, depression, decreased cooperation, decreased insight or decreased judgement",
        levels: [
          { value: "1", score: 1, label: "Does not appear to have any of these" },
          { value: "2", score: 2, label: "Appears mildly affected by one or more" },
          { value: "3", score: 3, label: "Appears moderately affected by one or more" },
          { value: "4", score: 4, label: "Appears severely affected by one or more" }
        ]
      },
      {
        key: "cognitive",
        label: "Cognitive Status",
        note: "AMTS: Hodkinson Abbreviated Mental Test Score",
        levels: [
          { value: "1", score: 1, label: "AMTS 9 or 10 /10 or intact" },
          { value: "2", score: 2, label: "AMTS 7-8 or mildly impaired" },
          { value: "3", score: 3, label: "AMTS 5-6 or moderately impaired" },
          { value: "4", score: 4, label: "AMTS 4 or less or severely impaired" }
        ]
      }
    ],
    fratAutomaticHighRisk: [
      "Recent change in functional status and / or medications affecting safe mobility",
      "Dizziness / postural hypotension"
    ],
    fallIncidentReasons: [
      "Dizziness",
      "LL weakness",
      "Environmental Hazards",
      "Slip & Fall / Trip & Fall",
      "Risky Behaviour",
      "Unknown",
      "Other"
    ],
    fratChecklist: [
      { key: "vision", label: "Vision", description: "Difficulty seeing - objects / signs / finding way around" },
      { key: "mobility", label: "Mobility", description: "Unknown or appears unsafe / impulsive / forgets gait aid" },
      { key: "transfers", label: "Transfers", description: "Unknown or appears unsafe" },
      { key: "behaviors", label: "Behaviors", description: "Agitation / confusion / disorientation, difficulty following instructions or non-compliant" },
      { key: "adlRiskTaking", label: "ADL", description: "Risk-taking behavior" },
      { key: "equipment", label: "Equipment", description: "Observed unsafe use of equipment" },
      { key: "footwear", label: "Footwear", description: "Unsafe footwear / inappropriate clothing" },
      { key: "environment", label: "Environment", description: "Difficulties with orientation to environment" },
      { key: "nutrition", label: "Nutrition", description: "Underweight / low appetite" },
      { key: "continence", label: "Continence", description: "Reported or known urgency / nocturia / accidents" }
    ],
    hdrsItems: [
      {
        key: "patientCompetency",
        factor: "patient",
        label: "1a. Patient competency",
        help: "Select patient competency score directly",
        scores: [
          { value: "1", label: "Low", description: "Require 24-hour supervision and assistance" },
          { value: "2", label: "Moderate Low", description: "Require constant day-time supervision and assistance" },
          { value: "3", label: "Moderate High", description: "Require regular supervision and/or some assistance" },
          { value: "4", label: "High", description: "Require occasional supervision" },
          { value: "5", label: "Very High", description: "Require no supervision" }
        ]
      },
      {
        key: "patientAttitude",
        factor: "patient",
        label: "1b. Patient attitude",
        scores: [
          { value: "1", label: "Strong unwillingness", description: "Show strong unwillingness to return home; global dysphasia / severe receptive dysphasia is regarded as score 1" },
          { value: "2", label: "Unwilling", description: "Unwilling to return home despite pre/post discharge support" },
          { value: "3", label: "Neutral", description: "No concrete idea about discharge; willing to attempt with pre/post discharge support" },
          { value: "4", label: "Minimal worry", description: "Show desire to home discharge with minimal worry; reassurance and brief pre-discharge support required" },
          { value: "5", label: "Strong desire", description: "Show strong desire to home discharge without hesitation" }
        ]
      },
      {
        key: "carerAvailability",
        factor: "carer",
        label: "2a. Availability of home carer",
        scores: [
          { value: "1", label: "Poor support", description: "Live alone with poor support" },
          { value: "2", label: "Occasional support", description: "Live alone with occasional day-time support/care, or can obtain assistance when needed" },
          { value: "3", label: "Daytime alone", description: "Live with carer but daytime alone with occasional support or care" },
          { value: "4", label: "Daytime care", description: "Live with carer, daytime care available, may be alone for a few hours" },
          { value: "5", label: "24-hour care", description: "Live with carer, 24-hour full-time care available" }
        ]
      },
      {
        key: "carerCompetency",
        factor: "carer",
        label: "2b. Carer competency and attitude",
        scores: [
          { value: "1", label: "Unable/refuses", description: "Carer cannot care for patient, refuses home discharge, or patient will be living alone" },
          { value: "2", label: "Limited/hesitated", description: "Carer can provide limited care only, or is very hesitated despite support" },
          { value: "3", label: "Concerned but willing", description: "Carer expresses concern but is willing to make effort with pre/post discharge support" },
          { value: "4", label: "Able and willing", description: "Carer is able to care for patient at home and willing to bring patient home" },
          { value: "5", label: "Competent and eager", description: "Carer is competent and very eager to bring patient home" }
        ]
      },
      {
        key: "homeSafety",
        factor: "environment",
        label: "3a. Home safety",
        scores: [
          { value: "1", label: "High risk", description: "Significant high home safety risks cannot be removed with short-term intervention" },
          { value: "2", label: "Major risks", description: "Major home safety risks requiring intensive carer education and/or home modification; dependent/bedbound case regarded as this score" },
          { value: "3", label: "Several risks", description: "Several home safety risks requiring patient and carer education" },
          { value: "4", label: "Minimal risks", description: "Minimal home safety risks requiring brief education" },
          { value: "5", label: "No significant risk", description: "No significant home safety risk identified" }
        ]
      },
      {
        key: "physicalEnvironment",
        factor: "environment",
        label: "3b. Physical environment",
        scores: [
          { value: "1", label: "Inadequate", description: "Inadequate home and community environment; intervention is difficult" },
          { value: "2", label: "Major barriers", description: "Major barriers requiring extensive home modification or liaison with estate management" },
          { value: "3", label: "Several barriers", description: "Several barriers requiring simple modification or assistive devices" },
          { value: "4", label: "Adequate with barriers", description: "Adequate home environment with some barriers requiring education" },
          { value: "5", label: "Good environment", description: "Good home and community environment without barriers" }
        ]
      }
    ],
    fallPatientFactors: [
      { value: "Not applicable", exclusive: true },
      { value: "NAD", exclusive: true },
      { value: "Impaired ADL function" },
      { value: "Impaired Health Status" },
      { value: "Impaired physical stability" },
      { value: "Impaired cognition" },
      { value: "Risky behaviours" },
      { value: "Others", remark: true }
    ],
    patientFactors: [
      { value: "Not applicable", exclusive: true },
      { value: "NAD", exclusive: true },
      { value: "Impaired ADL function" },
      { value: "Impaired cognition" },
      { value: "Impaired physical stability" },
      { value: "Impaired safety awareness" },
      { value: "Others", remark: true }
    ],
    environmentalFactors: [
      { value: "Not applicable", exclusive: true },
      { value: "NAD", exclusive: true },
      { value: "Limited accessibility" },
      { value: "Risky home environment" },
      { value: "Others", remark: true }
    ],
    socialFactors: [
      { value: "Not applicable", exclusive: true },
      { value: "NAD", exclusive: true },
      { value: "Lack of competent caregiver" },
      { value: "Live alone" },
      { value: "Daytime alone" },
      { value: "Nighttime alone" },
      { value: "Others", remark: true }
    ],
    completedTreatmentOptions: [
      { value: "ADL Assessment done" },
      { value: "Cognitive Assessment done" },
      { value: "Fall Assessment done", fallOnly: true },
      { value: "Heel protectors fitted" },
      { value: "Other", remark: "Details" }
    ],
    treatmentPlan: [
      { value: "Further assessment if stable", exclusive: true },
      { value: "Basic ADL Training" },
      { value: "Basic ADL maintenance" },
      { value: "Cognitive training", program: true },
      { value: "Orientation training", program: true },
      { value: "Fall prevention education / training" },
      { value: "Limb function maintenance / positioning" },
      { value: "Upper limb and hand function training", fallOnly: true },
      { value: "Splintage program", fallOnly: true },
      { value: "Pressure injury prevention", remark: "Pressure relieve device" },
      { value: "Aids prescription", remark: "Aids" },
      { value: "Home Safety Recommendation / Home visit" },
      { value: "Environmental advice for ward area", fallOnly: true },
      { value: "Carer interview" },
      { value: "Carer education / training" },
      { value: "Symptoms management" },
      { value: "Active living program", palliativeOnly: true },
      { value: "Others", remark: "Details" }
    ],
    recommendations: [
      { value: "Functionally fit home" },
      { value: "Home with carer/maid/supervision from", remark: "Who?" },
      { value: "Short course of training in QEH" },
      { value: "Convalescent rehabilitation" },
      { value: "Refer to occupational therapy department out-patient department for", remark: "ADL / Cognitive / Hand Function, etc." },
      { value: "Community OT service (COT)" },
      { value: "GDH" },
      { value: "Refer ICDS for", remark: "Details" },
      { value: "For medical stabilization" },
      { value: "Others", remark: "Details" }
    ],
    carerInterviewTopics: [
      { value: "Premorbid function", remark: true },
      { value: "Current functional status", remark: true },
      { value: "Potential caring difficulties", remark: true },
      { value: "Caring Plan", remark: true },
      { value: "Others", remark: true }
    ],
    palliativeSymptoms: [
      { value: "Pain" },
      { value: "Fatigue" },
      { value: "Breathlessness" },
      { value: "Edema" },
      { value: "Pressure Injury" },
      { value: "Abdominal Distension" },
      { value: "Nausea and vomiting" },
      { value: "Jaundice" },
      { value: "Cachexia" },
      { value: "Others", remark: true }
    ],
    pressureSkinConditions: [
      { value: "Redness" },
      { value: "Blister" },
      { value: "Bruise" },
      { value: "Others", remark: true }
    ],
    pressureSiteSides: ["Left", "Right", "Bilateral"],
    pressureSiteAreas: [
      { value: "Head" },
      { value: "Back" },
      { value: "Sacrum" },
      { value: "Arm" },
      { value: "Forearm" },
      { value: "Elbow" },
      { value: "Hand" },
      { value: "Foot" },
      { value: "Heel" },
      { value: "Malleolus" },
      { value: "Others", remark: true }
    ],
    pressureInjuryStages: ["Stage I", "Stage II", "Stage III", "Stage IV", "Unstageable"],
    pressureAssessmentSkinConditions: [
      { value: "NAD", exclusive: true },
      { value: "Erythema" },
      { value: "Increase temperature" },
      { value: "Decrease Temperature" },
      { value: "Bruise" },
      { value: "Blister" },
      { value: "Edema" },
      { value: "Excessive moist" },
      { value: "Thin eschar" },
      { value: "Dry" },
      { value: "Others", remark: true }
    ],
    pressureSiteAttachments: [
      { value: "Tube" },
      { value: "Drip" },
      { value: "Device", remark: true },
      { value: "Poor hygiene" }
    ],
    pressureFunctionStatuses: [
      "Bedbound",
      "Chairbound",
      "Ambulate occasionally",
      "Ambulate frequently"
    ],
    pressurePowerMovementOptions: [
      "Nil active / spontaneous limb movement",
      "Minimal active / spontaneous limb movement"
    ],
    pressureSensationOptions: [
      { value: "NAD", exclusive: true },
      { value: "Pain", remark: "Present in" },
      { value: "Numbness", remark: "Present in" }
    ],
    pressureTactileSensationOptions: [
      "Intact",
      "Partial intact",
      "Impaired",
      "Failed to assess"
    ],
    pressureProblemOptions: [
      { value: "High pressure injury risk" },
      { value: "Largely dependent ADL function" },
      { value: "Decrease mobility" },
      { value: "Bedbound status" },
      { value: "Others", remark: true }
    ],
    pressureDevicePrescriptionOptions: [
      "Suggest not for additional pressure relieving device at the moment",
      "Prescription of pressure relieving device"
    ],
    pressureDeviceTypes: [
      { value: "Heel protectors" },
      { value: "Heel free cushion" },
      { value: "Hand Spongy" },
      { value: "Cushion" },
      { value: "Bed wedge" },
      { value: "Mattress" },
      { value: "Others", remark: true }
    ],
    pressureRegimeOptions: [
      { value: "Day and night use" },
      { value: "Lying on bed" },
      { value: "Supine lying" },
      { value: "Sit out" },
      { value: "Q4 hours" },
      { value: "Others", remark: true }
    ],
    pressureDeviceActions: [
      "Measurement taken for the device",
      "Device issued"
    ],
    pressureManagementInterventions: [
      { value: "Positioning", remark: true },
      { value: "Limbs function training / maintenance" },
      { value: "ADL training" },
      { value: "Pressure Relief techniques education" },
      { value: "Carer education", remark: true },
      { value: "Sitting program" },
      { value: "For further assessment", remark: "e.g. for pressure mapping" }
    ],
    pressureTreatmentPlanOptions: [
      { value: "Bedside review" },
      { value: "Limb function maintenance" },
      { value: "ADL training / Mobility training" },
      { value: "FU at OPD/COT" },
      { value: "Others", remark: true }
    ],
    tedSkinConditions: [
      { value: "NAD", exclusive: true },
      { value: "Wound", remark: "Over" },
      { value: "Redness", remark: "Over" }
    ],
    tedSwellingOptions: [
      { value: "Nil", exclusive: true },
      { value: "Yes" }
    ],
    tedSwellingLimbs: [
      { value: "Left limb" },
      { value: "Right limb" }
    ],
    tedPatientRiskFactors: [
      { value: "Active cancer or cancer treatment" },
      { value: "Age > 60" },
      { value: "Dehydration" },
      { value: "Known thrombophilia" },
      { value: "Obesity (BMI >30mg/m2)" },
      { value: "Personal history or first-degree relative with a history of DVT" },
      { value: "One or more significant medical comorbidities" },
      { value: "Use of hormone replacement therapy" },
      { value: "Varicose veins with phlebitis" }
    ],
    tedAdmissionRiskFactors: [
      { value: "Significantly reduced mobility for 3 days or more" },
      { value: "Hip or knee replacement" },
      { value: "Hip fracture" },
      { value: "Total anesthetic + surgical time > 90 minutes" },
      { value: "Surgery involving pelvis or lower limb with a total anesthetic + surgical time > 60 minutes" },
      { value: "Acute surgical admission with inflammatory or intra-abdominal condition" },
      { value: "Critical care admission" },
      { value: "Surgery with significant reduction in mobility" }
    ],
    tedManagementOptions: [
      { value: "Not fit for TED stocking" },
      { value: "Compression stocking prescribed" },
      { value: "Limb function training / maintenance" }
    ],
    tedNotFitReasons: [
      { value: "Poor skin condition" },
      { value: "Tube / Drip available" },
      { value: "Not indicated" },
      { value: "Others", remark: true }
    ],
    tedStockingTypes: [
      { value: "Commercial type TED stocking" },
      { value: "Tailor made stocking" }
    ],
    tedStockingSizes: ["XS", "S", "M", "L", "1", "2"],
    tedRegimeOptions: [
      { value: "Post-operation" },
      { value: "Bed rest" },
      { value: "Others", remark: true }
    ],
    tedPlanOptions: [
      { value: "Continue limb maintenance" },
      { value: "Review upon request" }
    ],
    homeO2AdlItems: [
      { key: "bedMobility", label: "Bed Mobility", summaryLabel: "Bed mobility" },
      { key: "transfer", label: "Transfer", summaryLabel: "Transfer" },
      { key: "feeding", label: "Feeding", summaryLabel: "Feeding" },
      { key: "dressing", label: "Dressing", summaryLabel: "Dressing" },
      { key: "grooming", label: "Grooming", summaryLabel: "Grooming" },
      { key: "toileting", label: "Toileting", summaryLabel: "Toileting" },
      { key: "bathing", label: "Bathing", summaryLabel: "Bathing" },
      { key: "iadl", label: "IADL", summaryLabel: "IADL" },
      { key: "outdoor", label: "Outdoor", summaryLabel: "Outdoor" },
      { key: "work", label: "Work", summaryLabel: "Work" }
    ],
    homeO2AdlAssistanceLevels: [
      ...assistanceLevels,
      { value: "Not Applicable", label: "Not Applicable", exclusive: true }
    ],
    homeO2AdlAssistanceOrder: [
      ...assistanceLevels,
      "Not Applicable"
    ],
    homeO2DefaultActivities: [
      "Bed mobility",
      "Dressing (Sitting)",
      "Ambulation (2 minutes)"
    ],
    homeO2OximetryOxygenModes: [
      "Room Air",
      "O2"
    ],
    homeO2DyspneaLevels: [
      "Nil",
      "Only chest discomfort",
      "Mild",
      "Moderate",
      "Maximal",
      "Very severe"
    ],
    homeO2ActivityAssistanceLevels: [
      "Independent",
      "Supervision",
      "Mild Assistance",
      "Moderate Assistance",
      "Dependent"
    ],
    homeO2OxygenRegimeOptions: [
      { value: "Pending further oximetry test" },
      { value: "Not indicated for Home O2 at the moment" },
      { value: "Home O2 indicated" }
    ],
    homeO2ProblemOptions: [
      { value: "Breathlessness symptoms" },
      { value: "O2 dependent" }
    ],
    homeO2TreatmentOptions: [
      { value: "Home O2 Assessment done" },
      { value: "Education on Breathing Technique, Handheld Fan and Energy Conservation" },
      { value: "Home O2 education" },
      { value: "HaGO Tele-information prescribed" },
      { value: "Others", remark: true }
    ],
    homeO2TreatmentPlanOptions: [
      { value: "Home O2 review" },
      { value: "Home O2 education" },
      { value: "Pending Home O2 arrangement" }
    ],
    homeO2ConsentFundingOptions: [
      "Self paid",
      "DA",
      "CSSA",
      "Funding support"
    ],
    homeO2DecisionDeviceOptions: [
      "Portable Oxygen Concentrator",
      "Conserving Device",
      "Accessories"
    ],
    homeO2AccessoryOptions: [
      "Nasal Cannula",
      "Mask",
      "Humidifier",
      "Others"
    ],
    homeO2NasalCannulaLengthOptions: [
      "7ft",
      "16ft",
      "25ft"
    ],
    homeO2DeliveryStatusOptions: [
      "Pending arrangement",
      "Arranged on"
    ],
    homeO2CylinderSizeOptions: [
      "B",
      "C",
      "D",
      "E"
    ],
    homeO2ConsentSignatoryOptions: [
      "Patient",
      "Family",
      "Others"
    ],
    homeO2UseOptions: [
      "STOT",
      "Palliative use"
    ],
    homeO2ReferralStatuses: [
      "Referred",
      "Declined referral"
    ],
    homeO2ReferralDestinations: [
      "OPD",
      "EMV"
    ],
    homeO2MonitoringReferralOptions: [
      "3-month Home Oxygen Therapy Review",
      "ICM-OT",
      "CGAT",
      "EMV"
    ]
  };

  window.OT_PHRASE_BANK = bank;
})();
