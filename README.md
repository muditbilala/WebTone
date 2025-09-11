# WebTone

A Chrome extension that uses AI to detect and filter out negative posts from X.com (formerly Twitter), making your social media experience more positive.

If you don't want to install locally, you can [install directly from th# 🌐 WebTone — Calm Your Feeds

WebTone is a **privacy-first Chrome extension** that hides or blurs hostile posts on platforms like **X (Twitter)**, with optional stats and filters.  
It helps you browse calmer by filtering out **cynical, sarcastic, threatening, political, or racist content** — fully customizable.

---

## ✨ Features

- ✅ **Customizable Filters** → choose which categories to hide/blur (cynical, sarcastic, threatening, political, racist).  
- ✅ **Blur or Hide Mode** → blur posts (tap to reveal) or hide them completely.  
- ✅ **Per-Category Sensitivity** → set thresholds for each filter type or use global sensitivity.  
- ✅ **Allowlist** → never filter certain accounts or keywords.  
- ✅ **Quiet Hours** → auto-enable calm mode during set times (e.g., 10pm–7am).  
- ✅ **Stats Dashboard** → see how many posts were filtered today.  
- ✅ **Account Menu to Top** → easier access to your profile/account switcher on X.  
- ✅ **Show Account Age** → see how old an account is (days, months, years).  
- ✅ **Keyboard Shortcuts** →  
  - `Ctrl/⌘+Shift+M` → Toggle WebTone  
  - `Ctrl/⌘+Shift+S` → Snooze 10 mins  
  - `Ctrl/⌘+Shift+R` → Reveal last hidden post  

---

## 📦 Installation

### From Source (Developer Mode)
1.  Clone or download this repo:
   ```bash
   git clone https://github.com/your-username/webtone.git
   cd webtone
2. Open Chrome and go to chrome://extensions/.

3. Enable Developer Mode (top right).

4. Click Load unpacked and select the webtone folder.

5. WebTone is now installed 🎉


## 📊 Stats Dashboard

See your personal filtering stats at `chrome-extension://<id>/stats.html`.

Example:

* Total posts filtered today
* Breakdown by category (cynical, sarcastic, etc.)
* Recent blocked posts

---

## ⚙️ Settings

Open the extension popup to configure:

* Toggle WebTone on/off
* Blur instead of hide
* Adjust sensitivity sliders
* Allowlist accounts or keywords
* Set quiet hours (auto calm)

All settings sync locally and respect your privacy.

---

## 🔒 Privacy First

* All filtering is done locally in your browser.
* No data is sent to external servers by default.
* Optional **Pro scoring** via your own Cloudflare Worker (advanced users).

---

## 🚀 Roadmap

* Add more categories (toxicity, spam, NSFW, ads).
* Cross-site support (Reddit, YouTube).
* Multi-language detection.
* Cloud backup & sync (Google Drive).
* Firefox & Safari ports.



