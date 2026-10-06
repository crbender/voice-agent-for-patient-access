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
      .replace(/[,./-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function includesWholePhrase(normalizedText, phrase) {
    const normalizedPhrase = normalizeVerificationText(phrase);
    if (!normalizedPhrase) return false;
    return (` ${normalizedText} `).includes(` ${normalizedPhrase} `);
  }

  function nameMatchesVerification(normalizedText, name) {
    const text = normalizeVerificationText(normalizedText);
    const parts = normalizeVerificationText(name).split(" ").filter(Boolean);
    return parts.length > 0 && parts.every(part => includesWholePhrase(text, part));
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
    if (!parsed) return includesWholePhrase(text, dateOfBirth);

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
    return variants.some(variant => includesWholePhrase(text, variant));
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

  return {
    buildScopedRealtimeContext,
    dobMatchesVerification,
    fetchJsonWithDeadline,
    findActiveVerificationRecord,
    inferSchedulingWindowFromText,
    isPatientBackgroundInert,
    matchesActiveVerification,
    nameMatchesVerification,
    normalizeVerificationText,
    parseDemoDateOfBirth,
    waitForDataChannelOpen,
    withDeadline
  };
});
