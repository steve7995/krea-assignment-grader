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
  rubric: Rubric | null;
}

export interface Assignment {
  id: string;
  title: string;
  teacher_name: string;
  created_at: string;
  is_published: boolean;
  questions?: Question[];
  submission_count?: number;
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
