# ⚡ ReflexRush

> **Think You Can Beat Your Friends?**  
> A high-performance, mobile-first arcade mini-game platform built with modern web standards, high-precision millisecond timing, and viral challenge loops.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-cyan.svg)](#technology-stack)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-purple.svg)](CONTRIBUTING.md)

---

## 🎮 Live Games

### 1. Reaction Time Benchmark (`index.html`)
- **5-Round Average:** Eliminates lucky guesses with a true multi-round sample.
- **Millisecond Precision:** Uses `window.performance.now()` for hardware-level timing.
- **Anti-Cheat Penalty:** Premature clicks trigger a false-start warning and round retry.
- **Viral Challenge Engine:** Share custom URL links (e.g. `?challenge=210&by=Alex`) to challenge friends to beat your time.
- **Tier Classification:** From *Godspeed Cyborg* (<190ms) to *Need More Coffee* (>340ms).

### 2. Number Memory Challenge (`number-memory.html`)
- **Dynamic Level Scaling:** Level $N$ requires memorizing $N$ digits.
- **Visual Countdown Bar:** Scaled duration according to sequence length.
- **Touch-Friendly On-Screen Keypad:** Virtual 0–9 keypad prevents the mobile virtual keyboard from obscuring the game.
- **Educational Deep-Dive:** Explains **Miller’s Law (7 ± 2 items)** and cognitive "chunking" strategies.

---

## 🚀 Features

- **Zero Heavy Frameworks:** Pure HTML5, CSS3, and Vanilla JavaScript. Loads in under 200ms.
- **Synthesized Web Audio:** High-frequency crystal chimes, victory fanfare, and error buzzers generated via the Web Audio API without downloading external audio files.
- **Web Share API:** Native mobile sharing sheet with automated fallback to clipboard and WhatsApp/Twitter/Telegram links.
- **AdSense Compliant Layout:** Dedicated, non-intrusive ad placement slots with clear `ADVERTISEMENT` indicators and strict distance from touch interaction zones.
- **GDPR & Privacy Ready:** Built-in cookie consent banner and full legal disclosures (`about.html`, `privacy.html`, `terms.html`, `contact.html`).

---

## 📁 Project Structure

```
reflexrush/
├── assets/
│   ├── favicon.svg          # Vector icon
│   ├── logo.svg             # Primary navbar logo
│   └── og-image.svg         # Social sharing card (1200x630)
├── index.html               # Reaction Time game & arcade hub
├── number-memory.html       # Number Memory Challenge game
├── script.js                # Core reaction engine & Web Audio synthesizer
├── number-memory.js         # Number Memory game engine & virtual keypad
├── style.css                # Dark-mode arcade design system
├── about.html               # The science of reflexes & developer story
├── privacy.html             # AdSense, GDPR & CCPA privacy policy
├── terms.html               # Terms of Service
├── contact.html             # Feedback form & FAQ
├── robots.txt               # Search engine directives
├── sitemap.xml              # XML sitemap
└── README.md                # Project documentation
```

---

## 🛠️ Local Development

You can run this project locally with any static web server:

### Option 1: VS Code Live Server
1. Open this folder in VS Code.
2. Right click `index.html` > **Open with Live Server**.

### Option 2: Python Built-in Server
```bash
python -m http.server 8000
```
Open `http://localhost:8000` in your browser.

---

## 🌐 Free Deployment (Cloudflare Pages, Vercel, or GitHub Pages)

1. Push this repository to GitHub.
2. In [Cloudflare Pages](https://pages.cloudflare.com/) or [Vercel](https://vercel.com/):
   - Connect your GitHub repository.
   - Set Build Command: *(Leave blank)*
   - Set Output Directory: `.`
3. Your site is live on a global CDN with free SSL.

---

## 📄 License

This project is open-source under the [MIT License](LICENSE).
