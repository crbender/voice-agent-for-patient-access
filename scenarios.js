window.DEMO_SCENARIOS = {
  access: {
    label: "Patient access",
    title: "AI answers the front door",
    summary: "Reschedule imaging, answer prep questions, route exceptions.",
    hook: "This is what happens when the front door of healthcare becomes conversational, multilingual, and always available.",
    close: "Voice AI is strongest when it handles routine access and escalates exceptions safely.",
    captions: ["Voice as the new front door", "Low-latency patient access", "Escalate when needed"],
    talkTrack: "Healthcare access is still too dependent on phone trees, hold queues, and manual follow-up. This demo shows a voice agent that handles routine rescheduling, grounds answers in approved instructions, and creates a clean handoff for staff.",
    systemPrompt: "You are a healthcare patient access voice agent demo. Use synthetic data only. Do not provide clinical advice. Help with scheduling, prep-instruction routing, and escalation.",
    script: [
      { at: 1000, time: "0:03", scene: "Patient intent", who: "Patient", type: "patient", text: "Hi, I need to reschedule my imaging appointment. I have a conflict tomorrow morning.", metrics: ["12%", "2m", "1"], packet: ["Intent: reschedule imaging appointment", "Tool: patient access triage", "Escalation: not required"] },
      { at: 6500, time: "0:10", scene: "Natural response", who: "Access agent", type: "agent", text: "I can help with that. I can collect the details for a scheduling callback and share approved prep instructions. Is this for radiology, imaging, or a specialist visit?", speak: true, metrics: ["28%", "4m", "1"], packet: ["Intent: reschedule imaging appointment", "Tool: scheduling callback candidate", "Escalation: not required"] },
      { at: 17000, time: "0:22", scene: "Clarify safely", who: "Patient", type: "patient", text: "Imaging. It is at the downtown clinic. I also need to know if I should fast.", metrics: ["41%", "7m", "1"], packet: ["Intent: reschedule + prep question", "Tool: imaging FAQ lookup", "Escalation: not required"] },
      { at: 24500, time: "0:31", scene: "Grounded instructions", who: "Access agent", type: "agent", text: "For this demo, I am using synthetic instructions. I found the imaging preparation policy and can send approved guidance, but I will not make a clinical determination.", speak: true, metrics: ["55%", "10m", "2"], packet: ["Intent: prep guidance", "Tool: approved FAQ response", "Escalation: clinical questions route to staff"] },
      { at: 39000, time: "0:47", scene: "Action trigger", who: "System action", type: "system", text: "Action packet created: reschedule request, preferred callback window, clinic location, and policy citation attached for staff review.", speak: true, metrics: ["67%", "13m", "2"], packet: ["Intent: scheduling callback", "Tool: create callback task", "Escalation: staff queue prepared"], tag: "Ready" },
      { at: 54500, time: "1:05", scene: "Executive value", who: "Access agent", type: "agent", text: "The patient avoids the phone tree, staff receive structured context, and exceptions are routed to humans. That is higher throughput without pretending AI is the clinician.", speak: true, metrics: ["72%", "16m", "3"], packet: ["Intent: resolved routine access need", "Tool: callback + FAQ", "Escalation: exception-ready"] },
      { at: 72500, time: "1:25", scene: "Close", who: "Demo close", type: "agent", text: "If you only remember one thing: voice AI is strongest when it handles routine access and escalates exceptions safely.", speak: true, metrics: ["78%", "18m", "3"], packet: ["Outcome: routine access contained", "Staff impact: cleaner handoff", "Governance: synthetic demo, auditable flow"], tag: "Complete" }
    ]
  },
  revenue: {
    label: "Revenue cycle",
    title: "AI reduces billing friction",
    summary: "Explain claim status, identify next action, route exceptions.",
    hook: "Here is the revenue-cycle version: fewer status calls, cleaner handoffs, and less avoidable admin work.",
    close: "The win is not replacing billing teams. It is removing repetitive status friction before it reaches them.",
    captions: ["Claims status without hold time", "Cleaner billing handoff", "Exceptions routed to humans"],
    talkTrack: "Revenue cycle teams lose capacity to repetitive status calls. This demo shows how a voice agent can answer routine billing questions with synthetic policy context and prepare exception packets for human staff.",
    systemPrompt: "You are a revenue-cycle voice agent demo. Use synthetic data only. Do not request real account numbers. Explain generic claim status workflows and route billing exceptions to staff.",
    script: [
      { at: 1000, time: "0:03", scene: "Billing intent", who: "Patient", type: "patient", text: "I received a statement and I am trying to understand whether insurance has processed it.", metrics: ["10%", "2m", "1"], packet: ["Intent: billing status question", "Tool: revenue cycle triage", "Escalation: not required"] },
      { at: 6500, time: "0:10", scene: "Safe boundary", who: "Access agent", type: "agent", text: "I can explain the standard claim-status workflow using synthetic data. I will not ask for real account numbers in this public demo.", speak: true, metrics: ["25%", "5m", "1"], packet: ["Intent: explain workflow", "Tool: billing FAQ lookup", "Escalation: not required"] },
      { at: 17000, time: "0:22", scene: "Next action", who: "Patient", type: "patient", text: "What should happen next if the payer needs more information?", metrics: ["38%", "8m", "1"], packet: ["Intent: payer follow-up", "Tool: claim workflow lookup", "Escalation: not required"] },
      { at: 24500, time: "0:31", scene: "Grounded answer", who: "Access agent", type: "agent", text: "The approved workflow says the next step is to route the item to billing review with payer follow-up context. I can prepare that packet for staff.", speak: true, metrics: ["53%", "11m", "2"], packet: ["Intent: payer follow-up", "Tool: prepare billing review packet", "Escalation: billing staff queue"] },
      { at: 39000, time: "0:47", scene: "Action trigger", who: "System action", type: "system", text: "Action packet created: statement question, payer follow-up reason, callback preference, and approved script attached.", speak: true, metrics: ["64%", "15m", "2"], packet: ["Intent: billing review", "Tool: create staff task", "Escalation: billing queue prepared"], tag: "Ready" },
      { at: 54500, time: "1:05", scene: "Executive value", who: "Access agent", type: "agent", text: "For operations leaders, this means fewer repetitive calls, better prepared staff work, and less cycle-time waste in revenue operations.", speak: true, metrics: ["70%", "19m", "3"], packet: ["Outcome: routine billing friction reduced", "Staff impact: cleaner work queue", "Governance: no real financial data"] },
      { at: 72500, time: "1:25", scene: "Close", who: "Demo close", type: "agent", text: "If you only remember one thing: voice AI can reduce revenue-cycle friction without exposing sensitive billing data in a public demo.", speak: true, metrics: ["74%", "22m", "3"], packet: ["Outcome: exception-ready", "Risk: reduced data exposure", "Governance: synthetic demo"], tag: "Complete" }
    ]
  },
  multilingual: {
    label: "Multilingual access",
    title: "AI expands access capacity",
    summary: "Route language needs and prepare a human-ready summary.",
    hook: "The access story gets stronger when the patient needs help in another language and the system still routes safely.",
    close: "Access improves when AI handles routine language friction and hands complex needs to the right human team.",
    captions: ["Language access at the front door", "Structured summary for staff", "Human handoff preserved"],
    talkTrack: "Language access is an operational throughput issue and an equity issue. This demo shows synthetic multilingual routing, a structured staff summary, and safe escalation for complex needs.",
    systemPrompt: "You are a multilingual patient access voice agent demo. Use synthetic data only. Do not translate clinical determinations. Route complex needs to approved language services or staff.",
    script: [
      { at: 1000, time: "0:03", scene: "Language need", who: "Patient", type: "patient", text: "I need help confirming my clinic appointment, but I prefer Spanish.", metrics: ["14%", "3m", "2"], packet: ["Intent: appointment confirmation", "Tool: language preference detection", "Escalation: not required"] },
      { at: 6500, time: "0:10", scene: "Language routing", who: "Access agent", type: "agent", text: "I can continue this access workflow with Spanish-language support and prepare a staff summary if anything needs human follow-up.", speak: true, metrics: ["31%", "6m", "2"], packet: ["Intent: language-supported access", "Tool: multilingual prompt route", "Escalation: not required"] },
      { at: 17000, time: "0:22", scene: "Appointment detail", who: "Patient", type: "patient", text: "Please confirm the time and tell me what to bring. I am worried I may miss an instruction.", metrics: ["43%", "9m", "2"], packet: ["Intent: confirm visit + instructions", "Tool: appointment FAQ lookup", "Escalation: not required"] },
      { at: 24500, time: "0:31", scene: "Safe guidance", who: "Access agent", type: "agent", text: "I can share approved appointment preparation details and create a summary for staff. I will route clinical or urgent concerns to a human immediately.", speak: true, metrics: ["58%", "12m", "3"], packet: ["Intent: prep support", "Tool: approved instruction lookup", "Escalation: clinical concerns route to staff"] },
      { at: 39000, time: "0:47", scene: "Action trigger", who: "System action", type: "system", text: "Action packet created: language preference, appointment confirmation need, instruction concern, and staff-ready summary.", speak: true, metrics: ["68%", "16m", "3"], packet: ["Intent: language access handoff", "Tool: create staff summary", "Escalation: language services-ready"], tag: "Ready" },
      { at: 54500, time: "1:05", scene: "Executive value", who: "Access agent", type: "agent", text: "For executives, this is access capacity: less avoidable call friction, more consistent instructions, and a clearer handoff when human support matters.", speak: true, metrics: ["73%", "20m", "4"], packet: ["Outcome: access friction reduced", "Staff impact: summarized need", "Governance: language support boundary visible"] },
      { at: 72500, time: "1:25", scene: "Close", who: "Demo close", type: "agent", text: "If you only remember one thing: multilingual voice access can improve throughput while preserving human escalation.", speak: true, metrics: ["79%", "24m", "4"], packet: ["Outcome: language need routed", "Risk: no clinical translation claim", "Governance: approved handoff"], tag: "Complete" }
    ]
  }
};
