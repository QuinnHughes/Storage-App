# backend/db/crud.py

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from db import models
from schemas.item import ItemCreate
from schemas.analytics import AnalyticsCreate

###─── ITEM CRUD ─────────────────────────────

def create_item(db: Session, item_in: ItemCreate) -> models.Item:
    """
    Inserts a new Item record. Raises IntegrityError if barcode already exists.
    """
    db_item = models.Item(
        barcode=item_in.barcode,
        alt_call_number=item_in.alt_call_number,
        floor=item_in.floor,
        range=item_in.range,
        ladder=item_in.ladder,
        shelf=item_in.shelf,
        position=item_in.position
    )
    db.add(db_item)
    try:
        db.commit()
        db.refresh(db_item)
        return db_item
    except IntegrityError:
        db.rollback()
        raise

def get_item_by_barcode(db: Session, barcode: str) -> models.Item | None:
    """
    Returns the Item with the given barcode, or None if not found.
    """
    return db.query(models.Item).filter(models.Item.barcode == barcode).first()

def list_items(
    db: Session,
    skip: int = 0,
    limit: int = 100
) -> list[models.Item]:
    """
    Returns a paginated list of all Items.
    """
    return db.query(models.Item).offset(skip).limit(limit).all()

def list_items_by_shelf(
    db: Session,
    floor: str,
    range: str,
    ladder: str,
    shelf: str
) -> list[models.Item]:
    """
    Returns all items on a specific shelf (by floor, range, ladder, shelf).
    """
    return (
        db.query(models.Item)
          .filter(models.Item.floor == floor)
          .filter(models.Item.range == range)
          .filter(models.Item.ladder == ladder)
          .filter(models.Item.shelf == shelf)
          .all()
    )

def delete_item_by_barcode(db: Session, barcode: str) -> bool:
    """
    Deletes the Item with the given barcode. Returns True if deleted, False if not found.
    """
    obj = db.query(models.Item).filter(models.Item.barcode == barcode).first()
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


###─── ANALYTICS CRUD ─────────────────────────

def create_analytics(db: Session, analytics_in: AnalyticsCreate) -> models.Analytics:
    """
    Inserts a new Analytics row.
    If an Analytics record for that barcode already exists, returns the existing one.
    """
    existing = (
        db.query(models.Analytics)
          .filter(models.Analytics.barcode == analytics_in.barcode)
          .first()
    )
    if existing:
        return existing

    db_obj = models.Analytics(
        barcode=analytics_in.barcode,
        alt_call_number=analytics_in.alt_call_number,
        title=analytics_in.title,
        call_number=analytics_in.call_number,
        status=analytics_in.status
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

def get_analytics_by_barcode(db: Session, barcode: str) -> models.Analytics | None:
    """
    Fetches Analytics row by barcode, or None if not found.
    """
    return (
        db.query(models.Analytics)
          .filter(models.Analytics.barcode == barcode)
          .first()
    )

def update_analytics_status(
    db: Session,
    barcode: str,
    new_status: str
) -> models.Analytics | None:
    """
    Updates the 'status' of an existing Analytics record. Returns the updated object.
    """
    obj = db.query(models.Analytics).filter(models.Analytics.barcode == barcode).first()
    if not obj:
        return None
    obj.status = new_status
    db.commit()
    db.refresh(obj)
    return obj

def list_all_analytics(
    db: Session,
    skip: int = 0,
    limit: int = 100
) -> list[models.Analytics]:
    """
    Returns a paginated list of all Analytics rows.
    """
    return db.query(models.Analytics).offset(skip).limit(limit).all()
