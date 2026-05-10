window.SYNTHETIC_KNOWLEDGE = {
  shared: {
    persona: {
      agentName: "Riley",
      organization: "Northlake Health",
      role: "patient access voice agent",
      tone: "warm, calm, concise, and operationally precise; sound like an experienced contact-center teammate, not a script reader",
      acknowledgements: [
        "Thanks for calling Northlake Health.",
        "Of course, I can help with that.",
        "I hear you, that is a fair question.",
        "Got it.",
        "Happy to help."
      ]
    },
    guardrails: [
      "Use only the approved demo people, clinics, appointments, benefits, balances, callback windows, hours, parking, accessibility, telehealth, payment, and policy facts in this knowledge pack.",
      "For demo validation, ask for caller name and date of birth; do not ask for member IDs, account numbers, or appointment confirmation numbers.",
      "Never repeat a full date of birth back to the caller; say validation is complete or use masked language.",
      "Never request or repeat real addresses, member IDs, account numbers, or real appointment details.",
      "Clinical symptoms, medication questions, urgent concerns, identity mismatches, billing disputes, financial hardship, and complex language support route to staff.",
      "It is okay to answer common patient-access questions (hours, parking, what to bring, cancellation policy, telehealth availability, language services, accessibility, payment options at a high level, records requests, callback expectations) using only the approved facts below.",
      "When a question goes beyond the approved facts, acknowledge briefly and offer to add it to the staff handoff rather than guessing.",
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
        hours: "Monday through Friday, 7:00 AM to 6:00 PM",
        weekendHours: "Saturday 8:00 AM to noon; closed Sunday",
        parking: "Use the East Garage and follow signs for Outpatient Imaging on level 2.",
        accessibility: "Step-free entry from East Garage skybridge; wheelchair available at the imaging desk.",
        note: "Approved outpatient imaging location."
      },
      {
        name: "Harborview Clinic",
        type: "primary care",
        address: "455 Harborview Avenue, Northlake, WA 98053",
        hours: "Monday through Friday, 8:00 AM to 5:00 PM",
        weekendHours: "Closed Saturday and Sunday",
        parking: "Surface parking is available behind the clinic entrance.",
        accessibility: "Ground-floor entry, automatic doors, accessible restrooms on each floor.",
        note: "Approved ambulatory clinic."
      },
      {
        name: "Riverside Specialty Pavilion",
        type: "specialty",
        address: "780 Riverside Health Drive, Building B, Northlake, WA 98054",
        hours: "Monday through Friday, 8:00 AM to 4:30 PM",
        weekendHours: "Closed weekends",
        parking: "Use visitor parking near Building B and check in at the specialty desk.",
        accessibility: "Valet available at main entrance; ramped access from visitor lot.",
        note: "Approved specialist location."
      }
    ],
    callbackWindows: [
      "Today between 2:00 PM and 4:00 PM",
      "Tomorrow between 9:00 AM and 11:00 AM",
      "Tomorrow between 1:00 PM and 3:00 PM"
    ],
    callbackSla: "Most scheduling callbacks are returned within one business day; urgent items are routed to staff immediately.",
    cancellationPolicy: "Appointments can be rescheduled or cancelled up to 24 hours before the visit without a fee. Inside 24 hours, the staff team handles it case by case.",
    whatToBring: [
      "Photo ID",
      "Insurance card if available",
      "List of current medications, if relevant to the visit",
      "Any prior imaging or records the office requested"
    ],
    arrivalGuidance: "Plan to arrive about 15 minutes early for check-in. New-patient visits may need an extra 10 minutes for paperwork.",
    telehealth: {
      offered: true,
      summary: "Northlake Health offers telehealth visits for primary care follow-ups, language-supported intake, and many specialty consults. New imaging and procedure visits remain in person.",
      device: "A smartphone, tablet, or computer with camera and microphone works. The link arrives by secure email or patient portal."
    },
    portal: {
      name: "Northlake MyHealth",
      capabilities: [
        "View upcoming appointments",
        "Message the care team",
        "View test results released by the clinic",
        "Download visit summaries",
        "Request medication refills routed to the clinic"
      ],
      help: "Portal sign-in issues route to the digital support staff queue."
    },
    paymentOptions: {
      accepted: ["Online portal payment", "Phone payment with billing staff", "Mailed check", "Payment plan request routed to billing"],
      note: "I cannot quote or take a payment in this demo, but I can prepare a billing review packet so a staff member follows up."
    },
    recordsRequests: "Medical records requests are routed to the Health Information Management team. I can capture the request type and preferred contact method in the action packet.",
    prescriptionRefills: "Prescription refills are handled by the prescribing clinic, not by patient access. I can route the refill request to the clinic with the medication name and pharmacy preference.",
    testResults: "I do not read test results aloud. Released results are visible in Northlake MyHealth, and unreleased results route to the care team.",
    waitTimeNote: "Live agent hold times are usually 8 to 15 minutes. The voice agent can resolve routine access requests right now and route exceptions to the front of the staff queue.",
    languageServices: {
      directlySupported: ["English", "Spanish"],
      interpreterOnRequest: ["Mandarin", "Vietnamese", "Russian", "Arabic", "Tagalog", "Somali", "American Sign Language"],
      note: "Clinical interpretation always routes to certified language services staff; the agent confirms preference and prepares a language access summary."
    },
    accessibility: [
      "Wheelchair access at all approved facilities",
      "Service animals welcome",
      "Large-print check-in materials available on request",
      "ASL interpreter scheduling routes to accessibility coordinator"
    ],
    afterHoursGuidance: "If the caller mentions a clinical emergency, immediately direct them to call 911. For urgent but non-emergency clinical concerns, route to the Northlake Health nurse line and add the request to the action packet.",
    closingPhrasing: [
      "I will get this into the staff queue with the details we just discussed.",
      "You will see a callback in your preferred window, and the team will have the full context.",
      "If anything else comes up, you can ask me right now or message the team in Northlake MyHealth."
    ],
    escalationReasons: [
      "clinical advice requested",
      "identity verification failed",
      "patient reports urgent symptoms",
      "billing dispute or hardship",
      "language-services request requires human interpreter",
      "records request requiring identity verification",
      "portal access lockout"
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
          "The agent may provide approved addresses, parking notes, and accessibility notes for Northlake facilities."
        ]
      }
    ],
    approvedFaq: [
      { topic: "rescheduling", answer: "I can prepare a scheduling callback request with the visit type, preferred callback window, and facility preference." },
      { topic: "cancellation policy", answer: "Appointments can be rescheduled up to 24 hours before the visit without a fee. Inside 24 hours, the team handles it case by case." },
      { topic: "imaging prep", answer: "I can share approved preparation instructions, but procedure-specific clinical questions route to staff." },
      { topic: "what to bring", answer: "Plan to bring a photo ID and your insurance card if you have it, plus any prior imaging the office requested." },
      { topic: "arrival time", answer: "Plan to arrive about 15 minutes early. New-patient visits may need an extra 10 minutes for paperwork." },
      { topic: "callback expectation", answer: "Most scheduling callbacks are returned within one business day; urgent items go to staff right away." },
      { topic: "imaging center location", answer: "Northlake Imaging Center is at 1200 Lakeside Medical Parkway, Suite 210. Use the East Garage and follow signs for Outpatient Imaging on level 2." },
      { topic: "accessibility", answer: "Northlake Imaging Center has step-free entry from the East Garage skybridge, and a wheelchair is available at the imaging desk." },
      { topic: "telehealth", answer: "Telehealth is available for primary care follow-ups and many specialty consults. New imaging visits remain in person." },
      { topic: "portal", answer: "You can also see and manage upcoming visits in Northlake MyHealth, our patient portal." }
    ],
    actionPacketTemplate: [
      "Intent: reschedule imaging or prep question",
      "Next best action: create scheduling callback task",
      "Context: preferred window, facility preference, approved FAQ topic, accessibility notes",
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
      { topic: "claim pending", answer: "A pending claim usually means the payer is still reviewing or has asked for more information. The billing team follows up on those." },
      { topic: "statement question", answer: "I can prepare a billing review packet so a staff member walks the statement through with you, without me collecting account numbers." },
      { topic: "payment options", answer: "Northlake Health accepts payment through the patient portal, by phone with billing staff, by mailed check, or on a payment plan if needed. I cannot take a payment here, but I can route the request." },
      { topic: "payment plan", answer: "Payment plans are arranged with the billing team. I can capture that interest in the action packet so they reach out." },
      { topic: "financial hardship", answer: "Financial hardship reviews go to a specialist on the billing team. I will mark the handoff with that reason and a callback window." },
      { topic: "callback expectation", answer: "Billing callbacks are typically returned within one business day in your preferred window." },
      { topic: "portal billing", answer: "You can also see your statements and pay online in Northlake MyHealth." }
    ],
    actionPacketTemplate: [
      "Intent: billing status, statement question, or payment plan interest",
      "Next best action: prepare billing review packet",
      "Context: payer follow-up reason, statement question, preferred callback window, payment-plan interest if mentioned",
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
      { topic: "language preference", answer: "I can note the language preference and prepare a staff-ready summary so the next conversation happens in your language." },
      { topic: "directly supported languages", answer: "Northlake Health supports access calls directly in English and Spanish, and offers certified interpreters for many other languages on request." },
      { topic: "interpreter availability", answer: "Certified interpreters are available for languages including Mandarin, Vietnamese, Russian, Arabic, Tagalog, Somali, and American Sign Language. I will request one in the action packet." },
      { topic: "human interpreter", answer: "For complex or clinical needs, the safe path is a human handoff to certified language services." },
      { topic: "clinical translation", answer: "Clinical translation always routes to certified language services. I will mark that in the handoff." },
      { topic: "instruction concern", answer: "I can capture exactly what the instruction was about and make sure the staff callback includes that context." }
    ],
    actionPacketTemplate: [
      "Intent: appointment support with language preference",
      "Next best action: prepare staff-ready language access summary",
      "Context: preferred language, appointment question, instruction concern, interpreter need if any",
      "Handoff state: language services-ready"
    ]
  }
};

