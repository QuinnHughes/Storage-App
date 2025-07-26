from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional, List

import db.models as models
from core.auth import get_current_user
from db.session import get_db

router = APIRouter()

model_map = {
    'items':            models.Item,
    'analytics':        models.Analytics,
    'weeded_items':     models.WeededItem,
    'analytics_errors': models.AnalyticsError,
}

# Helper to serialize SQLAlchemy models
def serialize_model(obj: Any) -> Dict[str, Any]:
    return {col.name: getattr(obj, col.name) for col in obj.__table__.columns}

@router.get("/{table}/search")
def search_records(
    table: str,
    id: Optional[int] = Query(None),
    barcode: Optional[str] = Query(None),
    alternative_call_number: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    range_code: Optional[str] = Query(None),
    ladder: Optional[str] = Query(None),
    shelf: Optional[str] = Query(None),
    position: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    call_number: Optional[str] = Query(None),
    item_policy: Optional[str] = Query(None),
    location_code: Optional[str] = Query(None),
    description: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    scanned_barcode: Optional[str] = Query(None),
    is_weeded: Optional[bool] = Query(None),
    error_reason: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:

    if table == "items":
        query = db.query(models.Item)
        if id is not None:
            query = query.filter(models.Item.id == id)
        if barcode:
            query = query.filter(models.Item.barcode.ilike(f"%{barcode}%"))
        if alternative_call_number:
            query = query.filter(models.Item.alternative_call_number.ilike(f"%{alternative_call_number}%"))
        if location:
            query = query.filter(models.Item.location.ilike(f"%{location}%"))
        if floor:
            query = query.filter(models.Item.floor == floor)
        if range_code:
            query = query.filter(models.Item.range_code == range_code)
        if ladder:
            query = query.filter(models.Item.ladder == ladder)
        if shelf:
            query = query.filter(models.Item.shelf == shelf)
        if position:
            query = query.filter(models.Item.position == position)
        results = query.offset(skip).limit(limit).all()

    elif table == "analytics":
        query = db.query(models.Analytics)
        if id is not None:
            query = query.filter(models.Analytics.id == id)
        if barcode:
            query = query.filter(models.Analytics.barcode.ilike(f"%{barcode}%"))
        if alternative_call_number:
            query = query.filter(models.Analytics.alternative_call_number.ilike(f"%{alternative_call_number}%"))
        if title:
            query = query.filter(models.Analytics.title.ilike(f"%{title}%"))
        if call_number:
            query = query.filter(models.Analytics.call_number.ilike(f"%{call_number}%"))
        if item_policy:
            query = query.filter(models.Analytics.item_policy == item_policy)
        if location_code:
            query = query.filter(models.Analytics.location_code == location_code)
        if description:
            query = query.filter(models.Analytics.description.ilike(f"%{description}%"))
        if status:
            query = query.filter(models.Analytics.status == status)
        results = query.offset(skip).limit(limit).all()

    elif table == "weeded_items":
        query = db.query(models.WeededItem)
        if id is not None:
            query = query.filter(models.WeededItem.id == id)
        if barcode:
            query = query.filter(models.WeededItem.barcode.ilike(f"%{barcode}%"))
        if alternative_call_number:
            query = query.filter(models.WeededItem.alternative_call_number.ilike(f"%{alternative_call_number}%"))
        if scanned_barcode:
            query = query.filter(models.WeededItem.scanned_barcode.ilike(f"%{scanned_barcode}%"))
        if is_weeded is not None:
            query = query.filter(models.WeededItem.is_weeded == is_weeded)
        results = query.offset(skip).limit(limit).all()

    elif table == "analytics_errors":
        query = db.query(models.AnalyticsError)
        if id is not None:
            query = query.filter(models.AnalyticsError.id == id)
        if barcode:
            query = query.filter(models.AnalyticsError.barcode.ilike(f"%{barcode}%"))
        if alternative_call_number:
            query = query.filter(models.AnalyticsError.alternative_call_number.ilike(f"%{alternative_call_number}%"))
        if title:
            query = query.filter(models.AnalyticsError.title.ilike(f"%{title}%"))
        if call_number:
            query = query.filter(models.AnalyticsError.call_number.ilike(f"%{call_number}%"))
        if status:
            query = query.filter(models.AnalyticsError.status == status)
        if error_reason:
            query = query.filter(models.AnalyticsError.error_reason == error_reason)
        results = query.offset(skip).limit(limit).all()

    else:
        raise HTTPException(status_code=404, detail="Table not found")

    return [serialize_model(r) for r in results]

@router.get("/{table}/{record_id}")
def read_record(
    table: str,
    record_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    recs = search_records(table, id=record_id, skip=0, limit=1, db=db)
    if not recs:
        raise HTTPException(status_code=404, detail="Record not found")
    return recs[0]

@router.post("/{table}/create", status_code=201)
def create_record(
    table: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    if table == 'items': obj = models.Item(**payload)
    elif table == 'analytics': obj = models.Analytics(**payload)
    elif table == 'weeded_items': obj = models.WeededItem(**payload)
    elif table == 'analytics_errors': obj = models.AnalyticsError(**payload)
    else: raise HTTPException(status_code=404, detail="Table not found")
    db.add(obj); db.commit(); db.refresh(obj)
    return serialize_model(obj)


@router.patch("/{table}/{record_id}")
def update_record(
    table: str,
    record_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    Model = model_map.get(table)
    if not Model:
        raise HTTPException(status_code=404, detail="Table not found")
    rec = db.query(Model).get(record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    for k, v in payload.items():
        setattr(rec, k, v)
    db.commit()
    db.refresh(rec)
    return serialize_model(rec)

@router.delete("/{table}/{record_id}")
def delete_record(
    table: str,
    record_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    Model = model_map.get(table)
    if not Model:
        raise HTTPException(status_code=404, detail="Table not found")
    rec = db.query(Model).get(record_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(rec)
    db.commit()
    return serialize_model(rec)

@router.get("/{table}/distinct/{field}")
def get_distinct_field(
    table: str,
    field: str,
    db: Session = Depends(get_db)
) -> List[Any]:
    model_map = {
        'items': models.Item,
        'analytics': models.Analytics,
        'weeded_items': models.WeededItem,
        'analytics_errors': models.AnalyticsError,
    }
    model = model_map.get(table)
    if not model or not hasattr(model, field):
        raise HTTPException(status_code=404, detail=f"Unknown table or field: {table}.{field}")
    col = getattr(model, field)
    vals = db.query(col).distinct().all()
    return [v[0] for v in vals if v[0] is not None]
