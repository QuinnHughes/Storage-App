from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.dialects.postgresql import insert
from typing import List, Optional 
from datetime import datetime
from sqlalchemy import or_, func, desc
from . import models
from .models import User
from schemas.item import ItemCreate
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate
from schemas.weeded_item import WeededItemCreate


def get_user_by_username(db: Session, username: str) -> User | None:
 
    return db.query(User).filter(User.username == username).first()


def create_user(db: Session, username: str, password: str, role: str) -> User:

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

def search_items(
    db: Session,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.Item)
    if q:
        if q.isdigit():
            query = query.filter(models.Item.id == int(q))
        else:
            term = f"%{q}%"
            query = query.filter(or_(
                models.Item.barcode.ilike(term),
                models.Item.alternative_call_number.ilike(term),
            ))
    return query.offset(skip).limit(limit).all()

def get_item(db: Session, item_id: int):
    return db.query(models.Item).filter(models.Item.id == item_id).first()

def update_item(db: Session, item_id: int, **data):
    item = get_item(db, item_id)
    if not item:
        return None
    for key, val in data.items():
        setattr(item, key, val)
    db.commit()
    db.refresh(item)
    return item

def delete_item(db: Session, item_id: int):
    item = get_item(db, item_id)
    if not item:
        return None
    db.delete(item)
    db.commit()
    return item

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

    stmt = insert(models.AnalyticsError).values(
        barcode=error_in.barcode,
        alternative_call_number=error_in.alternative_call_number,
        title=error_in.title,
        call_number=error_in.call_number,
        status=error_in.status,
        error_reason=error_in.error_reason,
    ).on_conflict_do_nothing(
        constraint="uq_analytics_error_all_fields"
    ).returning(models.AnalyticsError.id)

    result = db.execute(stmt)
    db.commit()

    row = result.fetchone()
    if row:
        # newly inserted
        return db.get(models.AnalyticsError, row.id)

    # conflict → fetch existing
    return db.query(models.AnalyticsError).filter_by(
        barcode=error_in.barcode,
        alternative_call_number=error_in.alternative_call_number,
        title=error_in.title,
        call_number=error_in.call_number,
        status=error_in.status,
        error_reason=error_in.error_reason,
    ).first()

def search_analytics_errors(
    db: Session,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.AnalyticsError)
    if q:
        if q.isdigit():
            query = query.filter(models.AnalyticsError.id == int(q))
        else:
            term = f"%{q}%"
            query = query.filter(or_(
                models.AnalyticsError.barcode.ilike(term),
                models.AnalyticsError.alternative_call_number.ilike(term),
                models.AnalyticsError.title.ilike(term),
                models.AnalyticsError.call_number.ilike(term),
                models.AnalyticsError.status.ilike(term),
                models.AnalyticsError.error_reason.ilike(term),
            ))
    return query.offset(skip).limit(limit).all()

def get_analytics_error(db: Session, error_id: int):
    return db.query(models.AnalyticsError).filter(models.AnalyticsError.id == error_id).first()

def update_analytics_error(db: Session, error_id: int, **data):
    obj = get_analytics_error(db, error_id)
    if not obj:
        return None
    for key, val in data.items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj

def delete_analytics_error(db: Session, error_id: int):
    obj = get_analytics_error(db, error_id)
    if not obj:
        return None
    db.delete(obj)
    db.commit()
    return obj

def search_analytics(
    db: Session,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.Analytics)
    if q:
        if q.isdigit():
            query = query.filter(models.Analytics.id == int(q))
        else:
            term = f"%{q}%"
            query = query.filter(or_(
                models.Analytics.barcode.ilike(term),
                models.Analytics.alternative_call_number.ilike(term),
                models.Analytics.title.ilike(term),
                models.Analytics.call_number.ilike(term),
                models.Analytics.status.ilike(term),
            ))
    return query.offset(skip).limit(limit).all()

def get_analytics(db: Session, analytics_id: int):
    return db.query(models.Analytics).filter(models.Analytics.id == analytics_id).first()

def update_analytics(db: Session, analytics_id: int, **data):
    obj = get_analytics(db, analytics_id)
    if not obj:
        return None
    for key, val in data.items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj

def delete_analytics(db: Session, analytics_id: int):
    obj = get_analytics(db, analytics_id)
    if not obj:
        return None
    db.delete(obj)
    db.commit()
    return obj

def get_weeded_items(db: Session, *, skip: int = 0, limit: int = 100):
    return db.query(models.WeededItem).offset(skip).limit(limit).all()

def bulk_create_weeded_items(
    db: Session,
    wis: List[WeededItemCreate]
) -> List[models.WeededItem]:

    rows = []
    for wi in wis:
        rows.append({
            "alternative_call_number": wi.alternative_call_number,
            "barcode":                 wi.barcode,
            "scanned_barcode":         wi.scanned_barcode,
            "is_weeded":               (wi.scanned_barcode == wi.barcode) if wi.scanned_barcode else False,
        })

    stmt = (
        insert(models.WeededItem)
        .values(rows)
        .on_conflict_do_nothing(
            constraint="weeded_items_alternative_call_number_barcode_key"
        )
        .returning(
            models.WeededItem.id,
            models.WeededItem.alternative_call_number,
            models.WeededItem.barcode,
            models.WeededItem.scanned_barcode,
            models.WeededItem.is_weeded,
            models.WeededItem.created_at
        )
    )

    result = db.execute(stmt)
    db.commit()

    inserted = result.fetchall()
    return [
        models.WeededItem(
            id=row.id,
            alternative_call_number=row.alternative_call_number,
            barcode=row.barcode,
            scanned_barcode=row.scanned_barcode,
            is_weeded=row.is_weeded,
            created_at=row.created_at,
        )
        for row in inserted
    ]

def search_weeded_items(
    db: Session,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    query = db.query(models.WeededItem)
    if q:
        if q.isdigit():
            query = query.filter(models.WeededItem.id == int(q))
        else:
            term = f"%{q}%"
            query = query.filter(or_(
                models.WeededItem.barcode.ilike(term),
                models.WeededItem.alternative_call_number.ilike(term),
                models.WeededItem.scanned_barcode.ilike(term),
            ))
    return query.offset(skip).limit(limit).all()

def get_weeded_item(db: Session, weeded_id: int):
    return db.query(models.WeededItem).filter(models.WeededItem.id == weeded_id).first()

def create_weeded_item(db: Session, weeded_in: WeededItemCreate):
    wi = models.WeededItem(
        alternative_call_number=weeded_in.alternative_call_number,
        barcode=weeded_in.barcode,
        scanned_barcode=weeded_in.scanned_barcode,
        is_weeded=(weeded_in.scanned_barcode == weeded_in.barcode)
                 if weeded_in.scanned_barcode else False,
    )
    db.add(wi)
    db.commit()
    db.refresh(wi)
    return wi

def update_weeded_item(db: Session, weeded_id: int, **data):
    obj = get_weeded_item(db, weeded_id)
    if not obj:
        return None
    for key, val in data.items():
        setattr(obj, key, val)
    db.commit()
    db.refresh(obj)
    return obj

def delete_weeded_item(db: Session, weeded_id: int):
    obj = get_weeded_item(db, weeded_id)
    if not obj:
        return None
    db.delete(obj)
    db.commit()
    return obj

def get_users(db: Session) -> List[User]:
    return db.query(User).all()


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def update_user(db: Session, user: User, data) -> User:
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
    db.delete(user)
    db.commit()

def create_sudoc_cart(db: Session, name: str) -> models.SudocCart:
    cart = models.SudocCart(name=name)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart

def get_carts(db: Session) -> List[models.SudocCart]:
    return db.query(models.SudocCart)\
             .options(joinedload(models.SudocCart.items))\
             .order_by(models.SudocCart.created_at.desc())\
             .all()

def add_to_cart(db: Session, cart_id: int, record_id: int) -> models.SudocCartItem:
    item = models.SudocCartItem(cart_id=cart_id, record_id=record_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

def save_edited_record(db: Session, record_id: int, marc_data: bytes, user_id: int | None):
    overlay = models.SudocEditedRecord(
        record_id=record_id,
        marc_data=marc_data,
        edited_by=user_id
    )
    db.add(overlay)
    db.commit()

def get_latest_edited_overlay(db: Session, record_id: int):
    return (
        db.query(models.SudocEditedRecord)
        .filter(models.SudocEditedRecord.record_id == record_id)
        .order_by(desc(models.SudocEditedRecord.edited_at))
        .first()
    )

def create_new_marc_record(db: Session, marc_data: bytes, user_id: int | None) -> int:
    rec = models.SudocCreatedRecord(marc_data=marc_data, created_by=user_id)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec.id

def get_created_record(db: Session, record_id: int):
    return db.query(models.SudocCreatedRecord).filter(models.SudocCreatedRecord.id == record_id).first()

def get_records_by_oclc(db: Session, oclc: str, created_only: bool = False):
    """Get records by OCLC number"""
    if created_only:
        return db.query(models.CreatedRecord).filter(models.CreatedRecord.oclc == oclc).all()
    else:
        return db.query(models.EditedRecord).filter(models.EditedRecord.oclc == oclc).all()
