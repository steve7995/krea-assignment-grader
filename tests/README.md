# Stress Tests

## Setup

```bash
pip install locust
```

## Run

```bash
locust -f tests/locustfile.py --host=https://krea-assignment-grader-production.up.railway.app
```

Then open http://localhost:8089

## Test plan

| Phase | Users | Spawn rate | Goal |
|-------|-------|------------|------|
| Smoke | 10 | 2/s | Everything works |
| Load | 50 | 5/s | Find slow endpoints |
| Stress | 150 | 10/s | Find breaking point |
| Peak | 300 | 10/s | Simulate real exam |

## What to watch

- Response time autosave: should stay under 500ms
- Response time submit/grade: under 15s is fine (Claude takes time)
- Error rate: should be 0% for autosave/heartbeat, <1% overall
- DB connection errors: any = upgrade Supabase to Pro

## Assignment used for testing

ID: 00618477-849c-4c5d-92fb-9ecca2015a78
Title: Stress Test Assignment - Business Strategy
Teacher: mrwritersteven@gmail.com
