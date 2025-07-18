# backend/api/users.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from sqlalchemy.orm import Session

from db.session import get_db
from db.crud import (get_users, get_user_by_id, create_user, update_user, delete_user, get_user_by_username)

from schemas.user import UserCreate, UserRead, UserUpdate
from core.auth import require_admin

router = APIRouter()

@router.get("", response_model=List[UserRead])
def list_users(db: Session = Depends(get_db)):
    """List all users (admin only)"""
    return get_users(db)

@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def add_user(data: UserCreate, db: Session = Depends(get_db)):
    """Create a new user"""
    existing = get_user_by_username(db, data.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already taken")
    return create_user(db, data.username, data.password, data.role)

@router.get("/{user_id}", response_model=UserRead)
def read_user(user_id: int, db: Session = Depends(get_db)):
    """Get a user by ID"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.patch("/{user_id}", response_model=UserRead)
def modify_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db)
):
    """Update a user's attributes (username, password, role)"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return update_user(db, user, data)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(user_id: int, db: Session = Depends(get_db)):
    """Delete a user account"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    delete_user(db, user)

