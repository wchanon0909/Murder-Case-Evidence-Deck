'use strict';

const assert = require('node:assert/strict');
const Cases = require('../src/cases');
const Game = require('../src/gameLogic');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function checkCaseContent() {
  const caseData = Cases.getCaseById('the-night-of-the-will');
  assert.ok(caseData, 'The first case must be available by id.');
  assert.equal(caseData.title, 'คดีคืนเปิดพินัยกรรม');
  assert.equal(caseData.victim, 'วิชาญ ธนากุล');
  assert.deepEqual(caseData.suspects, ['ภาคิน', 'มินตรา', 'อารักษ์', 'ป้านวล', 'ศศิน']);
  assert.deepEqual(caseData.locations, ['ห้องทำงาน', 'ห้องรับแขก', 'ห้องครัว', 'สวนหลังบ้าน', 'ห้องเก็บเอกสาร']);
  assert.deepEqual(caseData.solution, {
    killer: 'อารักษ์',
    method: 'poisoned wine',
    location: 'ห้องทำงาน',
    motive: 'hidden debt and loss of benefit from the new will'
  });
  assert.ok(caseData.maxActions > 0 && caseData.maxActions < 32, 'Actions must be limited.');

  const requiredEvidence = [
    'แก้วไวน์แตก',
    'แฟ้มพินัยกรรม',
    'กล้องวงจรปิด',
    'ถาดไวน์',
    'คำให้การของป้านวล',
    'ห้องทำงาน',
    'ห้องครัว',
    'รายงานนิติเวช'
  ];
  assert.deepEqual(caseData.evidence.map((item) => item.title), requiredEvidence);

  const validCategories = new Set(['critical', 'useful', 'red_herring', 'flavor']);
  const evidenceIds = new Set();
  const hotspotIds = new Set();
  caseData.evidence.forEach((card) => {
    assert.ok(!evidenceIds.has(card.id), `Duplicate evidence id: ${card.id}`);
    evidenceIds.add(card.id);
    assert.ok(card.hotspots.length >= 3 && card.hotspots.length <= 4, `${card.title} needs 3–4 hotspots.`);
    const categoriesOnCard = new Set();
    card.hotspots.forEach((hotspot) => {
      const compositeId = `${card.id}:${hotspot.id}`;
      assert.ok(!hotspotIds.has(compositeId), `Duplicate hotspot id: ${compositeId}`);
      hotspotIds.add(compositeId);
      assert.ok(validCategories.has(hotspot.category), `Invalid category on ${compositeId}.`);
      assert.ok(hotspot.result && hotspot.notebook, `${compositeId} needs reveal and notebook text.`);
      categoriesOnCard.add(hotspot.category);
    });
    assert.ok(categoriesOnCard.has('critical'), `${card.title} needs a critical choice.`);
    assert.ok(categoriesOnCard.has('red_herring'), `${card.title} needs a red herring.`);
  });
}

function checkInvestigationRules() {
  const caseData = Cases.FIRST_CASE;
  const fixedTime = '2026-08-17T10:00:00.000Z';
  let state = Game.createInitialCaseState(caseData.id, fixedTime);
  assert.equal(state.actionsLeft, caseData.maxActions);
  assert.equal(state.deductionBoard.length, caseData.suspects.length);

  const firstCard = caseData.evidence[0];
  const firstHotspot = firstCard.hotspots[0];
  const firstInspection = Game.inspectHotspot(state, caseData.id, firstCard.id, firstHotspot.id, fixedTime);
  assert.equal(firstInspection.spentAction, true);
  assert.equal(firstInspection.alreadyOpened, false);
  assert.equal(firstInspection.state.actionsLeft, caseData.maxActions - 1);
  assert.equal(firstInspection.result.category, firstHotspot.category);
  assert.equal(firstInspection.state.notebook.length, 1);

  const repeated = Game.inspectHotspot(firstInspection.state, caseData.id, firstCard.id, firstHotspot.id, fixedTime);
  assert.equal(repeated.spentAction, false, 'Reopening a result must be free.');
  assert.equal(repeated.alreadyOpened, true);
  assert.equal(repeated.state.actionsLeft, caseData.maxActions - 1);

  state = repeated.state;
  const unopened = caseData.evidence.flatMap((card) => card.hotspots.map((hotspot) => ({
    evidenceId: card.id,
    hotspotId: hotspot.id
  }))).filter((item) => !Game.isHotspotOpened(state, item.evidenceId, item.hotspotId));
  for (let index = 0; state.actionsLeft > 0; index += 1) {
    state = Game.inspectHotspot(state, caseData.id, unopened[index].evidenceId, unopened[index].hotspotId, fixedTime).state;
  }
  assert.equal(state.actionsLeft, 0);
  assert.equal(state.mustAccuse, true);
  assert.throws(
    () => Game.inspectHotspot(state, caseData.id, unopened[caseData.maxActions].evidenceId, unopened[caseData.maxActions].hotspotId, fixedTime),
    (error) => error && error.code === 'NO_ACTIONS_LEFT'
  );

  const updated = Game.setDeductionEntry(
    firstInspection.state,
    caseData.id,
    'อารักษ์',
    { status: 'prime', notes: 'มีแรงจูงใจและโอกาส', evidenceIds: ['will-folder'] },
    fixedTime
  );
  const arak = updated.deductionBoard.find((entry) => entry.suspect === 'อารักษ์');
  assert.equal(arak.status, 'prime');
  assert.equal(arak.notes, 'มีแรงจูงใจและโอกาส');
  assert.deepEqual(arak.evidenceIds, ['will-folder']);
}

function checkScoringRules() {
  const caseData = Cases.FIRST_CASE;
  const pristine = Game.createInitialCaseState(caseData.id, '2026-08-17T10:00:00.000Z');
  const correct = Game.scoreAccusation(caseData.id, caseData.solution, pristine);
  assert.equal(correct.baseScore, 100);
  assert.equal(correct.breakdown.killer, 40);
  assert.equal(correct.breakdown.method, 20);
  assert.equal(correct.breakdown.location, 20);
  assert.equal(correct.breakdown.motive, 20);
  assert.equal(correct.actionBonus, 10, 'Remaining action bonus must be capped at 10.');
  assert.equal(correct.rank, 'Perfect');
  assert.equal(correct.isSolved, true);

  const labelBased = Game.scoreAccusation(caseData.id, {
    killer: 'arak',
    method: 'ไวน์ผสมยาพิษ',
    location: 'study',
    motive: 'หนี้ลับและการเสียผลประโยชน์จากพินัยกรรมฉบับใหม่'
  }, { actionsLeft: 0 });
  assert.equal(labelBased.baseScore, 100, 'Ids and Thai labels should normalize to canonical answers.');

  const failed = Game.scoreAccusation(caseData.id, {
    killer: 'ภาคิน',
    method: 'strangulation',
    location: 'สวนหลังบ้าน',
    motive: 'revenge over betrayal'
  }, { actionsLeft: 0 });
  assert.equal(failed.score, 0);
  assert.equal(failed.rank, 'Failed');

  assert.equal(Game.getRank(95), 'Perfect');
  assert.equal(Game.getRank(75), 'Solved');
  assert.equal(Game.getRank(45), 'Partial');
  assert.equal(Game.getRank(44), 'Failed');

  const completed = Game.finalizeCase(pristine, caseData.id, caseData.solution, '2026-08-17T10:10:00.000Z');
  assert.equal(completed.state.status, 'completed');
  assert.equal(completed.result.isSolved, true);
  assert.equal(completed.historyEntry.caseTitle, caseData.title);
}

function checkProfileIsolation() {
  const storage = createMemoryStorage();
  const fixedTime = '2026-08-17T10:00:00.000Z';
  const first = Game.loadOrCreateProfile('นักสืบหนึ่ง', storage, fixedTime);
  const second = Game.loadOrCreateProfile('นักสืบสอง', storage, fixedTime);
  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.notEqual(first.profile.id, second.profile.id);
  assert.equal(Game.listProfiles(storage).length, 2);

  let firstProfile = Game.startCase(first.profile, Cases.FIRST_CASE.id, { now: fixedTime });
  let firstState = firstProfile.caseSaves[Cases.FIRST_CASE.id];
  firstState = Game.inspectHotspot(
    firstState,
    Cases.FIRST_CASE.id,
    Cases.FIRST_CASE.evidence[0].id,
    Cases.FIRST_CASE.evidence[0].hotspots[0].id,
    fixedTime
  ).state;
  firstProfile = Game.saveCaseState(firstProfile, firstState, fixedTime);
  Game.saveProfile(firstProfile, storage, { now: fixedTime });

  const selectedSecond = Game.selectProfile(second.profile.id, storage, fixedTime);
  assert.deepEqual(selectedSecond.caseSaves, {}, 'A new profile must not inherit another player’s save.');
  const reloadedFirst = Game.selectProfile(first.profile.id, storage, fixedTime);
  assert.equal(reloadedFirst.caseSaves[Cases.FIRST_CASE.id].notebook.length, 1);

  const completed = Game.finalizeCaseForProfile(
    reloadedFirst,
    reloadedFirst.caseSaves[Cases.FIRST_CASE.id],
    Cases.FIRST_CASE.id,
    Cases.FIRST_CASE.solution,
    '2026-08-17T10:10:00.000Z'
  );
  assert.equal(completed.profile.caseHistory.length, 1);
  assert.equal(completed.profile.stats.casesPlayed, 1);
  assert.equal(completed.profile.stats.casesSolved, 1);
}

function run() {
  checkCaseContent();
  checkInvestigationRules();
  checkScoringRules();
  checkProfileIsolation();
  console.log('✓ case content and hotspot categories');
  console.log('✓ limited actions and repeat-inspection behavior');
  console.log('✓ accusation scoring and rank thresholds');
  console.log('✓ isolated localStorage profile saves and history');
  console.log('All Murder Case: Evidence Deck rule checks passed.');
}

try {
  run();
} catch (error) {
  console.error('Rule check failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
