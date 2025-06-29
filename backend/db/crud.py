from sqlalchemy.orm import Session
from typing import List

from . import models
from .models import User
from schemas.item import ItemCreate
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate
from schemas.weeded_item import WeededItemCreate


def get_user_by_username(db: Session, username: str) -> User | None:
    """
    Return the User with the given username, or None if not found.
    """
    return db.query(User).filter(User.username == username).first()


def create_user(db: Session, username: str, password: str, role: str) -> User:
    """
    Create a new user:
    - Hash the plain-text password (imported inside to avoid circular imports)
    - Save username, hashed_password, and role
    """
    from core.auth import hash_password  # deferred import
    hashed = hash_password(password)
    user = User(username=username, hashed_password=hashed, role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_item_by_barcode(db: Session, barcode: str):
    return db.query(models.Item).filter(models.Item.barcode == barcode).first()


def create_item(db: Session, item_in: ItemCreate):
    db_item = models.Item(
        barcode=item_in.barcode,
        alternative_call_number=item_in.alternative_call_number,
        location=item_in.location,
        floor=item_in.floor,
        range_code=item_in.range_code,
        ladder=item_in.ladder,
        shelf=item_in.shelf,
        position=item_in.position,
    )
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


def list_items(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Item).offset(skip).limit(limit).all()


def create_analytics(db: Session, analytics_in: AnalyticsCreate):
    db_analytics = models.Analytics(
        barcode=analytics_in.barcode,
        alternative_call_number=analytics_in.alternative_call_number,
        title=analytics_in.title,
        call_number=analytics_in.call_number,
        status=analytics_in.status,
    )
    db.add(db_analytics)
    db.commit()
    db.refresh(db_analytics)
    return db_analytics


def create_analytics_error(db: Session, error_in: AnalyticsErrorCreate):
    db_err = models.AnalyticsError(
        barcode=error_in.barcode,
        alternative_call_number=error_in.alternative_call_number,
        title=error_in.title,
        call_number=error_in.call_number,
        status=error_in.status,
        error_reason=error_in.error_reason,
    )
    db.add(db_err)
    db.commit()
    db.refresh(db_err)
    return db_err


def create_weeded_item(db: Session, wi: WeededItemCreate) -> models.WeededItem:
    is_weeded = (wi.scanned_barcode == wi.barcode) if wi.scanned_barcode else False
    db_obj = models.WeededItem(
        alternative_call_number=wi.alternative_call_number,
        barcode=wi.barcode,
        scanned_barcode=wi.scanned_barcode,
        is_weeded=is_weeded,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def get_weeded_items(db: Session, *, skip: int = 0, limit: int = 100):
    return db.query(models.WeededItem).offset(skip).limit(limit).all()

def bulk_create_weeded_items(
    db: Session, 
    wis: List[WeededItemCreate]
) -> List[models.WeededItem]:
    """
    Efficiently insert a batch of weeded items and return the resulting ORM objects.
    Uses bulk_save_objects with return_defaults=True to get back primary keys/defaults.
    """
    objs: List[models.WeededItem] = []
    for wi in wis:
        is_weeded = (wi.scanned_barcode == wi.barcode) if wi.scanned_barcode else False
        objs.append(
            models.WeededItem(
                alternative_call_number = wi.alternative_call_number,
                barcode                 = wi.barcode,
                scanned_barcode         = wi.scanned_barcode,
                is_weeded               = is_weeded,
            )
        )
    # bulk‐save all at once, pulling back defaults (e.g. id, created_at)
    db.bulk_save_objects(objs, return_defaults=True)
    db.commit()
    return objs

def get_users(db: Session) -> List[User]:
    """Return all users"""
    return db.query(User).all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Return a single user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def update_user(db: Session, user: User, data) -> User:
    """Update user's attributes based on UserUpdate schema"""
    # data may have username, password, role
    if data.username:
        user.username = data.username
    if data.password:
        from core.auth import hash_password
        user.hashed_password = hash_password(data.password)
    if data.role:
        user.role = data.role
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    """Delete a user record"""
    db.delete(user)
    db.commit()
