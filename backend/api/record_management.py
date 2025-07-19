from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Any, Dict, Optional, List

import db.models as models
from core.auth import get_current_user
from db.crud import (
    search_items, get_item, create_item, update_item, delete_item,
    search_analytics, get_analytics, create_analytics, update_analytics, delete_analytics,
    search_weeded_items, get_weeded_item, create_weeded_item, update_weeded_item, delete_weeded_item,
    search_analytics_errors, get_analytics_error, create_analytics_error, update_analytics_error, delete_analytics_error,
)
from db.session import get_db

router = APIRouter(
    prefix="/record-management",
    tags=["record_management"],
    dependencies=[Depends(get_current_user)]
)

@router.get("/{table}/search")
def search_records(
    table: str,
    id: Optional[int] = Query(None),
    barcode: Optional[str] = Query(None),
    alternative_call_number: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    range_code: Optional[str] = Query(None),
    title: Optional[str] = Query(None),
    call_number: Optional[str] = Query(None),
    item_policy: Optional[str] = Query(None),
    location_code: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    scanned_barcode: Optional[str] = Query(None),
    is_weeded: Optional[bool] = Query(None),
    error_reason: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    db: Session = Depends(get_db)
) -> List[Any]:
    """
    Search records by specific fields for each table.
    """
    # ----------- ITEMS -----------
    if table == 'items':
        if id is not None:
            item = get_item(db, id)
            return [item] if item else []
        results = search_items(db, q=None, skip=skip, limit=limit)
        if barcode:
            results = [r for r in results if r.barcode == barcode]
        if alternative_call_number:
            results = [r for r in results if r.alternative_call_number == alternative_call_number]
        if location:
            results = [r for r in results if getattr(r, 'location', None) == location]
        if floor:
            results = [r for r in results if getattr(r, 'floor', None) == floor]
        if range_code:
            results = [r for r in results if getattr(r, 'range_code', None) == range_code]
        return results

    # ----------- ANALYTICS -----------
    if table == 'analytics':
        if id is not None:
            analytics = get_analytics(db, id)
            return [analytics] if analytics else []
        results = search_analytics(db, q=None, skip=skip, limit=limit)
        if barcode:
            results = [r for r in results if r.barcode == barcode]
        if alternative_call_number:
            results = [r for r in results if r.alternative_call_number == alternative_call_number]
        if title:
            results = [r for r in results if r.title and title.lower() in r.title.lower()]
        if call_number:
            results = [r for r in results if r.call_number == call_number]
        if item_policy:
            results = [r for r in results if r.item_policy == item_policy]
        if location_code:
            results = [r for r in results if r.location_code == location_code]
        if status:
            results = [r for r in results if r.status == status]
        return results

    # ----------- WEEDED ITEMS -----------
    if table == 'weeded_items':
        if id is not None:
            wi = get_weeded_item(db, id)
            return [wi] if wi else []
        results = search_weeded_items(db, q=None, skip=skip, limit=limit)
        if barcode:
            results = [r for r in results if r.barcode == barcode]
        if alternative_call_number:
            results = [r for r in results if r.alternative_call_number == alternative_call_number]
        if scanned_barcode:
            results = [r for r in results if r.scanned_barcode == scanned_barcode]
        if is_weeded is not None:
            results = [r for r in results if r.is_weeded == is_weeded]
        return results

    # ----------- ANALYTICS ERRORS -----------
    if table == 'analytics_errors':
        if id is not None:
            ae = get_analytics_error(db, id)
            return [ae] if ae else []
        results = search_analytics_errors(db, q=None, skip=skip, limit=limit)
        if barcode:
            results = [r for r in results if r.barcode == barcode]
        if alternative_call_number:
            results = [r for r in results if r.alternative_call_number == alternative_call_number]
        if title:
            results = [r for r in results if r.title and title.lower() in r.title.lower()]
        if call_number:
            results = [r for r in results if r.call_number == call_number]
        if status:
            results = [r for r in results if r.status == status]
        if error_reason:
            results = [r for r in results if r.error_reason == error_reason]
        return results

    raise HTTPException(status_code=404, detail="Table not found")

@router.get("/{table}/{record_id}")
def read_record(
    table: str,
    record_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """Get a single record by ID"""
    records = search_records(table, id=record_id, db=db)
    return records[0] if records else None

@router.post("/{table}/create")
def create_record(
    table: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
) -> Any:
    """Create a new record in the given table"""
    if table == 'items':
        return create_item(db, **payload)
    if table == 'analytics':
        return create_analytics(db, **payload)
    if table == 'weeded_items':
        return create_weeded_item(db, **payload)
    if table == 'analytics_errors':
        return create_analytics_error(db, **payload)
    raise HTTPException(status_code=404, detail="Table not found")

@router.patch("/{table}/{record_id}")
def update_record(
    table: str,
    record_id: int,
    payload: Dict[str, Any],
    db: Session = Depends(get_db)
) -> Any:
    """Update an existing record by ID"""
    if table == 'items':
        return update_item(db, record_id, **payload)
    if table == 'analytics':
        return update_analytics(db, record_id, **payload)
    if table == 'weeded_items':
        return update_weeded_item(db, record_id, **payload)
    if table == 'analytics_errors':
        return update_analytics_error(db, record_id, **payload)
    raise HTTPException(status_code=404, detail="Table not found")

@router.delete("/{table}/{record_id}")
def delete_record(
    table: str,
    record_id: int,
    db: Session = Depends(get_db)
) -> Any:
    """Delete a record by ID"""
    if table == 'items':
        return delete_item(db, record_id)
    if table == 'analytics':
        return delete_analytics(db, record_id)
    if table == 'weeded_items':
        return delete_weeded_item(db, record_id)
    if table == 'analytics_errors':
        return delete_analytics_error(db, record_id)
    raise HTTPException(status_code=404, detail="Table not found")

@router.get("/{table}/distinct/{field}")
def get_distinct_field(
    table: str,
    field: str,
    db: Session = Depends(get_db)
) -> List[Any]:
    """Return distinct, non-null values for a given field in the specified table."""
    model_map = {
        'items': models.Item,
        'analytics': models.Analytics,
        'weeded_items': models.WeededItem,
        'analytics_errors': models.AnalyticsError,
    }
    model = model_map.get(table)
    if not model or not hasattr(model, field):
        raise HTTPException(404, f"Unknown table or field: {table}.{field}")
    col = getattr(model, field)
    distinct_vals = db.query(col).distinct().all()
    return [v[0] for v in distinct_vals if v[0] is not None]
