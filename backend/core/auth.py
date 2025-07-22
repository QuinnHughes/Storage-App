# backend/core/auth.py

import os
from datetime import datetime, timedelta

from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db.session import get_db
from db.crud import get_user_by_username
from db.models import User

# ── Password hashing ──────────────────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# ── JWT settings ─────────────────────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "CHANGE_ME_TO_A_RANDOM_SECRET")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 180

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# ── OAuth2 / Dependency setup ────────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(db, username)
    if user is None:
        raise credentials_exception
    return user

# ── Role hierarchy & dependencies ────────────────────────────────────────────
def _role_value(role: str) -> int:
    hierarchy = {
        "viewer":     0,
        "book_worm":  1,
        "cataloger":  2,
        "admin":      3,
    }
    return hierarchy.get(role, -1)

def require_viewer(current_user: User = Depends(get_current_user)) -> User:
    # Any logged-in user
    return current_user

def require_book_worm(current_user: User = Depends(get_current_user)) -> User:
    if _role_value(current_user.role) < _role_value("book_worm"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Book_worms only",
        )
    return current_user

def require_cataloger(current_user: User = Depends(get_current_user)) -> User:
    if _role_value(current_user.role) < _role_value("cataloger"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Catalogers only",
        )
    return current_user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admins only",
        )
    return current_user
