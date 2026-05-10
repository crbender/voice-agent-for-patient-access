window.SYNTHETIC_KNOWLEDGE = {
  shared: {
    guardrails: [
      "Use only the approved demo people, clinics, appointments, benefits, balances, and callback windows in this knowledge pack.",
      "For demo validation, ask for caller name and date of birth; do not ask for member IDs, account numbers, or appointment confirmation numbers.",
      "Never repeat a full date of birth back to the caller; say validation is complete or use masked language.",
      "Never request or repeat addresses, member IDs, account numbers, or real appointment details.",
      "Clinical symptoms, medication questions, urgent concerns, identity mismatches, billing disputes, and financial hardship exceptions route to staff.",
      "Use the phrase 'approved instructions' when answering preparation or policy questions.",
      "Use the phrase 'action packet' when summarizing what staff receive."
    ],
    validationProtocol: {
      prompt: "For validation, may I have your full name and date of birth?",
      acceptedDemoValues: [
        { name: "Jordan Lee", dateOfBirth: "July 14, 1982", masked: "July 14 ending 1982" },
        { name: "Maya Patel", dateOfBirth: "March 8, 1979", masked: "March 8 ending 1979" },
        { name: "Sam Rivera", dateOfBirth: "November 22, 1990", masked: "November 22 ending 1990" },
        { name: "Alex Morgan", dateOfBirth: "February 3, 1975", masked: "February 3 ending 1975" },
        { name: "Taylor Chen", dateOfBirth: "June 18, 1988", masked: "June 18 ending 1988" },
        { name: "Elena Garcia", dateOfBirth: "September 9, 1984", masked: "September 9 ending 1984" },
        { name: "Nora Ahmed", dateOfBirth: "December 12, 1992", masked: "December 12 ending 1992" }
      ],
      successPhrase: "Validation is complete. I can prepare the action packet.",
      failureRoute: "If the caller will not provide the demo validation values, route to staff queue with handoff state: validation incomplete."
    },
    facilities: [
      {
        name: "Northlake Imaging Center",
        type: "imaging",
        address: "1200 Lakeside Medical Parkway, Suite 210, Northlake, WA 98052",
        hours: "7:00 AM-6:00 PM",
        parking: "Use the East Garage and follow signs for Outpatient Imaging on level 2.",
        note: "Approved outpatient imaging location."
      },
      {
        name: "Harborview Clinic",
        type: "primary care",
        address: "455 Harborview Avenue, Northlake, WA 98053",
        hours: "8:00 AM-5:00 PM",
        parking: "Surface parking is available behind the clinic entrance.",
        note: "Approved ambulatory clinic."
      },
      {
        name: "Riverside Specialty Pavilion",
        type: "specialty",
        address: "780 Riverside Health Drive, Building B, Northlake, WA 98054",
        hours: "8:00 AM-4:30 PM",
        parking: "Use visitor parking near Building B and check in at the specialty desk.",
        note: "Approved specialist location."
      }
    ],
    callbackWindows: [
      "Today between 2:00 PM and 4:00 PM",
      "Tomorrow between 9:00 AM and 11:00 AM",
      "Tomorrow between 1:00 PM and 3:00 PM"
    ],
    escalationReasons: [
      "clinical advice requested",
      "identity verification failed",
      "patient reports urgent symptoms",
      "billing dispute or hardship",
      "language-services request requires human interpreter"
    ]
  },
  access: {
    personas: [
      {
        name: "Jordan Lee",
        dateOfBirth: "July 14, 1982",
        scenario: "reschedule imaging appointment",
        startingUtterance: "I need to reschedule my imaging appointment tomorrow morning.",
        approvedFacts: [
          "Demo validation uses name Jordan Lee and date of birth July 14, 1982.",
          "The request can be captured as a scheduling callback task.",
          "The agent can record preferred callback windows, visit type, and facility preference.",
          "The approved imaging address is Northlake Imaging Center, 1200 Lakeside Medical Parkway, Suite 210, Northlake, WA 98052.",
          "The agent cannot confirm or change a real appointment in this public demo."
        ]
      },
      {
        name: "Maya Patel",
        dateOfBirth: "March 8, 1979",
        scenario: "imaging preparation question",
        startingUtterance: "Do I need to fast before my imaging visit?",
        approvedFacts: [
          "Demo validation uses name Maya Patel and date of birth March 8, 1979.",
          "The agent may cite approved preparation instructions.",
          "Fasting guidance depends on procedure type and must be confirmed by staff or approved policy.",
          "Clinical uncertainty routes to staff."
        ]
      },
      {
        name: "Sam Rivera",
        dateOfBirth: "November 22, 1990",
        scenario: "transportation and location confusion",
        startingUtterance: "I am not sure which clinic I should go to.",
        approvedFacts: [
          "Demo validation uses name Sam Rivera and date of birth November 22, 1990.",
          "The agent may capture location confusion for staff follow-up.",
          "The action packet should include preferred facility, callback window, and question category.",
          "The agent should avoid inventing an appointment location.",
          "The agent may provide approved addresses and parking notes for Northlake facilities."
        ]
      }
    ],
    approvedFaq: [
      {
        topic: "rescheduling",
        answer: "I can prepare a scheduling callback request with the visit type, preferred callback window, and facility preference."
      },
      {
        topic: "imaging prep",
        answer: "I can share approved preparation instructions from the FAQ, but clinical or procedure-specific questions route to staff."
      },
      {
        topic: "callback expectation",
        answer: "For the demo, the next best action is a staff callback task with a concise summary and handoff state."
      },
      {
        topic: "imaging center location",
        answer: "Northlake Imaging Center is at 1200 Lakeside Medical Parkway, Suite 210, Northlake, WA 98052. Use the East Garage and follow signs for Outpatient Imaging on level 2."
      }
    ],
    actionPacketTemplate: [
      "Intent: reschedule imaging or prep question",
      "Next best action: create scheduling callback task",
      "Context: preferred window, facility preference, approved FAQ topic",
      "Handoff state: routine unless clinical or identity exception"
    ]
  },
  revenue: {
    personas: [
      {
        name: "Alex Morgan",
        dateOfBirth: "February 3, 1975",
        scenario: "claim status explanation",
        startingUtterance: "I got a statement and I do not understand if insurance processed it.",
        approvedFacts: [
          "Demo validation uses name Alex Morgan and date of birth February 3, 1975.",
          "The agent can explain a generic claim-status workflow.",
          "The agent cannot access or request a real account number.",
          "Disputes, hardship, and payer exceptions route to billing staff."
        ]
      },
      {
        name: "Taylor Chen",
        dateOfBirth: "June 18, 1988",
        scenario: "payer follow-up",
        startingUtterance: "What happens if the payer needs more information?",
        approvedFacts: [
          "Demo validation uses name Taylor Chen and date of birth June 18, 1988.",
          "The next action is a billing review packet with payer follow-up context.",
          "The agent may explain approved workflow stages: submitted, pending payer info, review, patient follow-up.",
          "The agent should not quote real balances."
        ]
      }
    ],
    approvedFaq: [
      {
        topic: "claim pending",
        answer: "A pending claim can mean the payer is still reviewing information or needs a billing team follow-up."
      },
      {
        topic: "statement question",
        answer: "The safest demo action is to create a billing review packet without collecting account numbers."
      }
    ],
    actionPacketTemplate: [
      "Intent: billing status or statement question",
      "Next best action: prepare billing review packet",
      "Context: payer follow-up reason, statement question, preferred callback window",
      "Handoff state: billing staff queue"
    ]
  },
  multilingual: {
    personas: [
      {
        name: "Elena Garcia",
        dateOfBirth: "September 9, 1984",
        scenario: "Spanish language preference",
        startingUtterance: "I prefer Spanish and need help confirming my appointment.",
        approvedFacts: [
          "Demo validation uses name Elena Garcia and date of birth September 9, 1984.",
          "The agent can acknowledge language preference and prepare a staff summary.",
          "Clinical translation or urgent concerns route to approved language services or staff.",
          "The demo can show multilingual routing without claiming certified interpretation."
        ]
      },
      {
        name: "Nora Ahmed",
        dateOfBirth: "December 12, 1992",
        scenario: "instruction concern with language support",
        startingUtterance: "I am worried I missed an instruction and need help in another language.",
        approvedFacts: [
          "Demo validation uses name Nora Ahmed and date of birth December 12, 1992.",
          "The agent can route to approved appointment preparation details.",
          "The action packet should include language preference and instruction concern.",
          "Complex needs route to human language services."
        ]
      }
    ],
    approvedFaq: [
      {
        topic: "language preference",
        answer: "I can note the language preference and prepare a staff-ready summary for follow-up."
      },
      {
        topic: "human interpreter",
        answer: "For complex or clinical needs, the safe path is a human handoff to approved language services."
      }
    ],
    actionPacketTemplate: [
      "Intent: appointment support with language preference",
      "Next best action: prepare staff-ready language access summary",
      "Context: preferred language, appointment question, instruction concern",
      "Handoff state: language services-ready"
    ]
  }
};
