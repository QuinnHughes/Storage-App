# backend/db/crud.py

from sqlalchemy.orm import Session
from . import models
from schemas.item import ItemCreate
from schemas.analytics import AnalyticsCreate, AnalyticsErrorCreate

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
