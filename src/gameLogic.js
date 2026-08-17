(function attachGameLogic(root, factory) {
  const casesApi = typeof module === 'object' && module.exports
    ? require('./cases')
    : root.MurderCaseCases;
  const api = factory(casesApi, root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.MurderCaseGame = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameLogic(casesApi, root) {
  'use strict';

  const STORAGE_KEY = 'murderCaseEvidenceDeck.profiles.v1';
  const SCHEMA_VERSION = 1;
  const DEDUCTION_STATUSES = Object.freeze(['unreviewed', 'watch', 'prime', 'cleared']);
  const RANKS = Object.freeze([
    { minimum: 95, name: 'Perfect' },
    { minimum: 75, name: 'Solved' },
    { minimum: 45, name: 'Partial' },
    { minimum: 0, name: 'Failed' }
  ]);

  function gameError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function toIso(now) {
    const value = now === undefined ? new Date() : new Date(now);
    if (Number.isNaN(value.getTime())) {
      throw gameError('INVALID_DATE', 'The supplied date is invalid.');
    }
    return value.toISOString();
  }

  function resolveCase(caseOrId) {
    if (caseOrId && typeof caseOrId === 'object' && caseOrId.id) {
      return caseOrId;
    }
    if (!casesApi || typeof casesApi.getCaseById !== 'function') {
      throw gameError('CASES_NOT_LOADED', 'Load cases.js before gameLogic.js.');
    }
    const caseData = casesApi.getCaseById(caseOrId);
    if (!caseData) {
      throw gameError('CASE_NOT_FOUND', 'Unknown case: ' + String(caseOrId));
    }
    return caseData;
  }

  function findEvidence(caseData, evidenceId) {
    const evidenceCard = caseData.evidence.find(function matchEvidence(item) {
      return item.id === evidenceId;
    });
    if (!evidenceCard) {
      throw gameError('EVIDENCE_NOT_FOUND', 'Unknown evidence card: ' + String(evidenceId));
    }
    return evidenceCard;
  }

  function findHotspot(evidenceCard, hotspotId) {
    const hotspot = evidenceCard.hotspots.find(function matchHotspot(item) {
      return item.id === hotspotId;
    });
    if (!hotspot) {
      throw gameError('HOTSPOT_NOT_FOUND', 'Unknown hotspot: ' + String(hotspotId));
    }
    return hotspot;
  }

  function createInitialCaseState(caseOrId, now) {
    const caseData = resolveCase(caseOrId);
    const timestamp = toIso(now);
    const actionLimit = Math.max(1, Number(caseData.maxActions || caseData.initialActions || caseData.actionLimit || 1));

    return {
      schemaVersion: SCHEMA_VERSION,
      caseId: caseData.id,
      caseVersion: caseData.version || 1,
      status: 'in_progress',
      startedAt: timestamp,
      updatedAt: timestamp,
      completedAt: null,
      maxActions: actionLimit,
      actionsLeft: actionLimit,
      selectedEvidenceId: caseData.evidence.length ? caseData.evidence[0].id : null,
      openedEvidence: {},
      openedHotspots: {},
      openedResults: [],
      notebook: [],
      deductionBoard: caseData.suspects.map(function makeDeductionEntry(suspect) {
        return {
          suspect,
          status: 'unreviewed',
          notes: '',
          evidenceIds: []
        };
      }),
      investigationStats: {
        actionsSpent: 0,
        criticalClues: 0,
        usefulClues: 0,
        redHerrings: 0,
        flavorFinds: 0
      },
      mustAccuse: false,
      finalAccusation: null,
      finalResult: null
    };
  }

  function assertPlayableState(state, caseData) {
    if (!state || typeof state !== 'object') {
      throw gameError('INVALID_STATE', 'A case state is required.');
    }
    if (state.caseId !== caseData.id) {
      throw gameError('CASE_STATE_MISMATCH', 'This save belongs to a different case.');
    }
    if (state.status === 'completed') {
      throw gameError('CASE_COMPLETED', 'This case has already been completed.');
    }
  }

  function hotspotKey(evidenceId, hotspotId) {
    return evidenceId + ':' + hotspotId;
  }

  function isHotspotOpened(state, evidenceId, hotspotId) {
    return Boolean(state && state.openedHotspots && state.openedHotspots[hotspotKey(evidenceId, hotspotId)]);
  }

  function canInspectHotspot(state, evidenceId, hotspotId) {
    if (!state || state.status === 'completed') return false;
    return isHotspotOpened(state, evidenceId, hotspotId) || Number(state.actionsLeft) > 0;
  }

  function makeNotebookEntry(evidenceCard, hotspot, openedAt) {
    return {
      id: hotspotKey(evidenceCard.id, hotspot.id),
      evidenceId: evidenceCard.id,
      evidenceTitle: evidenceCard.title,
      hotspotId: hotspot.id,
      hotspotLabel: hotspot.label,
      category: hotspot.category,
      resultTitle: hotspot.resultTitle,
      result: hotspot.result,
      notebook: hotspot.notebook || hotspot.result,
      relatedSuspects: clone(hotspot.relatedSuspects || []),
      relatedLocations: clone(hotspot.relatedLocations || []),
      clueTags: clone(hotspot.clueTags || []),
      openedAt
    };
  }

  function incrementCategoryStats(stats, category) {
    const next = Object.assign({
      actionsSpent: 0,
      criticalClues: 0,
      usefulClues: 0,
      redHerrings: 0,
      flavorFinds: 0
    }, stats || {});
    next.actionsSpent += 1;
    if (category === 'critical') next.criticalClues += 1;
    if (category === 'useful') next.usefulClues += 1;
    if (category === 'red_herring') next.redHerrings += 1;
    if (category === 'flavor') next.flavorFinds += 1;
    return next;
  }

  function inspectHotspot(state, caseOrId, evidenceId, hotspotId, now) {
    const caseData = resolveCase(caseOrId);
    assertPlayableState(state, caseData);
    const evidenceCard = findEvidence(caseData, evidenceId);
    const hotspot = findHotspot(evidenceCard, hotspotId);
    const key = hotspotKey(evidenceId, hotspotId);

    if (state.openedHotspots && state.openedHotspots[key]) {
      return {
        state: clone(state),
        result: clone(state.openedHotspots[key]),
        alreadyOpened: true,
        spentAction: false
      };
    }

    if (Number(state.actionsLeft) <= 0) {
      throw gameError('NO_ACTIONS_LEFT', 'No investigation actions remain. Submit a final accusation.');
    }

    const openedAt = toIso(now);
    const entry = makeNotebookEntry(evidenceCard, hotspot, openedAt);
    const next = clone(state);
    const remaining = Math.max(0, Number(state.actionsLeft) - 1);
    const evidenceOpenings = Array.isArray(next.openedEvidence[evidenceId])
      ? next.openedEvidence[evidenceId].slice()
      : [];

    evidenceOpenings.push(hotspotId);
    next.actionsLeft = remaining;
    next.updatedAt = openedAt;
    next.selectedEvidenceId = evidenceId;
    next.openedEvidence[evidenceId] = evidenceOpenings;
    next.openedHotspots[key] = entry;
    next.openedResults.push(entry);
    next.notebook.push(entry);
    next.investigationStats = incrementCategoryStats(next.investigationStats, hotspot.category);
    next.mustAccuse = remaining === 0;

    return {
      state: next,
      result: clone(entry),
      alreadyOpened: false,
      spentAction: true
    };
  }

  function selectEvidence(state, caseOrId, evidenceId, now) {
    const caseData = resolveCase(caseOrId);
    assertPlayableState(state, caseData);
    findEvidence(caseData, evidenceId);
    const next = clone(state);
    next.selectedEvidenceId = evidenceId;
    next.updatedAt = toIso(now);
    return next;
  }

  function getNotebookEntries(state, options) {
    const entries = state && Array.isArray(state.notebook) ? state.notebook : [];
    const settings = options || {};
    return clone(entries.filter(function filterNotebook(entry) {
      if (settings.category && entry.category !== settings.category) return false;
      if (settings.evidenceId && entry.evidenceId !== settings.evidenceId) return false;
      if (settings.suspect && !entry.relatedSuspects.includes(settings.suspect)) return false;
      return true;
    }));
  }

  function getOpenedCategoryCounts(state) {
    const entries = state && Array.isArray(state.notebook) ? state.notebook : [];
    return entries.reduce(function countCategories(counts, entry) {
      if (entry.category === 'critical') counts.critical += 1;
      if (entry.category === 'useful') counts.useful += 1;
      if (entry.category === 'red_herring') counts.red_herring += 1;
      if (entry.category === 'flavor') counts.flavor += 1;
      return counts;
    }, { critical: 0, useful: 0, red_herring: 0, flavor: 0 });
  }

  function resolveSuspectName(caseData, suspectValue) {
    const raw = String(suspectValue || '').trim();
    const profile = (caseData.suspectProfiles || []).find(function matchSuspect(item) {
      return item.name === raw || item.id === raw;
    });
    if (profile) return profile.name;
    if (caseData.suspects.includes(raw)) return raw;
    throw gameError('SUSPECT_NOT_FOUND', 'Unknown suspect: ' + raw);
  }

  function setDeductionEntry(state, caseOrId, suspectValue, changes, now) {
    const caseData = resolveCase(caseOrId);
    assertPlayableState(state, caseData);
    const suspect = resolveSuspectName(caseData, suspectValue);
    const patch = changes || {};
    const next = clone(state);
    const entry = next.deductionBoard.find(function matchEntry(item) {
      return item.suspect === suspect;
    });
    if (!entry) {
      throw gameError('DEDUCTION_ENTRY_NOT_FOUND', 'No deduction entry exists for ' + suspect + '.');
    }

    if (patch.status !== undefined) {
      if (!DEDUCTION_STATUSES.includes(patch.status)) {
        throw gameError('INVALID_DEDUCTION_STATUS', 'Use one of: ' + DEDUCTION_STATUSES.join(', ') + '.');
      }
      entry.status = patch.status;
    }
    if (patch.notes !== undefined) {
      entry.notes = String(patch.notes).slice(0, 4000);
    }
    if (patch.evidenceIds !== undefined) {
      if (!Array.isArray(patch.evidenceIds)) {
        throw gameError('INVALID_EVIDENCE_LINKS', 'evidenceIds must be an array.');
      }
      entry.evidenceIds = Array.from(new Set(patch.evidenceIds.map(String))).filter(function validEvidence(id) {
        return caseData.evidence.some(function matchEvidence(item) { return item.id === id; });
      });
    }
    next.updatedAt = toIso(now);
    return next;
  }

  function toggleDeductionEvidence(state, caseOrId, suspectValue, evidenceId, now) {
    const caseData = resolveCase(caseOrId);
    findEvidence(caseData, evidenceId);
    const suspect = resolveSuspectName(caseData, suspectValue);
    const current = state.deductionBoard.find(function matchEntry(entry) {
      return entry.suspect === suspect;
    });
    if (!current) {
      throw gameError('DEDUCTION_ENTRY_NOT_FOUND', 'No deduction entry exists for ' + suspect + '.');
    }
    const evidenceIds = current.evidenceIds.includes(evidenceId)
      ? current.evidenceIds.filter(function removeId(id) { return id !== evidenceId; })
      : current.evidenceIds.concat(evidenceId);
    return setDeductionEntry(state, caseData, suspect, { evidenceIds }, now);
  }

  function buildAccusationOptions(caseOrId) {
    const caseData = resolveCase(caseOrId);
    return {
      killers: caseData.suspects.map(function suspectOption(name) {
        return { value: name, label: name };
      }),
      methods: clone(caseData.methods),
      locations: caseData.locations.map(function locationOption(name) {
        return { value: name, label: name };
      }),
      motives: clone(caseData.motives)
    };
  }

  function normaliseText(value) {
    return String(value === undefined || value === null ? '' : value)
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
  }

  function canonicalAnswer(caseData, dimension, value) {
    const raw = String(value === undefined || value === null ? '' : value).trim();
    if (dimension === 'killer') {
      const profile = (caseData.suspectProfiles || []).find(function matchProfile(item) {
        return normaliseText(item.id) === normaliseText(raw) || normaliseText(item.name) === normaliseText(raw);
      });
      return profile ? profile.name : raw;
    }
    if (dimension === 'location') {
      const location = (caseData.locationDetails || []).find(function matchLocation(item) {
        return normaliseText(item.id) === normaliseText(raw) || normaliseText(item.name) === normaliseText(raw);
      });
      return location ? location.name : raw;
    }
    const source = dimension === 'method' ? caseData.methods : caseData.motives;
    const option = (source || []).find(function matchOption(item) {
      return normaliseText(item.value) === normaliseText(raw) || normaliseText(item.label) === normaliseText(raw);
    });
    return option ? option.value : raw;
  }

  function answerLabel(caseData, dimension, canonicalValue) {
    if (dimension === 'killer' || dimension === 'location') return canonicalValue;
    const source = dimension === 'method' ? caseData.methods : caseData.motives;
    const option = (source || []).find(function matchOption(item) {
      return item.value === canonicalValue;
    });
    return option ? option.label : canonicalValue;
  }

  function nonNegativeInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.floor(number));
  }

  function getRank(score) {
    const numericScore = Number(score) || 0;
    return RANKS.find(function matchRank(rank) {
      return numericScore >= rank.minimum;
    }).name;
  }

  function scoreAccusation(caseOrId, accusation, stateOrContext) {
    const caseData = resolveCase(caseOrId);
    const submitted = accusation || {};
    const context = stateOrContext || {};
    const scoring = caseData.scoring || {};
    const answerPoints = Object.assign({ killer: 40, method: 20, location: 20, motive: 20 }, scoring.answerPoints || {});
    const dimensions = ['killer', 'method', 'location', 'motive'];
    const answers = {};
    const breakdown = {};
    let baseScore = 0;
    let correctAnswers = 0;

    dimensions.forEach(function scoreDimension(dimension) {
      const submittedValue = canonicalAnswer(caseData, dimension, submitted[dimension]);
      const expectedValue = canonicalAnswer(caseData, dimension, caseData.solution[dimension]);
      const correct = normaliseText(submittedValue) === normaliseText(expectedValue);
      const points = correct ? nonNegativeInteger(answerPoints[dimension]) : 0;
      baseScore += points;
      if (correct) correctAnswers += 1;
      breakdown[dimension] = points;
      answers[dimension] = {
        submitted: submittedValue,
        submittedLabel: answerLabel(caseData, dimension, submittedValue),
        expected: expectedValue,
        expectedLabel: answerLabel(caseData, dimension, expectedValue),
        correct,
        points
      };
    });

    const remainingActions = nonNegativeInteger(
      context.actionsLeft !== undefined ? context.actionsLeft : context.remainingActions
    );
    const actionBonus = Math.min(nonNegativeInteger(scoring.actionBonusMax === undefined ? 10 : scoring.actionBonusMax), remainingActions);
    const categoryCounts = context.notebook || context.openedResults
      ? getOpenedCategoryCounts({ notebook: context.notebook || context.openedResults })
      : {
          critical: nonNegativeInteger(context.criticalClues),
          useful: nonNegativeInteger(context.usefulClues),
          red_herring: nonNegativeInteger(context.redHerrings),
          flavor: nonNegativeInteger(context.flavorFinds)
        };
    const criticalRule = Object.assign({ perClue: 0, max: 0 }, scoring.criticalClueBonus || {});
    const redRule = Object.assign({ perClue: 0, max: 0 }, scoring.redHerringPenalty || {});
    const criticalClueBonus = Math.min(
      nonNegativeInteger(criticalRule.max),
      nonNegativeInteger(criticalRule.perClue) * categoryCounts.critical
    );
    const redHerringPenalty = Math.min(
      nonNegativeInteger(redRule.max),
      nonNegativeInteger(redRule.perClue) * categoryCounts.red_herring
    );
    const total = Math.max(0, baseScore + actionBonus + criticalClueBonus - redHerringPenalty);

    breakdown.baseScore = baseScore;
    breakdown.actionBonus = actionBonus;
    breakdown.criticalClueBonus = criticalClueBonus;
    breakdown.redHerringPenalty = -redHerringPenalty;
    breakdown.total = total;

    return {
      caseId: caseData.id,
      accusation: {
        killer: answers.killer.submitted,
        method: answers.method.submitted,
        location: answers.location.submitted,
        motive: answers.motive.submitted
      },
      answers,
      correctSolution: clone(caseData.solution),
      correctSolutionLabels: clone(caseData.solutionLabels || caseData.solution),
      correctAnswers,
      isSolved: correctAnswers === dimensions.length,
      baseScore,
      actionBonus,
      criticalClueBonus,
      redHerringPenalty,
      score: total,
      rank: getRank(total),
      breakdown,
      solutionExplanation: caseData.solutionExplanation || ''
    };
  }

  function validateAccusation(caseOrId, accusation) {
    const caseData = resolveCase(caseOrId);
    const missing = ['killer', 'method', 'location', 'motive'].filter(function missingDimension(dimension) {
      return !String(accusation && accusation[dimension] || '').trim();
    });
    if (missing.length) {
      throw gameError('INCOMPLETE_ACCUSATION', 'Choose: ' + missing.join(', ') + '.');
    }
    return {
      killer: canonicalAnswer(caseData, 'killer', accusation.killer),
      method: canonicalAnswer(caseData, 'method', accusation.method),
      location: canonicalAnswer(caseData, 'location', accusation.location),
      motive: canonicalAnswer(caseData, 'motive', accusation.motive)
    };
  }

  function finalizeCase(state, caseOrId, accusation, now) {
    const caseData = resolveCase(caseOrId);
    assertPlayableState(state, caseData);
    const canonicalAccusation = validateAccusation(caseData, accusation);
    const submittedAt = toIso(now);
    const result = scoreAccusation(caseData, canonicalAccusation, state);
    result.submittedAt = submittedAt;
    const next = clone(state);
    next.status = 'completed';
    next.updatedAt = submittedAt;
    next.completedAt = submittedAt;
    next.mustAccuse = false;
    next.finalAccusation = clone(canonicalAccusation);
    next.finalResult = clone(result);
    const historyEntry = {
      id: caseData.id + ':' + submittedAt,
      caseId: caseData.id,
      caseTitle: caseData.title,
      victim: caseData.victim,
      startedAt: state.startedAt,
      submittedAt,
      actionsUsed: Math.max(0, Number(state.maxActions) - Number(state.actionsLeft)),
      actionsLeft: nonNegativeInteger(state.actionsLeft),
      score: result.score,
      rank: result.rank,
      isSolved: result.isSolved,
      correctAnswers: result.correctAnswers,
      accusation: clone(result.accusation),
      breakdown: clone(result.breakdown)
    };
    return { state: next, result, historyEntry };
  }

  function normalizePlayerName(name) {
    return String(name === undefined || name === null ? '' : name)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 48);
  }

  function profileIdFromName(name) {
    const normalized = normalizePlayerName(name);
    if (!normalized) {
      throw gameError('PLAYER_NAME_REQUIRED', 'Enter a detective name.');
    }
    return 'profile:' + encodeURIComponent(normalized.toLocaleLowerCase());
  }

  function emptyStats() {
    return {
      casesPlayed: 0,
      casesSolved: 0,
      perfectResults: 0,
      bestScore: 0,
      totalScore: 0,
      averageScore: 0,
      totalActionsSpent: 0
    };
  }

  function createProfile(name, now) {
    const displayName = normalizePlayerName(name);
    if (!displayName) {
      throw gameError('PLAYER_NAME_REQUIRED', 'Enter a detective name.');
    }
    const timestamp = toIso(now);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: profileIdFromName(displayName),
      name: displayName,
      createdAt: timestamp,
      lastPlayedAt: timestamp,
      activeCaseId: null,
      caseSaves: {},
      caseHistory: [],
      history: [],
      stats: emptyStats()
    };
  }

  function makeEmptyProfileStore() {
    return {
      schemaVersion: SCHEMA_VERSION,
      activeProfileId: null,
      profiles: {}
    };
  }

  function resolveStorage(storage) {
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') {
      return storage;
    }
    if (root && root.localStorage && typeof root.localStorage.getItem === 'function') {
      return root.localStorage;
    }
    return null;
  }

  function readProfileStore(storage) {
    const target = resolveStorage(storage);
    if (!target) return makeEmptyProfileStore();
    try {
      const raw = target.getItem(STORAGE_KEY);
      if (!raw) return makeEmptyProfileStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.profiles || typeof parsed.profiles !== 'object') {
        return makeEmptyProfileStore();
      }
      return Object.assign(makeEmptyProfileStore(), parsed, { profiles: parsed.profiles });
    } catch (error) {
      return makeEmptyProfileStore();
    }
  }

  function writeProfileStore(store, storage) {
    const target = resolveStorage(storage);
    if (!target) {
      throw gameError('STORAGE_UNAVAILABLE', 'localStorage is unavailable in this environment.');
    }
    const cleanStore = Object.assign(makeEmptyProfileStore(), clone(store));
    target.setItem(STORAGE_KEY, JSON.stringify(cleanStore));
    return cleanStore;
  }

  function listProfiles(storage) {
    const store = readProfileStore(storage);
    return Object.keys(store.profiles)
      .map(function mapProfile(id) { return clone(store.profiles[id]); })
      .sort(function newestFirst(a, b) {
        return String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || ''));
      });
  }

  function loadOrCreateProfile(name, storage, now) {
    const displayName = normalizePlayerName(name);
    const profileId = profileIdFromName(displayName);
    const store = readProfileStore(storage);
    const existing = store.profiles[profileId];
    const created = !existing;
    const profile = existing ? clone(existing) : createProfile(displayName, now);
    profile.lastPlayedAt = toIso(now);
    store.profiles[profileId] = profile;
    store.activeProfileId = profileId;
    writeProfileStore(store, storage);
    return { profile: clone(profile), created, store: clone(store) };
  }

  function saveProfile(profile, storage, options) {
    if (!profile || !profile.id || !profile.name) {
      throw gameError('INVALID_PROFILE', 'A valid profile is required.');
    }
    const store = readProfileStore(storage);
    const saved = clone(profile);
    saved.lastPlayedAt = toIso(options && options.now);
    store.profiles[saved.id] = saved;
    if (!options || options.setActive !== false) store.activeProfileId = saved.id;
    writeProfileStore(store, storage);
    return clone(saved);
  }

  function selectProfile(profileIdOrName, storage, now) {
    const store = readProfileStore(storage);
    const directId = String(profileIdOrName || '');
    const derivedId = directId.startsWith('profile:') ? directId : profileIdFromName(directId);
    if (!store.profiles[derivedId]) {
      throw gameError('PROFILE_NOT_FOUND', 'Unknown player profile.');
    }
    store.activeProfileId = derivedId;
    store.profiles[derivedId].lastPlayedAt = toIso(now);
    writeProfileStore(store, storage);
    return clone(store.profiles[derivedId]);
  }

  function getActiveProfile(storage) {
    const store = readProfileStore(storage);
    if (!store.activeProfileId || !store.profiles[store.activeProfileId]) return null;
    return clone(store.profiles[store.activeProfileId]);
  }

  function calculateProfileStats(history) {
    const entries = Array.isArray(history) ? history : [];
    const totalScore = entries.reduce(function sumScore(total, item) {
      return total + nonNegativeInteger(item.score);
    }, 0);
    return {
      casesPlayed: entries.length,
      casesSolved: entries.filter(function solved(item) { return Boolean(item.isSolved); }).length,
      perfectResults: entries.filter(function perfect(item) { return item.rank === 'Perfect'; }).length,
      bestScore: entries.reduce(function bestScore(best, item) { return Math.max(best, nonNegativeInteger(item.score)); }, 0),
      totalScore,
      averageScore: entries.length ? Math.round((totalScore / entries.length) * 10) / 10 : 0,
      totalActionsSpent: entries.reduce(function sumActions(total, item) {
        return total + nonNegativeInteger(item.actionsUsed);
      }, 0)
    };
  }

  function startCase(profile, caseOrId, options) {
    if (!profile || !profile.id) throw gameError('INVALID_PROFILE', 'A valid profile is required.');
    const caseData = resolveCase(caseOrId);
    const settings = options || {};
    const next = clone(profile);
    const existing = next.caseSaves && next.caseSaves[caseData.id];
    if (!next.caseSaves) next.caseSaves = {};
    if (existing && existing.status === 'in_progress' && !settings.restart) {
      next.activeCaseId = caseData.id;
      next.lastPlayedAt = toIso(settings.now);
      return next;
    }
    next.caseSaves[caseData.id] = createInitialCaseState(caseData, settings.now);
    next.activeCaseId = caseData.id;
    next.lastPlayedAt = toIso(settings.now);
    return next;
  }

  function saveCaseState(profile, state, now) {
    if (!profile || !profile.id) throw gameError('INVALID_PROFILE', 'A valid profile is required.');
    if (!state || !state.caseId) throw gameError('INVALID_STATE', 'A case state is required.');
    const next = clone(profile);
    if (!next.caseSaves) next.caseSaves = {};
    next.caseSaves[state.caseId] = clone(state);
    next.activeCaseId = state.caseId;
    next.lastPlayedAt = toIso(now);
    return next;
  }

  function recordCaseResult(profile, completedState, historyEntry, now) {
    let next = saveCaseState(profile, completedState, now);
    const history = Array.isArray(next.caseHistory)
      ? next.caseHistory.slice()
      : (Array.isArray(next.history) ? next.history.slice() : []);
    if (!history.some(function duplicate(item) { return item.id === historyEntry.id; })) {
      history.unshift(clone(historyEntry));
    }
    next.caseHistory = history;
    next.history = clone(history);
    next.stats = calculateProfileStats(history);
    return next;
  }

  function finalizeCaseForProfile(profile, state, caseOrId, accusation, now) {
    const completed = finalizeCase(state, caseOrId, accusation, now);
    const nextProfile = recordCaseResult(profile, completed.state, completed.historyEntry, now);
    return {
      profile: nextProfile,
      state: completed.state,
      result: completed.result,
      historyEntry: completed.historyEntry
    };
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    DEDUCTION_STATUSES,
    RANKS,
    createInitialCaseState,
    createCaseState: createInitialCaseState,
    inspectHotspot,
    selectEvidence,
    isHotspotOpened,
    canInspectHotspot,
    getNotebookEntries,
    getOpenedCategoryCounts,
    setDeductionEntry,
    updateDeduction: setDeductionEntry,
    updateDeductionBoard: setDeductionEntry,
    toggleDeductionEvidence,
    buildAccusationOptions,
    getAccusationOptions: buildAccusationOptions,
    validateAccusation,
    scoreAccusation,
    calculateScore: scoreAccusation,
    getRank,
    finalizeCase,
    submitAccusation: finalizeCase,
    normalizePlayerName,
    profileIdFromName,
    createProfile,
    makeEmptyProfileStore,
    readProfileStore,
    writeProfileStore,
    listProfiles,
    loadOrCreateProfile,
    saveProfile,
    selectProfile,
    getActiveProfile,
    calculateProfileStats,
    startCase,
    restartCase: function restartCase(profile, caseOrId, options) {
      return startCase(profile, caseOrId, Object.assign({}, options || {}, { restart: true }));
    },
    saveCaseState,
    recordCaseResult,
    finalizeCaseForProfile,
    completeCaseForProfile: finalizeCaseForProfile
  });
});
