# MBA-CET Exam Simulator — PWA

A fully offline-capable Progressive Web App that replicates the real MBA-CET 
computer-based test environment.

## File Structure

```
mba-cet-simulator/
├── index.html          ← Entry point
├── styles.css          ← Complete UI stylesheet
├── app.js              ← Application logic (no dependencies)
├── manifest.json       ← PWA manifest
├── service-worker.js   ← Offline-first caching
└── icons/
    ├── icon-192.png    ← App icon (192×192)
    └── icon-512.png    ← App icon (512×512)
```

## Deployment

### Netlify
1. Drag-and-drop the `mba-cet-simulator/` folder into Netlify Drop (drop.netlify.com)
2. Done. No build step required.

### GitHub Pages
1. Push this folder contents to a GitHub repository
2. Enable Pages (Settings → Pages → Deploy from branch → main → / root)
3. Access at `https://<username>.github.io/<repo>/`

### Any Static Host
Upload all files maintaining the directory structure. No server-side processing needed.

## Features

- **Exam Mode** — Full CBT simulation with question palette, countdown timer, mark-for-review
- **Question Palette** — Real-time visual state: Not Visited / Unanswered / Answered / Marked / Answered+Marked
- **Persistent Timer** — Survives page refresh; auto-submits on time expiry
- **Review Mode** — Enter correct answers from answer key, add question-level notes
- **Notes System** — Test-level and question-level notes with quick-tag buttons
- **Analytics Tab** — Cross-test performance history
- **PWA** — Installable, works fully offline after first load
- **localStorage** — All data persists locally, no backend

## Keyboard Shortcuts (Exam Mode)

| Key       | Action              |
|-----------|---------------------|
| A / B / C / D / E | Mark answer |
| M         | Toggle mark for review |
| ← / →     | Previous / Next question |
| PageUp/Dn | Previous / Next question |
| Escape    | Close dialogs        |

## Data Storage

All test data is stored in browser `localStorage` under key `mba_cet_v1`.
Data survives browser restarts and works offline.

To export data: open browser DevTools → Application → LocalStorage → copy value.

---
Version 1.0 | Frontend-only | No build tools | No frameworks
