from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import anthropic
import httpx
import os
import uuid
import json
import re
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Assignment Grader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
_SUPABASE_KEY = os.environ["SUPABASE_KEY"]
_REST = f"{_SUPABASE_URL}/rest/v1"
_BASE_HEADERS = {
    "apikey": _SUPABASE_KEY,
    "Authorization": f"Bearer {_SUPABASE_KEY}",
    "Content-Type": "application/json",
}

anthropic_client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


# ── Supabase REST helpers ────────────────────────────────────────────────────

async def db_select(
    table: str,
    *,
    eq: Optional[dict] = None,
    select: str = "*",
    order: Optional[str] = None,
) -> list:
    params: dict = {"select": select}
    if eq:
        for k, v in eq.items():
            params[k] = f"eq.{v}"
    if order:
        params["order"] = order
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{_REST}/{table}", params=params, headers=_BASE_HEADERS)
        r.raise_for_status()
        return r.json()


async def db_insert(table: str, data: dict) -> dict:
    headers = {**_BASE_HEADERS, "Prefer": "return=representation"}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{_REST}/{table}", json=data, headers=headers)
        r.raise_for_status()
        result = r.json()
        return result[0] if isinstance(result, list) else result


async def db_count(table: str, *, eq: Optional[dict] = None) -> int:
    rows = await db_select(table, eq=eq, select="id")
    return len(rows)


# ── Pydantic Models ──────────────────────────────────────────────────────────

class RubricInput(BaseModel):
    keywords: List[str]
    concepts_required: str
    model_answer: str
    explanation_notes: str


class QuestionInput(BaseModel):
    question_text: str
    max_points: int
    rubric: RubricInput


class AssignmentCreate(BaseModel):
    title: str
    teacher_name: str
    questions: List[QuestionInput]


class AnswerInput(BaseModel):
    question_id: str
    answer_text: str


class SubmissionCreate(BaseModel):
    student_name: str
    answers: List[AnswerInput]


# ── Grading helpers ──────────────────────────────────────────────────────────

def extract_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return json.loads(match.group(1))
    return json.loads(text.strip())


def build_grading_prompt(assignment: dict, submission: SubmissionCreate) -> str:
    answers_map = {a.question_id: a.answer_text for a in submission.answers}

    questions_section = ""
    for q in assignment["questions"]:
        rubric = q.get("rubric") or {}
        answer = answers_map.get(q["id"], "No answer provided")
        keywords = rubric.get("keywords", [])
        keywords_str = ", ".join(keywords) if isinstance(keywords, list) else str(keywords)

        questions_section += f"""
---
Question ID: {q["id"]}
Question: {q["question_text"]}
Max Points: {q["max_points"]}
Keywords to look for: {keywords_str}
Concepts required: {rubric.get("concepts_required", "")}
Model answer: {rubric.get("model_answer", "")}
Explanation notes: {rubric.get("explanation_notes", "")}
Student's answer: {answer}
"""

    return f"""You are an AI grading assistant. Grade the following student submission for the assignment titled "{assignment["title"]}".

Evaluate each student answer against its rubric. Be fair but thorough.

Questions and Rubrics:
{questions_section}

Return ONLY valid JSON with no additional text, markdown, or explanation. Use this exact structure:
{{
  "questions": [
    {{
      "question_id": "<exact question id from above>",
      "score": <number between 0 and max_points>,
      "max_score": <max_points value>,
      "feedback": "<specific, constructive feedback>",
      "keywords_found": ["<keywords present in the student answer>"],
      "keywords_missing": ["<keywords absent from the student answer>"],
      "rubric_breakdown": {{
        "keywords_score": <0-100>,
        "concepts_score": <0-100>,
        "explanation_score": <0-100>,
        "accuracy_score": <0-100>
      }}
    }}
  ],
  "total_score": <sum of all question scores>,
  "total_max_score": <sum of all max_points>,
  "overall_feedback": "<overall feedback paragraph>"
}}"""


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/assignments")
async def create_assignment(data: AssignmentCreate):
    assignment_id = str(uuid.uuid4())

    await db_insert("assignments", {
        "id": assignment_id,
        "title": data.title,
        "teacher_name": data.teacher_name,
        "is_published": False,
    })

    for idx, q in enumerate(data.questions):
        question_id = str(uuid.uuid4())
        await db_insert("questions", {
            "id": question_id,
            "assignment_id": assignment_id,
            "question_text": q.question_text,
            "max_points": q.max_points,
            "order_index": idx,
        })
        await db_insert("rubrics", {
            "id": str(uuid.uuid4()),
            "question_id": question_id,
            "keywords": q.rubric.keywords,
            "concepts_required": q.rubric.concepts_required,
            "model_answer": q.rubric.model_answer,
            "explanation_notes": q.rubric.explanation_notes,
        })

    return {"assignment_id": assignment_id}


@app.get("/assignments")
async def list_assignments():
    assignments = await db_select("assignments", order="created_at.desc")
    for a in assignments:
        a["submission_count"] = await db_count("submissions", eq={"assignment_id": a["id"]})
    return assignments


@app.get("/assignments/{assignment_id}")
async def get_assignment(assignment_id: str):
    rows = await db_select("assignments", eq={"id": assignment_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment = rows[0]
    questions = await db_select(
        "questions",
        eq={"assignment_id": assignment_id},
        order="order_index.asc",
    )

    questions_with_rubrics = []
    for q in questions:
        rubrics = await db_select("rubrics", eq={"question_id": q["id"]})
        questions_with_rubrics.append({**q, "rubric": rubrics[0] if rubrics else None})

    return {**assignment, "questions": questions_with_rubrics}


@app.post("/assignments/{assignment_id}/submit")
async def submit_assignment(assignment_id: str, submission: SubmissionCreate):
    assignment = await get_assignment(assignment_id)

    prompt = build_grading_prompt(assignment, submission)

    message = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text

    try:
        grade_result = extract_json(response_text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse AI grading response: {exc}",
        )

    submission_id = str(uuid.uuid4())
    answers_dict = {a.question_id: a.answer_text for a in submission.answers}

    await db_insert("submissions", {
        "id": submission_id,
        "assignment_id": assignment_id,
        "student_name": submission.student_name,
        "answers": answers_dict,
        "grades": grade_result.get("questions", []),
        "total_score": grade_result.get("total_score", 0),
        "total_max_score": grade_result.get("total_max_score", 0),
        "overall_feedback": grade_result.get("overall_feedback", ""),
    })

    return {"submission_id": submission_id, **grade_result}


@app.get("/submissions/{submission_id}")
async def get_submission(submission_id: str):
    rows = await db_select("submissions", eq={"id": submission_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Submission not found")
    return rows[0]


@app.get("/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(assignment_id: str):
    return await db_select(
        "submissions",
        eq={"assignment_id": assignment_id},
        order="submitted_at.desc",
    )
