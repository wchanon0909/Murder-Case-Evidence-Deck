'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

function publicPath(...parts) {
  return path.join(__dirname, '..', 'public', ...parts);
}

function checkFirstCaseContent() {
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
}

function checkSecondCaseContent() {
  const caseData = Cases.getCaseById('the-cold-room-hour');
  assert.ok(caseData, 'The second case must be available by id.');
  assert.equal(caseData.title, 'คดีชั่วโมงในห้องเย็น');
  assert.equal(caseData.victim, 'ดร.ปัณณธร วรานนท์');
  assert.equal(caseData.suspects.length, 6, 'Case 002 raises the suspect count to six.');
  assert.equal(caseData.evidence.length, 10, 'Case 002 ships ten evidence cards.');
  assert.equal(caseData.maxActions, 11);
  assert.equal(caseData.methods.length, 6);
  assert.equal(caseData.motives.length, 6);
  assert.equal(caseData.locations.length, 6);
  assert.deepEqual(caseData.solution, {
    killer: 'แพรวา',
    method: 'sedative overdose',
    location: 'ห้องแล็บวิเคราะห์',
    motive: 'covering up fabricated trial data'
  });

  // The staged explanation must remain a selectable wrong answer, otherwise the
  // twist collapses into a single obvious choice.
  assert.ok(
    caseData.methods.some((item) => item.value === 'hypothermia in the cold room'),
    'The staged cause of death must stay on the method list as a decoy.'
  );
  assert.ok(
    caseData.locations.includes('ห้องเย็นเก็บตัวอย่าง'),
    'The room the body was found in must stay selectable as a decoy location.'
  );
  assert.notEqual(caseData.solution.location, 'ห้องเย็นเก็บตัวอย่าง');

  const hotspots = caseData.evidence.flatMap((card) => card.hotspots);
  assert.equal(hotspots.length, 40, 'Case 002 has 40 inspectable hotspots.');
  const locked = hotspots.filter((hotspot) => Array.isArray(hotspot.requires) && hotspot.requires.length);
  assert.equal(locked.length, 3, 'Case 002 gates three leads behind prerequisites.');
  locked.forEach((hotspot) => {
    assert.ok(hotspot.lockedHint, `${hotspot.id} needs a lockedHint so the lock is actionable.`);
  });
}

function checkCaseStructure() {
  const validCategories = new Set(['critical', 'useful', 'red_herring', 'flavor']);
  assert.ok(Cases.CASES.length >= 2, 'The deck ships more than one case.');

  const caseIds = new Set();
  Cases.CASES.forEach((caseData) => {
    assert.ok(!caseIds.has(caseData.id), `Duplicate case id: ${caseData.id}`);
    caseIds.add(caseData.id);
    assert.ok(caseData.code, `${caseData.title} needs a case code.`);
    assert.ok(caseData.maxActions > 0 && caseData.maxActions < 32, `${caseData.title}: actions must be limited.`);
    assert.ok(caseData.suspectLineup, `${caseData.title} needs a suspect lineup image.`);
    assert.ok(
      fs.existsSync(publicPath(caseData.suspectLineup)),
      `Missing suspect lineup for ${caseData.title}: ${caseData.suspectLineup}`
    );

    // Every accusation option the player can pick must resolve, and the answer
    // key must be one of those options.
    assert.ok(caseData.suspects.includes(caseData.solution.killer), `${caseData.title}: killer is not a listed suspect.`);
    assert.ok(caseData.locations.includes(caseData.solution.location), `${caseData.title}: location is not a listed location.`);
    assert.ok(caseData.methods.some((item) => item.value === caseData.solution.method), `${caseData.title}: method is not a listed option.`);
    assert.ok(caseData.motives.some((item) => item.value === caseData.solution.motive), `${caseData.title}: motive is not a listed option.`);
    assert.equal(caseData.suspectProfiles.length, caseData.suspects.length, `${caseData.title}: every suspect needs a profile.`);

    const layout = caseData.boardLayout;
    assert.ok(layout && layout.width && layout.height && layout.victim, `${caseData.title} needs a board layout.`);
    caseData.suspectProfiles.forEach((suspect) => {
      assert.ok(caseData.suspects.includes(suspect.name), `${caseData.title}: profile ${suspect.id} is not in the suspect list.`);
      assert.ok(layout.suspects[suspect.id], `${caseData.title}: board layout is missing ${suspect.id}.`);
    });

    const evidenceIds = new Set();
    const hotspotKeys = new Set();
    caseData.evidence.forEach((card) => {
      assert.ok(!evidenceIds.has(card.id), `Duplicate evidence id: ${card.id}`);
      evidenceIds.add(card.id);
      assert.ok(layout.evidence[card.id], `${caseData.title}: board layout is missing ${card.id}.`);
      assert.match(
        card.image || '',
        /^\/assets\/evidence\/[a-z0-9-]+(\/[a-z0-9-]+)?\.(jpg|svg)$/,
        `${card.title} needs a local evidence image.`
      );
      assert.ok(fs.existsSync(publicPath(card.image)), `Missing image file for ${card.title}: ${card.image}`);
      assert.ok(card.hotspots.length >= 3 && card.hotspots.length <= 4, `${card.title} needs 3–4 hotspots.`);

      const categoriesOnCard = new Set();
      card.hotspots.forEach((hotspot) => {
        const compositeId = `${card.id}:${hotspot.id}`;
        assert.ok(!hotspotKeys.has(compositeId), `Duplicate hotspot id: ${compositeId}`);
        hotspotKeys.add(compositeId);
        assert.ok(validCategories.has(hotspot.category), `Invalid category on ${compositeId}.`);
        assert.ok(hotspot.result && hotspot.notebook, `${compositeId} needs reveal and notebook text.`);
        assert.ok(hotspot.position, `${compositeId} needs an image hotspot position.`);
        assert.ok(Number.isFinite(hotspot.position.x) && hotspot.position.x >= 0 && hotspot.position.x <= 100, `${compositeId} x must be 0–100.`);
        assert.ok(Number.isFinite(hotspot.position.y) && hotspot.position.y >= 0 && hotspot.position.y <= 100, `${compositeId} y must be 0–100.`);
        categoriesOnCard.add(hotspot.category);
      });
      assert.ok(categoriesOnCard.has('critical'), `${card.title} needs a critical choice.`);
      assert.ok(categoriesOnCard.has('red_herring'), `${card.title} needs a red herring.`);
    });

    checkPrerequisites(caseData, hotspotKeys);
  });
}

// Locked hotspots must point at clues that exist, must not depend on themselves
// or on each other in a cycle, and the whole chain has to be openable inside the
// case's action budget — otherwise the case is unwinnable.
function checkPrerequisites(caseData, hotspotKeys) {
  const depthCache = new Map();

  function depthOf(key, seen) {
    if (depthCache.has(key)) return depthCache.get(key);
    assert.ok(!seen.has(key), `${caseData.title}: circular hotspot requirement at ${key}.`);
    seen.add(key);
    const parsed = Cases.parseHotspotKey(key);
    const requires = Cases.getHotspotRequirements(caseData, parsed.evidenceId, parsed.hotspotId);
    const depth = requires.length
      ? 1 + Math.max(...requires.map((requirement) => depthOf(requirement, seen)))
      : 1;
    seen.delete(key);
    depthCache.set(key, depth);
    return depth;
  }

  let deepest = 0;
  hotspotKeys.forEach((key) => {
    const parsed = Cases.parseHotspotKey(key);
    Cases.getHotspotRequirements(caseData, parsed.evidenceId, parsed.hotspotId).forEach((requirement) => {
      assert.ok(hotspotKeys.has(requirement), `${caseData.title}: ${key} requires unknown hotspot ${requirement}.`);
      assert.notEqual(requirement, key, `${caseData.title}: ${key} cannot require itself.`);
    });
    deepest = Math.max(deepest, depthOf(key, new Set()));
  });
  assert.ok(deepest <= caseData.maxActions, `${caseData.title}: a requirement chain is longer than the action budget.`);

  // Opening every gated critical clue plus its prerequisites must still leave
  // room to spare, so a careful player is never mathematically locked out.
  const gatedCriticalCost = caseData.evidence
    .flatMap((card) => card.hotspots.map((hotspot) => ({ card, hotspot })))
    .filter((item) => item.hotspot.category === 'critical' && Array.isArray(item.hotspot.requires) && item.hotspot.requires.length)
    .reduce((total, item) => total + depthOf(`${item.card.id}:${item.hotspot.id}`, new Set()), 0);
  assert.ok(
    gatedCriticalCost < caseData.maxActions,
    `${caseData.title}: unlocking every gated critical clue would consume the whole budget.`
  );
}

function checkLockedHotspotRule() {
  const caseData = Cases.getCaseById('the-cold-room-hour');
  const fixedTime = '2026-08-17T10:00:00.000Z';
  let state = Game.createInitialCaseState(caseData.id, fixedTime);

  assert.equal(Game.isHotspotUnlocked(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal'), false);
  assert.equal(Game.canInspectHotspot(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal'), false);
  assert.equal(Game.canInspectHotspot(state, caseData.id, 'toxicology', 'tox-sedative-class'), true);

  const missing = Game.getMissingRequirements(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].evidenceTitle, 'ผลตรวจพิษวิทยา');

  const blocked = () => Game.inspectHotspot(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal', fixedTime);
  assert.throws(blocked, (error) => error && error.code === 'HOTSPOT_LOCKED');
  assert.equal(state.actionsLeft, caseData.maxActions, 'A blocked inspection must not spend an action.');

  state = Game.inspectHotspot(state, caseData.id, 'toxicology', 'tox-sedative-class', fixedTime).state;
  assert.equal(state.actionsLeft, caseData.maxActions - 1);
  assert.equal(Game.isHotspotUnlocked(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal'), true);

  const unlocked = Game.inspectHotspot(state, caseData.id, 'drug-cabinet-log', 'drug-praewa-withdrawal', fixedTime);
  assert.equal(unlocked.spentAction, true);
  assert.equal(unlocked.state.actionsLeft, caseData.maxActions - 2);
  assert.equal(unlocked.result.category, 'critical');
}

function checkAssetIntegrity() {
  assert.ok(
    fs.existsSync(publicPath('assets', 'suspects', 'suspect-lineup.jpg')),
    'The deduction board suspect lineup image is missing.'
  );
  // Every generated SVG plate has to parse as XML, otherwise it silently renders
  // as a broken image in the browser.
  const svgDirectory = publicPath('assets', 'evidence', 'cold-room');
  const svgFiles = fs.readdirSync(svgDirectory).filter((name) => name.endsWith('.svg'));
  assert.equal(svgFiles.length, 10, 'Case 002 needs one SVG plate per evidence card.');
  svgFiles.concat(['../../suspects/cold-room-lineup.svg']).forEach((name) => {
    const markup = fs.readFileSync(path.join(svgDirectory, name), 'utf8');
    assert.match(markup, /^<svg[\s>]/m, `${name} must start with an <svg> root element.`);
    assert.ok(markup.trimEnd().endsWith('</svg>'), `${name} must close its <svg> element.`);
    assert.doesNotMatch(markup, /fill="#[0-9a-fA-F]* [0-9a-fA-F]*"/, `${name} has a malformed colour value.`);
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
  checkFirstCaseContent();
  checkSecondCaseContent();
  checkCaseStructure();
  checkAssetIntegrity();
  checkInvestigationRules();
  checkLockedHotspotRule();
  checkScoringRules();
  checkProfileIsolation();
  console.log('✓ case content for both case files');
  console.log('✓ shared case structure, board layouts and accusation options');
  console.log('✓ evidence artwork and suspect lineups on disk');
  console.log('✓ limited actions and repeat-inspection behavior');
  console.log('✓ locked hotspots, prerequisite chains and solvability');
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
