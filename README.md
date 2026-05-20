# Move!

`Move!` is a healing-oriented mind–body web app for people who sit for long stretches.  
It brings together **micro-workouts** and **Eastern-inspired encouragement**: complete short movement breaks between study or work, earn Qi feedback, meet your zodiac cat companion, and receive gentle copy—so self-care becomes a habit you can keep.

**Try it:** [https://move-2h6.pages.dev/](https://move-2h6.pages.dev/)

## Why Move!

- Ease neck, eye, and hand fatigue from sitting; encourage low-barrier daily movement.
- Pair Pomodoro focus with doable micro-goals so reminders become something you can actually finish.
- Close the loop with **Qi points, healing lines, workout check-ins, and diary reflection** to stay motivated.
- Run movement detection in the browser where possible, while your progress and copy are saved on the server—balancing experience, privacy, and growth.

## Main features

### 1. Account
- Register and sign in (username + password).
- Zodiac cat type from your birthday, with moods that follow your focus and workouts.
- Profile and Qi balance in User Center.

### 2. Focus & micro-workouts
- Pomodoro timer on Home (pause, reset, end).
- After a focus session, pick micro-movements; recent choices are de-emphasized so variety stays natural.
- Camera-assisted reps with on-screen guidance, then settlement (Qi + workout record).
- Monthly **workout check-in calendar** to see which days you moved.

### 3. Meridian library
- Browse movements and acupoints on front/back body views—the same moves you can train on Home.

### 4. Energy Station
- **Spark diary**: create, edit, and revisit entries about how you feel.
- **Healing quotes** after workouts; AI copy via Volcengine Doubao, with built-in gentle fallbacks when generation is unavailable.
- **Today’s echo**: relate your diary to curated healing lines and a short, warm explanation.

### 5. User Center & reflection
- **Zen board**: today’s recap, recent trends, and longer-period views.
- **Zen reports** that weave focus time, workouts, and diary into readable encouragement (daily / weekly / monthly / yearly).

### 6. Experience
- Multi-page app: Home, Meridian Library, Energy Station, User Center (login / register).
- Light and dark theme; Pinia for user, training, check-in, and theme state.
- Unified API requests in development via Vite proxy (`/api`).

## Tech stack

### Frontend
- Vue 3 (`<script setup>`)
- Vite
- Tailwind CSS
- Vue Router
- Pinia
- Axios
- MediaPipe Tasks Vision (movement detection)

### Backend
- FastAPI
- SQLAlchemy ORM
- Pydantic
- Uvicorn
- Python-dotenv

### Data & external services
- MySQL (user data, sessions, diaries, workout records, healing copy)
- Volcengine Doubao API (healing copy, diary summaries, Energy Station echo; configure `DOUBAO_API_KEY` and endpoint via environment)
- Built-in fallback copy when AI is unavailable

## Project layout

- `move-frontend/` — web application
- `move-backend/` — API and services
- `requirements.txt` — Python dependencies


---

# Move!

`Move!` 是一个面向久坐人群的治愈系身心协同 Web 应用。  
项目尝试把「微运动干预」与「东方疗愈表达」结合起来：用户在日常学习/办公间隙完成短时动作训练，积累「真气」反馈，遇见专属星座猫咪，并获得温和的鼓励文案，从而形成可持续的自我关照习惯。

**线上体验：** [https://move-2h6.pages.dev/](https://move-2h6.pages.dev/)

## 项目意义

- 缓解久坐带来的肩颈、眼部、手部疲劳，鼓励低门槛日常活动。
- 通过番茄钟与动作任务结合，把「提醒」转化为「可执行的小目标」。
- 以「真气积分 + 疗愈文案 + 运动打卡日历 + 日记沉淀 + 禅意回顾」构建正向反馈闭环，提升坚持动力。
- 采用前后端分离与边缘侧检测思路，在保证体验的同时兼顾隐私与可扩展性。

## 主要功能模块

### 1. 用户与账户
- 注册与登录（用户名 + 密码）。
- 基于生日计算星座猫咪类型，专注与训练过程中猫咪情绪（待机 / 开心 / 疲惫）会随之变化。
- 用户中心查看档案与真气值管理。

### 2. 专注与微运动
- 番茄钟专注计时（可暂停、重置、结束）。
- 专注结束后预选微运动动作；结合最近完成记录，让推荐更自然、少重复。
- 摄像头辅助完成动作组数，结算页累计真气并写入训练记录。
- **运动打卡日历**：按月标记有训练收纳的日期，方便回顾坚持轨迹。

### 3. 经络库
- 正背面人体视图浏览动作与穴位，支持部位聚焦与高亮；与首页训练共用同一套动作，所见即可练。

### 4. 能量站与疗愈文案
- **灵光日记**：记录当下心情与训练后的主观感受，支持增删改查与历史浏览。
- 运动或表现描述可生成疗愈金句并沉淀；AI 文案统一走火山方舟豆包，失败时使用内置温和兜底文案。
- **今日回响**：根据日记内容匹配疗愈金句，并给出简短、贴心的解读。

### 5. 用户中心与禅意回顾
- **禅意看板**：今日回顾、近期趋势与更长周期摘要。
- **禅意报告**：汇总专注时段、微运动与日记摘录，生成可读的中文寄语（支持日 / 周 / 月 / 年等周期）。

### 6. 前端体验与状态管理
- Vue3 单页应用，多页面视图（首页、经络库、能量站、用户中心、登录/注册等）。
- Pinia 管理用户、训练、打卡、主题等核心状态；支持深浅色切换。
- Axios 统一请求封装，开发环境通过 Vite 代理 `/api`。

## 技术栈

### 前端
- Vue 3（`<script setup>`）
- Vite
- Tailwind CSS
- Vue Router
- Pinia
- Axios
- MediaPipe Tasks Vision（动作检测相关能力）

### 后端
- FastAPI
- SQLAlchemy ORM
- Pydantic
- Uvicorn
- Python-dotenv

### 数据与外部服务
- MySQL（业务数据持久化）
- 豆包（火山方舟）API（疗愈金句、日记摘要、能量站回响等；需配置 `DOUBAO_API_KEY`、接入点等）
- 豆包不可用时的本地兜底文案

## 项目结构（简要）

- `move-frontend/`：前端应用代码
- `move-backend/`：后端与服务逻辑
- `requirements.txt`：Python 依赖清单

## 复现/开发版说明

### 环境准备

- **Node.js** 18+、**Python** 3.10+、本地 **MySQL**（默认库名 `move_v2`，连接串见 `move-backend/database.py`）。
- 在**仓库根目录**创建 `.env`（勿提交），至少配置：
  - `MOVEV2_DATABASE_URL` — MySQL 连接（示例：`mysql+pymysql://root:密码@localhost:3306/move_v2`）
  - `DOUBAO_API_KEY`、`DOUBAO_ENDPOINT_ID`（或 `DOUBAO_MODEL`）— 疗愈文案 / 能量站 AI
  - 可选：`ENERGY_PGVECTOR_URL` — 能量站向量库（本地可用 `move-backend/docker-compose.pgvector.yml` + `scripts/start_pgvector_docker.ps1`）
- **勿将 API Key 写入前端**；`move-frontend/.env` 仅用于生产构建时的 `VITE_API_BASE_URL`，开发时留空即可（走 Vite 代理）。
- 后端业务数据统一经 **SQLAlchemy ORM** 访问 MySQL。

### 本地启动（开发联调）

先启后端，再启前端。后端默认 `http://127.0.0.1:8001`，前端默认 `http://127.0.0.1:5173`（端口占用时会自动递增），`/api` 由 Vite 代理到后端。

**后端启动步骤**：

```powershell
cd move-backend
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

若使用仓库内虚拟环境 `moveV2`，也可执行：`.\start_dev.ps1`（会自动释放 8001 端口并启动）。

**前端启动步骤**：

```powershell
cd move-frontend
npm install
npm run dev
```

浏览器访问终端提示的本地地址（一般为 `http://127.0.0.1:5173`）。首次使用能量站向量能力时，可按需运行 `move-backend/scripts/init_energy_station_kb.ps1` 初始化知识库。

## 部署

当前线上：**前端**托管于 [Cloudflare Pages](https://move-2h6.pages.dev/)，**后端**为独立 HTTPS API 服务（Railway），浏览器在生产环境通过 `VITE_API_BASE_URL` 直连 API。