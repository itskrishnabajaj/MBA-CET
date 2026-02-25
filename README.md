# MBA-CET Examination Simulator
### Progressive Web Application — v1.0

---

## Overview

A fully functional front-end PWA that simulates an official MBA-CET (Common Entrance Test) computer-based examination environment. Designed to replicate the psychological and functional experience of the actual test — neutral, precise, distraction-free, and high-stakes.

---

## File Structure

```
mba-cet-pwa/
├── index.html          # Main application shell
├── styles.css          # Complete UI stylesheet
├── app.js              # Application logic (vanilla JS)
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker (offline support)
├── icons/
│   ├── icon-192.svg    # App icon (192×192)
│   └── icon-512.svg    # App icon (512×512)
└── README.md           # This file
```

---

## How to Run

### Option 1: Local HTTP Server (Recommended)

PWAs require HTTPS or localhost. Use any of these:

**Python (built-in):**
```bash
cd mba-cet-pwa
python3 -m http.server 8080
# Open: http://localhost:8080
```

**Node.js (npx):**
```bash
cd mba-cet-pwa
npx serve .
# Or: npx http-server -p 8080
```

**VS Code:**  
Install the "Live Server" extension → Right-click `index.html` → Open with Live Server.

---

### Option 2: Deploy Online

Upload all files to any static hosting:
- **GitHub Pages** — push to a repo, enable Pages
- **Netlify** — drag-and-drop the folder
- **Vercel** — `vercel --prod`

---

## PWA Installation (Tablet / Desktop)

1. Open the app in Chrome / Edge on your tablet
2. Look for the **install prompt** in the address bar (⊕ icon)
3. Click → "Install MBA-CET Exam"
4. The app opens in fullscreen, installable mode
5. Works completely **offline** after first visit

---

## Exam Setup

On the setup screen, configure:

| Field | Description |
|---|---|
| Test Name | e.g., "MBA-CET 2025 — Mock Test 01" |
| Candidate Name | For display and result sheet |
| Total Questions | 10–300 (default: 200) |
| Exam Duration | 10–360 minutes (default: 150) |
| Options per Question | 4 or 5 |
| Sections (optional) | Add named sections with question counts |

> ⚠ If sections are defined, their question totals **must** equal Total Questions.

---

## Exam Interface

### Layout
- **Top bar**: Test name | Countdown timer | Submit button
- **Main area**: Question panel (left) + Palette sidebar (right)
- **Bottom bar**: Previous / Next / Mark for Review / Clear Response

### Question Panel
- Displays current question number and section
- Shows answer status flags (Answered / Marked)
- 4 or 5 clickable option rows (click to select, click again to deselect)

### Palette Colors
| Color | Meaning |
|---|---|
| Grey | Not visited |
| White (bordered) | Visited, not answered |
| Green | Answered |
| Purple | Marked for review |
| Amber | Answered + marked for review |

### Controls
| Action | Control |
|---|---|
| Navigate questions | Palette click / Prev/Next buttons |
| Select answer | Click option row |
| Deselect answer | Click selected option again |
| Mark for review | [Mark for Review] button |
| Clear all | [Clear Response] button |
| Submit | [Submit Test] button (with confirmation) |
| Keyboard: Next/Prev | Arrow keys |
| Keyboard: Select option | Keys 1–5 |

---

## Timer Behavior

| Time Remaining | Behavior |
|---|---|
| > 15 min | Normal (white display) |
| ≤ 15 min | Yellow warning + warning banner |
| ≤ 5 min | Red + pulsing animation |
| 0:00 | Auto-submit + lock responses |

---

## State Persistence

All state is saved to `localStorage` after every interaction. If you close the browser mid-exam:
- Reopen the app
- You will be prompted to **Resume** or **Start New**
- All answers, marks, and visited status are preserved

---

## Result Screen

After submission:
- Summary card grid (Total / Attempted / Not Attempted / Marked / Visited)
- Section-wise breakdown (if sections configured)
- Full response sheet table, filterable by:
  - All / Answered / Not Answered / Marked

No scores are shown (no answer key is built in — this is a response recorder, not a scorer).

---

## Design Principles

- **No gamification** — strictly functional
- **No animations** except timer urgency
- **Mouse-first** — large click targets, visible hover states
- **High contrast** focus indicators
- **Government-grade aesthetic** — IBM Plex Mono + IBM Plex Sans

---

## Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full (recommended) |
| Edge 90+ | ✅ Full |
| Firefox 90+ | ✅ Full |
| Safari 15+ | ✅ Full |

---

## No Backend Required

All data is stored in `localStorage`. No server, no database, no accounts.

---

*Built for DTE Maharashtra — MBA-CET Examination Simulation Authority*
