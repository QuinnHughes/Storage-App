# backend/api/records.py
# Comprehensive Record Management API
# Handles viewing, editing, and deleting records across all tables

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any, List
from datetime import datetime

from db.session import get_db
from db import models
from core.auth import require_viewer, require_book_worm, require_cataloger, require_admin

router = APIRouter()


# ==================== ANALYTICS RECORDS ====================

@router.get("/analytics/{record_id}")
def get_analytics_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_viewer)
):
    """
    Get complete details of an analytics record including:
    - Full record data
    - Related item (if has_item_link)
    - Related error (if exists)
    - Shelf context (other items on same shelf)
    """
    # Get the analytics record
    analytics = db.query(models.Analytics).filter(models.Analytics.id == record_id).first()
    
    if not analytics:
        raise HTTPException(status_code=404, detail="Analytics record not found")
    
    # Get related item if has_item_link is true
    related_item = None
    if analytics.has_item_link and analytics.barcode:
        related_item = db.query(models.Item).filter(
            models.Item.barcode == analytics.barcode
        ).first()
    
    # Get related error if exists
    related_error = None
    if analytics.barcode and analytics.alternative_call_number:
        related_error = db.query(models.AnalyticsError).filter(
            models.AnalyticsError.barcode == analytics.barcode,
            models.AnalyticsError.alternative_call_number == analytics.alternative_call_number
        ).first()
    
    # Get shelf context (other items on same shelf)
    shelf_context = None
    if analytics.alternative_call_number:
        # Parse shelf from call number (S-floor-range-ladder-shelf-position)
        import re
        match = re.match(r'S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)', analytics.alternative_call_number)
        if match:
            floor, range_code, ladder, shelf, position = match.groups()
            shelf_base = f"S-{floor}-{range_code}-{ladder}-{shelf}"
            
            # Get other items on same shelf (limit to 20 for performance)
            shelf_items = db.query(models.Analytics).filter(
                models.Analytics.alternative_call_number.like(f"{shelf_base}-%"),
                models.Analytics.id != record_id
            ).limit(20).all()
            
            # Also check Items table and get their titles from analytics
            shelf_physical_items = db.query(models.Item).filter(
                models.Item.alternative_call_number.like(f"{shelf_base}-%")
            ).limit(20).all()
            
            # Build physical items list with titles from analytics
            physical_items_list = []
            for item in shelf_physical_items:
                # Get title from related analytics
                title = None
                if item.barcode:
                    related_analytics = db.query(models.Analytics).filter(
                        models.Analytics.barcode == item.barcode
                    ).first()
                    if related_analytics:
                        title = related_analytics.title
                
                physical_items_list.append({
                    'id': item.id,
                    'title': title,
                    'barcode': item.barcode,
                    'call_number': item.alternative_call_number,
                    'position': item.position
                })
            
            shelf_context = {
                'shelf_call_number': shelf_base,
                'position': int(position),
                'floor': floor,
                'range': range_code,
                'ladder': int(ladder),
                'shelf': int(shelf),
                'analytics_neighbors': [
                    {
                        'id': item.id,
                        'title': item.title,
                        'barcode': item.barcode,
                        'call_number': item.alternative_call_number,
                        'status': item.status,
                        'has_item_link': item.has_item_link
                    } for item in shelf_items
                ],
                'physical_items': physical_items_list
            }
    
    return {
        'record': {
            'id': analytics.id,
            'barcode': analytics.barcode,
            'title': analytics.title,
            'alternative_call_number': analytics.alternative_call_number,
            'location_code': analytics.location_code,
            'item_policy': analytics.item_policy,
            'call_number': analytics.call_number,
            'description': analytics.description,
            'status': analytics.status,
            'has_item_link': analytics.has_item_link
        },
        'related_item': {
            'id': related_item.id,
            'barcode': related_item.barcode,
            'alternative_call_number': related_item.alternative_call_number,
            'location': related_item.location,
            'floor': related_item.floor,
            'range_code': related_item.range_code,
            'ladder': related_item.ladder,
            'shelf': related_item.shelf,
            'position': related_item.position
        } if related_item else None,
        'related_error': {
            'id': related_error.id,
            'barcode': related_error.barcode,
            'alternative_call_number': related_error.alternative_call_number,
            'title': related_error.title,
            'call_number': related_error.call_number,
            'status': related_error.status,
            'error_reason': related_error.error_reason
        } if related_error else None,
        'shelf_context': shelf_context
    }


@router.put("/analytics/{record_id}")
def update_analytics_record(
    record_id: int,
    updates: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_book_worm)
):
    """
    Update an analytics record.
    Requires book_worm role or higher.
    """
    analytics = db.query(models.Analytics).filter(models.Analytics.id == record_id).first()
    
    if not analytics:
        raise HTTPException(status_code=404, detail="Analytics record not found")
    
    # Allowed fields to update
    allowed_fields = [
        'barcode', 'title', 'alternative_call_number', 'location_code',
        'item_policy', 'call_number', 'description', 'status', 'has_item_link'
    ]
    
    # Track changes for audit
    changes = {}
    
    for field, value in updates.items():
        if field in allowed_fields:
            old_value = getattr(analytics, field)
            if old_value != value:
                changes[field] = {'old': old_value, 'new': value}
                setattr(analytics, field, value)
    
    if changes:
        db.commit()
        db.refresh(analytics)
        
        return {
            'success': True,
            'message': 'Analytics record updated successfully',
            'changes': changes,
            'record_id': record_id
        }
    else:
        return {
            'success': True,
            'message': 'No changes detected',
            'record_id': record_id
        }


@router.delete("/analytics/{record_id}")
def delete_analytics_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cataloger)
):
    """
    Delete an analytics record.
    Requires cataloger role or higher.
    Also removes related analytics errors.
    """
    analytics = db.query(models.Analytics).filter(models.Analytics.id == record_id).first()
    
    if not analytics:
        raise HTTPException(status_code=404, detail="Analytics record not found")
    
    # Store info for response
    barcode = analytics.barcode
    title = analytics.title
    call_number = analytics.alternative_call_number
    
    # Delete related errors first
    if analytics.barcode and analytics.alternative_call_number:
        deleted_errors = db.query(models.AnalyticsError).filter(
            models.AnalyticsError.barcode == analytics.barcode,
            models.AnalyticsError.alternative_call_number == analytics.alternative_call_number
        ).delete()
    else:
        deleted_errors = 0
    
    # Delete the analytics record
    db.delete(analytics)
    db.commit()
    
    return {
        'success': True,
        'message': f'Analytics record deleted: {title}',
        'deleted_record': {
            'id': record_id,
            'barcode': barcode,
            'title': title,
            'call_number': call_number
        },
        'deleted_errors': deleted_errors
    }


# ==================== ITEM RECORDS ====================

@router.get("/item/{record_id}")
def get_item_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_viewer)
):
    """
    Get complete details of an item record including:
    - Full record data
    - Related analytics (if exists)
    - Shelf context
    """
    item = db.query(models.Item).filter(models.Item.id == record_id).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item record not found")
    
    # Get related analytics if exists
    related_analytics = None
    if item.barcode:
        related_analytics = db.query(models.Analytics).filter(
            models.Analytics.barcode == item.barcode,
            models.Analytics.has_item_link == True
        ).first()
    
    # Get shelf context
    shelf_context = None
    if item.alternative_call_number:
        import re
        match = re.match(r'S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)', item.alternative_call_number)
        if match:
            floor, range_code, ladder, shelf, position = match.groups()
            shelf_base = f"S-{floor}-{range_code}-{ladder}-{shelf}"
            
            # Get other items on same shelf
            shelf_items = db.query(models.Item).filter(
                models.Item.alternative_call_number.like(f"{shelf_base}-%"),
                models.Item.id != record_id
            ).limit(20).all()
            
            # Build physical items with titles from analytics
            physical_items_list = []
            for neighbor in shelf_items:
                title = None
                if neighbor.barcode:
                    neighbor_analytics = db.query(models.Analytics).filter(
                        models.Analytics.barcode == neighbor.barcode
                    ).first()
                    if neighbor_analytics:
                        title = neighbor_analytics.title
                
                physical_items_list.append({
                    'id': neighbor.id,
                    'title': title,
                    'barcode': neighbor.barcode,
                    'call_number': neighbor.alternative_call_number,
                    'position': neighbor.position
                })
            
            # Also check Analytics
            shelf_analytics = db.query(models.Analytics).filter(
                models.Analytics.alternative_call_number.like(f"{shelf_base}-%")
            ).limit(20).all()
            
            shelf_context = {
                'shelf_call_number': shelf_base,
                'position': int(position),
                'floor': floor,
                'range': range_code,
                'ladder': int(ladder),
                'shelf': int(shelf),
                'physical_items': physical_items_list,
                'analytics_neighbors': [
                    {
                        'id': a.id,
                        'title': a.title,
                        'barcode': a.barcode,
                        'call_number': a.alternative_call_number,
                        'status': a.status,
                        'has_item_link': a.has_item_link
                    } for a in shelf_analytics
                ]
            }
    
    return {
        'record': {
            'id': item.id,
            'barcode': item.barcode,
            'alternative_call_number': item.alternative_call_number,
            'location': item.location,
            'floor': item.floor,
            'range_code': item.range_code,
            'ladder': item.ladder,
            'shelf': item.shelf,
            'position': item.position
        },
        'related_analytics': {
            'id': related_analytics.id,
            'barcode': related_analytics.barcode,
            'title': related_analytics.title,
            'alternative_call_number': related_analytics.alternative_call_number,
            'status': related_analytics.status,
            'location_code': related_analytics.location_code,
            'item_policy': related_analytics.item_policy,
            'call_number': related_analytics.call_number
        } if related_analytics else None,
        'shelf_context': shelf_context
    }


@router.put("/item/{record_id}")
def update_item_record(
    record_id: int,
    updates: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cataloger)
):
    """
    Update an item record.
    Requires cataloger role or higher.
    """
    item = db.query(models.Item).filter(models.Item.id == record_id).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item record not found")
    
    # Allowed fields to update
    allowed_fields = [
        'barcode', 'alternative_call_number', 'location',
        'floor', 'range_code', 'ladder', 'shelf', 'position'
    ]
    
    changes = {}
    
    for field, value in updates.items():
        if field in allowed_fields:
            old_value = getattr(item, field)
            if old_value != value:
                changes[field] = {'old': str(old_value), 'new': str(value)}
                setattr(item, field, value)
    
    if changes:
        # If barcode or alternative_call_number changed, update has_item_link in analytics
        if 'barcode' in changes or 'alternative_call_number' in changes:
            if item.barcode:
                analytics = db.query(models.Analytics).filter(
                    models.Analytics.barcode == item.barcode
                ).all()
                for a in analytics:
                    a.has_item_link = True
        
        db.commit()
        db.refresh(item)
        
        return {
            'success': True,
            'message': 'Item record updated successfully',
            'changes': changes,
            'record_id': record_id
        }
    else:
        return {
            'success': True,
            'message': 'No changes detected',
            'record_id': record_id
        }


@router.delete("/item/{record_id}")
def delete_item_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_cataloger)
):
    """
    Delete an item record.
    Requires cataloger role or higher.
    Updates has_item_link in related analytics.
    """
    item = db.query(models.Item).filter(models.Item.id == record_id).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item record not found")
    
    barcode = item.barcode
    title = item.title
    call_number = item.alternative_call_number
    
    # Update has_item_link in analytics if this was the only item with this barcode
    if barcode:
        other_items = db.query(models.Item).filter(
            models.Item.barcode == barcode,
            models.Item.id != record_id
        ).count()
        
        if other_items == 0:
            # No other items with this barcode, set has_item_link to false
            analytics = db.query(models.Analytics).filter(
                models.Analytics.barcode == barcode
            ).all()
            for a in analytics:
                a.has_item_link = False
    
    db.delete(item)
    db.commit()
    
    return {
        'success': True,
        'message': f'Item deleted: {title}',
        'deleted_record': {
            'id': record_id,
            'barcode': barcode,
            'title': title,
            'call_number': call_number
        }
    }


# ==================== SHELF RECORDS ====================

@router.get("/shelf/{call_number}")
def get_shelf_records(
    call_number: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_viewer)
):
    """
    Get all records on a specific shelf.
    Returns items, analytics, weeded items, and errors for the shelf.
    
    call_number format: S-3-01A-02-03 (full) or S-3-01A-02-03 (shelf base)
    """
    import re
    
    # Parse the call number to get shelf base
    # Full format: S-floor-range-ladder-shelf-position
    # Shelf format: S-floor-range-ladder-shelf
    match = re.match(r'(S-[^-]+-[^-]+-\d+-\d+)', call_number)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid call number format")
    
    shelf_base = match.group(1)
    
    # Parse components
    parts = shelf_base.split('-')
    if len(parts) != 5:
        raise HTTPException(status_code=400, detail="Invalid shelf call number")
    
    _, floor, range_code, ladder, shelf = parts
    
    # Get all items from Items table on this shelf
    items = db.query(models.Item).filter(
        models.Item.alternative_call_number.like(f"{shelf_base}-%")
    ).all()
    
    # Detect duplicates - items with same call number
    call_number_counts = {}
    for item in items:
        call_num = item.alternative_call_number
        call_number_counts[call_num] = call_number_counts.get(call_num, 0) + 1
    duplicate_call_numbers = {cn for cn, count in call_number_counts.items() if count > 1}
    
    # Get all analytics on this shelf
    analytics = db.query(models.Analytics).filter(
        models.Analytics.alternative_call_number.like(f"{shelf_base}-%")
    ).all()
    
    # Get weeded items from this shelf
    weeded = db.query(models.WeededItem).filter(
        models.WeededItem.alternative_call_number.like(f"{shelf_base}-%")
    ).all()
    
    # Get errors for this shelf from database
    errors = db.query(models.AnalyticsError).filter(
        models.AnalyticsError.alternative_call_number.like(f"{shelf_base}-%")
    ).all()
    
    # Dynamically detect additional errors: analytics within accessioned range but no matching item
    # Get min/max call numbers from all items in database
    all_items = db.query(models.Item).filter(
        models.Item.alternative_call_number.isnot(None)
    ).all()
    
    if all_items:
        # Parse to get shelf range
        shelf_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)')
        shelves_with_items = set()
        item_barcodes = {item.barcode for item in all_items}
        
        for item in all_items:
            shelf_match = shelf_pattern.match(item.alternative_call_number)
            if shelf_match:
                f, r, ladder, shelf = shelf_match.groups()
                shelves_with_items.add(f"{f}-{r}-{ladder}-{shelf}")
        
        # Check if current shelf is within accessioned range
        current_shelf_match = shelf_pattern.match(shelf_base)
        if current_shelf_match and shelves_with_items:
            current_shelf_key = f"{current_shelf_match.group(1)}-{current_shelf_match.group(2)}-{current_shelf_match.group(3)}-{current_shelf_match.group(4)}"
            sorted_shelves = sorted(shelves_with_items)
            min_shelf = sorted_shelves[0]
            max_shelf = sorted_shelves[-1]
            
            # If this shelf is within the range, check for missing items
            if min_shelf <= current_shelf_key <= max_shelf:
                # Add dynamic errors for analytics without matching items
                error_barcodes_in_db = {(e.barcode, e.alternative_call_number) for e in errors}
                
                for a in analytics:
                    # Skip if already in errors table
                    if (a.barcode, a.alternative_call_number) in error_barcodes_in_db:
                        continue
                    
                    # Skip if has matching item
                    if a.barcode in item_barcodes:
                        continue
                    
                    # This analytics is in accessioned range but has no item - add as dynamic error
                    dynamic_error = type('obj', (object,), {
                        'id': f"dynamic_{a.id}",
                        'barcode': a.barcode,
                        'alternative_call_number': a.alternative_call_number,
                        'title': a.title,
                        'error_reason': f"Within accessioned range ({min_shelf} to {max_shelf}) but no matching physical item"
                    })()
                    errors.append(dynamic_error)
    
    # Build position map
    position_map = {}
    call_pattern = re.compile(r'S-[^-]+-[^-]+-\d+-\d+-(\d+)')
    
    # Create barcode to analytics map for title lookup
    analytics_by_barcode = {a.barcode: a for a in analytics}
    
    # Add items
    for item in items:
        pos_match = call_pattern.match(item.alternative_call_number or '')
        if pos_match:
            pos = int(pos_match.group(1))
            if pos not in position_map:
                position_map[pos] = {'items': [], 'analytics': [], 'source': 'item'}
            
            # Get title from matching analytics record if available
            title = analytics_by_barcode[item.barcode].title if item.barcode in analytics_by_barcode else None
            
            position_map[pos]['items'].append({
                'id': item.id,
                'barcode': item.barcode,
                'title': title,
                'call_number': item.alternative_call_number
            })
    
    # Add analytics
    error_set = {(e.barcode, e.alternative_call_number) for e in errors}
    for a in analytics:
        # Skip if this analytics has an error
        if (a.barcode, a.alternative_call_number) in error_set:
            continue
        
        pos_match = call_pattern.match(a.alternative_call_number or '')
        if pos_match:
            pos = int(pos_match.group(1))
            if pos not in position_map:
                position_map[pos] = {'items': [], 'analytics': [], 'source': 'analytics'}
            position_map[pos]['analytics'].append({
                'id': a.id,
                'barcode': a.barcode,
                'title': a.title,
                'call_number': a.alternative_call_number,
                'has_item_link': a.has_item_link
            })
    
    return {
        'shelf_info': {
            'call_number': shelf_base,
            'floor': floor,
            'range': range_code,
            'ladder': int(ladder),
            'shelf': int(shelf)
        },
        'summary': {
            'total_items': len(items),
            'total_analytics': len(analytics),
            'total_weeded': len(weeded),
            'total_errors': len(errors),
            'occupied_positions': len(position_map),
            'sources_breakdown': {
                'items': len(items),
                'analytics_only': len([a for a in analytics if not a.has_item_link]),
                'errors': len(errors)
            }
        },
        'position_map': position_map,
        'physical_items': [
            {
                'id': item.id,
                'barcode': item.barcode,
                'title': analytics_by_barcode[item.barcode].title if item.barcode in analytics_by_barcode else None,
                'call_number': item.alternative_call_number,
                'position': item.alternative_call_number.split('-')[-1] if item.alternative_call_number and '-' in item.alternative_call_number else None,
                'has_analytics_match': item.barcode in analytics_by_barcode,
                'is_duplicate': item.alternative_call_number in duplicate_call_numbers
            } for item in items
        ],
        'analytics_neighbors': [
            {
                'id': a.id,
                'barcode': a.barcode,
                'title': a.title,
                'call_number': a.alternative_call_number,
                'has_item_link': a.has_item_link,
                'status': a.status
            } for a in analytics
        ],
        'weeded': [
            {
                'id': w.id,
                'barcode': w.barcode,
                'title': analytics_by_barcode[w.barcode].title if w.barcode in analytics_by_barcode else None,
                'call_number': w.alternative_call_number,
                'created_at': w.created_at.isoformat() if w.created_at else None
            } for w in weeded
        ],
        'errors': [
            {
                'id': e.id,
                'barcode': e.barcode,
                'analytics_call_number': e.alternative_call_number,
                'title': e.title,
                'error_reason': e.error_reason
            } for e in errors
        ]
    }
