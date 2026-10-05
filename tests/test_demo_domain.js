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
