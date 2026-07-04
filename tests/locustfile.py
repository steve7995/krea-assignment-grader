"""
Stress test for the Assignment Grader API.

Usage:
    pip install locust
    locust -f tests/locustfile.py --host=https://krea-assignment-grader-production.up.railway.app

Then open http://localhost:8089 and set:
    - Number of users: 10 (start), then 50, then 300
    - Spawn rate: 2 (users added per second)
    - Host: pre-filled from command above

The test simulates the full student exam flow:
    signup → start attempt → autosave (every 10s) + heartbeat (every 10s) → submit
"""

import uuid
import random
from locust import HttpUser, task, between, events

# ── Config ────────────────────────────────────────────────────────────────────

ASSIGNMENT_ID = "1074753b-f5c1-4904-bad7-17b9c96c5ef6"  # 30Q Business Management exam

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
    """Simulates one student taking the exam end-to-end."""

    wait_time = between(8, 12)  # seconds between tasks (mimics autosave interval)

    def on_start(self):
        """Called once when the simulated user starts. Signup + get assignment."""
        self.token = None
        self.question_ids = []
        self.session_token = str(uuid.uuid4())
        self.submitted = False
        self.save_count = 0

        # 1. Sign up as a fresh student
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

        # 2. Fetch assignment to get question IDs
        res = self.client.get(
            f"/assignments/{ASSIGNMENT_ID}",
            headers=self._headers(),
            name="/assignments/[id]",
        )
        if res.status_code == 200:
            questions = res.json().get("questions", [])
            self.question_ids = [q["id"] for q in questions]

        # 3. Start attempt
        self.client.post(
            f"/assignments/{ASSIGNMENT_ID}/attempts/start",
            headers=self._headers(),
            name="/attempts/start",
        )

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    @task(3)
    def autosave(self):
        """Autosave answers — highest frequency task."""
        if not self.token or self.submitted or not self.question_ids:
            return
        answers = random_answers(self.question_ids)
        self.client.put(
            f"/assignments/{ASSIGNMENT_ID}/attempts/me",
            json={"answers": answers},
            headers=self._headers(),
            name="/attempts/me (autosave)",
        )
        self.save_count += 1

    @task(3)
    def heartbeat(self):
        """Send heartbeat to keep session alive."""
        if not self.token or self.submitted:
            return
        self.client.post(
            f"/assignments/{ASSIGNMENT_ID}/attempts/heartbeat",
            json={"session_token": self.session_token},
            headers=self._headers(),
            name="/attempts/heartbeat",
        )

    @task(1)
    def submit(self):
        """Submit after enough autosaves (simulates ~2 minutes of work)."""
        if not self.token or self.submitted or self.save_count < 3:
            return
        res = self.client.post(
            f"/assignments/{ASSIGNMENT_ID}/attempts/submit",
            headers=self._headers(),
            name="/attempts/submit",
        )
        if res.status_code == 200:
            self.submitted = True

    def on_stop(self):
        pass


