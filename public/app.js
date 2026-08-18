(function murderCaseApp() {
  'use strict';

  const Cases = window.MurderCaseCases;
  const Game = window.MurderCaseGame;
  // UI saves use their own versioned key. The shared rules module also exposes
  // storage helpers for reuse, but its profile schema is intentionally separate.
  const STORAGE_KEY = 'murder-case-evidence-deck.ui-profiles.v1';
  const SESSION_PROFILE_KEY = 'murder-case-evidence-deck.active-profile';
  const SESSION_VIEW_KEY = 'murder-case-evidence-deck.active-view';
  const PROFILE_NAME_MAX = 40;

  const appRoot = document.getElementById('app-main');
  const siteHeader = document.getElementById('site-header');
  const modalRoot = document.getElementById('modal-root');
  const headerActions = document.getElementById('header-actions');
  const brandHome = document.getElementById('brand-home');
  const toastRegion = document.getElementById('toast-region');

  if (!Cases || !Cases.FIRST_CASE) {
    appRoot.innerHTML = '<div class="page-shell"><p class="error-message">ไม่สามารถเปิดข้อมูลคดีได้ กรุณาโหลดหน้าอีกครั้ง</p></div>';
    return;
  }

  const allCases = Cases.CASES;
  // caseData always points at the case currently on screen. It is re-pointed in
  // render() from the profile's active save, and by the case picker.
  let caseData = allCases[0];
  let storageError = null;
  let recoveryIssue = null;
  let store = loadStore();
  let activeProfileId = sessionStorage.getItem(SESSION_PROFILE_KEY);
  let view = sessionStorage.getItem(SESSION_VIEW_KEY) || 'home';
  let selectedResultKey = null;
  let sideTab = 'notebook';
  let modalReturnFocus = null;

  if (!activeProfileId || !store.profiles[activeProfileId]) {
    activeProfileId = null;
    view = 'home';
  } else if ((view === 'investigation' || view === 'board') && !getActiveProfile().activeCase) {
    view = 'dashboard';
  }

  function emptyStore() {
    return { version: 1, profiles: {}, updatedAt: new Date().toISOString() };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.profiles || typeof parsed.profiles !== 'object' || Array.isArray(parsed.profiles)) {
        throw new Error('invalid profile store');
      }
      parsed.version = 1;
      Object.keys(parsed.profiles).forEach(function repairProfile(profileId) {
        parsed.profiles[profileId] = repairProfileData(parsed.profiles[profileId], profileId);
      });
      return parsed;
    } catch (error) {
      let raw = null;
      let backupKey = null;
      try {
        raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const candidateBackupKey = STORAGE_KEY + '.recovery.' + Date.now();
          localStorage.setItem(candidateBackupKey, raw);
          backupKey = candidateBackupKey;
          sessionStorage.setItem(STORAGE_KEY + '.recovery', raw);
        }
      } catch (_ignored) {
        // The UI below will explain that local saving is unavailable.
      }
      recoveryIssue = {
        kind: raw ? 'corrupt' : 'unavailable',
        backupKey: backupKey,
        message: error && error.message ? error.message : 'storage unavailable'
      };
      return emptyStore();
    }
  }

  function repairProfileData(profile, profileId) {
    const now = new Date().toISOString();
    const safe = profile && typeof profile === 'object' ? profile : {};
    const history = Array.isArray(safe.history) ? safe.history : [];
    return {
      id: String(safe.id || profileId),
      name: String(safe.name || 'สายสืบ').slice(0, PROFILE_NAME_MAX),
      createdAt: safe.createdAt || now,
      updatedAt: safe.updatedAt || now,
      lastPlayedAt: safe.lastPlayedAt || safe.updatedAt || safe.createdAt || now,
      stats: calculateStats(history),
      history: history,
      activeCase: repairCaseState(safe.activeCase)
    };
  }

  function repairCaseState(caseState) {
    if (!caseState || typeof caseState !== 'object') return null;
    const savedCase = Cases.getCaseById(caseState.caseId);
    if (!savedCase) return null;
    const sourceDeductions = caseState.deductions && typeof caseState.deductions === 'object' && !Array.isArray(caseState.deductions)
      ? caseState.deductions
      : {};
    const deductions = createEmptyDeductions(savedCase);
    savedCase.suspects.forEach(function repairSuspectRecord(suspect) {
      const source = sourceDeductions[suspect];
      if (!source || typeof source !== 'object' || Array.isArray(source)) return;
      deductions[suspect] = {
        status: ['unknown', 'watch', 'prime', 'cleared'].includes(source.status) ? source.status : 'unknown',
        notes: typeof source.notes === 'string' ? source.notes.slice(0, 2000) : ''
      };
    });
    return {
      caseId: savedCase.id,
      caseVersion: savedCase.version,
      status: 'active',
      startedAt: caseState.startedAt || new Date().toISOString(),
      updatedAt: caseState.updatedAt || new Date().toISOString(),
      actionsLeft: clampNumber(caseState.actionsLeft, 0, savedCase.initialActions, savedCase.initialActions),
      opened: Array.isArray(caseState.opened)
        ? caseState.opened.filter(function keepValidEntry(entry) { return isValidOpenedEntry(savedCase, entry); })
        : [],
      deductions: deductions,
      selectedEvidenceId: Cases.getEvidenceById(savedCase, caseState.selectedEvidenceId)
        ? caseState.selectedEvidenceId
        : savedCase.evidence[0].id
    };
  }

  function isValidOpenedEntry(sourceCase, entry) {
    return Boolean(entry && Cases.getHotspotById(sourceCase, entry.evidenceId, entry.hotspotId));
  }

  function resolveCaseData(caseId) {
    return Cases.getCaseById(caseId) || allCases[0];
  }

  function caseOf(caseState) {
    return caseState ? resolveCaseData(caseState.caseId) : caseData;
  }

  // "evidenceId:hotspotId" keys for every clue the player has already opened.
  function openedKeySet(caseState) {
    const keys = new Set();
    if (!caseState || !Array.isArray(caseState.opened)) return keys;
    caseState.opened.forEach(function collectKey(entry) {
      keys.add(entry.evidenceId + ':' + entry.hotspotId);
    });
    return keys;
  }

  function missingRequirementsFor(caseState, evidenceId, hotspotId) {
    if (typeof Cases.getMissingRequirements !== 'function') return [];
    return Cases.getMissingRequirements(caseOf(caseState), evidenceId, hotspotId, openedKeySet(caseState));
  }

  function lockedHintFor(sourceCase, evidenceId, hotspotId, missing) {
    const hotspot = Cases.getHotspotById(sourceCase, evidenceId, hotspotId);
    if (hotspot && hotspot.lockedHint) return hotspot.lockedHint;
    if (!missing.length) return '';
    return 'ต้องเปิดเบาะแสจาก “' + missing[0].evidenceTitle + '” ก่อน';
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
  }

  function saveStore(options) {
    const config = options || {};
    try {
      store.updatedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      storageError = null;
      if (!config.silent) showSaveState();
      return true;
    } catch (error) {
      storageError = error;
      showToast('ไม่สามารถบันทึกข้อมูลในเบราว์เซอร์นี้ได้ โปรดเปิด localStorage ก่อนเล่นต่อ', 'error', 6000);
      renderHeader();
      return false;
    }
  }

  function showSaveState() {
    const state = document.querySelector('.header-save-state');
    if (!state) return;
    state.innerHTML = '<span class="save-dot"></span> บันทึกแล้วในเครื่อง';
  }

  function normalizeName(name) {
    return String(name || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001F\u007F]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function profileIdFromName(name) {
    const normalized = normalizeName(name).toLocaleLowerCase('th-TH');
    return 'detective:' + encodeURIComponent(normalized);
  }

  function findProfileIdByName(name) {
    const normalized = normalizeName(name).toLocaleLowerCase('th-TH');
    return Object.keys(store.profiles).find(function matchProfile(profileId) {
      const profile = store.profiles[profileId];
      return normalizeName(profile && profile.name).toLocaleLowerCase('th-TH') === normalized;
    }) || null;
  }

  function getActiveProfile() {
    return activeProfileId ? store.profiles[activeProfileId] || null : null;
  }

  function createOrLoadProfile(rawName) {
    if (recoveryIssue) throw new Error('กรุณาแก้ไขปัญหาข้อมูลในเครื่องก่อนเปิดโปรไฟล์');
    const name = normalizeName(rawName);
    if (!name) throw new Error('กรุณากรอกชื่อสายสืบ');
    if (name.length > PROFILE_NAME_MAX) throw new Error('ชื่อสายสืบต้องไม่เกิน ' + PROFILE_NAME_MAX + ' ตัวอักษร');
    if (!/[\p{L}\p{N}]/u.test(name)) throw new Error('ชื่อสายสืบต้องมีตัวอักษรหรือตัวเลขอย่างน้อย 1 ตัว');

    const profileId = findProfileIdByName(name) || profileIdFromName(name);
    if (!store.profiles[profileId]) {
      const now = new Date().toISOString();
      store.profiles[profileId] = {
        id: profileId,
        name: name,
        createdAt: now,
        updatedAt: now,
        lastPlayedAt: now,
        stats: calculateStats([]),
        history: [],
        activeCase: null
      };
      if (!saveStore()) {
        delete store.profiles[profileId];
        throw new Error('สร้างโปรไฟล์ไม่ได้ เพราะเบราว์เซอร์ไม่อนุญาตให้บันทึกข้อมูล');
      }
      showToast('สร้างแฟ้มประจำตัวของ “' + name + '” แล้ว');
    }
    enterProfile(profileId);
  }

  function enterProfile(profileId) {
    if (!store.profiles[profileId]) return;
    const previousLastPlayedAt = store.profiles[profileId].lastPlayedAt;
    activeProfileId = profileId;
    store.profiles[profileId].lastPlayedAt = new Date().toISOString();
    if (!saveStore({ silent: true })) {
      store.profiles[profileId].lastPlayedAt = previousLastPlayedAt;
      activeProfileId = null;
      renderHeader();
      showToast('เปิดแฟ้มไม่ได้จนกว่าจะบันทึกข้อมูลในเครื่องได้', 'error', 5000);
      return;
    }
    sessionStorage.setItem(SESSION_PROFILE_KEY, profileId);
    // A detective with nothing in progress lands on the case picker, not the
    // dossier — choosing the file is the first real decision of a session.
    navigate(store.profiles[profileId].activeCase ? 'dashboard' : 'case-select');
  }

  function leaveProfile() {
    closeModal();
    activeProfileId = null;
    selectedResultKey = null;
    sessionStorage.removeItem(SESSION_PROFILE_KEY);
    navigate('home');
  }

  function navigate(nextView) {
    view = nextView;
    sessionStorage.setItem(SESSION_VIEW_KEY, nextView);
    render();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function createEmptyDeductions(sourceCase) {
    return (sourceCase || caseData).suspects.reduce(function buildDeductions(result, suspect) {
      result[suspect] = { status: 'unknown', notes: '' };
      return result;
    }, {});
  }

  function createNewCaseState(sourceCase) {
    const target = sourceCase || caseData;
    const now = new Date().toISOString();
    return {
      caseId: target.id,
      caseVersion: target.version,
      status: 'active',
      startedAt: now,
      updatedAt: now,
      actionsLeft: target.initialActions,
      opened: [],
      deductions: createEmptyDeductions(target),
      selectedEvidenceId: target.evidence[0].id
    };
  }

  function startCase(caseId, forceRestart) {
    const profile = getActiveProfile();
    if (!profile) return;
    const target = resolveCaseData(caseId || caseData.id);
    const current = profile.activeCase;
    if (current && !forceRestart) {
      const sameCase = current.caseId === target.id;
      const currentTitle = resolveCaseData(current.caseId).title;
      const shouldRestart = window.confirm(sameCase
        ? 'เริ่มคดีนี้ใหม่หรือไม่? ความคืบหน้าที่ยังไม่จบจะถูกแทนที่ แต่ประวัติคดีเดิมจะยังอยู่'
        : 'คุณกำลังสืบ “' + currentTitle + '” อยู่ การเปิด “' + target.title + '” จะแทนที่ความคืบหน้านั้น ดำเนินการต่อหรือไม่?');
      if (!shouldRestart) return;
    }
    const previousProfile = cloneData(profile);
    caseData = target;
    profile.activeCase = createNewCaseState(target);
    profile.lastPlayedAt = new Date().toISOString();
    profile.updatedAt = profile.lastPlayedAt;
    selectedResultKey = null;
    sideTab = 'notebook';
    if (!saveStore()) {
      store.profiles[activeProfileId] = previousProfile;
      caseData = resolveCaseData(previousProfile.activeCase && previousProfile.activeCase.caseId);
      showToast('ยังเริ่มคดีไม่ได้ เพราะไม่สามารถบันทึกเซฟใหม่ได้', 'error', 5000);
      return;
    }
    navigate('investigation');
  }

  function continueCase() {
    const profile = getActiveProfile();
    if (!profile || !profile.activeCase) return;
    navigate('investigation');
  }

  function render() {
    const profile = getActiveProfile();
    if (activeProfileId && !profile) {
      activeProfileId = null;
      view = 'home';
      sessionStorage.removeItem(SESSION_PROFILE_KEY);
      sessionStorage.setItem(SESSION_VIEW_KEY, view);
    } else if ((view === 'investigation' || view === 'board') && profile && !profile.activeCase) {
      view = 'dashboard';
      sessionStorage.setItem(SESSION_VIEW_KEY, view);
    }
    const currentProfile = getActiveProfile();
    if (currentProfile && currentProfile.activeCase) {
      caseData = resolveCaseData(currentProfile.activeCase.caseId);
    }
    renderHeader();
    if (view === 'case-select' && getActiveProfile()) {
      renderCaseSelect();
    } else if (view === 'dashboard' && getActiveProfile()) {
      renderDashboard();
    } else if (view === 'investigation' && getActiveProfile() && getActiveProfile().activeCase) {
      renderInvestigation();
    } else if (view === 'board' && getActiveProfile() && getActiveProfile().activeCase) {
      renderBoardPage();
    } else {
      view = 'home';
      renderHome();
    }
  }

  function renderHeader() {
    const profile = getActiveProfile();
    if (!profile) {
      headerActions.innerHTML = '';
      return;
    }
    headerActions.innerHTML =
      '<span class="header-save-state" aria-live="polite">' +
        (storageError
          ? '<span class="save-dot" style="background:var(--danger)"></span> บันทึกไม่สำเร็จ'
          : '<span class="save-dot"></span> บันทึกแล้วในเครื่อง') +
      '</span>' +
      '<span class="header-profile"><span>สายสืบ</span> <strong>' + escapeHtml(profile.name) + '</strong></span>' +
      (view === 'case-select'
        ? ''
        : '<button class="button button-ghost" type="button" data-action="case-select">เลือกคดี</button>') +
      (view === 'dashboard'
        ? ''
        : '<button class="button button-ghost" type="button" data-action="dashboard">แดชบอร์ด</button>') +
      '<button class="button button-ghost" type="button" data-action="switch-profile">สลับโปรไฟล์</button>';
  }

  function renderStorageWarning() {
    if (recoveryIssue && recoveryIssue.kind === 'corrupt') {
      const recoveryCopy = recoveryIssue.backupKey
        ? 'ระบบเก็บสำเนากู้คืนไว้แล้วและจะไม่เขียนทับข้อมูลเดิม จนกว่าคุณจะยืนยันเริ่มพื้นที่บันทึกใหม่'
        : 'ระบบยังไม่เขียนทับข้อมูลเดิม แต่พื้นที่ไม่พอสร้างสำเนากู้คืน คุณต้องยืนยันก่อนลบและเริ่มใหม่';
      return '<div class="storage-blocker" role="alert"><div><strong>พบข้อมูลบันทึกที่อ่านไม่ได้</strong><span>' + recoveryCopy + '</span></div><button class="button button-danger" type="button" data-action="reset-corrupt-storage">' + (recoveryIssue.backupKey ? 'สำรองแล้ว เริ่มใหม่' : 'ลบข้อมูลเดิมและเริ่มใหม่') + '</button></div>';
    }
    if (recoveryIssue) {
      return '<div class="storage-blocker" role="alert"><div><strong>localStorage ยังใช้งานไม่ได้</strong><span>เกมจะไม่เริ่มจนกว่าจะสามารถบันทึกความคืบหน้าได้</span></div><button class="button button-secondary" type="button" data-action="retry-storage">ลองอีกครั้ง</button></div>';
    }
    if (!storageError) return '';
    return '<div class="no-actions-notice" role="alert">ไม่สามารถบันทึกข้อมูลในเครื่องได้ การรีเฟรชหน้าอาจทำให้ความคืบหน้าหายไป กรุณาอนุญาต localStorage ก่อนเล่นต่อ</div>';
  }

  function renderHome() {
    document.title = 'Murder Case: Evidence Deck';
    const profiles = Object.values(store.profiles).sort(function sortProfiles(a, b) {
      return new Date(b.lastPlayedAt || 0) - new Date(a.lastPlayedAt || 0);
    });
    const profileList = profiles.length
      ? profiles.map(function profileOption(profile) {
          const current = profile.activeCase;
          const detail = current
            ? resolveCaseData(current.caseId).title + ' · เหลือ ' + current.actionsLeft + ' แอ็กชัน'
            : profile.history.length
              ? 'จบแล้ว ' + profile.history.length + ' ครั้ง · คะแนนสูงสุด ' + calculateStats(profile.history).bestScore
              : 'โปรไฟล์ใหม่ · ยังไม่เริ่มคดี';
          return '<button class="profile-option" type="button" data-profile-id="' + escapeAttribute(profile.id) + '">' +
            '<span class="profile-avatar" aria-hidden="true">' + escapeHtml(initialOf(profile.name)) + '</span>' +
            '<span class="profile-option-text"><strong>' + escapeHtml(profile.name) + '</strong><small>' + escapeHtml(detail) + '</small></span>' +
            '<span class="profile-arrow" aria-hidden="true">›</span>' +
          '</button>';
        }).join('')
      : '<div class="empty-list">ยังไม่มีแฟ้มสายสืบ<br />กรอกชื่อเพื่อสร้างโปรไฟล์แรก</div>';
    const featuredCase = allCases[allCases.length - 1];

    appRoot.innerHTML =
      '<section class="home-page">' +
        renderStorageWarning() +
        '<div class="home-hero">' +
          '<div class="home-copy">' +
            '<p class="eyebrow">Solo investigation game</p>' +
            '<h1>ทุกหลักฐาน<span>มีราคาที่ต้องจ่าย</span></h1>' +
            '<p class="hero-lede">เลือกจุดตรวจให้คุ้มค่า เชื่อมคำโกหกเข้าหากัน และกล่าวหาคนร้ายก่อนโอกาสสุดท้ายหมดลง</p>' +
            '<div class="hero-points" aria-label="คุณสมบัติของเกม">' +
              '<span class="hero-point">เล่นคนเดียว</span>' +
              '<span class="hero-point">' + allCases.length + ' คดี</span>' +
              '<span class="hero-point">แอ็กชันจำกัด</span>' +
              '<span class="hero-point">บันทึกในเครื่อง</span>' +
            '</div>' +
          '</div>' +
          '<div class="case-file-art" aria-hidden="true">' +
            '<div class="art-shadow"></div><div class="file-folder"></div>' +
            '<div class="file-paper">' +
              '<span class="case-art-label">CASE FILE ' + escapeHtml(featuredCase.code || '001') + ' / CONFIDENTIAL</span>' +
              '<h2 class="case-art-title">' + escapeHtml(featuredCase.title) + '</h2>' +
              '<p class="case-art-victim">ผู้เสียชีวิต<strong>' + escapeHtml(featuredCase.victim) + '</strong></p>' +
              '<span class="case-stamp">UNSOLVED</span>' +
            '</div><span class="paper-clip"></span>' +
          '</div>' +
        '</div>' +
        '<div class="profile-gate" id="profile-gate">' +
          '<section class="profile-entry-panel" aria-labelledby="enter-profile-title">' +
            '<span class="section-kicker">Detective Registry</span>' +
            '<h2 class="panel-title" id="enter-profile-title">เปิดแฟ้มสายสืบ</h2>' +
            '<p class="panel-description">ใช้ชื่อเดิมเพื่อโหลดเกม หรือกรอกชื่อใหม่เพื่อสร้างแฟ้มแยก</p>' +
            '<form id="profile-form" novalidate>' +
              '<label class="field-label" for="detective-name">ชื่อสายสืบ</label>' +
              '<div class="input-row">' +
                '<input class="text-input" id="detective-name" name="detectiveName" maxlength="' + PROFILE_NAME_MAX + '" autocomplete="off" placeholder="กรอกชื่อเพื่อสร้างหรือเปิดโปรไฟล์" required' + (recoveryIssue ? ' disabled' : '') + ' />' +
                '<button class="button button-primary" type="submit"' + (recoveryIssue ? ' disabled' : '') + '>เข้าสู่แฟ้ม</button>' +
              '</div>' +
              '<p class="error-message" id="profile-error" role="alert" hidden></p>' +
            '</form>' +
            '<p class="privacy-note">ข้อมูลเก็บเฉพาะในเบราว์เซอร์นี้ ไม่มีบัญชีออนไลน์และไม่มีการซิงก์</p>' +
          '</section>' +
          '<section class="profile-list-panel" aria-labelledby="existing-profile-title">' +
            '<div class="profile-list-heading"><h2 id="existing-profile-title">แฟ้มที่มีอยู่</h2><span class="profile-count">' + profiles.length + ' โปรไฟล์</span></div>' +
            '<div class="profile-list">' + profileList + '</div>' +
          '</section>' +
        '</div>' +
      '</section>';
  }

  function renderDashboard() {
    const profile = getActiveProfile();
    const stats = calculateStats(profile.history);
    profile.stats = stats;
    document.title = 'แฟ้มสายสืบ ' + profile.name + ' · Murder Case';
    const active = profile.activeCase;
    const activeCaseData = active ? resolveCaseData(active.caseId) : null;
    const openedCount = active ? active.opened.length : 0;
    const progress = active ? Math.round((openedCount / activeCaseData.initialActions) * 100) : 0;
    const featured = activeCaseData || caseData;
    const historyMarkup = profile.history.length
      ? profile.history.map(renderHistoryRow).join('')
      : '<div class="empty-list">ยังไม่มีประวัติการปิดคดี<br />ผลลัพธ์ครั้งแรกจะปรากฏที่นี่</div>';

    appRoot.innerHTML =
      '<section class="page-shell dashboard-page">' +
        renderStorageWarning() +
        '<div class="dashboard-intro">' +
          '<div class="dashboard-heading"><p class="eyebrow">Detective dossier</p><h1>ยินดีต้อนรับ<br />สายสืบ ' + escapeHtml(profile.name) + '</h1><p>เลือกกลับเข้าสู่คดี หรือเปิดแฟ้มคดีใหม่จากคลัง ' + allCases.length + ' คดี</p></div>' +
          (active
            ? '<button class="button button-primary" type="button" data-action="continue-case">สืบสวนต่อ →</button>'
            : '<button class="button button-primary" type="button" data-action="case-select">เลือกคดี →</button>') +
        '</div>' +
        '<div class="dashboard-grid">' +
          '<article class="case-card">' +
            '<div class="case-card-heading"><span class="case-number">CASE ' + escapeHtml(featured.code || '001') + '</span><span class="case-state">' + (active ? 'กำลังดำเนินคดี' : 'พร้อมเปิดคดี') + '</span></div>' +
            '<h2>' + escapeHtml(featured.title) + '</h2>' +
            '<p class="victim-line">ผู้เสียชีวิต <strong>' + escapeHtml(featured.victim) + '</strong> · ' + featured.suspects.length + ' ผู้ต้องสงสัย · ระดับ ' + escapeHtml(featured.difficultyLabel || 'มาตรฐาน') + '</p>' +
            '<div class="case-progress-wrap">' +
              '<div class="case-progress-copy"><span>' + (active ? 'ตรวจแล้ว ' + openedCount + ' จุด' : 'ยังไม่เริ่มสืบสวน') + '</span><span>' + (active ? 'เหลือ ' + active.actionsLeft + '/' + featured.initialActions + ' แอ็กชัน' : featured.initialActions + ' แอ็กชันทั้งหมด') + '</span></div>' +
              '<div class="progress-track" role="progressbar" aria-label="ความคืบหน้าการใช้แอ็กชัน" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><div class="progress-fill" style="width:' + progress + '%"></div></div>' +
            '</div>' +
            '<div class="case-card-actions">' +
              (active
                ? '<button class="button button-primary" type="button" data-action="continue-case">สืบสวนต่อ</button><button class="button button-secondary" type="button" data-action="restart-case" data-case-id="' + escapeAttribute(featured.id) + '">เริ่มคดีนี้ใหม่</button>'
                : '<button class="button button-primary" type="button" data-action="case-select">เลือกคดี</button>') +
              (active ? '<button class="button button-ghost" type="button" data-action="case-select">คลังคดี (' + allCases.length + ')</button>' : '') +
            '</div>' +
          '</article>' +
          '<div class="stats-column" aria-label="สถิติสายสืบ">' +
            renderStatCard('คดีที่เล่น', stats.casesPlayed, 'ครั้ง') +
            renderStatCard('คดีที่ไขได้', stats.casesSolved, 'Solved ขึ้นไป') +
            renderStatCard('คะแนนสูงสุด', stats.bestScore, stats.bestRank || 'ยังไม่มีอันดับ', true) +
          '</div>' +
        '</div>' +
        '<section class="history-panel" aria-labelledby="history-title">' +
          '<div class="history-heading"><div><span class="section-kicker">Case archive</span><h2 id="history-title">ประวัติการสรุปคดี</h2></div><span class="profile-count">บันทึกแยกเฉพาะโปรไฟล์นี้</span></div>' +
          '<div class="history-list">' + historyMarkup + '</div>' +
        '</section>' +
      '</section>';
  }

  function caseFactsFor(item) {
    const hotspotCount = item.evidence.reduce(function countHotspots(total, card) { return total + card.hotspots.length; }, 0);
    const lockedCount = item.evidence.reduce(function countLocked(total, card) {
      return total + card.hotspots.filter(function isLocked(hotspot) {
        return Array.isArray(hotspot.requires) && hotspot.requires.length;
      }).length;
    }, 0);
    return { hotspotCount: hotspotCount, lockedCount: lockedCount };
  }

  function caseRecordFor(profile, caseId) {
    const runs = profile.history.filter(function matchCase(entry) { return entry.caseId === caseId; });
    const bestScore = runs.reduce(function best(top, entry) { return Math.max(top, Number(entry.score) || 0); }, 0);
    const bestRun = runs.find(function matchBest(entry) { return (Number(entry.score) || 0) === bestScore; });
    return {
      runs: runs.length,
      bestScore: bestScore,
      bestRank: bestRun ? bestRun.rank || getRank(bestScore) : ''
    };
  }

  function renderCaseSelect() {
    const profile = getActiveProfile();
    document.title = 'เลือกคดี · Murder Case';
    const active = profile.activeCase;
    const activeCaseData = active ? resolveCaseData(active.caseId) : null;

    const cards = allCases.map(function caseChoice(item) {
      const isActive = Boolean(active && active.caseId === item.id);
      const facts = caseFactsFor(item);
      const record = caseRecordFor(profile, item.id);
      const status = isActive
        ? '<span class="case-choice-state active">กำลังสืบสวน · เหลือ ' + active.actionsLeft + '/' + item.initialActions + ' แอ็กชัน</span>'
        : record.runs
          ? '<span class="case-choice-state done">ปิดคดีแล้ว ' + record.runs + ' ครั้ง · ดีที่สุด ' + record.bestScore + ' (' + escapeHtml(record.bestRank) + ')</span>'
          : '<span class="case-choice-state">ยังไม่เคยเปิดแฟ้มนี้</span>';
      const replaceNote = !isActive && active
        ? '<p class="case-choice-warning">การเปิดคดีนี้จะแทนที่ความคืบหน้าของ “' + escapeHtml(activeCaseData.title) + '” ที่ยังไม่จบ</p>'
        : '';

      return '<article class="case-choice' + (isActive ? ' current' : '') + '">' +
        '<div class="case-choice-top">' +
          '<span class="case-number">CASE ' + escapeHtml(item.code || '001') + '</span>' +
          '<span class="difficulty-chip ' + escapeAttribute(item.difficulty || 'normal') + '">' + escapeHtml(item.difficultyLabel || 'มาตรฐาน') + '</span>' +
        '</div>' +
        '<h2>' + escapeHtml(item.title) + '</h2>' +
        '<p class="case-choice-sub">' + escapeHtml(item.subtitle || '') + '</p>' +
        '<p class="case-choice-victim">ผู้เสียชีวิต <strong>' + escapeHtml(item.victim) + '</strong></p>' +
        '<p class="case-choice-briefing">' + escapeHtml(item.briefing || '') + '</p>' +
        '<div class="case-choice-facts">' +
          '<span><b>' + item.suspects.length + '</b> ผู้ต้องสงสัย</span>' +
          '<span><b>' + item.evidence.length + '</b> หลักฐาน</span>' +
          '<span><b>' + facts.hotspotCount + '</b> จุดตรวจ</span>' +
          '<span><b>' + item.initialActions + '</b> แอ็กชัน</span>' +
          (facts.lockedCount ? '<span class="fact-locked"><b>' + facts.lockedCount + '</b> จุดที่ต้องปลดล็อก</span>' : '') +
        '</div>' +
        status +
        replaceNote +
        '<div class="case-choice-actions">' +
          (isActive
            ? '<button class="button button-primary" type="button" data-action="continue-case">สืบสวนต่อ</button>' +
              '<button class="button button-secondary" type="button" data-action="restart-case" data-case-id="' + escapeAttribute(item.id) + '">เริ่มคดีนี้ใหม่</button>'
            : '<button class="button button-primary" type="button" data-action="start-case" data-case-id="' + escapeAttribute(item.id) + '">เปิดแฟ้มคดีนี้</button>') +
        '</div>' +
      '</article>';
    }).join('');

    appRoot.innerHTML =
      '<section class="page-shell case-select-page">' +
        renderStorageWarning() +
        '<div class="case-select-intro">' +
          '<div class="case-select-heading">' +
            '<p class="eyebrow">Case selection</p>' +
            '<h1 id="case-select-title" tabindex="-1">เลือกคดีที่จะสืบ</h1>' +
            '<p>สายสืบ <strong>' + escapeHtml(profile.name) + '</strong> · สืบได้ครั้งละหนึ่งคดี ความคืบหน้าและประวัติบันทึกแยกตามโปรไฟล์นี้</p>' +
          '</div>' +
          '<button class="button button-ghost" type="button" data-action="dashboard">ดูแดชบอร์ด</button>' +
        '</div>' +
        (activeCaseData
          ? '<div class="active-case-banner" role="status"><div><strong>คุณกำลังสืบ “' + escapeHtml(activeCaseData.title) + '” อยู่</strong>' +
            '<span>เหลือ ' + active.actionsLeft + '/' + activeCaseData.initialActions + ' แอ็กชัน · ตรวจแล้ว ' + active.opened.length + ' จุด</span></div>' +
            '<button class="button button-primary" type="button" data-action="continue-case">สืบสวนต่อ</button></div>'
          : '') +
        '<div class="case-select-grid">' + cards + '</div>' +
      '</section>';
  }

  function renderStatCard(label, value, foot, wide) {
    return '<div class="stat-card' + (wide ? ' wide' : '') + '"><span class="stat-label">' + escapeHtml(label) + '</span><strong class="stat-value">' + escapeHtml(String(value)) + '</strong><span class="stat-foot">' + escapeHtml(foot) + '</span></div>';
  }

  function renderHistoryRow(item) {
    return '<div class="history-row">' +
      '<div class="history-case"><strong>' + escapeHtml(item.caseTitle || caseData.title) + '</strong><small>กล่าวหา ' + escapeHtml(item.accusation && item.accusation.killer ? item.accusation.killer : '—') + '</small></div>' +
      '<time class="history-date" datetime="' + escapeAttribute(item.completedAt || '') + '">' + escapeHtml(formatDate(item.completedAt)) + '</time>' +
      '<span class="rank-label">' + escapeHtml(item.rank || getRank(item.score || 0)) + '</span>' +
      '<strong class="history-score">' + escapeHtml(String(item.score || 0)) + '</strong>' +
    '</div>';
  }

  function renderInvestigation() {
    const profile = getActiveProfile();
    const caseState = profile.activeCase;
    const selectedEvidence = Cases.getEvidenceById(caseData, caseState.selectedEvidenceId) || caseData.evidence[0];
    caseState.selectedEvidenceId = selectedEvidence.id;
    const openedForSelected = caseState.opened.filter(function openedForEvidence(entry) {
      return entry.evidenceId === selectedEvidence.id;
    });
    const latestEntry = findSelectedResult(caseState, selectedEvidence.id) || openedForSelected[openedForSelected.length - 1] || null;
    const latestHotspot = latestEntry ? Cases.getHotspotById(caseData, latestEntry.evidenceId, latestEntry.hotspotId) : null;
    document.title = selectedEvidence.title + ' · ' + caseData.title;

    appRoot.innerHTML =
      '<section class="investigation-page">' +
        renderStorageWarning() +
        '<div class="case-banner">' +
          '<div class="case-banner-title"><span class="section-kicker">Case ' + escapeHtml(caseData.code || '001') + ' · Investigation active</span><h1>' + escapeHtml(caseData.title) + '</h1><p>ผู้เสียชีวิต <strong>' + escapeHtml(caseData.victim) + '</strong></p></div>' +
          '<div class="action-meter' + (caseState.actionsLeft <= 3 ? ' danger' : '') + '" aria-label="เหลือ ' + caseState.actionsLeft + ' แอ็กชัน"><strong class="action-number">' + caseState.actionsLeft + '</strong><span class="action-label">actions<br />remaining</span></div>' +
          '<div class="case-banner-actions"><button class="button button-secondary" type="button" data-action="open-board">เปิดกระดานสรุป</button><button class="button button-danger" type="button" data-action="open-accusation">สรุปคดีและกล่าวหา</button></div>' +
        '</div>' +
        '<div class="intel-strip">' +
          '<div class="intel-group"><span class="intel-group-label">ผู้ต้องสงสัย</span><span class="intel-items">' + caseData.suspects.map(renderPersonChip).join('') + '</span></div>' +
          '<div class="intel-group"><span class="intel-group-label">สถานที่</span><span class="intel-items">' + caseData.locations.map(renderPersonChip).join('') + '</span></div>' +
        '</div>' +
        '<div class="investigation-grid">' +
          '<aside class="evidence-rail" aria-labelledby="evidence-deck-title">' +
            '<div class="rail-heading"><h2 id="evidence-deck-title">กองหลักฐาน</h2><span class="panel-count">' + caseState.opened.length + ' จุดเปิดแล้ว</span></div>' +
            '<div class="evidence-list">' + caseData.evidence.map(function renderEvidence(item, index) { return renderEvidenceItem(item, index, caseState, selectedEvidence.id); }).join('') + '</div>' +
          '</aside>' +
          '<section class="evidence-workbench" aria-labelledby="selected-evidence-title">' +
            '<div class="workbench-heading"><div class="workbench-heading-copy"><span class="section-kicker">Evidence ' + padEvidenceNumber(caseData.evidence.indexOf(selectedEvidence) + 1) + '</span><h2 id="selected-evidence-title">' + escapeHtml(selectedEvidence.title) + '</h2></div><span class="status-chip">' + openedForSelected.length + '/' + selectedEvidence.hotspots.length + ' ตรวจแล้ว</span></div>' +
            '<div class="workbench-content">' +
              '<div class="inspection-instruction"><span class="radar-dot" aria-hidden="true"></span><span><strong>ภาพขยายพร้อมตรวจสอบ</strong> แตะวงกลมบนภาพเพื่อเปิดเบาะแส — แต่ละจุดใช้ 1 แอ็กชัน' + (caseHasLocks(caseData) ? ' จุดที่ขึ้นแม่กุญแจต้องมีเบาะแสรองรับก่อน' : '') + '</span></div>' +
              '<div class="evidence-photo-stage" id="evidence-photo-stage" tabindex="-1" style="aspect-ratio:' + escapeAttribute(selectedEvidence.imageRatio || '3 / 2') + '" aria-label="ภาพขยายหลักฐาน ' + escapeAttribute(selectedEvidence.title) + '">' +
                '<img src="' + escapeAttribute(selectedEvidence.image) + '" alt="' + escapeAttribute(selectedEvidence.shortDescription) + '" />' +
                '<span class="photo-scanline" aria-hidden="true"></span>' +
                selectedEvidence.hotspots.map(function renderPhotoHotspot(hotspot, index) { return renderImageHotspot(hotspot, index, selectedEvidence.id, caseState); }).join('') +
                '<span class="photo-caption">EVIDENCE ' + padEvidenceNumber(caseData.evidence.indexOf(selectedEvidence) + 1) + ' · ' + escapeHtml(selectedEvidence.title) + '</span>' +
              '</div>' +
              '<p class="evidence-description">' + escapeHtml(selectedEvidence.shortDescription) + '</p>' +
              '<div class="hotspot-key-list" aria-label="รายการจุดตรวจสอบ">' + selectedEvidence.hotspots.map(function renderHotspotKey(hotspot, index) {
                const opened = isHotspotOpened(caseState, selectedEvidence.id, hotspot.id);
                const locked = !opened && missingRequirementsFor(caseState, selectedEvidence.id, hotspot.id).length > 0;
                return '<span class="hotspot-key' + (opened ? ' opened' : '') + (locked ? ' locked' : '') + '"><b>' + (locked ? '🔒' : index + 1) + '</b>' + escapeHtml(hotspot.label) + '</span>';
              }).join('') + '</div>' +
              (caseState.actionsLeft === 0 ? '<div class="no-actions-notice" role="status">แอ็กชันหมดแล้ว คุณยังทบทวนสมุดหลักฐานและกระดานอนุมานได้ จากนั้นส่งคำกล่าวหาเพื่อปิดคดี</div>' : '') +
              (latestHotspot ? renderOpenedResult(latestHotspot, selectedEvidence.title) : '') +
            '</div>' +
          '</section>' +
          '<aside class="side-panel" aria-label="เครื่องมือวิเคราะห์">' +
            '<div class="side-heading"><h2>แฟ้มวิเคราะห์</h2><span class="panel-count">บันทึกอัตโนมัติ</span></div>' +
            '<div class="side-tabs" role="tablist" aria-label="แฟ้มวิเคราะห์">' +
              '<button class="side-tab" id="notebook-tab" type="button" role="tab" aria-selected="' + (sideTab === 'notebook') + '" aria-controls="analysis-panel" data-side-tab="notebook">สมุดหลักฐาน (' + caseState.opened.length + ')</button>' +
              '<button class="side-tab" id="deduction-tab" type="button" role="tab" aria-selected="' + (sideTab === 'deduction') + '" aria-controls="analysis-panel" data-side-tab="deduction">กระดานอนุมาน</button>' +
            '</div>' +
            '<div class="side-content" id="analysis-panel" role="tabpanel" aria-labelledby="' + sideTab + '-tab">' + (sideTab === 'deduction' ? renderDeductionBoard(caseState) : renderNotebook(caseState)) + '</div>' +
          '</aside>' +
        '</div>' +
      '</section>';
  }

  function renderPersonChip(item) {
    return '<span class="person-chip">' + escapeHtml(item) + '</span>';
  }

  function renderEvidenceItem(evidenceItem, index, caseState, selectedId) {
    const openedCount = caseState.opened.filter(function countOpened(entry) { return entry.evidenceId === evidenceItem.id; }).length;
    const label = openedCount === 0 ? 'ยังไม่ได้ตรวจ' : 'ตรวจแล้ว ' + openedCount + '/' + evidenceItem.hotspots.length;
    return '<button class="evidence-item' + (selectedId === evidenceItem.id ? ' selected' : '') + '" type="button" data-evidence-id="' + escapeAttribute(evidenceItem.id) + '" aria-pressed="' + (selectedId === evidenceItem.id) + '">' +
      '<span class="evidence-thumb"><img src="' + escapeAttribute(evidenceItem.image) + '" alt="" loading="lazy" /><span class="evidence-index">' + padEvidenceNumber(index + 1) + '</span><span class="evidence-check' + (openedCount ? '' : ' unopened') + '" aria-hidden="true">' + (openedCount ? '●' : '○') + '</span></span>' +
      '<span class="evidence-item-text"><strong>' + escapeHtml(evidenceItem.title) + '</strong><small>' + label + '</small></span>' +
    '</button>';
  }

  function caseHasLocks(sourceCase) {
    return (sourceCase || caseData).evidence.some(function anyLocked(card) {
      return card.hotspots.some(function hasRequires(hotspot) {
        return Array.isArray(hotspot.requires) && hotspot.requires.length > 0;
      });
    });
  }

  function renderImageHotspot(hotspot, index, evidenceId, caseState) {
    const opened = isHotspotOpened(caseState, evidenceId, hotspot.id);
    const missing = opened ? [] : missingRequirementsFor(caseState, evidenceId, hotspot.id);
    const locked = missing.length > 0;
    const noActions = caseState.actionsLeft <= 0;
    const disabled = !opened && noActions;
    const position = hotspot.position || { x: 50, y: 50 };
    const lockCopy = locked ? lockedHintFor(caseOf(caseState), evidenceId, hotspot.id, missing) : '';
    const actionCopy = opened
      ? 'เปิดอ่านอีกครั้งโดยไม่ใช้แอ็กชัน'
      : locked ? lockCopy : 'ใช้ 1 แอ็กชัน';
    const edgeClass = (Number(position.x) < 20 ? ' edge-left' : Number(position.x) > 80 ? ' edge-right' : '') +
      (Number(position.y) < 23 ? ' edge-top' : '');
    return '<button class="image-hotspot' + (opened ? ' opened' : '') + (locked ? ' locked' : '') + edgeClass + '" style="left:' + Number(position.x) + '%;top:' + Number(position.y) + '%" type="button" data-evidence-id="' + escapeAttribute(evidenceId) + '" data-hotspot-id="' + escapeAttribute(hotspot.id) + '" aria-label="จุดตรวจ ' + (index + 1) + ': ' + escapeAttribute(hotspot.label) + ' — ' + escapeAttribute(actionCopy) + '"' + (disabled ? ' disabled' : '') + '>' +
      '<span class="hotspot-radar" aria-hidden="true"></span><span class="hotspot-marker">' + (opened ? '✓' : locked ? '🔒' : index + 1) + '</span>' +
      '<span class="hotspot-tooltip"><strong>' + escapeHtml(hotspot.label) + '</strong><small>' + escapeHtml(actionCopy) + '</small></span>' +
    '</button>';
  }

  function renderOpenedResult(hotspot, evidenceTitle) {
    return '<article class="opened-result" id="opened-result" tabindex="-1" data-category="' + escapeAttribute(hotspot.category) + '" aria-live="polite">' +
      '<div class="result-meta"><span class="category-badge">' + escapeHtml(categoryLabel(hotspot.category)) + '</span><span class="profile-count">จาก ' + escapeHtml(evidenceTitle) + '</span></div>' +
      '<h3>' + escapeHtml(hotspot.resultTitle) + '</h3><p>' + escapeHtml(hotspot.result) + '</p>' +
    '</article>';
  }

  function renderNotebook(caseState) {
    if (!caseState.opened.length) {
      return '<div class="empty-notebook">ยังไม่มีหลักฐานที่เปิดเผย<br />เลือกจุดตรวจสอบจากหลักฐานหนึ่งใบ</div>';
    }
    const entries = caseState.opened.slice().reverse().map(function notebookEntry(entry) {
      const evidenceItem = Cases.getEvidenceById(caseData, entry.evidenceId);
      const hotspot = Cases.getHotspotById(caseData, entry.evidenceId, entry.hotspotId);
      if (!evidenceItem || !hotspot) return '';
      return '<article class="notebook-entry ' + escapeAttribute(hotspot.category) + '">' +
        '<span class="notebook-source">' + escapeHtml(evidenceItem.title) + ' · ' + escapeHtml(categoryLabel(hotspot.category)) + '</span>' +
        '<strong>' + escapeHtml(hotspot.resultTitle) + '</strong><p>' + escapeHtml(hotspot.notebook || hotspot.result) + '</p>' +
      '</article>';
    }).join('');
    return '<div class="notebook-list">' + entries + '</div>';
  }

  function renderDeductionBoard(caseState) {
    const cards = caseData.suspectProfiles.map(function deductionCard(suspect) {
      const deduction = caseState.deductions[suspect.name] || { status: 'unknown', notes: '' };
      return '<article class="deduction-card">' +
        '<div class="deduction-card-header"><div><strong class="suspect-name">' + escapeHtml(suspect.name) + '</strong><span class="sr-only"> ' + escapeHtml(suspect.role) + '</span></div>' +
          '<label class="sr-only" for="status-' + escapeAttribute(suspect.id) + '">สถานะของ ' + escapeHtml(suspect.name) + '</label>' +
          '<select class="select-input status-select" id="status-' + escapeAttribute(suspect.id) + '" data-deduction-status="' + escapeAttribute(suspect.name) + '">' + renderStatusOptions(deduction.status) + '</select>' +
        '</div>' +
        '<label class="sr-only" for="notes-' + escapeAttribute(suspect.id) + '">บันทึกเกี่ยวกับ ' + escapeHtml(suspect.name) + '</label>' +
        '<textarea class="notes-input" id="notes-' + escapeAttribute(suspect.id) + '" maxlength="2000" placeholder="บันทึกข้อสงสัย ความเชื่อมโยง หรือข้อแก้ต่าง…" data-deduction-notes="' + escapeAttribute(suspect.name) + '">' + escapeHtml(deduction.notes || '') + '</textarea>' +
      '</article>';
    }).join('');
    return '<p class="deduction-tip">จัดสถานะผู้ต้องสงสัยและจดเหตุผล กระดานนี้เป็นของสายสืบ ' + escapeHtml(getActiveProfile().name) + ' เท่านั้น</p><div class="deduction-list">' + cards + '</div>';
  }

  function renderBoardPage() {
    const profile = getActiveProfile();
    const caseState = profile.activeCase;
    const boardData = buildBoardConnections(caseState);
    document.title = 'กระดานสรุป · ' + caseData.title;

    appRoot.innerHTML =
      '<section class="board-page">' +
        renderStorageWarning() +
        '<header class="board-toolbar">' +
          '<div><span class="section-kicker">Detective link board</span><h1 id="board-title" tabindex="-1">กระดานสรุปคดี</h1><p>' + escapeHtml(caseData.title) + ' · แฟ้มของสายสืบ ' + escapeHtml(profile.name) + '</p></div>' +
          '<div class="board-toolbar-actions"><span class="board-action-count"><strong>' + caseState.actionsLeft + '</strong> แอ็กชันคงเหลือ</span><button class="button button-secondary" type="button" data-action="back-investigation">กลับไปตรวจหลักฐาน</button><button class="button button-danger" type="button" data-action="open-accusation">สรุปคดีและกล่าวหา</button></div>' +
        '</header>' +
        '<div class="board-legend"><span><i class="legend-string critical"></i>หลักฐานชี้ขาด</span><span><i class="legend-string useful"></i>ข้อมูลเชื่อมโยง</span><span><i class="legend-string uncertain"></i>ข้อมูลยังไม่ยืนยัน</span><span class="board-legend-stat">พบความเชื่อมโยง ' + boardData.lineCount + ' เส้น</span></div>' +
        '<div class="board-scroll-shell" tabindex="0" aria-label="กระดานสืบสวนแบบเลื่อนได้">' +
          '<div class="investigation-board" style="' + boardStyleVariables() + '">' +
            '<span class="board-vignette" aria-hidden="true"></span>' +
            boardData.strings +
            renderVictimBoardNode() +
            caseData.suspectProfiles.map(function renderSuspectNode(suspect, index) { return renderBoardSuspect(suspect, index, caseState); }).join('') +
            caseData.evidence.map(function renderEvidenceNode(evidenceItem) { return renderBoardEvidence(evidenceItem, caseState); }).join('') +
          '</div>' +
        '</div>' +
        '<div class="sr-only" aria-live="polite">' + boardData.connections.map(function describeConnection(item) { return escapeHtml(item.evidenceTitle + ' เชื่อมกับ ' + item.suspect); }).join(' · ') + '</div>' +
        '<section class="board-notes-section" aria-labelledby="board-notes-title"><div class="board-notes-heading"><div><span class="section-kicker">Suspect notes</span><h2 id="board-notes-title">บันทึกผู้ต้องสงสัย</h2></div><p>สถานะและโน้ตจะบันทึกลงโปรไฟล์นี้ทันที</p></div>' + renderDeductionBoard(caseState) + '</section>' +
      '</section>';
  }

  function boardLayout() {
    return caseData.boardLayout;
  }

  function buildBoardConnections(caseState) {
    const layout = boardLayout();
    const pairs = new Map();
    const evidenceCategories = new Map();
    const priority = { critical: 4, useful: 3, red_herring: 2, flavor: 1 };

    caseState.opened.forEach(function collectOpenedLink(entry) {
      const evidenceItem = Cases.getEvidenceById(caseData, entry.evidenceId);
      const hotspot = Cases.getHotspotById(caseData, entry.evidenceId, entry.hotspotId);
      if (!evidenceItem || !hotspot) return;
      const currentEvidenceCategory = evidenceCategories.get(entry.evidenceId);
      if (!currentEvidenceCategory || priority[hotspot.category] > priority[currentEvidenceCategory]) {
        evidenceCategories.set(entry.evidenceId, hotspot.category);
      }
      (hotspot.relatedSuspects || []).forEach(function addPair(suspect) {
        const key = entry.evidenceId + ':' + suspect;
        const current = pairs.get(key);
        if (!current || priority[hotspot.category] > priority[current.category]) {
          pairs.set(key, { evidenceId: entry.evidenceId, evidenceTitle: evidenceItem.title, suspect: suspect, category: hotspot.category });
        }
      });
    });

    const connections = Array.from(pairs.values());
    const strings = [];
    connections.forEach(function connectionString(connection) {
      const evidencePosition = layout.evidence[connection.evidenceId];
      const suspectProfile = caseData.suspectProfiles.find(function matchSuspect(item) { return item.name === connection.suspect; });
      const suspectPosition = suspectProfile ? layout.suspects[suspectProfile.id] : null;
      if (!evidencePosition || !suspectPosition) return;
      strings.push(renderBoardString(nodeCenter(evidencePosition), nodeCenter(suspectPosition), connection.category));
    });

    Array.from(new Set(caseState.opened.map(function openedEvidenceId(entry) { return entry.evidenceId; }))).forEach(function victimString(evidenceId) {
      const evidencePosition = layout.evidence[evidenceId];
      if (evidencePosition) strings.push(renderBoardString(
        nodeCenter(evidencePosition),
        nodeCenter(layout.victim),
        evidenceCategories.get(evidenceId) || 'flavor'
      ));
    });

    return { connections: connections, strings: strings.join(''), lineCount: strings.length };
  }

  // The board size and the suspect portrait sheet both vary per case, so they
  // are handed to CSS as custom properties instead of being hard-coded there.
  function boardStyleVariables() {
    const layout = boardLayout();
    const lineup = caseData.suspectLineup || '/assets/suspects/suspect-lineup.jpg';
    const count = Math.max(1, caseData.suspectProfiles.length);
    return '--board-width:' + Number(layout.width) + 'px;' +
      '--board-height:' + Number(layout.height) + 'px;' +
      '--portrait-sheet:url(&quot;' + escapeAttribute(lineup) + '&quot;);' +
      '--portrait-scale:' + (count * 100) + '%';
  }

  function nodeCenter(position) {
    return { x: position.left + position.width / 2, y: position.top + position.height / 2 };
  }

  function renderBoardString(from, to, category) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
    const lineClass = category === 'critical'
      ? 'critical'
      : category === 'useful'
        ? 'useful'
        : 'uncertain';
    return '<span class="board-string ' + lineClass + '" aria-hidden="true" style="left:' + from.x + 'px;top:' + from.y + 'px;width:' + length.toFixed(1) + 'px;transform:rotate(' + angle.toFixed(2) + 'deg)"></span>';
  }

  function renderVictimBoardNode() {
    const position = boardLayout().victim;
    return '<article class="board-victim-node" style="left:' + position.left + 'px;top:' + position.top + 'px"><span class="board-pin brass" aria-hidden="true"></span><span class="board-file-label">VICTIM / CASE 001</span><strong>' + escapeHtml(caseData.victim) + '</strong><small>เสียชีวิตใน ' + escapeHtml(caseData.solutionLabels.location) + '</small><span class="case-stamp">DECEASED</span></article>';
  }

  function renderBoardSuspect(suspect, index, caseState) {
    const position = boardLayout().suspects[suspect.id];
    const deduction = caseState.deductions[suspect.name] || { status: 'unknown', notes: '' };
    return '<article class="board-suspect-node status-' + escapeAttribute(deduction.status) + '" data-board-suspect-id="' + escapeAttribute(suspect.id) + '" style="left:' + position.left + 'px;top:' + position.top + 'px">' +
      '<span class="board-pin red" aria-hidden="true"></span><div class="suspect-photo" style="--portrait-position:' + portraitPosition(index) + '%" role="img" aria-label="ภาพผู้ต้องสงสัย ' + escapeAttribute(suspect.name) + '"></div>' +
      '<div class="suspect-polaroid-copy"><strong>' + escapeHtml(suspect.name) + '</strong><small>' + escapeHtml(suspect.role) + '</small></div><span class="board-status-label">' + escapeHtml(deductionStatusLabel(deduction.status)) + '</span>' +
    '</article>';
  }

  function renderBoardEvidence(evidenceItem, caseState) {
    const position = boardLayout().evidence[evidenceItem.id];
    const openedCount = caseState.opened.filter(function matchEvidence(entry) { return entry.evidenceId === evidenceItem.id; }).length;
    return '<button class="board-evidence-node' + (openedCount ? ' revealed' : '') + '" style="left:' + position.left + 'px;top:' + position.top + 'px" type="button" data-board-evidence-id="' + escapeAttribute(evidenceItem.id) + '" aria-label="เปิดหลักฐาน ' + escapeAttribute(evidenceItem.title) + '">' +
      '<span class="board-pin dark" aria-hidden="true"></span><img src="' + escapeAttribute(evidenceItem.image) + '" alt="" loading="lazy" /><span class="board-evidence-copy"><strong>' + escapeHtml(evidenceItem.title) + '</strong><small>' + (openedCount ? 'เปิดแล้ว ' + openedCount + '/' + evidenceItem.hotspots.length : 'ยังไม่ตรวจ') + '</small></span>' +
    '</button>';
  }

  function portraitPosition(index) {
    const count = caseData.suspectProfiles.length;
    if (count <= 1) return 0;
    return Math.round((index / (count - 1)) * 10000) / 100;
  }

  function deductionStatusLabel(status) {
    return { unknown: 'ยังไม่แน่ใจ', watch: 'ต้องจับตา', prime: 'ผู้ต้องสงสัยหลัก', cleared: 'ตัดออก' }[status] || 'ยังไม่แน่ใจ';
  }

  function renderStatusOptions(selected) {
    const statuses = [
      ['unknown', 'ยังไม่แน่ใจ'],
      ['watch', 'ต้องจับตา'],
      ['prime', 'ผู้ต้องสงสัยหลัก'],
      ['cleared', 'ตัดออก']
    ];
    return statuses.map(function option(item) {
      return '<option value="' + item[0] + '"' + (selected === item[0] ? ' selected' : '') + '>' + item[1] + '</option>';
    }).join('');
  }

  function inspectHotspot(evidenceId, hotspotId) {
    const profile = getActiveProfile();
    if (!profile || !profile.activeCase) return;
    const caseState = profile.activeCase;
    const hotspot = Cases.getHotspotById(caseData, evidenceId, hotspotId);
    if (!hotspot) return;

    const existing = caseState.opened.find(function findOpened(entry) {
      return entry.evidenceId === evidenceId && entry.hotspotId === hotspotId;
    });
    if (existing) {
      selectedResultKey = evidenceId + ':' + hotspotId;
      caseState.selectedEvidenceId = evidenceId;
      renderInvestigation();
      focusOpenedResult();
      return;
    }
    if (caseState.actionsLeft <= 0) {
      showToast('แอ็กชันหมดแล้ว กรุณาทบทวนหลักฐานและสรุปคดี', 'error');
      return;
    }

    const missing = missingRequirementsFor(caseState, evidenceId, hotspotId);
    if (missing.length) {
      // A locked lead never costs an action — the player just learns what to open first.
      showToast('จุดนี้ยังเปิดไม่ได้ · ' + lockedHintFor(caseOf(caseState), evidenceId, hotspotId, missing), 'error', 6000);
      return;
    }

    const previousProfile = cloneData(profile);
    caseState.actionsLeft -= 1;
    caseState.opened.push({ evidenceId: evidenceId, hotspotId: hotspotId, openedAt: new Date().toISOString() });
    caseState.selectedEvidenceId = evidenceId;
    caseState.updatedAt = new Date().toISOString();
    profile.lastPlayedAt = caseState.updatedAt;
    profile.updatedAt = caseState.updatedAt;
    selectedResultKey = evidenceId + ':' + hotspotId;
    if (!saveStore()) {
      store.profiles[activeProfileId] = previousProfile;
      renderInvestigation();
      showToast('ยังไม่ใช้แอ็กชัน เพราะบันทึกเบาะแสนี้ไม่สำเร็จ', 'error', 5000);
      return;
    }
    renderInvestigation();
    showToast('เปิดเบาะแสแล้ว · เหลือ ' + caseState.actionsLeft + ' แอ็กชัน');
    focusOpenedResult();
  }

  function focusOpenedResult() {
    window.setTimeout(function focusResult() {
      const result = document.getElementById('opened-result');
      if (result) result.focus({ preventScroll: false });
    }, 20);
  }

  function findSelectedResult(caseState, evidenceId) {
    if (!selectedResultKey) return null;
    const parts = selectedResultKey.split(':');
    if (parts[0] !== evidenceId) return null;
    return caseState.opened.find(function matchResult(entry) {
      return entry.evidenceId === parts[0] && entry.hotspotId === parts[1];
    }) || null;
  }

  function isHotspotOpened(caseState, evidenceId, hotspotId) {
    return caseState.opened.some(function matchOpened(entry) {
      return entry.evidenceId === evidenceId && entry.hotspotId === hotspotId;
    });
  }

  function updateDeduction(suspectName, field, value) {
    const profile = getActiveProfile();
    if (!profile || !profile.activeCase || !caseData.suspects.includes(suspectName)) return;
    const previousProfile = cloneData(profile);
    const record = profile.activeCase.deductions[suspectName] || { status: 'unknown', notes: '' };
    if (field === 'status') record.status = ['unknown', 'watch', 'prime', 'cleared'].includes(value) ? value : 'unknown';
    if (field === 'notes') record.notes = String(value).slice(0, 2000);
    profile.activeCase.deductions[suspectName] = record;
    profile.activeCase.updatedAt = new Date().toISOString();
    profile.updatedAt = profile.activeCase.updatedAt;
    if (!saveStore({ silent: true })) {
      store.profiles[activeProfileId] = previousProfile;
      render();
      showToast('ไม่แก้กระดานอนุมาน เพราะบันทึกไม่สำเร็จ', 'error', 5000);
      return;
    }
    if (view === 'board' && field === 'status') {
      updateBoardSuspectStatus(suspectName, record.status);
    }
  }

  function updateBoardSuspectStatus(suspectName, status) {
    const suspect = caseData.suspectProfiles.find(function findSuspectProfile(item) { return item.name === suspectName; });
    if (!suspect) return;
    const node = document.querySelector('[data-board-suspect-id="' + suspect.id + '"]');
    if (!node) return;
    node.classList.remove('status-unknown', 'status-watch', 'status-prime', 'status-cleared');
    node.classList.add('status-' + status);
    const label = node.querySelector('.board-status-label');
    if (label) label.textContent = deductionStatusLabel(status);
  }

  function openAccusation() {
    const profile = getActiveProfile();
    if (!profile || !profile.activeCase) return;
    modalReturnFocus = document.activeElement;
    const primeSuspect = caseData.suspects.find(function findPrime(name) {
      const item = profile.activeCase.deductions[name];
      return item && item.status === 'prime';
    }) || '';
    modalRoot.innerHTML =
      '<div class="modal-backdrop" data-modal-backdrop>' +
        '<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="accusation-title">' +
          '<header class="modal-header"><div><span class="section-kicker">Final accusation</span><h2 id="accusation-title">สรุปคดีของคุณ</h2></div><button class="modal-close" type="button" data-action="close-modal" aria-label="ปิดหน้าต่าง">×</button></header>' +
          '<div class="modal-body"><p class="modal-intro">ระบุองค์ประกอบทั้งสี่ของคดีให้ครบ คะแนนคำตอบรวม 100 และมีโบนัสจากแอ็กชันที่เหลือ</p>' +
            (caseData.warning ? '<p class="modal-caution">' + escapeHtml(caseData.warning) + '</p>' : '') +
            '<form id="accusation-form">' +
              '<div class="accusation-grid">' +
                renderAccusationField('killer', 'ใครคือฆาตกร?', renderSimpleOptions(caseData.suspects, primeSuspect)) +
                renderAccusationField('method', 'วิธีสังหาร', renderObjectOptions(caseData.methods)) +
                renderAccusationField('location', 'สถานที่ลงมือ', renderSimpleOptions(caseData.locations)) +
                renderAccusationField('motive', 'แรงจูงใจ', renderObjectOptions(caseData.motives)) +
              '</div>' +
              '<p class="modal-warning">คำกล่าวหาจะปิดคดีทันทีและแก้ไขไม่ได้ ผลลัพธ์จะถูกบันทึกในประวัติของโปรไฟล์นี้</p>' +
              '<div class="modal-actions"><button class="button button-secondary" type="button" data-action="close-modal">กลับไปตรวจหลักฐาน</button><button class="button button-danger" type="submit">ส่งคำกล่าวหา</button></div>' +
            '</form>' +
          '</div>' +
        '</section>' +
      '</div>';
    lockPageForModal(true);
    focusFirstModalControl();
  }

  function renderAccusationField(name, label, options) {
    return '<div class="accusation-field"><label for="accusation-' + name + '">' + escapeHtml(label) + '</label><select class="select-input" id="accusation-' + name + '" name="' + name + '" required><option value="">— เลือกคำตอบ —</option>' + options + '</select></div>';
  }

  function renderSimpleOptions(items, selected) {
    return items.map(function simpleOption(item) {
      return '<option value="' + escapeAttribute(item) + '"' + (item === selected ? ' selected' : '') + '>' + escapeHtml(item) + '</option>';
    }).join('');
  }

  function renderObjectOptions(items) {
    return items.map(function objectOption(item) {
      return '<option value="' + escapeAttribute(item.value) + '">' + escapeHtml(item.label) + '</option>';
    }).join('');
  }

  function submitAccusation(form) {
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const accusation = {
      killer: String(data.get('killer') || ''),
      method: String(data.get('method') || ''),
      location: String(data.get('location') || ''),
      motive: String(data.get('motive') || '')
    };
    const confirmed = window.confirm('ส่งคำกล่าวหานี้และปิดคดีหรือไม่? หลังส่งแล้วจะย้อนกลับมาแก้คำตอบไม่ได้');
    if (!confirmed) return;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    finalizeCase(accusation);
  }

  function finalizeCase(accusation) {
    const profile = getActiveProfile();
    if (!profile || !profile.activeCase) return;
    const previousProfile = cloneData(profile);
    const stateSnapshot = profile.activeCase;
    const scored = scoreAccusation(accusation, stateSnapshot);
    const completedAt = new Date().toISOString();
    const result = {
      id: 'result-' + Date.now().toString(36),
      caseId: caseData.id,
      caseTitle: caseData.title,
      completedAt: completedAt,
      accusation: accusation,
      score: scored.score,
      rank: scored.rank,
      breakdown: scored.breakdown,
      correct: scored.correct,
      actionsLeft: stateSnapshot.actionsLeft,
      openedCount: stateSnapshot.opened.length,
      investigation: {
        startedAt: stateSnapshot.startedAt,
        completedAt: completedAt,
        actionsLeft: stateSnapshot.actionsLeft,
        opened: stateSnapshot.opened.map(function preserveOpened(entry) {
          return {
            evidenceId: entry.evidenceId,
            hotspotId: entry.hotspotId,
            openedAt: entry.openedAt
          };
        }),
        deductions: JSON.parse(JSON.stringify(stateSnapshot.deductions))
      }
    };
    profile.history.unshift(result);
    profile.activeCase = null;
    profile.updatedAt = completedAt;
    profile.lastPlayedAt = completedAt;
    profile.stats = calculateStats(profile.history);
    if (!saveStore()) {
      store.profiles[activeProfileId] = previousProfile;
      const submitButton = modalRoot.querySelector('#accusation-form [type="submit"]');
      if (submitButton) submitButton.disabled = false;
      showToast('ยังไม่ปิดคดี เพราะบันทึกผลลัพธ์ไม่สำเร็จ กรุณาลองอีกครั้ง', 'error', 6000);
      return;
    }
    showResult(result);
  }

  function scoreAccusation(accusation, caseState) {
    if (Game && typeof Game.scoreAccusation === 'function') {
      const openedResults = caseState.opened.map(function toCoreNotebookEntry(entry) {
        const hotspot = Cases.getHotspotById(caseData, entry.evidenceId, entry.hotspotId);
        return hotspot ? { category: hotspot.category } : null;
      }).filter(Boolean);
      const coreResult = Game.scoreAccusation(caseData.id, accusation, {
        actionsLeft: caseState.actionsLeft,
        openedResults: openedResults
      });
      return {
        score: coreResult.score,
        rank: coreResult.rank,
        correct: {
          killer: coreResult.answers.killer.correct,
          method: coreResult.answers.method.correct,
          location: coreResult.answers.location.correct,
          motive: coreResult.answers.motive.correct
        },
        breakdown: {
          killer: coreResult.breakdown.killer,
          method: coreResult.breakdown.method,
          location: coreResult.breakdown.location,
          motive: coreResult.breakdown.motive,
          actionBonus: coreResult.actionBonus,
          criticalBonus: coreResult.criticalClueBonus,
          redHerringPenalty: coreResult.redHerringPenalty
        }
      };
    }

    const correct = {
      killer: accusation.killer === caseData.solution.killer,
      method: accusation.method === caseData.solution.method,
      location: accusation.location === caseData.solution.location,
      motive: accusation.motive === caseData.solution.motive
    };
    const points = caseData.scoring.answerPoints;
    const answerScore = Object.keys(correct).reduce(function totalAnswers(total, key) {
      return total + (correct[key] ? points[key] : 0);
    }, 0);
    const actionBonus = Math.min(caseData.scoring.actionBonusMax, Math.max(0, caseState.actionsLeft));
    let criticalCount = 0;
    let redHerringCount = 0;
    caseState.opened.forEach(function countCategories(entry) {
      const hotspot = Cases.getHotspotById(caseData, entry.evidenceId, entry.hotspotId);
      if (!hotspot) return;
      if (hotspot.category === 'critical') criticalCount += 1;
      if (hotspot.category === 'red_herring') redHerringCount += 1;
    });
    const criticalBonus = Math.min(caseData.scoring.criticalClueBonus.max, criticalCount * caseData.scoring.criticalClueBonus.perClue);
    const redHerringPenalty = Math.min(caseData.scoring.redHerringPenalty.max, redHerringCount * caseData.scoring.redHerringPenalty.perClue);
    const score = Math.max(0, answerScore + actionBonus + criticalBonus - redHerringPenalty);
    return {
      score: score,
      rank: getRank(score),
      correct: correct,
      breakdown: {
        killer: correct.killer ? points.killer : 0,
        method: correct.method ? points.method : 0,
        location: correct.location ? points.location : 0,
        motive: correct.motive ? points.motive : 0,
        actionBonus: actionBonus,
        criticalBonus: criticalBonus,
        redHerringPenalty: redHerringPenalty
      }
    };
  }

  function showResult(result) {
    const allCorrect = Object.values(result.correct).every(Boolean);
    const labels = {
      killer: { title: 'ฆาตกร', player: result.accusation.killer, answer: caseData.solutionLabels.killer },
      method: { title: 'วิธีสังหาร', player: findOptionLabel(caseData.methods, result.accusation.method), answer: caseData.solutionLabels.method },
      location: { title: 'สถานที่', player: result.accusation.location, answer: caseData.solutionLabels.location },
      motive: { title: 'แรงจูงใจ', player: findOptionLabel(caseData.motives, result.accusation.motive), answer: caseData.solutionLabels.motive }
    };
    const rows = Object.keys(labels).map(function answerRow(key) {
      const label = labels[key];
      const isCorrect = result.correct[key];
      return '<tr><td>' + escapeHtml(label.title) + '</td><td>' + escapeHtml(label.player || '—') + '</td><td>' + escapeHtml(label.answer) + '</td><td class="answer-status ' + (isCorrect ? 'correct' : 'incorrect') + '">' + (isCorrect ? 'ถูก ✓' : 'ผิด ✕') + '</td></tr>';
    }).join('');
    modalRoot.innerHTML =
      '<div class="modal-backdrop">' +
        '<section class="modal-card result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title">' +
          '<header class="modal-header"><div><span class="section-kicker">Case closed · ' + escapeHtml(formatDate(result.completedAt)) + '</span><h2 id="result-title">ผลการสรุปคดี</h2></div></header>' +
          '<div class="modal-body">' +
            '<div class="result-hero"><div class="score-seal"><div><strong>' + result.score + '</strong><small>POINTS</small></div></div><div><p class="result-rank">' + escapeHtml(result.rank) + '</p><p class="result-summary">' + (allCorrect ? 'คุณเชื่อมโยงองค์ประกอบหลักของคดีได้ครบถ้วน' : 'บางส่วนของทฤษฎียังไม่ตรงกับข้อเท็จจริงในแฟ้มคดี') + '</p></div></div>' +
            '<div class="table-scroll"><table class="answer-table"><thead><tr><th>หัวข้อ</th><th>คำตอบของคุณ</th><th>เฉลย</th><th>ผล</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
            '<div class="score-breakdown" aria-label="รายละเอียดคะแนน">' +
              renderScoreChip('ฆาตกร', result.breakdown.killer) + renderScoreChip('วิธี', result.breakdown.method) + renderScoreChip('สถานที่', result.breakdown.location) + renderScoreChip('แรงจูงใจ', result.breakdown.motive) +
              renderScoreChip('แอ็กชัน', result.breakdown.actionBonus, '+') + renderScoreChip('หลักฐานชี้ขาด', result.breakdown.criticalBonus, '+') + renderScoreChip('ข้อมูลชวนหลงทาง', result.breakdown.redHerringPenalty, '−') +
            '</div>' +
            '<div class="opened-result" data-category="critical"><div class="result-meta"><span class="category-badge">บทสรุปคดี</span></div><p style="margin-top:10px">' + escapeHtml(caseData.solutionExplanation) + '</p></div>' +
            '<div class="modal-actions">' +
              '<button class="button button-secondary" type="button" data-action="result-dashboard">กลับแดชบอร์ด</button>' +
              (allCases.length > 1 ? '<button class="button button-secondary" type="button" data-action="case-select">เลือกคดีอื่น</button>' : '') +
              '<button class="button button-primary" type="button" data-action="result-restart" data-case-id="' + escapeAttribute(result.caseId || caseData.id) + '">สืบสวนคดีนี้อีกครั้ง</button>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';
    lockPageForModal(true);
    const first = modalRoot.querySelector('button');
    if (first) first.focus();
  }

  function renderScoreChip(label, value, sign) {
    const prefix = sign || '';
    return '<span class="score-chip">' + escapeHtml(label) + ' <strong>' + prefix + escapeHtml(String(value)) + '</strong></span>';
  }

  function closeModal() {
    if (!modalRoot.innerHTML) return;
    modalRoot.innerHTML = '';
    lockPageForModal(false);
    if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  function lockPageForModal(locked) {
    document.body.style.overflow = locked ? 'hidden' : '';
    appRoot.setAttribute('aria-hidden', locked ? 'true' : 'false');
    siteHeader.setAttribute('aria-hidden', locked ? 'true' : 'false');
    appRoot.inert = locked;
    siteHeader.inert = locked;
  }

  function focusFirstModalControl() {
    window.setTimeout(function focusModal() {
      const control = modalRoot.querySelector('button, select, input, textarea');
      if (control) control.focus();
    }, 10);
  }

  function focusEvidenceControl(evidenceId) {
    window.setTimeout(function restoreEvidenceFocus() {
      const buttons = Array.from(document.querySelectorAll('.evidence-item[data-evidence-id]'));
      const button = buttons.find(function matchEvidenceButton(item) {
        return item.dataset.evidenceId === evidenceId;
      });
      if (button) button.focus({ preventScroll: true });
    }, 10);
  }

  function focusEvidenceStage() {
    window.setTimeout(function focusStageAfterRender() {
      const stage = document.getElementById('evidence-photo-stage');
      if (stage) stage.focus({ preventScroll: false });
    }, 20);
  }

  function focusCaseSelectHeading() {
    window.setTimeout(function focusAfterRender() {
      const heading = document.getElementById('case-select-title');
      if (heading) heading.focus({ preventScroll: true });
    }, 20);
  }

  function focusBoardHeading() {
    window.setTimeout(function focusBoardAfterRender() {
      const heading = document.getElementById('board-title');
      if (heading) heading.focus({ preventScroll: true });
    }, 20);
  }

  function focusSideTab(tabName) {
    window.setTimeout(function restoreTabFocus() {
      const tab = document.getElementById(tabName + '-tab');
      if (tab) tab.focus({ preventScroll: true });
    }, 10);
  }

  function resetCorruptStorage() {
    if (!recoveryIssue || recoveryIssue.kind !== 'corrupt') return;
    const hasBackup = Boolean(recoveryIssue.backupKey);
    const confirmed = window.confirm(hasBackup
      ? 'เริ่มพื้นที่บันทึกใหม่หรือไม่? ข้อมูลที่อ่านไม่ได้ถูกเก็บเป็นสำเนากู้คืนแล้ว แต่โปรไฟล์เดิมจะยังไม่กลับมาในเกม'
      : 'ลบข้อมูลบันทึกที่อ่านไม่ได้และเริ่มใหม่หรือไม่? การกระทำนี้ย้อนกลับไม่ได้ เพราะเบราว์เซอร์ไม่สามารถสร้างสำเนากู้คืนได้');
    if (!confirmed) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      recoveryIssue = null;
      storageError = null;
      store = emptyStore();
      if (!saveStore({ silent: true })) {
        recoveryIssue = { kind: 'unavailable', backupKey: null, message: 'storage unavailable' };
      }
    } catch (error) {
      recoveryIssue = { kind: 'unavailable', backupKey: null, message: error.message };
    }
    render();
    if (!recoveryIssue) showToast('พร้อมสร้างแฟ้มสายสืบใหม่แล้ว');
  }

  function retryStorage() {
    recoveryIssue = null;
    storageError = null;
    store = loadStore();
    render();
    if (!recoveryIssue) showToast('localStorage กลับมาใช้งานได้แล้ว');
  }

  function trapModalFocus(event) {
    if (event.key !== 'Tab' || !modalRoot.innerHTML) return;
    const controls = Array.from(modalRoot.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function calculateStats(history) {
    const safeHistory = Array.isArray(history) ? history : [];
    const scores = safeHistory.map(function getScore(item) { return Number(item.score) || 0; });
    const bestScore = scores.length ? Math.max.apply(null, scores) : 0;
    const bestResult = safeHistory.find(function findBest(item) { return Number(item.score) === bestScore; });
    return {
      casesPlayed: safeHistory.length,
      casesSolved: safeHistory.filter(function countSolved(item) { return Number(item.score) >= 75; }).length,
      bestScore: bestScore,
      bestRank: bestResult ? bestResult.rank || getRank(bestScore) : '',
      totalScore: scores.reduce(function totalScore(total, score) { return total + score; }, 0),
      perfectCases: safeHistory.filter(function countPerfect(item) { return Number(item.score) >= 95; }).length
    };
  }

  function getRank(score) {
    if (score >= 95) return 'Perfect';
    if (score >= 75) return 'Solved';
    if (score >= 45) return 'Partial';
    return 'Failed';
  }

  function categoryLabel(category) {
    return {
      critical: 'หลักฐานชี้ขาด',
      useful: 'ข้อมูลเชื่อมโยง',
      red_herring: 'ข้อมูลยังไม่ยืนยัน',
      flavor: 'รายละเอียดประกอบ'
    }[category] || 'บันทึกหลักฐาน';
  }

  function findOptionLabel(items, value) {
    const option = items.find(function findItem(item) { return item.value === value; });
    return option ? option.label : value;
  }

  function initialOf(name) {
    return Array.from(String(name || '?'))[0] || '?';
  }

  function padEvidenceNumber(number) {
    return String(number).padStart(2, '0');
  }

  function formatDate(isoDate) {
    if (!isoDate) return 'ไม่ทราบเวลา';
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'ไม่ทราบเวลา';
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function showToast(message, type, duration) {
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' ' + type : '');
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    toastRegion.appendChild(toast);
    window.setTimeout(function removeToast() { toast.remove(); }, duration || 3000);
  }

  appRoot.addEventListener('submit', function handleSubmit(event) {
    if (event.target.id === 'profile-form') {
      event.preventDefault();
      const error = document.getElementById('profile-error');
      try {
        createOrLoadProfile(event.target.elements.detectiveName.value);
      } catch (problem) {
        error.textContent = problem.message;
        error.hidden = false;
        event.target.elements.detectiveName.focus();
      }
    }
  });

  document.addEventListener('click', function handleClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === 'switch-profile') leaveProfile();
      if (action === 'dashboard') navigate('dashboard');
      if (action === 'case-select') {
        closeModal();
        navigate('case-select');
        focusCaseSelectHeading();
      }
      if (action === 'open-board') {
        navigate('board');
        focusBoardHeading();
      }
      if (action === 'back-investigation') {
        navigate('investigation');
        focusEvidenceStage();
      }
      if (action === 'reset-corrupt-storage') resetCorruptStorage();
      if (action === 'retry-storage') retryStorage();
      const requestedCaseId = actionButton.dataset.caseId || '';
      if (action === 'start-case') {
        const profile = getActiveProfile();
        startCase(requestedCaseId, Boolean(profile && !profile.activeCase));
      }
      if (action === 'restart-case') startCase(requestedCaseId, false);
      if (action === 'continue-case') continueCase();
      if (action === 'open-accusation') openAccusation();
      if (action === 'close-modal') closeModal();
      if (action === 'result-dashboard') {
        closeModal();
        navigate('dashboard');
      }
      if (action === 'result-restart') {
        closeModal();
        startCase(requestedCaseId || caseData.id, true);
      }
      return;
    }

    const profileButton = event.target.closest('[data-profile-id]');
    if (profileButton) {
      enterProfile(profileButton.dataset.profileId);
      return;
    }

    const boardEvidenceButton = event.target.closest('[data-board-evidence-id]');
    if (boardEvidenceButton && view === 'board') {
      const profile = getActiveProfile();
      const previousProfile = cloneData(profile);
      profile.activeCase.selectedEvidenceId = boardEvidenceButton.dataset.boardEvidenceId;
      profile.activeCase.updatedAt = new Date().toISOString();
      if (!saveStore({ silent: true })) {
        store.profiles[activeProfileId] = previousProfile;
        showToast('เปิดหลักฐานนี้ไม่ได้ เพราะบันทึกสถานะไม่สำเร็จ', 'error', 5000);
        return;
      }
      selectedResultKey = null;
      navigate('investigation');
      focusEvidenceStage();
      return;
    }

    const evidenceButton = event.target.closest('[data-evidence-id]:not([data-hotspot-id])');
    if (evidenceButton && view === 'investigation') {
      const profile = getActiveProfile();
      const previousEvidenceId = profile.activeCase.selectedEvidenceId;
      const previousProfile = cloneData(profile);
      profile.activeCase.selectedEvidenceId = evidenceButton.dataset.evidenceId;
      profile.activeCase.updatedAt = new Date().toISOString();
      selectedResultKey = null;
      if (!saveStore({ silent: true })) {
        store.profiles[activeProfileId] = previousProfile;
        renderInvestigation();
        focusEvidenceControl(previousEvidenceId);
        showToast('เปลี่ยนหลักฐานไม่ได้ เพราะบันทึกสถานะไม่สำเร็จ', 'error', 5000);
        return;
      }
      renderInvestigation();
      focusEvidenceStage();
      return;
    }

    const hotspotButton = event.target.closest('[data-hotspot-id]');
    if (hotspotButton) {
      inspectHotspot(hotspotButton.dataset.evidenceId, hotspotButton.dataset.hotspotId);
      return;
    }

    const tabButton = event.target.closest('[data-side-tab]');
    if (tabButton) {
      sideTab = tabButton.dataset.sideTab;
      renderInvestigation();
      focusSideTab(sideTab);
    }
  });

  appRoot.addEventListener('change', function handleChange(event) {
    if (event.target.matches('[data-deduction-status]')) {
      updateDeduction(event.target.dataset.deductionStatus, 'status', event.target.value);
    }
  });

  appRoot.addEventListener('input', function handleInput(event) {
    if (event.target.matches('[data-deduction-notes]')) {
      updateDeduction(event.target.dataset.deductionNotes, 'notes', event.target.value);
    }
  });

  modalRoot.addEventListener('submit', function handleModalSubmit(event) {
    if (event.target.id === 'accusation-form') {
      event.preventDefault();
      submitAccusation(event.target);
    }
  });

  document.addEventListener('keydown', function handleKeyboard(event) {
    if (event.key === 'Escape' && modalRoot.querySelector('[data-action="close-modal"]')) closeModal();
    if (!modalRoot.innerHTML && event.target.matches && event.target.matches('[data-side-tab]') && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      sideTab = sideTab === 'notebook' ? 'deduction' : 'notebook';
      renderInvestigation();
      focusSideTab(sideTab);
    }
    trapModalFocus(event);
  });

  brandHome.addEventListener('click', function handleBrandHome() {
    if (getActiveProfile()) navigate('dashboard');
    else navigate('home');
  });

  window.addEventListener('storage', function handleStorage(event) {
    if (event.key !== STORAGE_KEY) return;
    store = loadStore();
    if (activeProfileId && !store.profiles[activeProfileId]) leaveProfile();
    else {
      showToast('อัปเดตข้อมูลล่าสุดจากอีกแท็บแล้ว');
      render();
    }
  });

  window.addEventListener('beforeunload', function flushPendingSave() {
    if (getActiveProfile()) saveStore({ silent: true });
  });

  render();
})();
