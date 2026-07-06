export interface Rubric {
  id: string;
  question_id: string;
  keywords: string[];
  concepts_required: string;
  model_answer: string;
  explanation_notes: string;
}

export interface Question {
  id: string;
  assignment_id: string;
  question_text: string;
  max_points: number;
  order_index: number;
  question_type: 'open_ended' | 'mcq';
  options: string[];
  image_url: string | null;
  rubric: Rubric | null;
}

export type AssignmentStatus = 'draft' | 'published' | 'closed';

export interface Assignment {
  id: string;
  title: string;
  teacher_name: string;
  teacher_id?: string;
  created_at: string;
  is_published: boolean;
  status: AssignmentStatus;
  deadline?: string | null;
  time_limit_minutes?: number | null;
  published_at?: string | null;
  questions?: Question[];
  submission_count?: number;
}

export interface User {
  id: string;
  email?: string;
  name: string;
  role: 'teacher' | 'student' | 'admin';
}

export interface StudentAccount {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface AttemptsSummary {
  total_started: number;
  in_progress: number;
  submitted: number;
  graded: number;
}

export interface Attempt {
  id: string;
  assignment_id: string;
  student_id: string;
  answers: Record<string, string>;
  status: 'in_progress' | 'submitted' | 'graded';
  session_token: string | null;
  last_heartbeat: string | null;
  tab_switch_count: number;
  updated_at: string;
}

export interface RubricBreakdown {
  keywords_score: number;
  concepts_score: number;
  explanation_score: number;
  accuracy_score: number;
}

export interface QuestionGrade {
  question_id: string;
  score: number;
  max_score: number;
  feedback: string;
  keywords_found: string[];
  keywords_missing: string[];
  rubric_breakdown: RubricBreakdown;
}

export interface Submission {
  id: string;
  assignment_id: string;
  student_name: string;
  submitted_at: string;
  answers: Record<string, string>;
  grades: QuestionGrade[];
  total_score: number;
  total_max_score: number;
  overall_feedback: string;
}
