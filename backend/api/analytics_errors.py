# backend/api/analytics_errors.py

from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from db.session import get_db
from db import models
from schemas.analytics import AnalyticsErrorRead
from schemas.item import ItemRead

router = APIRouter()

@router.get(
    "/",  
    response_model=List[AnalyticsErrorRead],
    summary="List all analytics error records"
)
def list_analytics_errors(db: Session = Depends(get_db)):
    """
    Retrieve all rows from the analytics_errors table.
    """
    return db.query(models.AnalyticsError).all()


@router.get(
    "/location-items",
    response_model=List[ItemRead],
    summary="Get items in a specific location"
)
def get_items_by_location(
    location: Optional[str] = Query(None, description="Location code or alternative call number pattern"),
    floor: Optional[str] = Query(None, description="Floor"),
    range_code: Optional[str] = Query(None, description="Range code"),
    ladder: Optional[str] = Query(None, description="Ladder"),
    shelf: Optional[str] = Query(None, description="Shelf"),
    db: Session = Depends(get_db)
):
    """
    Get items that are actually in a specific location based on various location parameters.
    """
    query = db.query(models.Item)
    
    if location:
        # If location is provided, search for items with alternative_call_number containing this location
        query = query.filter(models.Item.alternative_call_number.ilike(f"%{location}%"))
    else:
        # Use specific location components if provided
        if floor:
            query = query.filter(models.Item.floor == floor)
        if range_code:
            query = query.filter(models.Item.range_code == range_code)
        if ladder:
            query = query.filter(models.Item.ladder == ladder)
        if shelf:
            query = query.filter(models.Item.shelf == shelf)
    
    return query.limit(50).all()  # Limit to prevent large results


@router.delete(
    "/cleanup-no-match-errors",
    summary="Delete analytics errors with 'No matching barcode' reason"
)
def cleanup_no_match_errors(db: Session = Depends(get_db)):
    """
    Delete all AnalyticsError records with error_reason='No matching barcode'.
    These are false positives from before the analytics system was updated to save all records.
    Returns the count of deleted records.
    """
    deleted_count = db.query(models.AnalyticsError).filter(
        models.AnalyticsError.error_reason == "No matching barcode"
    ).delete(synchronize_session=False)
    
    db.commit()
    
    return {
        "message": "Successfully cleaned up false analytics errors",
        "deleted_count": deleted_count
    }


@router.delete(
    "/clear-all",
    summary="Delete ALL analytics errors"
)
def clear_all_analytics_errors(db: Session = Depends(get_db)):
    """
    Delete all records from the analytics_errors table.
    Use this to start fresh before re-uploading analytics data.
    Returns the count of deleted records (use only in case of emergency).
    """
    deleted_count = db.query(models.AnalyticsError).delete(synchronize_session=False)
    db.commit()
    
    return {
        "message": "Successfully deleted all analytics errors",
        "deleted_count": deleted_count
    }


@router.get(
    "/debug-range",
    summary="Debug: Show the accessioned shelf range"
)
def debug_range(db: Session = Depends(get_db)):
    """
    Debug endpoint to show what shelf range is being used for error detection.
    """
    import re
    
    items = db.query(models.Item).filter(
        models.Item.alternative_call_number.isnot(None)
    ).all()
    
    if not items:
        return {"message": "No items found"}
    
    call_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    shelves_with_items = set()
    
    for item in items:
        match = call_pattern.match(item.alternative_call_number)
        if match:
            floor, range_code, ladder, shelf, position = match.groups()
            shelf_key = f"{floor}-{range_code}-{ladder}-{shelf}"
            shelves_with_items.add(shelf_key)
    
    sorted_shelves = sorted(shelves_with_items)
    
    return {
        "total_items": len(items),
        "total_shelves_with_items": len(shelves_with_items),
        "min_shelf": sorted_shelves[0] if sorted_shelves else None,
        "max_shelf": sorted_shelves[-1] if sorted_shelves else None,
        "first_10_shelves": sorted_shelves[:10],
        "last_10_shelves": sorted_shelves[-10:]
    }


@router.post(
    "/detect-missing-items",
    summary="Detect analytics records within accessioned range that lack physical items"
)
def detect_missing_items(db: Session = Depends(get_db)):
    """
    Find analytics records that fall within the range of accessioned shelves but don't have
    matching physical items. Uses the same logic as the shelf viewer.
    
    Creates AnalyticsError records for these mismatches.
    """
    import re
    from schemas.analytics import AnalyticsErrorCreate
    from db import crud
    
    # Get all items with valid call numbers
    items = db.query(models.Item).filter(
        models.Item.alternative_call_number.isnot(None)
    ).all()
    
    if not items:
        return {"message": "No items found", "errors_created": 0}
    
    # Parse items to get shelf ranges (floor-range-ladder-shelf)
    shelf_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)')
    shelves_with_items = set()
    item_barcodes = {item.barcode for item in items}
    
    for item in items:
        shelf_match = shelf_pattern.match(item.alternative_call_number)
        if shelf_match:
            f, r, ladder, shelf = shelf_match.groups()
            shelves_with_items.add(f"{f}-{r}-{ladder}-{shelf}")
    
    if not shelves_with_items:
        return {"message": "No valid shelves found", "errors_created": 0}
    
    # Get min and max shelf keys
    sorted_shelves = sorted(shelves_with_items)
    min_shelf = sorted_shelves[0]
    max_shelf = sorted_shelves[-1]
    
    # Get all analytics records
    analytics_records = db.query(models.Analytics).filter(
        models.Analytics.alternative_call_number.isnot(None)
    ).all()
    
    errors_created = 0
    skipped_outside_range = 0
    skipped_has_item = 0
    
    for analytics in analytics_records:
        shelf_match = shelf_pattern.match(analytics.alternative_call_number)
        if not shelf_match:
            continue
        
        f, r, ladder, shelf = shelf_match.groups()
        shelf_key = f"{f}-{r}-{ladder}-{shelf}"
        
        # Check if this shelf is within the range of accessioned shelves
        if shelf_key < min_shelf or shelf_key > max_shelf:
            skipped_outside_range += 1
            continue  # Outside accessioned range
        
        # Skip if barcode matches an item (this analytics has a physical item)
        if analytics.barcode in item_barcodes:
            skipped_has_item += 1
            continue
        
        # This analytics is on a shelf within the accessioned range but has no matching item
        # Create an error record
        err_in = AnalyticsErrorCreate(
            barcode=analytics.barcode,
            alternative_call_number=analytics.alternative_call_number,
            title=analytics.title,
            call_number=analytics.call_number,
            status=analytics.status,
            error_reason=f"Within accessioned range ({min_shelf} to {max_shelf}) but no matching physical item"
        )
        try:
            crud.create_analytics_error(db, err_in)
            errors_created += 1
        except Exception:
            # Ignore duplicate constraint errors
            pass
    
    return {
        "message": f"Scanned analytics records on shelves between {min_shelf} and {max_shelf}",
        "errors_created": errors_created,
        "skipped_outside_range": skipped_outside_range,
        "skipped_has_item": skipped_has_item,
        "min_shelf": min_shelf,
        "max_shelf": max_shelf,
        "total_shelves_with_items": len(shelves_with_items)
    }
