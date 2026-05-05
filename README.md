# GradeAI — AI-Powered Assignment Grader

A full-stack application that lets teachers create rubric-based assignments and uses Claude AI to automatically grade student submissions with detailed feedback.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Python FastAPI |
| Database | Supabase (PostgreSQL) |
| AI Grading | Anthropic Claude (claude-haiku-4-5) |

## Project Structure

```
/
├── backend/          FastAPI app + grading logic
├── frontend/         React app
├── database/         SQL migration file
└── README.md
```

## Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **Supabase** account — [supabase.com](https://supabase.com)
- **Anthropic** API key — [console.anthropic.com](https://console.anthropic.com)

---

## Step 1 — Supabase Setup

1. Create a new Supabase project.
2. Go to **SQL Editor** in the Supabase dashboard.
3. Copy and run the contents of `database/migration.sql`.
4. From **Project Settings → API**, copy your **Project URL** and **anon public** key.

---

## Step 2 — Backend Setup

```bash
cd backend

# Copy and fill in environment variables
cp .env.example .env
# Edit .env: set SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_API_KEY

# Install Python dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload
```

API runs at `http://localhost:8000`.  
Swagger docs at `http://localhost:8000/docs`.

---

## Step 3 — Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

App runs at `http://localhost:5173`.

---

## Usage

### Teacher Flow
1. Go to `/teacher/create`
2. Enter your name and the assignment title
3. Add questions — each question needs:
   - Question text + max points
   - Keywords (comma-separated)
   - Concepts required
   - Model answer
   - Explanation notes (optional)
4. Submit → copy the shareable student link

### Student Flow
1. Open the shared link `/student/<assignment_id>`
2. Enter your name
3. Answer all questions (rubric hints available)
4. Submit → AI grades your answers in ~10 seconds
5. View detailed results at `/results/<submission_id>`

### Teacher Review
- View all assignments at `/teacher/dashboard`
- Click an assignment to see all submissions with scores
- Click **View** on any submission for the full grade breakdown

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon key |
| `ANTHROPIC_API_KEY` | Anthropic API key |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (default: `http://localhost:8000`) |
