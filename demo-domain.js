"use strict";

(function initVoiceDemoDomain(root, factory) {
  const domain = factory();
  if (typeof module === "object" && module.exports) module.exports = domain;
  if (root) root.VOICE_DEMO_DOMAIN = domain;
})(typeof window !== "undefined" ? window : null, () => {
  const MONTH_NAMES = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december"
  ];

  const DAY_ORDINALS = {
    1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth",
    6: "sixth", 7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth",
    11: "eleventh", 12: "twelfth", 13: "thirteenth", 14: "fourteenth",
    15: "fifteenth", 16: "sixteenth", 17: "seventeenth", 18: "eighteenth",
    19: "nineteenth", 20: "twentieth", 21: "twenty first", 22: "twenty second",
    23: "twenty third", 24: "twenty fourth", 25: "twenty fifth",
    26: "twenty sixth", 27: "twenty seventh", 28: "twenty eighth",
    29: "twenty ninth", 30: "thirtieth", 31: "thirty first"
  };

  const SPOKEN_YEARS = {
    1975: "nineteen seventy five",
    1979: "nineteen seventy nine",
    1982: "nineteen eighty two",
    1984: "nineteen eighty four",
    1988: "nineteen eighty eight",
    1990: "nineteen ninety",
    1992: "nineteen ninety two"
  };

  function normalizeVerificationText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[,./:;!?()"\u201c\u201d\u2013\u2014-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // A factor next to a negation ("i'm not jordan lee", "jordan lee is not my name") is a
  // denial, not evidence, and the latest mention of a factor wins. Other parts of the same
  // name may sit between the negation and the word it denies.
  // Keep in sync with server.py phrase_stance().
  const NEGATION = "(?:not|never|isn't|isnt|wasn't|wasnt|ain't|aint)";
  const DENIAL_FILLERS = ["really", "actually", "even", "named", "called", "the"];
  const DOB_DENIAL_FILLERS = ["born", "on"];

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Compiled denial patterns depend only on the filler set, so they are built once per set.
  const denialPatternCache = new Map();

  function denialPatterns(extraFillers) {
    const key = extraFillers.join("|");
    let patterns = denialPatternCache.get(key);
    if (!patterns) {
      const fillers = [...DENIAL_FILLERS, ...extraFillers].map(escapeRegExp).join("|");
      patterns = {
        before: new RegExp(`(?:^|\\s)${NEGATION}(?:\\s+(?:${fillers})){0,4}\\s$`),
        after: new RegExp(
          `^\\s(?:(?:${fillers})\\s+){0,4}(?:(?:is|was|are)\\s+(?:not|never)|isn't|isnt|wasn't|wasnt|ain't|aint)(?:\\s|$)`
        )
      };
      denialPatternCache.set(key, patterns);
    }
    return patterns;
  }

  function phraseStance(normalizedText, phrase, extraFillers = []) {
    const normalizedPhrase = normalizeVerificationText(phrase);
    if (!normalizedPhrase) return { index: -1, stance: "" };
    const { before: deniedBefore, after: deniedAfter } = denialPatterns(extraFillers);
    const text = ` ${normalizedText} `;
    const needle = ` ${normalizedPhrase} `;
    let latest = { index: -1, stance: "" };
    for (let index = text.indexOf(needle); index >= 0; index = text.indexOf(needle, index + 1)) {
      const denied = deniedBefore.test(text.slice(0, index + 1)) ||
        deniedAfter.test(text.slice(index + needle.length - 1));
      latest = { index, stance: denied ? "denied" : "affirmed" };
    }
    return latest;
  }

  function latestStance(normalizedText, phrases, extraFillers = []) {
    let latest = { index: -1, stance: "" };
    for (const phrase of phrases) {
      const found = phraseStance(normalizedText, phrase, extraFillers);
      if (found.index > latest.index || (found.index === latest.index && found.stance === "denied")) {
        latest = found;
      }
    }
    return latest.stance;
  }

  function nameMatchesVerification(normalizedText, name) {
    const text = normalizeVerificationText(normalizedText);
    const parts = normalizeVerificationText(name).split(" ").filter(Boolean);
    return parts.length > 0 &&
      parts.every(part => latestStance(text, [part], parts) === "affirmed");
  }

  function parseDemoDateOfBirth(value) {
    const match = String(value || "").trim().match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (!match) return null;
    const monthIndex = MONTH_NAMES.indexOf(match[1].toLowerCase());
    const day = Number(match[2]);
    const year = Number(match[3]);
    if (monthIndex < 0 || day < 1 || day > 31) return null;
    return { monthIndex, day, year };
  }

  function numericOrdinalSuffix(day) {
    if (day % 100 >= 11 && day % 100 <= 13) return "th";
    if (day % 10 === 1) return "st";
    if (day % 10 === 2) return "nd";
    if (day % 10 === 3) return "rd";
    return "th";
  }

  function dobMatchesVerification(normalizedText, dateOfBirth) {
    const text = normalizeVerificationText(normalizedText);
    const parsed = parseDemoDateOfBirth(dateOfBirth);
    if (!parsed) return latestStance(text, [dateOfBirth], DOB_DENIAL_FILLERS) === "affirmed";

    const month = MONTH_NAMES[parsed.monthIndex];
    const monthNumber = String(parsed.monthIndex + 1);
    const day = String(parsed.day);
    const year = String(parsed.year);
    const shortYear = year.slice(-2);
    const ordinal = DAY_ORDINALS[parsed.day];
    const spokenYear = SPOKEN_YEARS[parsed.year];
    const numericOrdinal = `${day}${numericOrdinalSuffix(parsed.day)}`;
    const paddedMonth = monthNumber.padStart(2, "0");
    const paddedDay = day.padStart(2, "0");
    const variants = [
      `${month} ${day} ${year}`,
      `${month} ${numericOrdinal} ${year}`,
      `${monthNumber} ${day} ${year}`,
      `${monthNumber} ${day} ${shortYear}`,
      `${paddedMonth} ${paddedDay} ${year}`,
      `${paddedMonth} ${paddedDay} ${shortYear}`,
      normalizeVerificationText(dateOfBirth)
    ];

    if (ordinal) variants.push(`${month} ${ordinal} ${year}`);
    if (spokenYear) {
      variants.push(`${month} ${day} ${spokenYear}`);
      variants.push(`${month} ${numericOrdinal} ${spokenYear}`);
      if (ordinal) variants.push(`${month} ${ordinal} ${spokenYear}`);
    }
    return latestStance(text, variants, DOB_DENIAL_FILLERS) === "affirmed";
  }

  function findActiveVerificationRecord(profile, acceptedDemoValues) {
    if (!profile?.displayName || !Array.isArray(acceptedDemoValues)) return null;
    const activeName = normalizeVerificationText(profile.displayName);
    return acceptedDemoValues.find(value =>
      normalizeVerificationText(value?.name) === activeName
    ) || null;
  }

  function matchesActiveVerification(text, profile, acceptedDemoValues) {
    const record = findActiveVerificationRecord(profile, acceptedDemoValues);
    if (!record) return false;
    const normalizedText = normalizeVerificationText(text);
    return nameMatchesVerification(normalizedText, record.name) &&
      dobMatchesVerification(normalizedText, record.dateOfBirth);
  }

  function buildScopedRealtimeContext(allKnowledge, scenarioKey) {
    const shared = allKnowledge?.shared || {};
    const profile = shared.signedInProfiles?.[scenarioKey] || null;
    const activeRecord = findActiveVerificationRecord(
      profile,
      shared.validationProtocol?.acceptedDemoValues || []
    );
    const { signedInProfiles: _signedInProfiles, ...sharedWithoutProfiles } = shared;
    return {
      profile,
      verificationRecord: activeRecord,
      knowledge: {
        shared: {
          ...sharedWithoutProfiles,
          validationProtocol: {
            ...(shared.validationProtocol || {}),
            acceptedDemoValues: activeRecord ? [activeRecord] : []
          }
        },
        scenario: allKnowledge?.[scenarioKey] || {}
      }
    };
  }

  // Bare "am" is also an ordinary word, so AM/PM tokens only count when attached to a time.
  function hasMeridiemConflict(text, timePattern, expected) {
    const pattern = new RegExp(
      `${timePattern}[\\s,()\\-]*(?:in the\\s+)?([ap])\\.?\\s*m\\.?(?![a-z])`,
      "g"
    );
    for (const match of text.matchAll(pattern)) {
      if (match[1] !== expected) return true;
    }
    return false;
  }

  function inferSchedulingWindowFromText(value) {
    const text = String(value || "").toLowerCase();
    const hasNegation = /\b(?:except|not|cannot|can't|don't|do not|anything but)\b/.test(text);
    if (hasNegation) return "";
    const hasThursday = text.includes("thursday");
    const hasFriday = text.includes("friday");
    if (hasThursday && hasFriday) return "";

    const elevenThirty = String.raw`\b(?:11[:.]30(?![\d:])|eleven[- ]thirty\b)`;
    const tenFortyFive = String.raw`\b(?:10[:.]45(?![\d:])|ten forty[- ]five\b)`;
    const twoFifteen = String.raw`\b(?:2[:.]15(?![\d:])|two[- ]fifteen\b)`;
    const hasElevenThirty = new RegExp(elevenThirty).test(text);
    const hasTenFortyFive = new RegExp(tenFortyFive).test(text);
    const hasTwoFifteen = new RegExp(twoFifteen).test(text);
    const hasCanonicalTime = hasElevenThirty || hasTenFortyFive || hasTwoFifteen;
    // An explicitly spoken AM/PM or day period that disagrees with an offered slot makes the
    // request ambiguous; it must never be normalized onto that slot.
    const hasMorningCue =
      /\bmorning\b|\bbefore noon\b|\ba\.\s*m\.|\b(?:thursday|friday)\s+a\.?\s*m\b/.test(text);
    const hasLaterCue = /\b(?:afternoon|after noon|evening|night|tonight)\b|\bp\.?\s*m\b/.test(text);
    if (
      hasMeridiemConflict(text, elevenThirty, "a") ||
      hasMeridiemConflict(text, tenFortyFive, "a") ||
      hasMeridiemConflict(text, twoFifteen, "p") ||
      (hasLaterCue && (hasElevenThirty || hasTenFortyFive)) ||
      (hasMorningCue && hasTwoFifteen)
    ) {
      return "";
    }

    if (hasFriday && hasElevenThirty) {
      return "Friday at 11:30 AM";
    }
    if (hasThursday && hasTenFortyFive) {
      return "Thursday at 10:45 AM";
    }
    if (hasThursday && hasTwoFifteen) {
      return "Thursday at 2:15 PM";
    }
    if (hasCanonicalTime) return "";
    if (hasThursday && text.includes("morning")) return "Thursday morning";
    if (hasThursday && text.includes("afternoon")) return "Thursday afternoon";
    if (hasThursday) return "Thursday";
    if (hasFriday &&
      (text.includes("morning") || text.includes("sometime") || text.includes("some time"))) {
      return "Friday morning";
    }
    if (hasFriday) return "Friday";
    if (text.includes("tomorrow morning")) return "tomorrow morning";
    return "";
  }

  function withDeadline(promise, timeoutMs, label = "Operation") {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${label} timed out.`);
        error.name = "DeadlineExceededError";
        reject(error);
      }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function fetchJsonWithDeadline(fetchImpl, url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const body = await response.json();
      return { response, body };
    } catch (error) {
      if (controller.signal.aborted) {
        const timeoutError = new Error("Verification service timed out.");
        timeoutError.name = "DeadlineExceededError";
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function waitForDataChannelOpen(channel, timeoutMs) {
    if (channel?.readyState === "open") return Promise.resolve();
    if (!channel || channel.readyState === "closing" || channel.readyState === "closed") {
      return Promise.reject(new Error("Realtime data channel closed before it was ready."));
    }
    return new Promise((resolve, reject) => {
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        channel.removeEventListener("open", onOpen);
        channel.removeEventListener("close", onClose);
        channel.removeEventListener("error", onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Realtime data channel closed before it was ready."));
      };
      const onError = () => {
        cleanup();
        reject(new Error("Realtime data channel failed before it was ready."));
      };
      timer = setTimeout(() => {
        cleanup();
        reject(new Error("Realtime data channel did not open in time."));
      }, timeoutMs);
      channel.addEventListener("open", onOpen);
      channel.addEventListener("close", onClose);
      channel.addEventListener("error", onError);
    });
  }

  function isPatientBackgroundInert(view, assistantOpen) {
    return view !== "patient" || Boolean(assistantOpen);
  }

  // Starts a microphone request early while keeping ownership with the caller: the stream is
  // only handed over through adopt(), and release() stops it now or as soon as it resolves.
  function requestEarlyMicrophone(mediaDevices, constraints) {
    let stream = null;
    let adopted = false;
    let released = false;
    const stopStream = value => value?.getTracks().forEach(track => track.stop());
    const promise = new Promise(resolve => resolve(mediaDevices.getUserMedia(constraints)))
      .then(value => {
        stream = value;
        if (released) stopStream(value);
        return value;
      });
    promise.catch(() => {});
    return {
      promise,
      adopt(value) {
        adopted = true;
        return value;
      },
      release() {
        if (adopted || released) return;
        released = true;
        stopStream(stream);
      }
    };
  }

  const NEGATED_MENTION =
    /\b(?:no|not|don't|dont|do not|doesn't|doesnt|never|without|can't|cant|cannot|won't|wont|isn't|isnt)\s+(?:\w+\s+){0,3}$/;

  // The latest mention decides: "affirmed", "denied", or "" when the topic is not mentioned.
  // Self-contained denials (such as "English only") count anywhere; corrections (such as
  // "actually, not") only count after the topic has been mentioned.
  function latestMentionStance(text, pattern, { denials = [], corrections = [] } = {}) {
    let latest = { index: -1, stance: "" };
    for (const match of text.matchAll(pattern)) {
      const denied = NEGATED_MENTION.test(text.slice(0, match.index));
      latest = { index: match.index, stance: denied ? "denied" : "affirmed" };
    }
    const laterDenials = latest.index >= 0 ? [...denials, ...corrections] : denials;
    for (const denial of laterDenials) {
      for (const match of text.matchAll(denial)) {
        if (match.index > latest.index) latest = { index: match.index, stance: "denied" };
      }
    }
    return latest.stance;
  }

  // Conservative live hints for the staff-facing packet. A key is present only when the
  // utterance mentions that topic: an affirmed request sets it, and a denial or later
  // correction ("I don't need Spanish", "actually, not this time") returns "" to clear it.
  function detectConversationHints(value) {
    const text = String(value || "").toLowerCase().replace(/[\u2018\u2019]/g, "'");
    const hints = {};
    const language = latestMentionStance(text, /\b(?:spanish|espa[ñn]ol)\b/g, {
      denials: [/\b(?:english only|only english|just english|only in english)\b/g]
    });
    if (language) {
      hints.languagePreference = language === "affirmed" ? "English first, Spanish second" : "";
    }
    const driving = motherDrivingStance(text);
    if (driving === "affirmed") {
      hints.caregiverContext = "mother driving";
    } else if (driving === "denied") {
      hints.caregiverContext = "";
    }
    return hints;
  }

  // The driving verb must belong to the mother in the same clause, so "my mom cannot drive,
  // but my sister is driving me" never records the mother as the driver.
  const MOTHER_DRIVING =
    /\b(?:mom|mother|mama)\b((?:\s+\S+){0,4}?)\s+(?:driv(?:e|es|ing)|drove|brings?\s+me|bringing\s+me|giv(?:e|es|ing)\s+me\s+a\s+ride)\b/g;
  const CLAUSE_BREAK = /[,;]|\b(?:but|and|or)\b/;
  const DRIVING_NEGATION = /\b(?:not|never|can't|cant|cannot|won't|wont|isn't|isnt|doesn't|doesnt|don't|dont)\b/;
  const DRIVING_CORRECTIONS = [/\b(?:actually|wait|sorry)\b[\s,]*not\b/g, /\bnot this time\b/g];

  function motherDrivingStance(text) {
    let latest = { index: -1, stance: "" };
    for (const match of text.matchAll(MOTHER_DRIVING)) {
      const between = match[1] || "";
      if (CLAUSE_BREAK.test(between)) continue;
      latest = { index: match.index, stance: DRIVING_NEGATION.test(between) ? "denied" : "affirmed" };
    }
    if (latest.index < 0) return "";
    for (const correction of DRIVING_CORRECTIONS) {
      for (const match of text.matchAll(correction)) {
        if (match.index > latest.index) return "denied";
      }
    }
    return latest.stance;
  }

  return {
    buildScopedRealtimeContext,
    detectConversationHints,
    dobMatchesVerification,
    fetchJsonWithDeadline,
    findActiveVerificationRecord,
    inferSchedulingWindowFromText,
    isPatientBackgroundInert,
    matchesActiveVerification,
    nameMatchesVerification,
    normalizeVerificationText,
    parseDemoDateOfBirth,
    requestEarlyMicrophone,
    waitForDataChannelOpen,
    withDeadline
  };
});
