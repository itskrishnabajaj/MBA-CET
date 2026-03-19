/* ============================================================
   MBA-CET EXAM SIMULATOR — app.js
   Complete single-file application logic
   Version 1.0 — Frontend only, no dependencies
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const STORAGE_KEY = 'mba_cet_v1';
const OPTIONS = ['A', 'B', 'C', 'D', 'E'];

const Q_STATE = {
  NOT_VISITED:       'not-visited',
  VISITED_UNANSWERED:'visited-unanswered',
  ANSWERED:          'answered',
  MARKED:            'marked',
  ANSWERED_MARKED:   'answered-marked',
};

// ============================================================
// APPLICATION STATE
// ============================================================
const appState = {
  screen:           'dashboard',   // dashboard | setup | exam | results | review | notes
  activeTab:        'tests',       // tests | analytics
  tests:            [],
  currentTestId:    null,
  currentQuestion:  0,             // 0-indexed
  timerInterval:    null,
  paletteOverlayOpen: false,
  submitDialogOpen:  false,
  editingFrom:      null,          // track where notes was opened from
};

// ============================================================
// STORAGE
// ============================================================
function storageLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      appState.tests = Array.isArray(parsed.tests) ? parsed.tests : [];
    }
  } catch (e) {
    appState.tests = [];
  }
}

function storageSave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tests: appState.tests, _v: 1 }));
  } catch (e) {
    console.warn('Storage write failed:', e);
  }
}

// ============================================================
// TEST MANAGEMENT
// ============================================================
function getCurrentTest() {
  return appState.tests.find(t => t.id === appState.currentTestId) || null;
}

function mutateCurrentTest(updater) {
  const idx = appState.tests.findIndex(t => t.id === appState.currentTestId);
  if (idx !== -1) {
    updater(appState.tests[idx]);
    storageSave();
  }
}

function mutateTest(testId, updater) {
  const idx = appState.tests.findIndex(t => t.id === testId);
  if (idx !== -1) {
    updater(appState.tests[idx]);
    storageSave();
  }
}

function createNewTest(config) {
  const questions = [];
  for (let i = 0; i < config.totalQuestions; i++) {
    questions.push({
      index:   i,
      visited: false,
      selected: null,   // 'A'|'B'|'C'|'D'|'E' or null
      marked:  false,
      correct: null,    // set during review
      notes:   '',
    });
  }

  const test = {
    id:              genId(),
    name:            config.name,
    date:            new Date().toISOString(),
    totalQuestions:  config.totalQuestions,
    duration:        config.duration,        // minutes
    negativeMarking: config.negativeMarking,
    status:          'active',               // 'active' | 'completed'
    timeRemaining:   config.duration * 60,  // seconds
    completedDate:   null,
    questions,
    testNotes:       '',
  };

  appState.tests.unshift(test);
  storageSave();
  return test;
}

function submitCurrentTest() {
  stopTimer();
  mutateCurrentTest(t => {
    t.status = 'completed';
    t.completedDate = new Date().toISOString();
  });
}

function deleteTest(testId) {
  appState.tests = appState.tests.filter(t => t.id !== testId);
  storageSave();
}

// ============================================================
// UTILITIES
// ============================================================
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function formatTime(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
    }) + ',\u00a0' + d.toLocaleTimeString('en-IN', {
      hour:   '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (e) { return iso; }
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getQState(q) {
  if (!q.visited)  return Q_STATE.NOT_VISITED;
  if (q.selected && q.marked) return Q_STATE.ANSWERED_MARKED;
  if (q.selected)  return Q_STATE.ANSWERED;
  if (q.marked)    return Q_STATE.MARKED;
  return Q_STATE.VISITED_UNANSWERED;
}

function getTestStats(test) {
  const answered    = test.questions.filter(q => q.selected !== null).length;
  const marked      = test.questions.filter(q => q.marked).length;
  const notVisited  = test.questions.filter(q => !q.visited).length;
  const unattempted = test.questions.filter(q => q.selected === null).length;
  const withCorrect = test.questions.filter(q => q.correct !== null && q.correct !== '').length;
  const correct     = test.questions.filter(q => q.correct && q.selected === q.correct).length;
  const wrong       = test.questions.filter(q => q.correct && q.selected && q.selected !== q.correct).length;
  const timeUsed    = test.duration * 60 - (test.timeRemaining || 0);
  return { answered, marked, notVisited, unattempted, withCorrect, correct, wrong, timeUsed };
}

// ============================================================
// TIMER
// ============================================================
function startTimer() {
  stopTimer();
  const test = getCurrentTest();
  if (!test || test.status !== 'active') return;

  appState.timerInterval = setInterval(() => {
    const t = getCurrentTest();
    if (!t || t.status !== 'active') { stopTimer(); return; }

    const newTime = Math.max(0, t.timeRemaining - 1);
    // Update in-memory & storage (debounce: only write every 5s to avoid thrash)
    t.timeRemaining = newTime;
    if (newTime % 5 === 0) storageSave();

    updateTimerDOM(newTime, t.duration * 60);

    // Also update answered count in header
    const countEl = document.getElementById('answered-count');
    if (countEl) {
      countEl.textContent = t.questions.filter(q => q.selected).length + ' answered';
    }

    if (newTime === 0) {
      stopTimer();
      storageSave();
      autoSubmit();
    }
  }, 1000);
}

function stopTimer() {
  if (appState.timerInterval) {
    clearInterval(appState.timerInterval);
    appState.timerInterval = null;
  }
  // Persist current time
  const t = getCurrentTest();
  if (t) storageSave();
}

function updateTimerDOM(secs, totalSecs) {
  const el = document.getElementById('exam-timer');
  if (!el) return;
  el.textContent = formatTime(secs);
  el.className = 'exam-timer';
  const pct = secs / totalSecs;
  if (secs <= 300)      el.classList.add('critical');
  else if (pct < 0.2)   el.classList.add('warning');
}

function autoSubmit() {
  submitCurrentTest();
  navigateTo('results');
}

// ============================================================
// NAVIGATION
// ============================================================
function navigateTo(screen, params = {}) {
  stopTimer();
  appState.submitDialogOpen = false;
  appState.paletteOverlayOpen = false;

  appState.screen = screen;
  if (params.testId   !== undefined) appState.currentTestId   = params.testId;
  if (params.question !== undefined) appState.currentQuestion = params.question;
  appState.editingFrom = params.from !== undefined ? params.from : null;

  render();
}

// ============================================================
// EXAM LOGIC (state mutations)
// ============================================================
function markVisited(qIdx) {
  const test = getCurrentTest();
  if (!test || test.questions[qIdx].visited) return;
  test.questions[qIdx].visited = true;
  storageSave();
}

function selectAnswer(qIdx, option) {
  const test = getCurrentTest();
  if (!test || test.status !== 'active') return;
  const q = test.questions[qIdx];
  // Toggle: click same → deselect
  q.selected = (q.selected === option) ? null : option;
  storageSave();
  updateExamView();
}

function toggleMarkForReview(qIdx) {
  const test = getCurrentTest();
  if (!test || test.status !== 'active') return;
  test.questions[qIdx].marked = !test.questions[qIdx].marked;
  storageSave();
  updateExamView();
}

function clearResponse(qIdx) {
  const test = getCurrentTest();
  if (!test || test.status !== 'active') return;
  test.questions[qIdx].selected = null;
  storageSave();
  updateExamView();
}

function goToQuestion(qIdx) {
  const test = getCurrentTest();
  if (!test) return;
  if (qIdx < 0 || qIdx >= test.totalQuestions) return;

  markVisited(appState.currentQuestion);
  appState.currentQuestion = qIdx;
  markVisited(qIdx);

  // Close mobile palette
  closePaletteOverlay();

  updateExamView();
  // Scroll question panel to top
  const panel = document.getElementById('q-panel');
  if (panel) panel.scrollTop = 0;
}

function prevQuestion() {
  if (appState.currentQuestion > 0)
    goToQuestion(appState.currentQuestion - 1);
}

function nextQuestion() {
  const test = getCurrentTest();
  if (!test) return;
  if (appState.currentQuestion < test.totalQuestions - 1)
    goToQuestion(appState.currentQuestion + 1);
}

// ============================================================
// EXAM VIEW UPDATES (partial DOM, no full re-render)
// ============================================================
function updateExamView() {
  const test = getCurrentTest();
  if (!test) return;
  const qIdx = appState.currentQuestion;
  const q    = test.questions[qIdx];

  // Question number
  const qNum = document.getElementById('q-num-display');
  if (qNum) qNum.textContent = qIdx + 1;

  const qTag = document.getElementById('q-tag');
  if (qTag) qTag.textContent = `Question ${qIdx + 1} of ${test.totalQuestions}`;

  // Answered count
  const countEl = document.getElementById('answered-count');
  if (countEl) countEl.textContent = test.questions.filter(q2 => q2.selected).length + ' answered';

  // Option states
  OPTIONS.forEach(opt => {
    const el = document.getElementById(`opt-${opt}`);
    if (el) el.classList.toggle('selected', q.selected === opt);
  });

  // Mark button
  const markBtn = document.getElementById('mark-review-btn');
  if (markBtn) {
    if (q.marked) {
      markBtn.textContent = 'Unmark Review';
      markBtn.className = 'btn btn-orange btn-sm';
    } else {
      markBtn.textContent = 'Mark for Review';
      markBtn.className = 'btn btn-mark btn-sm';
    }
  }

  // Nav buttons
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  if (prevBtn) prevBtn.disabled = qIdx === 0;
  if (nextBtn) nextBtn.disabled = qIdx === test.totalQuestions - 1;

  // Update palette
  refreshPalette();
}

function refreshPalette() {
  const test = getCurrentTest();
  if (!test) return;
  const grids = ['palette-grid-desktop', 'palette-grid-mobile'];
  grids.forEach(gId => {
    const grid = document.getElementById(gId);
    if (grid) buildPaletteGrid(grid, test);
  });
}

function buildPaletteGrid(container, test) {
  container.innerHTML = '';
  test.questions.forEach((q, idx) => {
    const btn = document.createElement('button');
    const state = getQState(q);
    btn.className = `palette-btn ${state}${idx === appState.currentQuestion ? ' current' : ''}`;
    btn.textContent = idx + 1;
    btn.title = `Q${idx + 1} — ${state.replace(/-/g, ' ')}`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      goToQuestion(idx);
    });
    container.appendChild(btn);
  });
}

// ============================================================
// SUBMIT DIALOG (DOM injection, avoids full re-render)
// ============================================================
function openSubmitDialog() {
  const test = getCurrentTest();
  if (!test) return;
  const stats = getTestStats(test);

  // Remove existing
  const existing = document.getElementById('submit-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'submit-modal';
  modal.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="submit-title">
      <h2 id="submit-title">Submit Test</h2>
      <p class="modal-desc">
        You are about to submit <strong>${esc(test.name)}</strong>.
        This action cannot be undone. Responses will be locked.
      </p>
      <div class="modal-stats-box">
        <span>Answered: <strong>${stats.answered}</strong></span>
        <span>Unattempted: <strong>${stats.unattempted}</strong></span>
        <span>Marked for Review: <strong>${stats.marked}</strong></span>
        <span>Not Visited: <strong>${stats.notVisited}</strong></span>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeSubmitDialog()">Cancel</button>
        <button class="btn btn-danger" onclick="confirmSubmit()">Submit Test</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeSubmitDialog();
  });

  document.querySelector('.exam-screen').appendChild(modal);
}

function closeSubmitDialog() {
  const modal = document.getElementById('submit-modal');
  if (modal) modal.remove();
}

function confirmSubmit() {
  submitCurrentTest();
  navigateTo('results');
}

// ============================================================
// PALETTE OVERLAY (mobile)
// ============================================================
function openPaletteOverlay() {
  const overlay = document.getElementById('palette-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  const test = getCurrentTest();
  if (test) {
    const grid = document.getElementById('palette-grid-mobile');
    if (grid) buildPaletteGrid(grid, test);
  }
}

function closePaletteOverlay() {
  const overlay = document.getElementById('palette-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ============================================================
// REVIEW FUNCTIONS
// ============================================================
function reviewGoTo(direction) {
  saveReviewData();
  const test = getCurrentTest();
  if (!test) return;
  const q = appState.currentQuestion;
  if (direction === 'prev' && q > 0) {
    appState.currentQuestion = q - 1;
  } else if (direction === 'next' && q < test.totalQuestions - 1) {
    appState.currentQuestion = q + 1;
  }
  render();
}

function saveReviewData() {
  const test = getCurrentTest();
  if (!test) return;
  const qIdx = appState.currentQuestion;

  const correctSel = document.getElementById('correct-answer-sel');
  const notesTa    = document.getElementById('q-notes-ta');

  if (correctSel) {
    const val = correctSel.value;
    test.questions[qIdx].correct = val || null;
  }
  if (notesTa) {
    test.questions[qIdx].notes = notesTa.value;
  }
  storageSave();
}

function setCorrectAnswer(value) {
  const test = getCurrentTest();
  if (!test) return;
  const qIdx = appState.currentQuestion;
  test.questions[qIdx].correct = value || null;
  storageSave();
  updateReviewIndicator(test.questions[qIdx]);
}

function updateReviewIndicator(q) {
  const ind = document.getElementById('result-indicator');
  if (!ind) return;
  if (q.selected && q.correct) {
    const ok = q.selected === q.correct;
    ind.textContent = ok ? '✓  CORRECT' : '✗  INCORRECT';
    ind.className = `review-result-indicator ${ok ? 'correct' : 'wrong'}`;
  } else {
    ind.className = 'review-result-indicator';
  }
  // Update border on question info
  const qi = document.querySelector('.review-qinfo');
  if (qi) {
    qi.className = 'review-qinfo';
    if (q.selected && q.correct) {
      qi.classList.add(q.selected === q.correct ? 'result-correct' : 'result-wrong');
    } else if (!q.selected) {
      qi.classList.add('result-skipped');
    }
  }
}

function appendNoteTag(tag) {
  const ta = document.getElementById('q-notes-ta');
  if (!ta) return;
  const cur = ta.value.trim();
  ta.value = cur ? `${cur}\n[${tag}]` : `[${tag}]`;
  ta.focus();
  // Persist immediately
  const test = getCurrentTest();
  if (test) {
    test.questions[appState.currentQuestion].notes = ta.value;
    storageSave();
  }
}

// ============================================================
// NOTES FUNCTIONS
// ============================================================
function saveTestNotes() {
  const ta = document.getElementById('test-notes-ta');
  if (!ta) return;
  mutateCurrentTest(t => { t.testNotes = ta.value; });

  const confirm = document.getElementById('save-confirm');
  if (confirm) {
    confirm.classList.add('show');
    setTimeout(() => confirm.classList.remove('show'), 2000);
  }
}

// ============================================================
// KEYBOARD HANDLER (exam mode)
// ============================================================
function handleKeydown(e) {
  if (appState.screen !== 'exam') return;
  // Don't capture if focus is in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  // Don't capture shortcuts when the submit dialog is open
  if (document.getElementById('submit-modal')) return;

  switch (e.key) {
    case 'ArrowRight':
    case 'PageDown':
      nextQuestion(); break;
    case 'ArrowLeft':
    case 'PageUp':
      prevQuestion(); break;
    case 'a': case 'A': selectAnswer(appState.currentQuestion, 'A'); break;
    case 'b': case 'B': selectAnswer(appState.currentQuestion, 'B'); break;
    case 'c': case 'C': selectAnswer(appState.currentQuestion, 'C'); break;
    case 'd': case 'D': selectAnswer(appState.currentQuestion, 'D'); break;
    case 'e': case 'E': selectAnswer(appState.currentQuestion, 'E'); break;
    case 'm': case 'M': toggleMarkForReview(appState.currentQuestion); break;
    case 'Escape': closeSubmitDialog(); closePaletteOverlay(); break;
  }
}

// ============================================================
// RENDER ENGINE
// ============================================================
function render() {
  const root = document.getElementById('app');
  if (!root) return;

  switch (appState.screen) {
    case 'dashboard': root.innerHTML = renderDashboard(); break;
    case 'setup':     root.innerHTML = renderSetup();     break;
    case 'exam':      root.innerHTML = renderExam();      break;
    case 'results':   root.innerHTML = renderResults();   break;
    case 'review':    root.innerHTML = renderReview();    break;
    case 'notes':     root.innerHTML = renderNotes();     break;
    default:          root.innerHTML = renderDashboard(); break;
  }

  if (appState.screen === 'exam') {
    const test = getCurrentTest();
    if (test && test.status === 'active') {
      markVisited(appState.currentQuestion);
      updateExamView();
      startTimer();
      updateTimerDOM(test.timeRemaining, test.duration * 60);
    }
  }
}

// ============================================================
// RENDER: DASHBOARD
// ============================================================
function renderDashboard() {
  const tab = appState.activeTab;

  let tabContent = '';
  if (tab === 'tests') {
    tabContent = renderTestsTab();
  } else {
    tabContent = renderAnalyticsTab();
  }

  return `
<div class="dashboard">
  <div class="dashboard-header">
    <div class="app-brand">
      <div class="app-brand-name">MBA-CET</div>
      <div class="app-brand-sub">Exam Simulator</div>
    </div>
    <button class="btn btn-primary btn-sm" onclick="navigateTo('setup')">+ New Test</button>
  </div>

  <div class="dashboard-tabs">
    <button class="tab-btn ${tab === 'tests' ? 'active' : ''}"
            onclick="switchTab('tests')">Tests</button>
    <button class="tab-btn ${tab === 'analytics' ? 'active' : ''}"
            onclick="switchTab('analytics')">Analytics</button>
  </div>

  <div class="dashboard-content">${tabContent}</div>
</div>`;
}

function renderTestsTab() {
  const tests = appState.tests;

  if (tests.length === 0) {
    return `
<div class="empty-state">
  <div class="empty-state-icon">📋</div>
  <h2>No Tests Found</h2>
  <p>Create a new test to begin your exam simulation.</p>
  <button class="btn btn-primary" onclick="navigateTo('setup')">+ New Test</button>
</div>`;
  }

  return `<div class="test-list">
${tests.map(t => {
    const stats = getTestStats(t);
    const timeUsed = formatTime(stats.timeUsed);
    const hasNotes = t.testNotes && t.testNotes.trim();
    const qNoteCount = t.questions.filter(q => q.notes && q.notes.trim()).length;

    return `
<div class="test-card">
  <div class="test-card-top">
    <div class="test-card-name">${esc(t.name)}</div>
    <span class="status-badge status-${t.status}">${t.status === 'completed' ? 'Completed' : 'In Progress'}</span>
  </div>
  <div class="test-card-date">${formatDate(t.date)}</div>
  <div class="test-card-stats">
    <span>Questions: <strong>${t.totalQuestions}</strong></span>
    <span>Duration: <strong>${t.duration} min</strong></span>
    <span>Attempted: <strong>${stats.answered}</strong></span>
    <span>Marked: <strong>${stats.marked}</strong></span>
    ${t.status === 'completed' ? `<span>Time Used: <strong>${timeUsed}</strong></span>` : ''}
    ${stats.withCorrect > 0 ? `<span>Correct: <strong>${stats.correct}/${stats.withCorrect}</strong></span>` : ''}
    ${hasNotes || qNoteCount > 0 ? `<span>📝 Notes (${qNoteCount} questions)</span>` : ''}
    ${t.negativeMarking ? `<span>⚠ Negative Marking</span>` : ''}
  </div>
  <div class="test-card-actions">
    ${t.status === 'active'
      ? `<button class="btn btn-primary btn-sm" onclick="resumeTest('${t.id}')">▶ Continue</button>`
      : `<button class="btn btn-secondary btn-sm" onclick="navigateTo('review', {testId:'${t.id}', question:0, from:'dashboard'})">Review</button>`
    }
    <button class="btn btn-secondary btn-sm" onclick="navigateTo('notes', {testId:'${t.id}', from:'dashboard'})">Notes</button>
    <button class="btn btn-secondary btn-sm" onclick="handleDeleteTest('${t.id}')">Delete</button>
  </div>
</div>`;
  }).join('')}
</div>`;
}

function renderAnalyticsTab() {
  const completed = appState.tests.filter(t => t.status === 'completed');
  if (completed.length === 0) {
    return `<div class="empty-state">
      <div class="empty-state-icon">📊</div>
      <h2>No Completed Tests</h2>
      <p>Complete a test to view performance analytics.</p>
    </div>`;
  }

  const totalTests    = completed.length;
  const avgAttempted  = Math.round(completed.reduce((s, t) => s + getTestStats(t).answered, 0) / totalTests);
  const totalWithCorr = completed.filter(t => getTestStats(t).withCorrect > 0);
  const avgAccuracy   = totalWithCorr.length > 0
    ? Math.round(totalWithCorr.reduce((s, t) => {
        const st = getTestStats(t);
        return s + (st.withCorrect > 0 ? (st.correct / st.withCorrect) * 100 : 0);
      }, 0) / totalWithCorr.length)
    : null;

  return `<div class="analytics-inner">
  <div class="analytics-overview">
    <div class="analytics-card">
      <span class="stat-val">${totalTests}</span>
      <span class="stat-label">Tests Done</span>
    </div>
    <div class="analytics-card">
      <span class="stat-val">${avgAttempted}</span>
      <span class="stat-label">Avg Attempted</span>
    </div>
    <div class="analytics-card">
      <span class="stat-val">${avgAccuracy !== null ? avgAccuracy + '%' : '—'}</span>
      <span class="stat-label">Avg Accuracy</span>
    </div>
    <div class="analytics-card">
      <span class="stat-val">${completed.filter(t => {
        const st = getTestStats(t); return st.withCorrect > 0;
      }).length}</span>
      <span class="stat-label">Reviewed</span>
    </div>
  </div>

  <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:10px;font-family:var(--font-mono)">Test History</div>

  ${completed.map(t => {
    const st = getTestStats(t);
    const acc = st.withCorrect > 0 ? Math.round((st.correct / st.withCorrect) * 100) + '%' : '—';
    return `
<div class="analytics-test-row">
  <div class="analytics-row-name">${esc(t.name)}</div>
  <div class="analytics-row-date">${formatDate(t.completedDate || t.date)}</div>
  <div class="analytics-row-stats">
    <span>Attempted: <strong>${st.answered}/${t.totalQuestions}</strong></span>
    <span>Unattempted: <strong>${st.unattempted}</strong></span>
    <span>Marked: <strong>${st.marked}</strong></span>
    <span>Time Used: <strong>${formatTime(st.timeUsed)}</strong></span>
    ${st.withCorrect > 0 ? `<span>Accuracy: <strong>${acc}</strong></span>` : ''}
    ${t.testNotes ? '<span>📝 Notes</span>' : ''}
  </div>
</div>`;
  }).join('')}
</div>`;
}

// ============================================================
// RENDER: SETUP
// ============================================================
function renderSetup() {
  return `
<div class="setup-screen">
  <div class="screen-header">
    <button class="back-btn" onclick="navigateTo('dashboard')" aria-label="Back">&#8592;</button>
    <h1>New Test Configuration</h1>
  </div>

  <div class="setup-body">
    <div class="setup-form">

      <div class="form-group">
        <label class="form-label" for="setup-name">Test Name *</label>
        <input type="text" class="form-input" id="setup-name"
               placeholder="e.g. SIMCET Mock 12 — Full Paper"
               maxlength="80" autocomplete="off" spellcheck="false" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="setup-questions">Total Questions</label>
          <input type="number" class="form-input" id="setup-questions"
                 value="200" min="1" max="500" />
        </div>
        <div class="form-group">
          <label class="form-label" for="setup-duration">Duration (minutes)</label>
          <input type="number" class="form-input" id="setup-duration"
                 value="150" min="1" max="600" />
        </div>
      </div>

      <div class="form-group">
        <label class="form-check-wrapper" for="setup-neg">
          <input type="checkbox" id="setup-neg" />
          <span class="form-check-label">Negative Marking Enabled</span>
        </label>
      </div>

      <div class="setup-instructions">
        <strong>How to use this simulator:</strong><br />
        1. Start the test — the timer begins immediately.<br />
        2. Solve questions from your printed mock test paper.<br />
        3. Mark answers (A–E) in this interface as you go.<br />
        4. Use "Mark for Review" for uncertain answers.<br />
        5. Navigate via the Question Palette or Prev/Next.<br />
        6. After submission, enter correct answers from the answer key in the Review section.<br />
        <br />
        <strong>Keyboard shortcuts (during exam):</strong>
        A–E to mark answers &nbsp;·&nbsp; M to mark/unmark &nbsp;·&nbsp;
        Arrow keys to navigate
      </div>

    </div>
  </div>

  <div class="setup-footer">
    <div class="setup-footer-inner">
      <button class="btn btn-primary btn-full" onclick="handleStartTest()">
        Start Test
      </button>
    </div>
  </div>
</div>`;
}

// ============================================================
// RENDER: EXAM
// ============================================================
function renderExam() {
  const test = getCurrentTest();
  if (!test) return '<div style="padding:20px">Error: Test not found.</div>';

  const qIdx = appState.currentQuestion;
  const q    = test.questions[qIdx];

  return `
<div class="exam-screen">

  <!-- TOP BAR -->
  <div class="exam-topbar">
    <div class="exam-test-name">${esc(test.name)}</div>
    <div class="exam-timer-wrap">
      <div class="exam-timer-label">Time Left</div>
      <div class="exam-timer" id="exam-timer">${formatTime(test.timeRemaining)}</div>
    </div>
    <button class="btn btn-danger btn-sm" onclick="openSubmitDialog()">Submit Test</button>
  </div>

  <!-- BODY -->
  <div class="exam-body">

    <!-- MAIN QUESTION AREA -->
    <div class="exam-main">
      <div class="question-panel" id="q-panel">

        <div class="question-meta">
          <span class="question-number-tag" id="q-tag">Question ${qIdx + 1} of ${test.totalQuestions}</span>
          <span class="question-answered-count" id="answered-count">${test.questions.filter(q2 => q2.selected).length} answered</span>
        </div>

        <div class="question-number-display" id="q-num-display">${qIdx + 1}</div>
        <div class="question-divider"></div>

        <p class="question-instruction-text">
          Mark your response to the corresponding question in the printed test paper.
        </p>

        <div class="options-container">
          ${OPTIONS.map(opt => `
          <div class="option-item${q.selected === opt ? ' selected' : ''}"
               id="opt-${opt}"
               onclick="selectAnswer(${qIdx}, '${opt}')"
               role="radio"
               aria-checked="${q.selected === opt}"
               tabindex="0"
               onkeydown="if(event.key==='Enter'||event.key===' '){selectAnswer(${qIdx},'${opt}');}">
            <span class="option-bubble">${opt}</span>
            <span class="option-text-label">Option ${opt}</span>
          </div>`).join('')}
        </div>

      </div><!-- /q-panel -->

      <!-- CONTROLS BAR -->
      <div class="exam-controls">
        <div class="controls-group">
          <button class="btn btn-secondary btn-sm" id="prev-btn"
                  onclick="prevQuestion()"
                  ${qIdx === 0 ? 'disabled' : ''}>
            &#8592; Prev
          </button>
          <button class="btn ${q.marked ? 'btn-orange' : 'btn-mark'} btn-sm"
                  id="mark-review-btn"
                  onclick="toggleMarkForReview(${qIdx})">
            ${q.marked ? 'Unmark Review' : 'Mark for Review'}
          </button>
        </div>
        <div class="controls-group" style="margin-left:auto">
          <button class="btn btn-secondary btn-sm"
                  onclick="clearResponse(${qIdx})">
            Clear
          </button>
          <button class="btn btn-primary btn-sm" id="next-btn"
                  onclick="nextQuestion()"
                  ${qIdx === test.totalQuestions - 1 ? 'disabled' : ''}>
            Next &#8594;
          </button>
        </div>
      </div>
    </div><!-- /exam-main -->

    <!-- PALETTE SIDEBAR (desktop) -->
    <div class="palette-panel">
      <div class="palette-title">Question Palette</div>
      <div class="palette-grid" id="palette-grid-desktop"></div>
      <div class="palette-legend">
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--q-not-visited)"></span>Not Visited
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--q-unanswered)"></span>Not Answered
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--q-answered)"></span>Answered
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--q-marked)"></span>Marked for Review
        </div>
        <div class="legend-item">
          <span class="legend-swatch" style="background:var(--q-answered-marked)"></span>Answered + Marked
        </div>
      </div>
    </div>

  </div><!-- /exam-body -->

  <!-- MOBILE PALETTE FAB -->
  <button class="palette-fab" onclick="openPaletteOverlay()" aria-label="Question Palette">
    &#9776;
  </button>

  <!-- MOBILE PALETTE OVERLAY -->
  <div class="palette-overlay" id="palette-overlay"
       onclick="closePaletteOverlay()" aria-hidden="true">
    <div class="palette-sheet" onclick="event.stopPropagation()">
      <div class="palette-sheet-header">
        <span class="palette-sheet-title">Question Palette</span>
        <button class="palette-sheet-close" onclick="closePaletteOverlay()" aria-label="Close">&#10005;</button>
      </div>
      <div class="palette-sheet-grid" id="palette-grid-mobile"></div>
      <div class="palette-sheet-legend">
        ${[
          ['var(--q-not-visited)', 'Not Visited'],
          ['var(--q-unanswered)',  'Not Answered'],
          ['var(--q-answered)',    'Answered'],
          ['var(--q-marked)',      'Marked'],
          ['var(--q-answered-marked)', 'Ans+Marked'],
        ].map(([bg, label]) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${bg}"></span>${label}
        </span>`).join('')}
      </div>
    </div>
  </div>

</div><!-- /exam-screen -->`;
}

// ============================================================
// RENDER: RESULTS
// ============================================================
function renderResults() {
  const test = getCurrentTest();
  if (!test) return '<div style="padding:20px">Error: Test not found.</div>';

  const stats = getTestStats(test);

  return `
<div class="result-screen">
  <div class="screen-header">
    <h1>Test Submitted</h1>
  </div>

  <div class="result-body">
    <div class="result-inner">

      <div class="result-test-info">
        <div class="result-test-name">${esc(test.name)}</div>
        <div class="result-test-date">
          Submitted: ${formatDate(test.completedDate || test.date)} &nbsp;·&nbsp;
          Duration: ${test.duration} min
        </div>
      </div>

      <div class="result-summary-grid">
        <div class="stat-card">
          <span class="stat-val">${stats.answered}</span>
          <span class="stat-label">Attempted</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${stats.unattempted}</span>
          <span class="stat-label">Unattempted</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${stats.marked}</span>
          <span class="stat-label">Marked</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${formatTime(stats.timeUsed)}</span>
          <span class="stat-label">Time Used</span>
        </div>
      </div>

      ${stats.withCorrect > 0 ? `
      <div class="result-summary-grid">
        <div class="stat-card">
          <span class="stat-val" style="color:#15803d">${stats.correct}</span>
          <span class="stat-label">Correct</span>
        </div>
        <div class="stat-card">
          <span class="stat-val" style="color:#dc2626">${stats.wrong}</span>
          <span class="stat-label">Wrong</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${stats.withCorrect > 0 ? Math.round(stats.correct / stats.withCorrect * 100) : 0}%</span>
          <span class="stat-label">Accuracy</span>
        </div>
        <div class="stat-card">
          <span class="stat-val">${stats.withCorrect}</span>
          <span class="stat-label">Reviewed</span>
        </div>
      </div>` : ''}

      <div class="result-note">
        Enter correct answers from the official answer key in the <strong>Review Questions</strong>
        section to calculate accuracy and track errors.
      </div>

      <div class="result-actions">
        <button class="btn btn-primary btn-full"
                onclick="navigateTo('review', {testId:'${test.id}', question:0, from:'results'})">
          Review Questions &amp; Enter Correct Answers
        </button>
        <button class="btn btn-secondary btn-full"
                onclick="navigateTo('notes', {testId:'${test.id}', from:'results'})">
          Add Test Notes
        </button>
        <button class="btn btn-secondary btn-full"
                onclick="navigateTo('dashboard')">
          Back to Dashboard
        </button>
      </div>

    </div>
  </div>
</div>`;
}

// ============================================================
// RENDER: REVIEW
// ============================================================
function renderReview() {
  const test = getCurrentTest();
  if (!test) return '<div style="padding:20px">Error.</div>';

  const qIdx = appState.currentQuestion;
  const q    = test.questions[qIdx];

  let qInfoClass = 'review-qinfo';
  if (q.selected && q.correct) {
    qInfoClass += q.selected === q.correct ? ' result-correct' : ' result-wrong';
  } else if (!q.selected) {
    qInfoClass += ' result-skipped';
  }

  let indicatorClass = 'review-result-indicator';
  let indicatorText  = '';
  if (q.selected && q.correct) {
    indicatorClass += q.selected === q.correct ? ' correct' : ' wrong';
    indicatorText   = q.selected === q.correct ? '✓  CORRECT' : '✗  INCORRECT';
  }

  const correctVal = q.correct || '';

  const backFn = appState.editingFrom === 'results'
    ? `saveReviewData(); navigateTo('results', {testId:'${test.id}'})`
    : `saveReviewData(); navigateTo('dashboard')`;

  return `
<div class="review-screen">
  <div class="screen-header">
    <button class="back-btn" onclick="${backFn}" aria-label="Back">&#8592;</button>
    <h1>Question Review — ${esc(test.name)}</h1>
  </div>

  <div class="review-body">
    <div class="review-inner">

      <div class="${qInfoClass}">
        <div class="review-q-num">Question ${qIdx + 1} of ${test.totalQuestions}</div>
        <div class="review-q-status">
          Your Response:
          <strong>${q.selected ? `Option ${q.selected}` : 'Not Attempted'}</strong>
          &nbsp;${q.marked ? '&bull;&nbsp;<span style="color:var(--q-marked)">Marked for Review</span>' : ''}
        </div>
      </div>

      <div class="review-answer-grid">
        <div class="review-answer-box">
          <div class="review-answer-label">Your Answer</div>
          <div class="review-answer-val ${!q.selected ? 'skipped' : ''}">${q.selected || '—'}</div>
        </div>
        <div class="review-answer-box">
          <div class="review-answer-label">Correct Answer (from key)</div>
          <select class="review-answer-select" id="correct-answer-sel"
                  onchange="setCorrectAnswer(this.value)">
            <option value="">— Not Set —</option>
            ${OPTIONS.map(o => `<option value="${o}" ${correctVal === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="${indicatorClass}" id="result-indicator">${indicatorText}</div>

      <div class="review-notes-box">
        <div class="review-answer-label">Question Notes</div>
        <textarea class="review-textarea" id="q-notes-ta"
                  placeholder="Mistake type, concept gap, approach used, revision tag..."
                  onblur="saveReviewData()"
                  >${esc(q.notes || '')}</textarea>
        <div class="quick-tags">
          ${['Concept Gap', 'Silly Mistake', 'Guessed', 'Time Pressure', 'Revisit', 'Tricky', 'Calculation Error'].map(tag => `
          <button class="tag-btn" onclick="appendNoteTag('${tag}')">+ ${tag}</button>`).join('')}
        </div>
      </div>

    </div>
  </div>

  <div class="review-nav">
    <button class="btn btn-secondary btn-sm"
            onclick="reviewGoTo('prev')"
            ${qIdx === 0 ? 'disabled' : ''}>
      &#8592; Previous
    </button>
    <span class="review-counter">${qIdx + 1} / ${test.totalQuestions}</span>
    <button class="btn btn-primary btn-sm"
            onclick="reviewGoTo('next')"
            ${qIdx === test.totalQuestions - 1 ? 'disabled' : ''}>
      Next &#8594;
    </button>
  </div>
</div>`;
}

// ============================================================
// RENDER: NOTES
// ============================================================
function renderNotes() {
  const test = getCurrentTest();
  if (!test) return '<div style="padding:20px">Error.</div>';

  const qWithNotes = test.questions.filter(q => q.notes && q.notes.trim());
  const from = appState.editingFrom;

  const backFn = from === 'results'
    ? `navigateTo('results', {testId:'${test.id}'})`
    : `navigateTo('dashboard')`;

  return `
<div class="notes-screen">
  <div class="screen-header">
    <button class="back-btn" onclick="${backFn}" aria-label="Back">&#8592;</button>
    <h1>Notes — ${esc(test.name)}</h1>
  </div>

  <div class="notes-body">
    <div class="notes-inner">

      <div class="section-label">Test-Level Observations</div>
      <p class="section-desc">
        Record general strategy observations, time management issues, mental state during the exam, and overall reflections.
      </p>
      <textarea class="notes-textarea" id="test-notes-ta"
                placeholder="e.g. Strategy mistakes — spent too long on DILR section...&#10;Mental state — anxious in first 30 minutes...&#10;Time issues — could not attempt last 15 questions..."
                >${esc(test.testNotes || '')}</textarea>
      <div class="notes-save-row">
        <button class="btn btn-primary btn-sm" onclick="saveTestNotes()">Save Notes</button>
        <span class="save-confirm" id="save-confirm">✓ Saved</span>
      </div>

      <div class="divider"></div>

      <div class="section-label">Question-Level Notes (${qWithNotes.length})</div>
      <p class="section-desc">
        ${qWithNotes.length} question${qWithNotes.length !== 1 ? 's' : ''} ha${qWithNotes.length === 1 ? 's' : 've'} notes recorded.
        <button class="btn btn-secondary btn-xs" style="margin-left:8px"
                onclick="saveTestNotes(); navigateTo('review', {testId:'${test.id}', question:0, from:'${from || 'notes'}'})">
          Edit in Review Mode
        </button>
      </p>

      ${qWithNotes.length > 0 ? `
      <div class="q-notes-list">
        ${qWithNotes.slice(0, 30).map(q => {
          const correct = q.correct && q.selected
            ? (q.selected === q.correct ? '✓' : '✗')
            : '';
          return `
<div class="q-note-card">
  <div class="q-note-meta">
    Q${q.index + 1}
    ${q.selected ? `· Marked: ${q.selected}` : '· Not Attempted'}
    ${q.correct  ? `· Key: ${q.correct}` : ''}
    ${correct    ? `· ${correct}` : ''}
  </div>
  <div class="q-note-text">${esc(q.notes)}</div>
</div>`;
        }).join('')}
        ${qWithNotes.length > 30
          ? `<p class="text-muted" style="font-size:0.78rem;text-align:center;padding:8px">
               ... and ${qWithNotes.length - 30} more. Open Review Mode to view all.
             </p>`
          : ''}
      </div>` : ''}

    </div>
  </div>
</div>`;
}

// ============================================================
// ACTION HANDLERS (called from inline onclick)
// ============================================================
function switchTab(tab) {
  appState.activeTab = tab;
  render();
}

function resumeTest(testId) {
  appState.currentTestId   = testId;
  appState.currentQuestion = 0;
  navigateTo('exam', { testId });
}

function handleDeleteTest(testId) {
  const test = appState.tests.find(t => t.id === testId);
  if (!test) return;
  if (!confirm(`Delete "${test.name}"?\n\nThis will permanently remove the test and all associated answers and notes.`)) return;
  deleteTest(testId);
  render();
}

function handleStartTest() {
  const nameEl      = document.getElementById('setup-name');
  const questionsEl = document.getElementById('setup-questions');
  const durationEl  = document.getElementById('setup-duration');
  const negEl       = document.getElementById('setup-neg');

  const name      = (nameEl?.value || '').trim();
  const questions = parseInt(questionsEl?.value) || 200;
  const duration  = parseInt(durationEl?.value)  || 150;
  const negative  = negEl?.checked || false;

  if (!name) {
    alert('Please enter a test name before starting.');
    nameEl?.focus();
    return;
  }

  if (questions < 1 || questions > 500) {
    alert('Total questions must be between 1 and 500.');
    questionsEl?.focus();
    return;
  }

  if (duration < 1 || duration > 600) {
    alert('Duration must be between 1 and 600 minutes.');
    durationEl?.focus();
    return;
  }

  const confirmed = confirm(
    `Start "${name}"?\n\n` +
    `${questions} questions · ${duration} minutes${negative ? ' · Negative marking' : ''}\n\n` +
    `The timer will begin immediately.`
  );

  if (!confirmed) return;

  const test = createNewTest({ name, totalQuestions: questions, duration, negativeMarking: negative });
  appState.currentTestId   = test.id;
  appState.currentQuestion = 0;
  navigateTo('exam', { testId: test.id });
}

// ============================================================
// INITIALIZATION
// ============================================================
function init() {
  storageLoad();

  // Check for interrupted exam sessions
  const activeTest = appState.tests.find(t => t.status === 'active');
  if (activeTest && activeTest.timeRemaining > 0) {
    appState.currentTestId   = activeTest.id;
    appState.currentQuestion = 0;
    // Option: auto-resume or show dashboard
    // We show dashboard with "Continue" button visible
  }

  render();

  // Register service worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js')
        .then(reg => console.log('SW registered, scope:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    });
  }
}

// Global keyboard listener
document.addEventListener('keydown', handleKeydown);

// Prevent accidental browser back during exam
window.addEventListener('beforeunload', (e) => {
  if (appState.screen === 'exam') {
    const test = getCurrentTest();
    if (test && test.status === 'active') {
      storageSave();
    }
  }
});

// Prevent zoom on double-tap (iOS)
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - (window._lastTouch || 0) < 300) {
    e.preventDefault();
  }
  window._lastTouch = now;
}, { passive: false });

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
