-- Assignment Grader Database Migration
-- Run this in your Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_published BOOLEAN DEFAULT FALSE
);

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  max_points INTEGER NOT NULL DEFAULT 10,
  order_index INTEGER NOT NULL DEFAULT 0
);

-- Rubrics table
CREATE TABLE IF NOT EXISTS rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  keywords TEXT[] DEFAULT '{}',
  concepts_required TEXT DEFAULT '',
  model_answer TEXT DEFAULT '',
  explanation_notes TEXT DEFAULT ''
);

-- Submissions table
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  answers JSONB DEFAULT '{}',
  grades JSONB DEFAULT '[]',
  total_score FLOAT DEFAULT 0,
  total_max_score FLOAT DEFAULT 0,
  overall_feedback TEXT DEFAULT ''
);

-- New columns for question types and images
ALTER TABLE questions ADD COLUMN IF NOT EXISTS question_type TEXT DEFAULT 'open_ended';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]';
ALTER TABLE questions ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_assignment_id ON questions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_rubrics_question_id ON rubrics(question_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_id ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

-- ── Auth, assignment locking & autosave (added) ──────────────────────────────

-- Users table (teachers and students)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assignment ownership + lifecycle
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES users(id);
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'; -- draft | published | closed
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS deadline TIMESTAMP WITH TIME ZONE;

-- In-progress student attempts (autosave + locking), separate from graded submissions
CREATE TABLE IF NOT EXISTS attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  answers JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | graded
  session_token TEXT,
  last_heartbeat TIMESTAMP WITH TIME ZONE,
  tab_switch_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

-- Link graded submissions back to the student and originating attempt
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS attempt_id UUID REFERENCES attempts(id);

CREATE INDEX IF NOT EXISTS idx_attempts_assignment_id ON attempts(assignment_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Time limit and auto-close support
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS published_at TIMESTAMP WITH TIME ZONE;

-- ── Admin role (global student roster + password reset) ──────────────────────
-- Admin is assigned by hand (direct DB update), never via signup.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('teacher', 'student', 'admin'));
