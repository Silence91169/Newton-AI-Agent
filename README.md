# Newton AI Agent ⚡️

Auto-solve MCQs, live quizzes, and coding problems on my.newtonschool.co

![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-%20-green?logo=fastapi)
![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-red?logo=googlechrome)

---

## What it does

- 🧠 Chrome extension that automatically solves MCQs, live quizzes, and coding problems on `my.newtonschool.co`
- 🔑 Uses your own LLM API key (Groq, OpenAI, Claude, Gemini, NVIDIA)
- ✅ No account needed — just install the extension and add your API key

---

## Setup (for Newton School students)

### Step 1 — Download the extension

1. Go to [https://github.com/Silence91169/Newton-AI-Agent](https://github.com/Silence91169/Newton-AI-Agent)
2. Click **Code** → **Download ZIP**
3. Extract the ZIP file anywhere on your computer

### Step 2 — Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer Mode** (toggle in top right corner)
3. Click **Load unpacked**
4. Select the `extension` folder from the extracted ZIP

### Step 3 — Get a free API key

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up for free
3. Click **Create API Key** and copy it (starts with `gsk_...`)

### Step 4 — Add your API key

1. Click the Newton AI Agent icon in your Chrome toolbar
2. Click **Add API Key**
3. Paste your key and click **Save**

### Step 5 — Use it

1. Log into `my.newtonschool.co` normally
2. Open any MCQ, live quiz, or coding problem
3. The extension detects and solves it automatically 🎯

---

## Supported task types

| Task | Status |
|---|---|
| MCQ | ✅ Working |
| Live Quiz | ✅ Working |
| Coding Problems | ⚠️ Works but accuracy varies |

---

## Supported LLM providers

| Provider | Get your key |
|---|---|
| Groq (free, recommended) | [console.groq.com](https://console.groq.com/keys) |
| OpenAI (GPT-4o) | [platform.openai.com](https://platform.openai.com) |
| Anthropic (Claude) | [console.anthropic.com](https://console.anthropic.com) |
| Google (Gemini) | [aistudio.google.com](https://aistudio.google.com) |
| NVIDIA NIM | [build.nvidia.com](https://build.nvidia.com) |

---

## Tech stack

- Chrome Extension (Manifest V3)
- FastAPI backend (hosted on Render)
- Supabase database
- Groq / OpenAI compatible LLMs

---

## Disclaimer

This is a personal learning project. Use responsibly and in accordance with your institution's academic integrity policies. 🙏