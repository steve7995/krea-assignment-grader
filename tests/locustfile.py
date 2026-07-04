"""
Stress test for the Assignment Grader API.

Usage:
    pip install locust
    locust -f tests/locustfile.py --host=https://krea-assignment-grader-production.up.railway.app

Each simulated student runs the full exam flow to completion in one deterministic
sequence (signup -> load assignment -> start attempt -> N autosave/heartbeat rounds
-> submit), then stops itself. This guarantees every spawned user reaches submit
within the test window instead of relying on random task-scheduling luck.
"""

import time
import uuid
import random
from locust import HttpUser, task, between

# ── Config ────────────────────────────────────────────────────────────────────

ASSIGNMENT_ID = "43ad07fc-d95d-438e-bb6f-cd3433b9aa78"  # 29Q Business Management exam, 15-min limit

ANSWER_ROUNDS = 5          # how many autosave+heartbeat cycles before submitting
ROUND_WAIT_SECONDS = (3, 6)  # pause between rounds, mimics time spent answering

SAMPLE_ANSWERS = {
    "open_ended": [
        "SWOT analysis stands for Strengths, Weaknesses, Opportunities, and Threats. It is a strategic planning tool used by businesses to evaluate internal and external factors. Strengths and weaknesses are internal while opportunities and threats are external factors.",
        "A SWOT analysis helps organizations identify their competitive advantages and areas of improvement. Strengths include loyal customers, weaknesses include poor cash flow, opportunities include new markets, threats include competitors.",
        "SWOT is used in business strategy to assess the current position of a company. It covers strengths like brand reputation, weaknesses like limited resources, opportunities in emerging markets and threats from new regulations.",
    ],
    "mission_vision": [
        "A mission statement defines the current purpose of the company. A vision statement defines where the company wants to be in the future. Example mission: Google's mission is to organize the world's information. Example vision: Microsoft's vision is to empower every person on the planet.",
        "Mission is about what the company does today. Vision is about what the company aspires to be tomorrow. Mission example: Tesla - to accelerate the world's transition to sustainable energy. Vision example: Amazon - to be Earth's most customer-centric company.",
        "Mission statements focus on the present purpose and goals. Vision statements focus on long-term aspirations. A mission example is Nike: to bring inspiration to every athlete. A vision example is Apple: to make the best products on earth.",
    ],
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def random_email() -> str:
    return f"testuser_{uuid.uuid4().hex[:8]}@stresstest.com"


def random_answers(question_ids: list) -> dict:
    answers = {}
    for i, qid in enumerate(question_ids):
        if i == 0:
            answers[qid] = random.choice(SAMPLE_ANSWERS["open_ended"])
        elif i == 1:
            answers[qid] = "1"  # MCQ — correct answer index
        else:
            answers[qid] = random.choice(SAMPLE_ANSWERS["mission_vision"])
    return answers


# ── User behaviour ────────────────────────────────────────────────────────────

class StudentUser(HttpUser):
    """Simulates one student taking the exam end-to-end, then stops."""

    wait_time = between(1, 1)

    def on_start(self):
        self.token = None
        self.question_ids = []
        self.session_token = str(uuid.uuid4())

        email = random_email()
        res = self.client.post("/auth/signup", json={
            "email": email,
            "password": "TestPassword123",
            "name": f"Test Student {uuid.uuid4().hex[:4]}",
            "role": "student",
        }, name="/auth/signup")

        if res.status_code != 200:
            self.token = None
            return

        self.token = res.json().get("token")

        res = self.client.get(
            f"/assignments/{ASSIGNMENT_ID}",
            headers=self._headers(),
            name="/assignments/[id]",
        )
        if res.status_code == 200:
            questions = res.json().get("questions", [])
            self.question_ids = [q["id"] for q in questions]

        self.client.post(
            f"/assignments/{ASSIGNMENT_ID}/attempts/start",
            headers=self._headers(),
            name="/attempts/start",
        )

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    @task
    def full_exam_flow(self):
        if not self.token or not self.question_ids:
            self.stop()
            return

        for _ in range(ANSWER_ROUNDS):
            answers = random_answers(self.question_ids)
            self.client.put(
                f"/assignments/{ASSIGNMENT_ID}/attempts/me",
                json={"answers": answers},
                headers=self._headers(),
                name="/attempts/me (autosave)",
            )
            self.client.post(
                f"/assignments/{ASSIGNMENT_ID}/attempts/heartbeat",
                json={"session_token": self.session_token},
                headers=self._headers(),
                name="/attempts/heartbeat",
            )
            time.sleep(random.uniform(*ROUND_WAIT_SECONDS))

        self.client.post(
            f"/assignments/{ASSIGNMENT_ID}/attempts/submit",
            headers=self._headers(),
            name="/attempts/submit",
        )
        self.stop()
