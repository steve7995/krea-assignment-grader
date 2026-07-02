from fastapi import FastAPI, HTTPException, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import anthropic
import httpx
import os
import uuid
import json
import re
from dotenv import load_dotenv

import auth as auth_module
from auth import CurrentUser, get_current_user, require_teacher, require_student

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

_HEARTBEAT_TIMEOUT_SECONDS = 30


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_deadline(assignment: dict) -> Optional[datetime]:
    published_at = assignment.get("published_at")
    time_limit = assignment.get("time_limit_minutes")
    if not published_at or not time_limit:
        return None
    published = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    return published + timedelta(minutes=time_limit)


def is_deadline_passed(assignment: dict) -> bool:
    deadline = get_deadline(assignment)
    if deadline is None:
        return False
    return datetime.now(timezone.utc) > deadline


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


async def db_update(table: str, *, eq: dict, data: dict) -> list:
    headers = {**_BASE_HEADERS, "Prefer": "return=representation"}
    params = {k: f"eq.{v}" for k, v in eq.items()}
    async with httpx.AsyncClient() as client:
        r = await client.patch(f"{_REST}/{table}", params=params, json=data, headers=headers)
        r.raise_for_status()
        return r.json()


async def db_count(table: str, *, eq: Optional[dict] = None) -> int:
    rows = await db_select(table, eq=eq, select="id")
    return len(rows)


# ── Pydantic Models ──────────────────────────────────────────────────────────

class RubricInput(BaseModel):
    keywords: List[str] = []
    concepts_required: str = ""
    model_answer: str = ""
    explanation_notes: str = ""


class QuestionInput(BaseModel):
    question_text: str
    max_points: int
    question_type: str = "open_ended"  # "open_ended" or "mcq"
    options: List[str] = []
    image_url: Optional[str] = None
    rubric: RubricInput


class AssignmentCreate(BaseModel):
    title: str
    time_limit_minutes: Optional[int] = None
    questions: List[QuestionInput]


class SignupRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str  # "teacher" or "student"


class LoginRequest(BaseModel):
    email: str
    password: str


class AttemptSave(BaseModel):
    answers: dict


class HeartbeatRequest(BaseModel):
    session_token: str


# ── Grading helpers ──────────────────────────────────────────────────────────

def extract_json(text: str) -> dict:
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return json.loads(match.group(1))
    return json.loads(text.strip())


_JSON_SCHEMA = """\nReturn ONLY valid JSON with no additional text, markdown, or explanation. Use this exact structure:
{
  "questions": [
    {
      "question_id": "<exact question id from above>",
      "score": <number between 0 and max_points>,
      "max_score": <max_points value>,
      "feedback": "<specific, constructive feedback>",
      "keywords_found": ["<keywords present in the student answer>"],
      "keywords_missing": ["<keywords absent from the student answer>"],
      "rubric_breakdown": {
        "keywords_score": <0-100>,
        "concepts_score": <0-100>,
        "explanation_score": <0-100>,
        "accuracy_score": <0-100>
      }
    }
  ],
  "total_score": <sum of all question scores>,
  "total_max_score": <sum of all max_points>,
  "overall_feedback": "<overall feedback paragraph>"
}"""


def build_grading_messages(assignment: dict, answers_map: dict) -> list:
    """Build Anthropic API messages, supporting both text and image answers."""
    image_answers = []  # list of (question_id, url)
    questions_section = ""

    for q in assignment["questions"]:
        rubric = q.get("rubric") or {}
        raw_answer = answers_map.get(q["id"], "No answer provided")
        keywords = rubric.get("keywords", [])
        keywords_str = ", ".join(keywords) if isinstance(keywords, list) else str(keywords)

        if raw_answer.startswith("[IMAGE]"):
            image_url = raw_answer[7:]
            image_answers.append((q["id"], image_url))
            answer_desc = f"[Student submitted a handwritten/drawn image — see image block tagged IMG_{q['id']} below]"
        else:
            answer_desc = raw_answer

        questions_section += f"""
---
Question ID: {q["id"]}
Question: {q["question_text"]}
Max Points: {q["max_points"]}
Keywords to look for: {keywords_str}
Concepts required: {rubric.get("concepts_required", "")}
Model answer: {rubric.get("model_answer", "")}
Explanation notes: {rubric.get("explanation_notes", "")}
Student's answer: {answer_desc}
"""

    header = (
        f'You are an AI grading assistant. Grade the student submission for "{assignment["title"]}".\n'
        f"Evaluate each answer against its rubric. Be fair but thorough.\n\n"
        f"Questions and Rubrics:\n{questions_section}"
    )

    if not image_answers:
        return [{"role": "user", "content": header + _JSON_SCHEMA}]

    # Multimodal: interleave text + image blocks
    content: list = [{"type": "text", "text": header}]
    for qid, url in image_answers:
        content.append({"type": "text", "text": f"\nIMG_{qid}:"})
        content.append({"type": "image", "source": {"type": "url", "url": url}})
    content.append({"type": "text", "text": _JSON_SCHEMA})
    return [{"role": "user", "content": content}]


def grade_mcq(q: dict, student_answer: str) -> dict:
    rubric = q.get("rubric") or {}
    options = q.get("options") or []
    try:
        correct_index = int(rubric.get("model_answer", "0"))
    except (ValueError, TypeError):
        correct_index = 0

    try:
        selected_index = int(student_answer)
    except (ValueError, TypeError):
        selected_index = -1

    is_correct = selected_index == correct_index
    correct_text = options[correct_index] if correct_index < len(options) else "N/A"

    return {
        "question_id": q["id"],
        "score": q["max_points"] if is_correct else 0,
        "max_score": q["max_points"],
        "feedback": "Correct!" if is_correct else f"Incorrect. The correct answer was: {correct_text}",
        "keywords_found": [],
        "keywords_missing": [],
        "rubric_breakdown": {
            "keywords_score": 100 if is_correct else 0,
            "concepts_score": 100 if is_correct else 0,
            "explanation_score": 100 if is_correct else 0,
            "accuracy_score": 100 if is_correct else 0,
        },
    }


async def grade_attempt(assignment: dict, answers_map: dict) -> dict:
    """Grade a full set of answers against an assignment. Shared by the close-assignment flow."""
    mcq_questions = [q for q in assignment["questions"] if q.get("question_type") == "mcq"]
    oe_questions = [q for q in assignment["questions"] if q.get("question_type") != "mcq"]

    mcq_grades = [grade_mcq(q, answers_map.get(q["id"], "")) for q in mcq_questions]

    oe_grades = []
    overall_feedback = ""
    if oe_questions:
        oe_assignment = {**assignment, "questions": oe_questions}
        messages = build_grading_messages(oe_assignment, answers_map)
        message = anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=4096,
            messages=messages,
        )
        try:
            grade_result = extract_json(message.content[0].text)
            oe_grades = grade_result.get("questions", [])
            overall_feedback = grade_result.get("overall_feedback", "")
        except (json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(status_code=500, detail=f"Failed to parse AI grading response: {exc}")

    grades_by_id = {g["question_id"]: g for g in mcq_grades + oe_grades}
    ordered_grades = [grades_by_id[q["id"]] for q in assignment["questions"] if q["id"] in grades_by_id]

    total_score = sum(g["score"] for g in ordered_grades)
    total_max = sum(g["max_score"] for g in ordered_grades)

    if not overall_feedback:
        pct = round(total_score / total_max * 100) if total_max > 0 else 0
        overall_feedback = f"You scored {total_score}/{total_max} ({pct}%) on this assignment."

    return {
        "questions": ordered_grades,
        "total_score": total_score,
        "total_max_score": total_max,
        "overall_feedback": overall_feedback,
    }


async def load_assignment_with_questions(assignment_id: str) -> dict:
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


# ── Auth endpoints ───────────────────────────────────────────────────────────

@app.post("/auth/signup")
async def signup(data: SignupRequest):
    if data.role not in ("teacher", "student"):
        raise HTTPException(status_code=400, detail="Role must be 'teacher' or 'student'")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    existing = await db_select("users", eq={"email": data.email.lower().strip()})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = await db_insert("users", {
        "id": str(uuid.uuid4()),
        "email": data.email.lower().strip(),
        "password_hash": auth_module.hash_password(data.password),
        "role": data.role,
        "name": data.name.strip(),
    })

    token = auth_module.create_token(user["id"], user["role"], user["name"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}


@app.post("/auth/login")
async def login(data: LoginRequest):
    rows = await db_select("users", eq={"email": data.email.lower().strip()})
    if not rows or not auth_module.verify_password(data.password, rows[0]["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = rows[0]
    token = auth_module.create_token(user["id"], user["role"], user["name"])
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}


@app.get("/auth/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    return {"id": user.id, "name": user.name, "role": user.role}


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/upload-image")
async def upload_image(file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    contents = await file.read()
    ext = os.path.splitext(file.filename or "image.png")[1] or ".png"
    filename = f"{uuid.uuid4()}{ext}"

    storage_url = f"{_SUPABASE_URL}/storage/v1/object/question-images/{filename}"
    headers = {
        "apikey": _SUPABASE_KEY,
        "Authorization": f"Bearer {_SUPABASE_KEY}",
        "Content-Type": file.content_type or "application/octet-stream",
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(storage_url, content=contents, headers=headers)
        r.raise_for_status()

    public_url = f"{_SUPABASE_URL}/storage/v1/object/public/question-images/{filename}"
    return {"url": public_url}


@app.post("/assignments")
async def create_assignment(data: AssignmentCreate, user: CurrentUser = Depends(require_teacher)):
    assignment_id = str(uuid.uuid4())

    await db_insert("assignments", {
        "id": assignment_id,
        "title": data.title,
        "teacher_name": user.name,
        "teacher_id": user.id,
        "status": "draft",
        "is_published": False,
        "time_limit_minutes": data.time_limit_minutes,
    })

    for idx, q in enumerate(data.questions):
        question_id = str(uuid.uuid4())
        await db_insert("questions", {
            "id": question_id,
            "assignment_id": assignment_id,
            "question_text": q.question_text,
            "max_points": q.max_points,
            "order_index": idx,
            "question_type": q.question_type,
            "options": q.options,
            "image_url": q.image_url,
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


@app.post("/assignments/{assignment_id}/publish")
async def publish_assignment(assignment_id: str, user: CurrentUser = Depends(require_teacher)):
    rows = await db_select("assignments", eq={"id": assignment_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if rows[0]["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this assignment")

    await db_update("assignments", eq={"id": assignment_id}, data={
        "status": "published",
        "is_published": True,
        "published_at": now_iso(),
    })
    return {"status": "published"}


@app.post("/assignments/{assignment_id}/close")
async def close_assignment(assignment_id: str, user: CurrentUser = Depends(require_teacher)):
    rows = await db_select("assignments", eq={"id": assignment_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if rows[0]["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this assignment")
    if rows[0]["status"] == "closed":
        raise HTTPException(status_code=400, detail="Assignment is already closed")

    await db_update("assignments", eq={"id": assignment_id}, data={"status": "closed"})

    # Grade any remaining in_progress attempts that don't have a submission yet
    assignment = await load_assignment_with_questions(assignment_id)
    all_attempts = await db_select("attempts", eq={"assignment_id": assignment_id})
    ungraded = [a for a in all_attempts if a["status"] == "in_progress"]

    graded_count = 0
    for attempt in ungraded:
        existing_sub = await db_select("submissions", eq={"assignment_id": assignment_id, "student_id": attempt["student_id"]})
        if existing_sub:
            await db_update("attempts", eq={"id": attempt["id"]}, data={"status": "graded"})
            continue

        answers_map = attempt.get("answers") or {}
        result = await grade_attempt(assignment, answers_map)

        student_rows = await db_select("users", eq={"id": attempt["student_id"]})
        student_name = student_rows[0]["name"] if student_rows else ""

        await db_insert("submissions", {
            "id": str(uuid.uuid4()),
            "assignment_id": assignment_id,
            "student_id": attempt["student_id"],
            "attempt_id": attempt["id"],
            "student_name": student_name,
            "answers": answers_map,
            "grades": result["questions"],
            "total_score": result["total_score"],
            "total_max_score": result["total_max_score"],
            "overall_feedback": result["overall_feedback"],
        })

        await db_update("attempts", eq={"id": attempt["id"]}, data={"status": "graded"})
        graded_count += 1

    return {"status": "closed", "graded_count": graded_count}


@app.get("/assignments")
async def list_assignments(user: CurrentUser = Depends(require_teacher)):
    assignments = await db_select("assignments", eq={"teacher_id": user.id}, order="created_at.desc")
    for a in assignments:
        a["submission_count"] = await db_count("submissions", eq={"assignment_id": a["id"]})
    return assignments


@app.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, user: CurrentUser = Depends(require_teacher)):
    rows = await db_select("assignments", eq={"id": assignment_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if rows[0]["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="You do not own this assignment")
    async with httpx.AsyncClient() as client:
        r = await client.delete(
            f"{_REST}/assignments",
            params={"id": f"eq.{assignment_id}"},
            headers=_BASE_HEADERS,
        )
        r.raise_for_status()
    return {"deleted": True}


@app.get("/assignments/{assignment_id}")
async def get_assignment(assignment_id: str, user: CurrentUser = Depends(get_current_user)):
    return await load_assignment_with_questions(assignment_id)


# ── Student attempts (autosave, resume, locking) ─────────────────────────────

@app.post("/assignments/{assignment_id}/attempts/start")
async def start_attempt(assignment_id: str, user: CurrentUser = Depends(require_student)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if not assignment_rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment_rows[0]["status"] != "published":
        raise HTTPException(status_code=400, detail="This assignment is not currently open")

    existing = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if existing:
        return existing[0]

    attempt = await db_insert("attempts", {
        "id": str(uuid.uuid4()),
        "assignment_id": assignment_id,
        "student_id": user.id,
        "answers": {},
        "status": "in_progress",
    })
    return attempt


@app.get("/assignments/{assignment_id}/attempts/me")
async def get_my_attempt(assignment_id: str, user: CurrentUser = Depends(require_student)):
    rows = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not rows:
        raise HTTPException(status_code=404, detail="No attempt found — call start first")
    return rows[0]


@app.put("/assignments/{assignment_id}/attempts/me")
async def save_my_attempt(assignment_id: str, data: AttemptSave, user: CurrentUser = Depends(require_student)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if not assignment_rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment_rows[0]["status"] != "published":
        raise HTTPException(status_code=400, detail="This assignment is no longer open for editing")

    if is_deadline_passed(assignment_rows[0]):
        raise HTTPException(status_code=400, detail="Time's up — the assignment deadline has passed")

    attempt_rows = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not attempt_rows:
        raise HTTPException(status_code=404, detail="No attempt found — call start first")
    if attempt_rows[0]["status"] != "in_progress":
        raise HTTPException(status_code=400, detail="You have already submitted — answers are locked")

    updated = await db_update(
        "attempts",
        eq={"assignment_id": assignment_id, "student_id": user.id},
        data={"answers": data.answers, "updated_at": now_iso()},
    )
    return updated[0]


@app.post("/assignments/{assignment_id}/attempts/submit")
async def submit_my_attempt(assignment_id: str, user: CurrentUser = Depends(require_student)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if not assignment_rows:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment_rows[0]["status"] not in ("published", "closed"):
        raise HTTPException(status_code=400, detail="This assignment is not open for submission")

    attempt_rows = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not attempt_rows:
        raise HTTPException(status_code=404, detail="No attempt found — call start first")

    if attempt_rows[0]["status"] != "in_progress":
        # Already graded — return existing submission so frontend can redirect
        sub_rows = await db_select("submissions", eq={"assignment_id": assignment_id, "student_id": user.id})
        if sub_rows:
            return {"submission_id": sub_rows[0]["id"], "graded": True}
        raise HTTPException(status_code=400, detail="You have already submitted")

    # Grade immediately
    assignment = await load_assignment_with_questions(assignment_id)
    answers_map = attempt_rows[0].get("answers") or {}
    result = await grade_attempt(assignment, answers_map)

    submission = await db_insert("submissions", {
        "id": str(uuid.uuid4()),
        "assignment_id": assignment_id,
        "student_id": user.id,
        "attempt_id": attempt_rows[0]["id"],
        "student_name": user.name,
        "answers": answers_map,
        "grades": result["questions"],
        "total_score": result["total_score"],
        "total_max_score": result["total_max_score"],
        "overall_feedback": result["overall_feedback"],
    })

    await db_update("attempts", eq={"id": attempt_rows[0]["id"]}, data={"status": "graded", "updated_at": now_iso()})

    return {"submission_id": submission["id"], "graded": True}


@app.post("/assignments/{assignment_id}/attempts/heartbeat")
async def heartbeat(assignment_id: str, data: HeartbeatRequest, user: CurrentUser = Depends(require_student)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if assignment_rows and is_deadline_passed(assignment_rows[0]):
        return {"locked": False, "deadline_passed": True}

    rows = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not rows:
        raise HTTPException(status_code=404, detail="No attempt found — call start first")

    attempt = rows[0]
    last_heartbeat = attempt.get("last_heartbeat")
    held_token = attempt.get("session_token")

    if held_token and held_token != data.session_token and last_heartbeat:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(last_heartbeat.replace("Z", "+00:00"))).total_seconds()
        if age < _HEARTBEAT_TIMEOUT_SECONDS:
            raise HTTPException(status_code=409, detail="This assignment is already open in another tab or device")

    await db_update(
        "attempts",
        eq={"assignment_id": assignment_id, "student_id": user.id},
        data={"session_token": data.session_token, "last_heartbeat": now_iso()},
    )
    return {"locked": False, "deadline_passed": False}


@app.post("/assignments/{assignment_id}/attempts/tab-event")
async def tab_event(assignment_id: str, user: CurrentUser = Depends(require_student)):
    rows = await db_select("attempts", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not rows:
        return {"ok": True}
    current_count = rows[0].get("tab_switch_count") or 0
    await db_update(
        "attempts",
        eq={"assignment_id": assignment_id, "student_id": user.id},
        data={"tab_switch_count": current_count + 1},
    )
    return {"ok": True}


@app.get("/assignments/{assignment_id}/attempts/summary")
async def attempts_summary(assignment_id: str, user: CurrentUser = Depends(require_teacher)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if not assignment_rows or assignment_rows[0]["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not your assignment")

    attempts = await db_select("attempts", eq={"assignment_id": assignment_id})
    in_progress = sum(1 for a in attempts if a["status"] == "in_progress")
    submitted = sum(1 for a in attempts if a["status"] == "submitted")
    graded = sum(1 for a in attempts if a["status"] == "graded")
    return {
        "total_started": len(attempts),
        "in_progress": in_progress,
        "submitted": submitted,
        "graded": graded,
    }


@app.get("/assignments/{assignment_id}/my-submission")
async def my_submission(assignment_id: str, user: CurrentUser = Depends(require_student)):
    rows = await db_select("submissions", eq={"assignment_id": assignment_id, "student_id": user.id})
    if not rows:
        raise HTTPException(status_code=404, detail="Not graded yet")
    return rows[0]


@app.get("/submissions/{submission_id}")
async def get_submission(submission_id: str, user: CurrentUser = Depends(get_current_user)):
    rows = await db_select("submissions", eq={"id": submission_id})
    if not rows:
        raise HTTPException(status_code=404, detail="Submission not found")

    submission = rows[0]
    if user.role == "student" and submission.get("student_id") != user.id:
        raise HTTPException(status_code=403, detail="Not your submission")
    if user.role == "teacher":
        assignment_rows = await db_select("assignments", eq={"id": submission["assignment_id"]})
        if not assignment_rows or assignment_rows[0]["teacher_id"] != user.id:
            raise HTTPException(status_code=403, detail="Not your assignment")

    return submission


@app.get("/assignments/{assignment_id}/submissions")
async def get_assignment_submissions(assignment_id: str, user: CurrentUser = Depends(require_teacher)):
    assignment_rows = await db_select("assignments", eq={"id": assignment_id})
    if not assignment_rows or assignment_rows[0]["teacher_id"] != user.id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    return await db_select(
        "submissions",
        eq={"assignment_id": assignment_id},
        order="submitted_at.desc",
    )
