"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const domain = require("../demo-domain.js");
const knowledge = require("../synthetic-data.js");
const fs = require("node:fs");
const path = require("node:path");

const accepted = knowledge.shared.validationProtocol.acceptedDemoValues;
const accessProfile = knowledge.shared.signedInProfiles.access;

test("active profile requires both name and date of birth", () => {
  assert.equal(
    domain.matchesActiveVerification(
      "Jordan Lee, July 14, 1982",
      accessProfile,
      accepted
    ),
    true
  );
  assert.equal(
    domain.matchesActiveVerification("Jordan Lee", accessProfile, accepted),
    false
  );
  assert.equal(
    domain.matchesActiveVerification("July 14, 1982", accessProfile, accepted),
    false
  );
});

test("negated identity statements never satisfy active-profile verification", () => {
  const cases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "verification_negation_cases.json"), "utf8")
  );
  for (const text of cases.denied) {
    assert.equal(domain.matchesActiveVerification(text, accessProfile, accepted), false, text);
  }
  for (const text of cases.affirmed) {
    assert.equal(domain.matchesActiveVerification(text, accessProfile, accepted), true, text);
  }
});

test("another accepted demo persona cannot verify the active profile", () => {
  assert.equal(
    domain.matchesActiveVerification(
      "Alex Morgan, February 3, 1975",
      accessProfile,
      accepted
    ),
    false
  );
});

test("spoken active-profile date is parsed without implementation Date parsing", () => {
  assert.equal(
    domain.matchesActiveVerification(
      "Jordan Lee, July fourteenth nineteen eighty two",
      accessProfile,
      accepted
    ),
    true
  );
});

test("previously supported numeric-ordinal and zero-padded dates still verify", () => {
  for (const spoken of [
    "Jordan Lee, July 14th 1982",
    "Jordan Lee, 07 14 1982",
    "Jordan Lee, July 14th nineteen eighty two",
    "Jordan Lee, 7/14/82"
  ]) {
    assert.equal(
      domain.matchesActiveVerification(spoken, accessProfile, accepted),
      true,
      spoken
    );
  }
});

test("scoped realtime context contains only the active verification record", () => {
  const context = domain.buildScopedRealtimeContext(knowledge, "access");
  const serialized = JSON.stringify(context.knowledge);

  assert.equal(context.profile.displayName, "Jordan Lee");
  assert.equal(
    context.knowledge.shared.validationProtocol.acceptedDemoValues.length,
    1
  );
  assert.equal(
    context.knowledge.shared.validationProtocol.acceptedDemoValues[0].name,
    "Jordan Lee"
  );
  assert.equal("signedInProfiles" in context.knowledge.shared, false);
  assert.match(serialized, /rescheduling/);
  assert.ok(serialized.length < 24000);
});

test("scheduling inference rejects negated and unrelated numeric text", () => {
  assert.equal(
    domain.inferSchedulingWindowFromText(
      "Anything except Friday at 11:30, please."
    ),
    ""
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Call me at area code 215 tomorrow."),
    ""
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 11:30 works."),
    ""
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Eleven thirty works."),
    ""
  );
});

test("scheduling inference recognizes bounded spoken and clock times", () => {
  assert.equal(
    domain.inferSchedulingWindowFromText("Friday at eleven thirty works."),
    "Friday at 11:30 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 2:15 works."),
    "Thursday at 2:15 PM"
  );
});

test("scheduling inference rejects explicit AM/PM conflicts with offered slots", () => {
  for (const text of [
    "Friday at 11:30 PM works.",
    "Friday at 11:30pm works.",
    "Friday at eleven thirty p.m. works.",
    "Thursday at 10:45 PM works.",
    "Thursday at 2:15 a.m. works.",
    "Friday at 11:30, PM works.",
    "Friday at 11:30 in the PM works.",
    "Friday at 11:30 p  m works.",
    "Thursday at 2:15, AM works.",
    "Friday at 11:30 at night works.",
    "Thursday at 10:45 in the evening works.",
    "Thursday at 2:15 in the morning works.",
    "Friday at 11:30 this evening works.",
    "Friday at 11:30 later tonight works.",
    "Thursday at 2:15 this morning works.",
    "Thursday at 2:15 (AM) works.",
    "Thursday at 2:15 before noon works.",
    "Friday at 11:30 after noon works.",
    "Thursday AM at 2:15 works.",
    "Friday at 11:30 AM, or 11:30 PM if that is open."
  ]) {
    assert.equal(domain.inferSchedulingWindowFromText(text), "", text);
  }
});

test("scheduling inference accepts a matching explicit AM/PM", () => {
  assert.equal(
    domain.inferSchedulingWindowFromText("Friday at 11:30 AM works."),
    "Friday at 11:30 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Friday at 11:30am works."),
    "Friday at 11:30 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 10:45 a.m. works."),
    "Thursday at 10:45 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 2:15 p.m. works."),
    "Thursday at 2:15 PM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 10:45, a morning slot is best."),
    "Thursday at 10:45 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Friday at 11:30 a meeting ends, so that works."),
    "Friday at 11:30 AM"
  );
  assert.equal(
    domain.inferSchedulingWindowFromText("Thursday at 2:15 in the afternoon works."),
    "Thursday at 2:15 PM"
  );
});

test("verification JSON deadline covers stalled response bodies", async () => {
  let aborted = false;
  const stalledFetch = async (_url, options) => ({
    json: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted"));
      });
    })
  });

  await assert.rejects(
    domain.fetchJsonWithDeadline(stalledFetch, "/verify", {}, 10),
    error => error.name === "DeadlineExceededError"
  );
  assert.equal(aborted, true);
});

test("unopened data channels fail within the readiness bound", async () => {
  const listeners = new Map();
  const channel = {
    readyState: "connecting",
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }
  };

  await assert.rejects(
    domain.waitForDataChannelOpen(channel, 10),
    /did not open in time/
  );
  assert.equal(listeners.size, 0);
});

test("already-open data channels use the readiness fast path", async () => {
  await domain.waitForDataChannelOpen({ readyState: "open" }, 10);
});

test("patient background inert state survives patient-executive-patient transitions", () => {
  assert.equal(domain.isPatientBackgroundInert("patient", false), false);
  assert.equal(domain.isPatientBackgroundInert("executive", false), true);
  assert.equal(domain.isPatientBackgroundInert("patient", false), false);
  assert.equal(domain.isPatientBackgroundInert("patient", true), true);
});

test("fresh-load assistant panel is inert while retaining focus-trap fallback", () => {
  const markup = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(
    markup,
    /<aside class="assistant-panel"[^>]*aria-hidden="true"[^>]*tabindex="-1"[^>]*inert>/
  );
});

test("conversation hints follow the latest affirmed or denied mention", () => {
  const spanish = { languagePreference: "English first, Spanish second" };
  const cases = [
    ["Can you do English and then Spanish for my mom?", spanish],
    ["Prefiero español, por favor.", spanish],
    ["My mom is driving me there.", { caregiverContext: "mother driving" }],
    ["My mother drove me last time.", { caregiverContext: "mother driving" }],
    ["No Spanish needed.", { languagePreference: "" }],
    ["I don't need Spanish.", { languagePreference: "" }],
    ["I do not speak Spanish.", { languagePreference: "" }],
    ["Spanish? No, I do not need Spanish.", { languagePreference: "" }],
    ["I speak Spanish, but I want English only.", { languagePreference: "" }],
    ["I don't need English only; Spanish please.", spanish],
    ["My mom cannot drive me.", { caregiverContext: "" }],
    ["My mom can't drive this week.", { caregiverContext: "" }],
    ["My mom is driving me, actually, not this time.", { caregiverContext: "" }],
    ["My mom cannot drive, but my sister is driving me.", { caregiverContext: "" }],
    ["My mom is not driving; I am driving myself.", { caregiverContext: "" }],
    ["My mom cannot bring me, but my friend will give me a ride.", { caregiverContext: "" }],
    ["My sister is driving me, and my mom is coming along.", {}],
    ["My mom will be driving me.", { caregiverContext: "mother driving" }],
    ["My mom has an appointment too.", {}],
    ["Actually English only, please.", { languagePreference: "" }],
    ["Actually, not Thursday.", {}],
    ["Friday morning works best.", {}]
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(domain.detectConversationHints(text), expected, text);
  }
});

function trackedStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { track, stream: { getTracks: () => [track] } };
}

test("early microphone release stops a stream that resolves later", async () => {
  let resolveStream;
  const microphone = domain.requestEarlyMicrophone({
    getUserMedia: () => new Promise(resolve => { resolveStream = resolve; })
  }, { audio: true });
  microphone.release();
  const { track, stream } = trackedStream();
  resolveStream(stream);
  await microphone.promise;
  assert.equal(track.stopped, true);
});

test("an adopted early microphone stream is never stopped by release", async () => {
  const { track, stream } = trackedStream();
  const microphone = domain.requestEarlyMicrophone({ getUserMedia: async () => stream }, {});
  assert.equal(microphone.adopt(await microphone.promise), stream);
  microphone.release();
  assert.equal(track.stopped, false);
});

test("early microphone failures reject when awaited, including synchronous throws", async () => {
  const microphone = domain.requestEarlyMicrophone({
    getUserMedia() { throw new Error("NotAllowedError"); }
  }, {});
  await assert.rejects(microphone.promise, /NotAllowedError/);
  microphone.release();
});
