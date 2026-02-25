/* ═══════════════════════════════════════════════
   MBA-CET EXAMINATION SIMULATOR — app.js
   Pure vanilla JS. No frameworks. No dependencies.
   State persisted via localStorage.
   ═══════════════════════════════════════════════ */

'use strict';

/* ─── CONSTANTS ───────────────────────────────── */
const STORAGE_KEY_CONFIG  = 'mbacet_config';
const STORAGE_KEY_STATE   = 'mbacet_state';
const WARN_MINUTES        = 15;
const CRITICAL_MINUTES    = 5;
const OPTION_LABELS       = ['A', 'B', 'C', 'D', 'E'];

/* ─── APP STATE ───────────────────────────────── */
let config  = null;   // exam configuration
let state   = null;   // live exam state
let timerInterval = null;

/* ─── DOM REFS ────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════
   SETUP SCREEN
   ═══════════════════════════════════════════════ */
let sectionCount = 1;

function removeSection(idx) {
  const el = document.querySelector(`.section-row[data-idx="${idx}"]`);
  if (el) el.remove();
}

function addSection() {
  const container = $('sectionInputs');
  const row = document.createElement('div');
  row.className = 'section-row';
  row.dataset.idx = sectionCount;
  row.innerHTML = `
    <input type="text" class="form-input section-name" placeholder="Section name" />
    <input type="number" class="form-input section-count" placeholder="Questions" min="1" max="300" />
    <button type="button" class="btn-remove-section" onclick="removeSection(${sectionCount})">✕</button>
  `;
  container.appendChild(row);
  sectionCount++;
}

// attach add section
$('addSectionBtn').addEventListener('click', addSection);

// Restore session if in-progress exam exists
window.addEventListener('DOMContentLoaded', () => {
  const savedConfig = loadJSON(STORAGE_KEY_CONFIG);
  const savedState  = loadJSON(STORAGE_KEY_STATE);

  if (savedConfig && savedState && !savedState.submitted) {
    showModal(
      'RESUME EXAMINATION',
      `<p>An in-progress examination was found:</p>
       <br>
       <div class="modal-stat"><span class="modal-stat-label">Test</span><span class="modal-stat-val">${savedConfig.testName}</span></div>
       <div class="modal-stat"><span class="modal-stat-label">Progress</span><span class="modal-stat-val">${countAnswered(savedState)} / ${savedConfig.totalQuestions} answered</span></div>
       <br>
       <p>Would you like to resume this session?</p>`,
      [
        { label: 'RESUME', className: 'btn-modal btn-modal-confirm', action: () => { resumeExam(savedConfig, savedState); closeModal(); } },
        { label: 'NEW TEST', className: 'btn-modal btn-modal-cancel', action: () => { clearStorage(); closeModal(); } }
      ]
    );
  }
});

// Form submit → start exam
$('setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const testName       = $('testName').value.trim() || 'MBA-CET Examination';
  const candidateName  = $('candidateName').value.trim() || 'Candidate';
  const totalQuestions = parseInt($('totalQuestions').value) || 200;
  const duration       = parseInt($('duration').value) || 150;
  const optionsCount   = parseInt($('optionsCount').value) || 5;

  // Parse sections
  const sectionRows = document.querySelectorAll('.section-row');
  let sections = [];
  let runningQ = 1;
  sectionRows.forEach(row => {
    const nameEl  = row.querySelector('.section-name');
    const countEl = row.querySelector('.section-count');
    if (nameEl && nameEl.value.trim() && countEl && countEl.value) {
      const cnt = parseInt(countEl.value);
      if (cnt > 0) {
        sections.push({
          name:  nameEl.value.trim(),
          count: cnt,
          start: runningQ,
          end:   runningQ + cnt - 1
        });
        runningQ += cnt;
      }
    }
  });

  // Validate sections don't exceed total
  const sectionTotal = sections.reduce((s, sec) => s + sec.count, 0);
  if (sections.length > 0 && sectionTotal !== totalQuestions) {
    alert(`⚠ Section totals (${sectionTotal}) must equal Total Questions (${totalQuestions}).\nPlease adjust and try again.`);
    return;
  }

  config = { testName, candidateName, totalQuestions, duration, optionsCount, sections };
  state  = buildFreshState(totalQuestions, duration);

  saveJSON(STORAGE_KEY_CONFIG, config);
  saveJSON(STORAGE_KEY_STATE, state);

  startExam();
});

function buildFreshState(totalQ, durationMin) {
  const answers  = {};
  const marked   = {};
  const visited  = {};
  for (let i = 1; i <= totalQ; i++) {
    answers[i]  = null;
    marked[i]   = false;
    visited[i]  = false;
  }
  return {
    answers,
    marked,
    visited,
    currentQuestion: 1,
    startTime: Date.now(),
    durationMs: durationMin * 60 * 1000,
    submitted: false
  };
}

/* ═══════════════════════════════════════════════
   EXAM STARTUP
   ═══════════════════════════════════════════════ */
function startExam() {
  populateExamUI();
  showScreen('exam');
  goToQuestion(state.currentQuestion);
  startTimer();
  requestFullscreen();
  setupExitGuard();
}

function resumeExam(savedConfig, savedState) {
  config = savedConfig;
  state  = savedState;
  populateExamUI();
  showScreen('exam');
  goToQuestion(state.currentQuestion);
  startTimer();
  requestFullscreen();
  setupExitGuard();
}

function populateExamUI() {
  $('examTestName').textContent      = config.testName;
  $('examCandidateName').textContent = config.candidateName;

  buildPalette();
  buildSectionTabs();
}

/* ═══════════════════════════════════════════════
   TIMER
   ═══════════════════════════════════════════════ */
function startTimer() {
  clearInterval(timerInterval);
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    updateTimerDisplay();
  }, 1000);
}

function getRemainingMs() {
  const elapsed = Date.now() - state.startTime;
  return Math.max(0, state.durationMs - elapsed);
}

function updateTimerDisplay() {
  const ms = getRemainingMs();
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const display = `${pad(h)}:${pad(m)}:${pad(s)}`;

  const el = $('timerDisplay');
  el.textContent = display;

  const minLeft = Math.floor(totalSec / 60);
  el.classList.remove('warn', 'critical');
  if (minLeft <= CRITICAL_MINUTES) {
    el.classList.add('critical');
  } else if (minLeft <= WARN_MINUTES) {
    el.classList.add('warn');
    showTimeWarning(minLeft);
  }

  if (ms <= 0) {
    clearInterval(timerInterval);
    autoSubmit();
  }
}

let warnShown15 = false;
let warnShown5  = false;
function showTimeWarning(minLeft) {
  if (minLeft <= 5 && !warnShown5) {
    warnShown5 = true;
    $('timeWarningText').textContent = '5';
    $('timeWarningBanner').classList.remove('hidden');
    setTimeout(() => $('timeWarningBanner').classList.add('hidden'), 8000);
  } else if (minLeft <= 15 && !warnShown15) {
    warnShown15 = true;
    $('timeWarningText').textContent = '15';
    $('timeWarningBanner').classList.remove('hidden');
    setTimeout(() => $('timeWarningBanner').classList.add('hidden'), 8000);
  }
}

function pad(n) { return String(n).padStart(2, '0'); }

/* ═══════════════════════════════════════════════
   QUESTION NAVIGATION
   ═══════════════════════════════════════════════ */
function goToQuestion(num) {
  if (num < 1 || num > config.totalQuestions) return;

  // Mark current as visited
  state.visited[num] = true;
  state.currentQuestion = num;

  renderQuestion(num);
  updatePalette();
  updateStats();
  persistState();
}

function renderQuestion(num) {
  $('qNumDisplay').textContent = num;
  $('qRefNum').textContent     = num;

  // Section tag
  const sec = getSectionForQ(num);
  const sectionTag = $('qSectionTag');
  if (sec) {
    sectionTag.textContent = sec.name;
    sectionTag.style.display = 'inline-block';
  } else {
    sectionTag.style.display = 'none';
  }

  // Status flags
  const flagsEl = $('qStatusFlags');
  flagsEl.innerHTML = '';
  if (state.answers[num] !== null) {
    flagsEl.innerHTML += `<span class="q-flag flag-answered">ANSWERED</span>`;
  }
  if (state.marked[num]) {
    flagsEl.innerHTML += `<span class="q-flag flag-marked">MARKED FOR REVIEW</span>`;
  }

  // Options
  renderOptions(num);

  // Buttons
  $('prevBtn').disabled = num === 1;
  $('nextBtn').disabled = num === config.totalQuestions;

  // Mark button visual state
  const markBtn = $('markBtn');
  if (state.marked[num]) {
    markBtn.classList.add('active');
    markBtn.textContent = 'UNMARK REVIEW';
  } else {
    markBtn.classList.remove('active');
    markBtn.textContent = 'MARK FOR REVIEW';
  }

  // Highlight palette
  const all = document.querySelectorAll('.palette-btn');
  all.forEach(b => {
    b.classList.toggle('current', parseInt(b.dataset.q) === num);
  });

  // Scroll palette btn into view
  const curBtn = document.querySelector(`.palette-btn[data-q="${num}"]`);
  if (curBtn) curBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function renderOptions(qNum) {
  const container = $('optionsContainer');
  container.innerHTML = '';
  const selected = state.answers[qNum];

  for (let i = 0; i < config.optionsCount; i++) {
    const label = OPTION_LABELS[i];
    const isSelected = selected === i;
    const row = document.createElement('div');
    row.className = `option-row${isSelected ? ' selected' : ''}`;
    row.dataset.optIdx = i;
    row.setAttribute('role', 'radio');
    row.setAttribute('aria-checked', isSelected);
    row.tabIndex = 0;

    row.innerHTML = `
      <div class="option-radio"></div>
      <span class="option-letter">${label}.</span>
      <span class="option-text">Option ${label}</span>
    `;

    row.addEventListener('click', () => selectOption(qNum, i));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectOption(qNum, i);
      }
    });

    container.appendChild(row);
  }
}

function selectOption(qNum, optIdx) {
  // Toggle (click again to deselect)
  if (state.answers[qNum] === optIdx) {
    state.answers[qNum] = null;
  } else {
    state.answers[qNum] = optIdx;
  }
  renderOptions(qNum);
  refreshStatusFlags(qNum);
  updatePalette();
  updateStats();
  persistState();
}

function refreshStatusFlags(qNum) {
  const flagsEl = $('qStatusFlags');
  flagsEl.innerHTML = '';
  if (state.answers[qNum] !== null) {
    flagsEl.innerHTML += `<span class="q-flag flag-answered">ANSWERED</span>`;
  }
  if (state.marked[qNum]) {
    flagsEl.innerHTML += `<span class="q-flag flag-marked">MARKED FOR REVIEW</span>`;
  }
}

/* ─── CONTROL BUTTONS ─────────────────────────── */
$('prevBtn').addEventListener('click', () => {
  if (state.currentQuestion > 1) goToQuestion(state.currentQuestion - 1);
});

$('nextBtn').addEventListener('click', () => {
  if (state.currentQuestion < config.totalQuestions) goToQuestion(state.currentQuestion + 1);
});

$('markBtn').addEventListener('click', () => {
  const q = state.currentQuestion;
  state.marked[q] = !state.marked[q];
  const btn = $('markBtn');
  if (state.marked[q]) {
    btn.classList.add('active');
    btn.textContent = 'UNMARK REVIEW';
  } else {
    btn.classList.remove('active');
    btn.textContent = 'MARK FOR REVIEW';
  }
  refreshStatusFlags(q);
  updatePalette();
  updateStats();
  persistState();
});

$('clearBtn').addEventListener('click', () => {
  const q = state.currentQuestion;
  if (state.answers[q] === null && !state.marked[q]) return;
  state.answers[q] = null;
  state.marked[q]  = false;
  renderOptions(q);
  refreshStatusFlags(q);
  const btn = $('markBtn');
  btn.classList.remove('active');
  btn.textContent = 'MARK FOR REVIEW';
  updatePalette();
  updateStats();
  persistState();
});

/* Keyboard navigation */
document.addEventListener('keydown', (e) => {
  if (!$('screen-exam').classList.contains('active')) return;
  if ($('modalOverlay').classList.contains('active')) return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (state.currentQuestion < config.totalQuestions) goToQuestion(state.currentQuestion + 1);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (state.currentQuestion > 1) goToQuestion(state.currentQuestion - 1);
  } else if (e.key >= '1' && e.key <= '5') {
    const idx = parseInt(e.key) - 1;
    if (idx < config.optionsCount) selectOption(state.currentQuestion, idx);
  }
});

/* ═══════════════════════════════════════════════
   PALETTE
   ═══════════════════════════════════════════════ */
function buildPalette() {
  const grid = $('paletteGrid');
  grid.innerHTML = '';

  for (let i = 1; i <= config.totalQuestions; i++) {
    const btn = document.createElement('button');
    btn.className = 'palette-btn p-not-visited';
    btn.textContent = i;
    btn.dataset.q = i;
    btn.title = `Question ${i}`;
    btn.setAttribute('aria-label', `Go to Question ${i}`);
    btn.addEventListener('click', () => goToQuestion(i));
    grid.appendChild(btn);
  }
}

function updatePalette() {
  const btns = document.querySelectorAll('.palette-btn');
  let answered = 0;
  btns.forEach(btn => {
    const q = parseInt(btn.dataset.q);
    const cls = getPaletteClass(q);
    btn.className = `palette-btn ${cls}${q === state.currentQuestion ? ' current' : ''}`;
    if (state.answers[q] !== null) answered++;
  });

  $('paletteCount').textContent = `${answered}/${config.totalQuestions}`;
}

function getPaletteClass(q) {
  const ans     = state.answers[q] !== null;
  const mark    = state.marked[q];
  const visited = state.visited[q];

  if (ans && mark) return 'p-answered-marked';
  if (ans)         return 'p-answered';
  if (mark)        return 'p-marked';
  if (visited)     return 'p-visited';
  return 'p-not-visited';
}

/* ─── SECTION TABS ────────────────────────────── */
function buildSectionTabs() {
  const tabsEl = $('sectionTabs');
  tabsEl.innerHTML = '';
  if (!config.sections || config.sections.length === 0) return;

  // Add "All" tab
  const allTab = document.createElement('div');
  allTab.className = 'section-tab active';
  allTab.textContent = 'ALL';
  allTab.dataset.section = 'all';
  allTab.addEventListener('click', () => filterPaletteBySection('all'));
  tabsEl.appendChild(allTab);

  config.sections.forEach(sec => {
    const tab = document.createElement('div');
    tab.className = 'section-tab';
    tab.textContent = sec.name;
    tab.title = `${sec.name} (Q${sec.start}–Q${sec.end})`;
    tab.dataset.section = sec.name;
    tab.addEventListener('click', () => filterPaletteBySection(sec.name));
    tabsEl.appendChild(tab);
  });
}

function filterPaletteBySection(sectionName) {
  // Update active tab
  document.querySelectorAll('.section-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.section === sectionName);
  });

  const btns = document.querySelectorAll('.palette-btn');
  btns.forEach(btn => {
    const q = parseInt(btn.dataset.q);
    if (sectionName === 'all') {
      btn.style.display = '';
    } else {
      const sec = config.sections.find(s => s.name === sectionName);
      btn.style.display = (sec && q >= sec.start && q <= sec.end) ? '' : 'none';
    }
  });
}

function getSectionForQ(q) {
  if (!config.sections || config.sections.length === 0) return null;
  return config.sections.find(s => q >= s.start && q <= s.end) || null;
}

/* ─── STATS ───────────────────────────────────── */
function updateStats() {
  let answered = 0, notAnswered = 0, marked = 0, notVisited = 0;
  for (let i = 1; i <= config.totalQuestions; i++) {
    if (state.answers[i] !== null) answered++;
    else notAnswered++;
    if (state.marked[i]) marked++;
    if (!state.visited[i]) notVisited++;
  }
  $('statAnswered').textContent   = answered;
  $('statUnanswered').textContent = notAnswered;
  $('statMarked').textContent     = marked;
  $('statNotVisited').textContent = notVisited;
}

/* ═══════════════════════════════════════════════
   SUBMISSION
   ═══════════════════════════════════════════════ */
$('submitExamBtn').addEventListener('click', () => confirmSubmit());

function confirmSubmit() {
  let answered = 0, notAnswered = 0, marked = 0;
  for (let i = 1; i <= config.totalQuestions; i++) {
    if (state.answers[i] !== null) answered++;
    else notAnswered++;
    if (state.marked[i]) marked++;
  }

  showModal(
    'CONFIRM TEST SUBMISSION',
    `<p style="margin-bottom:16px;">You are about to submit your examination. This action <strong>cannot be undone</strong>. Review the following summary before proceeding:</p>
     <div class="modal-stat"><span class="modal-stat-label">Total Questions</span><span class="modal-stat-val">${config.totalQuestions}</span></div>
     <div class="modal-stat"><span class="modal-stat-label">Answered</span><span class="modal-stat-val" style="color:var(--accent-green)">${answered}</span></div>
     <div class="modal-stat"><span class="modal-stat-label">Not Answered</span><span class="modal-stat-val">${notAnswered}</span></div>
     <div class="modal-stat"><span class="modal-stat-label">Marked for Review</span><span class="modal-stat-val" style="color:var(--accent-purple)">${marked}</span></div>
     <br><p style="color:#b01c1c;font-size:12px;">⚠ Once submitted, you cannot modify any response.</p>`,
    [
      { label: 'CANCEL', className: 'btn-modal btn-modal-cancel', action: closeModal },
      { label: 'SUBMIT TEST', className: 'btn-modal btn-modal-confirm', action: () => { closeModal(); submitExam(); } }
    ]
  );
}

function autoSubmit() {
  state.submitted = true;
  clearInterval(timerInterval);
  persistState();

  showModal(
    'TIME EXPIRED',
    '<p>The examination time has expired. Your responses have been automatically submitted.</p>',
    [
      { label: 'VIEW RESULTS', className: 'btn-modal btn-modal-confirm', action: () => { closeModal(); showResults(); } }
    ]
  );
}

function submitExam() {
  clearInterval(timerInterval);
  state.submitted = true;
  persistState();
  showResults();
}

/* ═══════════════════════════════════════════════
   RESULTS SCREEN
   ═══════════════════════════════════════════════ */
function showResults() {
  // Compute stats
  let answered = 0, notAnswered = 0, markedCount = 0, visitedCount = 0;
  for (let i = 1; i <= config.totalQuestions; i++) {
    if (state.answers[i] !== null) answered++;
    else notAnswered++;
    if (state.marked[i]) markedCount++;
    if (state.visited[i]) visitedCount++;
  }

  $('resultTestName').textContent  = config.testName;
  $('resultCandidate').textContent = `Candidate: ${config.candidateName}`;
  $('resultTimestamp').textContent = `Submitted: ${new Date().toLocaleString()}`;

  $('resTotalQ').textContent    = config.totalQuestions;
  $('resAnswered').textContent  = answered;
  $('resUnanswered').textContent= notAnswered;
  $('resMarked').textContent    = markedCount;
  $('resVisited').textContent   = visitedCount;

  // Section breakdown
  const breakdown = $('resultSectionBreakdown');
  breakdown.innerHTML = '';
  if (config.sections && config.sections.length > 0) {
    breakdown.innerHTML = `<div class="section-breakdown-title">SECTION-WISE SUMMARY</div><div class="section-breakdown-grid" id="sbGrid"></div>`;
    const grid = breakdown.querySelector('#sbGrid');
    config.sections.forEach(sec => {
      let sAns = 0, sTotal = 0;
      for (let q = sec.start; q <= sec.end; q++) {
        sTotal++;
        if (state.answers[q] !== null) sAns++;
      }
      const card = document.createElement('div');
      card.className = 'section-breakdown-card';
      card.innerHTML = `
        <div class="sbc-name">${sec.name}</div>
        <div class="sbc-stats">
          <span>Answered: <span class="sbc-stat-val">${sAns}</span></span>
          <span>Total: <span class="sbc-stat-val">${sTotal}</span></span>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Build review table
  buildReviewTable('all');
  showScreen('result');
  exitFullscreen();
}

let allReviewData = [];

function buildReviewTable(filter) {
  const tbody = $('reviewTableBody');
  tbody.innerHTML = '';
  allReviewData = [];

  for (let i = 1; i <= config.totalQuestions; i++) {
    const sec = getSectionForQ(i);
    const ans = state.answers[i];
    const mrkd = state.marked[i];
    allReviewData.push({
      q: i,
      section: sec ? sec.name : '—',
      answer: ans !== null ? OPTION_LABELS[ans] : null,
      marked: mrkd
    });
  }

  filterReview(filter);
}

function filterReview(filter) {
  const tbody = $('reviewTableBody');
  tbody.innerHTML = '';

  // Update filter buttons
  document.querySelectorAll('.btn-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });

  const filtered = allReviewData.filter(row => {
    if (filter === 'answered')   return row.answer !== null;
    if (filter === 'unanswered') return row.answer === null;
    if (filter === 'marked')     return row.marked;
    return true;
  });

  filtered.forEach(row => {
    const tr = document.createElement('tr');
    const statusBadge = row.answer !== null
      ? '<span class="review-status-badge badge-answered">ANSWERED</span>'
      : '<span class="review-status-badge badge-unanswered">NOT ANSWERED</span>';
    const markedBadge = row.marked
      ? '<span class="review-status-badge badge-marked">MARKED</span>'
      : '—';

    tr.innerHTML = `
      <td>${row.q}</td>
      <td>${row.section}</td>
      <td>${row.answer !== null ? row.answer : '—'}</td>
      <td>${statusBadge}</td>
      <td>${markedBadge}</td>
    `;
    tbody.appendChild(tr);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);font-style:italic;">No questions match this filter.</td></tr>`;
  }
}

function startNewExam() {
  clearStorage();
  config = null;
  state  = null;
  clearInterval(timerInterval);
  warnShown15 = false;
  warnShown5  = false;
  showScreen('setup');
}

/* ═══════════════════════════════════════════════
   SCREEN MANAGEMENT
   ═══════════════════════════════════════════════ */
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${name}`).classList.add('active');
}

/* ═══════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════ */
function showModal(title, bodyHTML, actions) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML    = bodyHTML;

  const actionsEl = $('modalActions');
  actionsEl.innerHTML = '';
  actions.forEach(({ label, className, action }) => {
    const btn = document.createElement('button');
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener('click', action);
    actionsEl.appendChild(btn);
  });

  $('modalOverlay').classList.add('active');
}

function closeModal() {
  $('modalOverlay').classList.remove('active');
}

// Prevent clicking overlay to dismiss during exam
$('modalOverlay').addEventListener('click', (e) => {
  if (e.target === $('modalOverlay') && !$('screen-exam').classList.contains('active')) {
    closeModal();
  }
});

/* ═══════════════════════════════════════════════
   EXIT GUARD
   ═══════════════════════════════════════════════ */
function setupExitGuard() {
  window.addEventListener('beforeunload', handleExit);
}

function handleExit(e) {
  if ($('screen-exam').classList.contains('active') && state && !state.submitted) {
    e.preventDefault();
    e.returnValue = 'Your examination is in progress. Are you sure you want to leave? Your progress is saved and can be resumed.';
    return e.returnValue;
  }
}

/* ═══════════════════════════════════════════════
   FULLSCREEN
   ═══════════════════════════════════════════════ */
function requestFullscreen() {
  try {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
  } catch(e) {
    // Fullscreen may not be supported; silently fail
  }
}

function exitFullscreen() {
  try {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch(e) {}
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && $('screen-exam').classList.contains('active') && state && !state.submitted) {
    showModal(
      'FULLSCREEN MODE EXITED',
      '<p>This examination is designed to run in fullscreen mode. Please restore fullscreen to continue.</p>',
      [
        { label: 'RESTORE FULLSCREEN', className: 'btn-modal btn-modal-confirm', action: () => { requestFullscreen(); closeModal(); } },
        { label: 'CONTINUE WITHOUT', className: 'btn-modal btn-modal-cancel', action: closeModal }
      ]
    );
  }
});

/* ═══════════════════════════════════════════════
   LOCAL STORAGE
   ═══════════════════════════════════════════════ */
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch(e) {
    console.warn('Storage write failed:', e);
  }
}

function loadJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY_CONFIG);
  localStorage.removeItem(STORAGE_KEY_STATE);
}

function persistState() {
  saveJSON(STORAGE_KEY_STATE, state);
}

/* ─── UTILITY ─────────────────────────────────── */
function countAnswered(st) {
  return Object.values(st.answers).filter(v => v !== null).length;
}

/* ═══════════════════════════════════════════════
   EXPOSE to HTML onclick attributes
   ═══════════════════════════════════════════════ */
window.removeSection    = removeSection;
window.filterReview     = filterReview;
window.startNewExam     = startNewExam;

/* ─── SERVICE WORKER REGISTRATION ─────────────── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // SW registration failed — app still works online
    });
  });
}
