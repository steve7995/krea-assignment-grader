import os
import time
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Header
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

_JWT_SECRET = os.environ["JWT_SECRET"]
_JWT_ALGORITHM = "HS256"
_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60  # 7 days


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_token(user_id: str, role: str, name: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "name": name,
        "exp": int(time.time()) + _TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


class CurrentUser:
    def __init__(self, id: str, role: str, name: str):
        self.id = id
        self.role = role
        self.name = name


async def get_current_user(authorization: Optional[str] = Header(None)) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization[len("Bearer "):]
    payload = decode_token(token)
    return CurrentUser(id=payload["sub"], role=payload["role"], name=payload.get("name", ""))


async def require_teacher(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teacher access required")
    return user


async def require_student(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "student":
        raise HTTPException(status_code=403, detail="Student access required")
    return user


async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
