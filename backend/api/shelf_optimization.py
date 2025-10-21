# backend/api/shelf_optimization.py
# ALL SQL QUERIES REMOVED - PURE PYTHON IMPLEMENTATION ONLY

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import re
import csv
import io
from collections import defaultdict

from db.session import get_db
from db import models

router = APIRouter()

# Material size constants based on 35-inch shelf capacity
SHELF_WIDTH_INCHES = 35
LARGE_MATERIAL_THRESHOLD = 20  # <= 20 items = large books (>1.5 inches avg)
AVERAGE_MATERIAL_THRESHOLD = 45  # 21-45 items = average books (~1 inch)
# > 45 items = small materials (<0.75 inches)


def categorize_material_size(item_count: int) -> Dict[str, any]:
    """
    Categorize shelf material size based on item density.
    Shelf is 35 inches wide.
    
    Returns:
        dict with 'category', 'description', and 'estimated_avg_width'
    """
    if item_count <= LARGE_MATERIAL_THRESHOLD:
        return {
            'category': 'large',
            'description': 'Large materials (oversize books, binders)',
            'estimated_avg_width': round(SHELF_WIDTH_INCHES / max(item_count, 1), 2),
            'icon': '📚',
            'can_fit': ['large', 'average', 'small']
        }
    elif item_count <= AVERAGE_MATERIAL_THRESHOLD:
        return {
            'category': 'average',
            'description': 'Average materials (standard books)',
            'estimated_avg_width': round(SHELF_WIDTH_INCHES / item_count, 2),
            'icon': '📖',
            'can_fit': ['average', 'small']
        }
    else:
        return {
            'category': 'small',
            'description': 'Small materials (pamphlets, thin documents)',
            'estimated_avg_width': round(SHELF_WIDTH_INCHES / item_count, 2),
            'icon': '📄',
            'can_fit': ['small']
        }


def parse_call_number(call_number: str) -> Dict[str, str]:
    """
    Parse alternative call number into components.
    Format: S-{floor}-{range}-{ladder}-{shelf}-{position}
    """
    if not call_number:
        return {}
    match = re.match(r'S-(\w+)-(\d+[A-Z]*)-(\d+)-(\d+)-(.+)', call_number)
    if match:
        return {
            'floor': match.group(1),
            'range_code': match.group(2),
            'ladder': match.group(3),
            'shelf': match.group(4),
            'position': match.group(5)
        }
    return {}


@router.get("/available-space")
def get_available_space(
    floor: Optional[str] = Query(None, description="Filter by floor"),
    range_code: Optional[str] = Query(None, description="Filter by range"),
    min_consecutive_slots: int = Query(1, description="Minimum consecutive empty slots"),
    db: Session = Depends(get_db)
):
    """
    Find available space using ONLY analytics data - NO SQL QUERIES.
    Pure Python processing to identify empty shelves and available slots.
    Accounts for: Items table (ground truth), Analytics errors (inaccuracies).
    """
    from db.models import Analytics, WeededItem, Item, AnalyticsError
    
    # Get Items table data (ground truth)
    items_query = db.query(Item).filter(
        Item.alternative_call_number.isnot(None),
        Item.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    if floor:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    items_records = items_query.all()
    accessioned_positions = {item.alternative_call_number for item in items_records if item.alternative_call_number}
    
    # Get analytics errors
    errors_query = db.query(AnalyticsError).all()
    error_positions = {(error.barcode, error.alternative_call_number) for error in errors_query if error.alternative_call_number}
    
    # Get all analytics records with valid call numbers
    analytics_query = db.query(Analytics).filter(
        Analytics.alternative_call_number.isnot(None),
        Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    analytics_records = analytics_query.all()
    
    # Parse and group by shelf, accounting for Items and errors
    shelf_occupancy = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'occupied_positions': set(),
        'max_position': 0
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    # First, add all accessioned items (Items table)
    for item in items_records:
        match = call_number_pattern.match(item.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_occupancy[shelf_key]['floor'] = f
            shelf_occupancy[shelf_key]['range_code'] = r
            shelf_occupancy[shelf_key]['ladder'] = int(ladder)
            shelf_occupancy[shelf_key]['shelf'] = int(shelf)
            shelf_occupancy[shelf_key]['occupied_positions'].add(int(position))
            shelf_occupancy[shelf_key]['max_position'] = max(
                shelf_occupancy[shelf_key]['max_position'],
                int(position)
            )
    
    # Then add analytics (skip errors and already-accessioned positions)
    for record in analytics_records:
        # Skip if error or already accessioned
        if (record.barcode, record.alternative_call_number) in error_positions:
            continue
        if record.alternative_call_number in accessioned_positions:
            continue
        
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_occupancy[shelf_key]['floor'] = f
            shelf_occupancy[shelf_key]['range_code'] = r
            shelf_occupancy[shelf_key]['ladder'] = int(ladder)
            shelf_occupancy[shelf_key]['shelf'] = int(shelf)
            shelf_occupancy[shelf_key]['occupied_positions'].add(int(position))
            shelf_occupancy[shelf_key]['max_position'] = max(
                shelf_occupancy[shelf_key]['max_position'],
                int(position)
            )
    
    # Also check for weeded shelves that might now be empty
    weeded_query = db.query(WeededItem).filter(
        WeededItem.alternative_call_number.isnot(None)
    )
    if floor:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    weeded_records = weeded_query.all()
    weeded_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)')
    
    for record in weeded_records:
        match = weeded_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            # Add to tracking if not already present
            if shelf_key not in shelf_occupancy:
                shelf_occupancy[shelf_key]['floor'] = f
                shelf_occupancy[shelf_key]['range_code'] = r
                shelf_occupancy[shelf_key]['ladder'] = int(ladder)
                shelf_occupancy[shelf_key]['shelf'] = int(shelf)
    
    # Build result
    spaces = []
    for shelf_key, data in shelf_occupancy.items():
        current_items = len(data['occupied_positions'])
        capacity = max(data['max_position'], current_items)
        
        # Get material size info based on current items
        material_info = categorize_material_size(current_items) if current_items > 0 else {
            'category': 'empty',
            'description': 'Empty shelf - can fit any size',
            'estimated_avg_width': 0,
            'can_fit': ['large', 'average', 'small']
        }
        
        # Check if shelf is completely empty
        if current_items == 0:
            spaces.append({
                'floor': data['floor'],
                'range_code': data['range_code'],
                'ladder': data['ladder'],
                'shelf': data['shelf'],
                'call_number_base': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}",
                'is_completely_empty': True,
                'current_items': 0,
                'empty_positions': [],
                'total_available': capacity if capacity > 0 else 35,  # Default to full shelf
                'material_size': material_info['category'],
                'material_description': material_info['description'],
                'can_fit_materials': material_info['can_fit']
            })
        else:
            # Find empty positions
            all_positions = set(range(1, capacity + 1))
            empty_positions = sorted(all_positions - data['occupied_positions'])
            
            if len(empty_positions) >= min_consecutive_slots:
                spaces.append({
                    'floor': data['floor'],
                    'range_code': data['range_code'],
                    'ladder': data['ladder'],
                    'shelf': data['shelf'],
                    'call_number_base': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}",
                    'is_completely_empty': False,
                    'current_items': current_items,
                    'empty_positions': empty_positions,
                    'total_available': len(empty_positions),
                    'material_size': material_info['category'],
                    'material_description': material_info['description'],
                    'can_fit_materials': material_info['can_fit']
                })
    
    # Sort spaces by call number (floor, range, ladder, shelf)
    spaces.sort(key=lambda x: (x['floor'], x['range_code'], x['ladder'], x['shelf']))
    
    return {
        'total_shelves_with_space': len(spaces),
        'spaces': spaces
    }


@router.get("/consolidation-opportunities")
def get_consolidation_opportunities(
    floor: Optional[str] = Query(None, description="Filter by floor"),
    range_code: Optional[str] = Query(None, description="Filter by range"),
    max_fill_percentage: int = Query(50, description="Max fill % to consider for consolidation"),
    db: Session = Depends(get_db)
):
    """
    Find partially filled shelves for consolidation.
    Accounts for: Items table (ground truth), Analytics errors (inaccuracies).
    Pure Python implementation - NO SQL.
    """
    from db.models import Analytics, Item, AnalyticsError
    
    # Get Items table data (ground truth)
    items_query = db.query(Item).filter(
        Item.alternative_call_number.isnot(None),
        Item.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    if floor:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    items_records = items_query.all()
    accessioned_positions = {item.alternative_call_number for item in items_records if item.alternative_call_number}
    
    # Get analytics errors
    errors_query = db.query(AnalyticsError).all()
    error_positions = {(error.barcode, error.alternative_call_number) for error in errors_query if error.alternative_call_number}
    
    analytics_query = db.query(Analytics).filter(
        Analytics.alternative_call_number.isnot(None),
        Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    analytics_records = analytics_query.all()
    
    # Parse and group, accounting for Items and errors
    shelf_data = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'occupied_positions': set(),
        'max_position': 0
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    # First add Items table data
    for item in items_records:
        match = call_number_pattern.match(item.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['occupied_positions'].add(int(position))
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
    # Then add analytics (skip errors and accessioned)
    for record in analytics_records:
        if (record.barcode, record.alternative_call_number) in error_positions:
            continue
        if record.alternative_call_number in accessioned_positions:
            continue
        
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['occupied_positions'].add(int(position))
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
    # Filter by fill percentage and group by range
    ranges = {}
    for shelf_key, data in shelf_data.items():
        current_items = len(data['occupied_positions'])
        capacity = max(data['max_position'], current_items)
        fill_pct = round((current_items / capacity) * 100, 1) if capacity > 0 else 0
        
        if fill_pct <= max_fill_percentage and capacity > 0:
            range_key = f"{data['floor']}-{data['range_code']}"
            if range_key not in ranges:
                ranges[range_key] = {
                    'floor': data['floor'],
                    'range_code': data['range_code'],
                    'partial_shelves': [],
                    'total_items': 0,
                    'total_capacity': 0
                }
            
            ranges[range_key]['partial_shelves'].append({
                'ladder': data['ladder'],
                'shelf': data['shelf'],
                'current_items': current_items,
                'capacity': capacity,
                'fill_percentage': fill_pct,
                'available_space': capacity - current_items,
                'call_number': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}"
            })
            ranges[range_key]['total_items'] += current_items
            ranges[range_key]['total_capacity'] += capacity
    
    # Calculate consolidation opportunities
    opportunities = []
    for range_key, data in ranges.items():
        if len(data['partial_shelves']) >= 2:
            # Sort shelves by call number (ladder, shelf) within each range
            data['partial_shelves'].sort(key=lambda x: (x['ladder'], x['shelf']))
            
            shelves_needed = 0
            items_placed = 0
            total_items = data['total_items']
            
            for shelf in data['partial_shelves']:
                if items_placed < total_items:
                    shelves_needed += 1
                    items_placed += shelf['capacity']
            
            shelves_freed = len(data['partial_shelves']) - shelves_needed
            
            if shelves_freed > 0:
                opportunities.append({
                    'floor': data['floor'],
                    'range_code': data['range_code'],
                    'current_partial_shelves': len(data['partial_shelves']),
                    'total_items': data['total_items'],
                    'shelves_needed_after_consolidation': shelves_needed,
                    'shelves_freed': shelves_freed,
                    'shelves': data['partial_shelves']
                })
    
    # Sort opportunities by floor and range_code
    opportunities.sort(key=lambda x: (x['floor'], x['range_code']))
    
    return {
        'total_opportunities': len(opportunities),
        'opportunities': opportunities
    }




@router.get("/weeded-space-analysis")
def get_weeded_space_analysis(
    floor: Optional[str] = Query(None, description="Filter by floor"),
    range_code: Optional[str] = Query(None, description="Filter by range"),
    min_weeded_count: int = Query(2, description="Minimum weeded items to show range"),
    db: Session = Depends(get_db)
):
    """
    Analyze weeded space using ONLY Python - NO SQL.
    """
    from db.models import WeededItem
    
    weeded_query = db.query(WeededItem).filter(
        WeededItem.is_weeded == True,
        WeededItem.alternative_call_number.isnot(None),
        WeededItem.alternative_call_number != 'nan',
        WeededItem.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+')
    )
    
    if floor:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    weeded_records = weeded_query.all()
    
    # Parse and group by shelf
    shelf_weeded = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'weeded_count': 0,
        'first_weeded': None,
        'last_weeded': None
    })
    
    weeded_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)')
    
    for record in weeded_records:
        match = weeded_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_weeded[shelf_key]['floor'] = f
            shelf_weeded[shelf_key]['range_code'] = r
            shelf_weeded[shelf_key]['ladder'] = int(ladder)
            shelf_weeded[shelf_key]['shelf'] = int(shelf)
            shelf_weeded[shelf_key]['weeded_count'] += 1
            
            if record.created_at:
                if shelf_weeded[shelf_key]['first_weeded'] is None:
                    shelf_weeded[shelf_key]['first_weeded'] = record.created_at
                else:
                    shelf_weeded[shelf_key]['first_weeded'] = min(
                        shelf_weeded[shelf_key]['first_weeded'],
                        record.created_at
                    )
                
                if shelf_weeded[shelf_key]['last_weeded'] is None:
                    shelf_weeded[shelf_key]['last_weeded'] = record.created_at
                else:
                    shelf_weeded[shelf_key]['last_weeded'] = max(
                        shelf_weeded[shelf_key]['last_weeded'],
                        record.created_at
                    )
    
    # Now check current items on these shelves from Analytics
    from db.models import Analytics
    
    # Get all analytics for the affected shelves
    shelf_keys_list = list(shelf_weeded.keys())
    shelf_current_items = defaultdict(int)
    
    analytics_query = db.query(Analytics).filter(
        Analytics.alternative_call_number.isnot(None),
        Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    analytics_records = analytics_query.all()
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    for record in analytics_records:
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            if shelf_key in shelf_weeded:
                shelf_current_items[shelf_key] += 1
    
    # Build result
    shelves = []
    total_items_weeded = 0
    
    for shelf_key, data in shelf_weeded.items():
        if data['weeded_count'] >= min_weeded_count:
            total_items_weeded += data['weeded_count']
            current_items = shelf_current_items.get(shelf_key, 0)
            shelf_now_empty = (current_items == 0)
            
            # Determine what material size was weeded based on weeded count
            weeded_material_info = categorize_material_size(data['weeded_count'])
            
            # If shelf still has items, use current item count for size
            if current_items > 0:
                current_material_info = categorize_material_size(current_items)
            else:
                current_material_info = {
                    'category': 'empty',
                    'description': 'Now empty - can fit any size',
                    'can_fit': ['large', 'average', 'small']
                }
            
            shelves.append({
                'floor': data['floor'],
                'range_code': data['range_code'],
                'ladder': data['ladder'],
                'shelf': data['shelf'],
                'weeded_count': data['weeded_count'],
                'current_items': current_items,
                'first_weeded': data['first_weeded'].isoformat() if data['first_weeded'] else None,
                'last_weeded': data['last_weeded'].isoformat() if data['last_weeded'] else None,
                'call_number': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}",
                'shelf_now_empty': shelf_now_empty,
                'weeded_material_size': weeded_material_info['category'],
                'weeded_material_description': weeded_material_info['description'],
                'current_material_size': current_material_info['category'],
                'current_material_description': current_material_info['description'],
                'can_fit_materials': current_material_info['can_fit']
            })
    
    # Sort by call number (floor, range, ladder, shelf)
    shelves.sort(key=lambda x: (x['floor'], x['range_code'], x['ladder'], x['shelf']))
    
    return {
        'total_locations': len(shelves),
        'total_items_weeded': total_items_weeded,
        'shelves': shelves
    }


@router.get("/shelf-analysis")
def get_shelf_analysis(
    floor: Optional[str] = Query(None, description="Filter by floor"),
    range_code: Optional[str] = Query(None, description="Filter by range"),
    sort_by: str = Query("fill_percentage", description="Sort by: fill_percentage, weeded_count, items_count"),
    sort_order: str = Query("asc", description="asc or desc"),
    density_filter: Optional[str] = Query(None, description="REQUIRED - Filter by density: empty, very_low, low, medium, high"),
    limit: int = Query(250, description="Maximum number of results to return", ge=1, le=5000),
    offset: int = Query(0, description="Number of results to skip", ge=0),
    db: Session = Depends(get_db)
):
    """
    Comprehensive shelf analysis with dynamic accuracy.
    IMPORTANT: density_filter is now REQUIRED to prevent loading thousands of shelves.
    
    Use density_filter to specify which category of shelves to view:
    1. Uses Items table as ground truth for occupied positions
    2. Removes analytics records that have matching errors (inaccurate data)
    3. Combines with analytics for full picture
    NO SQL queries - pure Python processing.
    """
    # Validate density_filter is provided
    if not density_filter:
        raise HTTPException(
            status_code=400,
            detail="density_filter is required. Please select: empty, very_low, low, medium, or high. This prevents loading thousands of shelves at once."
        )
    
    # Validate density_filter value
    valid_filters = ['empty', 'very_low', 'low', 'medium', 'high']
    if density_filter not in valid_filters:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid density_filter '{density_filter}'. Must be one of: {', '.join(valid_filters)}"
        )
    
    import re
    from db.models import Analytics, WeededItem, Item, AnalyticsError
    
    # Step 0: Get Items table data (ground truth) and Analytics Errors (inaccuracies)
    items_query = db.query(Item).filter(
        Item.alternative_call_number.isnot(None),
        Item.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        items_query = items_query.filter(Item.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    items_records = items_query.all()
    
    # Build set of positions occupied by actual accessioned items
    accessioned_positions = set()
    for item in items_records:
        if item.alternative_call_number:
            accessioned_positions.add(item.alternative_call_number)
    
    # Get analytics errors - these are locations where analytics is wrong
    errors_query = db.query(AnalyticsError).all()
    error_positions = set()
    for error in errors_query:
        # Match errors by barcode and alternative_call_number
        if error.alternative_call_number:
            error_positions.add((error.barcode, error.alternative_call_number))
    
    # Step 1: Get all analytics records with valid call numbers
    analytics_query = db.query(Analytics).filter(
        Analytics.alternative_call_number.isnot(None),
        Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    analytics_records = analytics_query.all()
    
    # Step 2: Parse analytics data and group by shelf, filtering out errors
    # Build set of shelves that have analytics (for empty shelf detection)
    shelves_with_analytics = set()
    
    shelf_data = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'current_items': 0,
        'max_position': 0,
        'weeded_count': 0,
        'first_weeded': None,
        'last_weeded': None,
        'occupied_positions': set(),  # Track which specific positions are occupied
        'items_count': 0,  # Count from Items table
        'analytics_count': 0  # Count from Analytics (after filtering errors)
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    # First, add all accessioned items (Items table = ground truth)
    for item in items_records:
        match = call_number_pattern.match(item.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['occupied_positions'].add(int(position))
            shelf_data[shelf_key]['items_count'] += 1
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
    # Then, add analytics records (but skip those with errors or already in Items)
    for record in analytics_records:
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            # Track that this shelf has analytics (BEFORE any filtering)
            # This is the source of truth for which shelves are NOT empty
            shelves_with_analytics.add(shelf_key)
        
        # Skip if this analytics record has a known error
        if (record.barcode, record.alternative_call_number) in error_positions:
            continue
        
        # Skip if this position is already occupied by an accessioned item
        if record.alternative_call_number in accessioned_positions:
            continue
        
        if match:
            # Already matched above
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['occupied_positions'].add(int(position))
            shelf_data[shelf_key]['analytics_count'] += 1
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
    # Calculate current_items as union of both sources
    for shelf_key in shelf_data:
        shelf_data[shelf_key]['current_items'] = len(shelf_data[shelf_key]['occupied_positions'])
    
    # Step 3: Get weeded items data
    weeded_query = db.query(WeededItem).filter(
        WeededItem.is_weeded == True,
        WeededItem.alternative_call_number.isnot(None),
        WeededItem.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+')
    )
    
    if floor:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        weeded_query = weeded_query.filter(WeededItem.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    weeded_records = weeded_query.all()
    
    # Step 4: Process weeded data
    weeded_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)')
    
    for record in weeded_records:
        match = weeded_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            # Initialize shelf if it doesn't exist (weeded but no current analytics)
            if shelf_key not in shelf_data:
                shelf_data[shelf_key]['floor'] = f
                shelf_data[shelf_key]['range_code'] = r
                shelf_data[shelf_key]['ladder'] = int(ladder)
                shelf_data[shelf_key]['shelf'] = int(shelf)
            
            shelf_data[shelf_key]['weeded_count'] += 1
            
            if record.created_at:
                if shelf_data[shelf_key]['first_weeded'] is None:
                    shelf_data[shelf_key]['first_weeded'] = record.created_at
                else:
                    shelf_data[shelf_key]['first_weeded'] = min(
                        shelf_data[shelf_key]['first_weeded'],
                        record.created_at
                    )
                
                if shelf_data[shelf_key]['last_weeded'] is None:
                    shelf_data[shelf_key]['last_weeded'] = record.created_at
                else:
                    shelf_data[shelf_key]['last_weeded'] = max(
                        shelf_data[shelf_key]['last_weeded'],
                        record.created_at
                    )
    
    # IMPORTANT: Store existing shelf keys AFTER all real data (Items, Analytics, Weeding)
    # This allows us to distinguish gap-filled empty shelves from shelves with actual data
    existing_shelf_keys = set(shelf_data.keys())
    
    # Step 4.5: Detect implicit empty shelves using intelligent range analysis
    # ONLY when density_filter='empty' to avoid creating unnecessary data
    if density_filter == 'empty':
        # Group all existing shelves by floor-range to establish boundaries
        range_boundaries = defaultdict(lambda: {
            'ladders': set(),
            'ladder_shelf_data': defaultdict(set)  # ladder -> set of shelf numbers
        })
        
        # First pass: Collect all ladders and shelves from EXISTING data (items, analytics, weeding)
        for shelf_key, data in shelf_data.items():
            if data['floor'] and data['range_code'] and data['ladder'] is not None:
                range_key = f"{data['floor']}-{data['range_code']}"
                ladder_num = data['ladder']
                shelf_num = data['shelf']
                
                range_boundaries[range_key]['ladders'].add(ladder_num)
                range_boundaries[range_key]['ladder_shelf_data'][ladder_num].add(shelf_num)
        
        # Second pass: For each range, intelligently detect empty shelves
        for range_key, boundaries in range_boundaries.items():
            if len(boundaries['ladders']) < 2:
                # Need at least 2 ladders to establish a pattern
                continue
            
            floor_part, range_part = range_key.split('-', 1)
            
            # Find min/max ladders for this range
            min_ladder = min(boundaries['ladders'])
            max_ladder = max(boundaries['ladders'])
            
            # For each ladder in the range (including gaps between ladders)
            for ladder_num in range(min_ladder, max_ladder + 1):
                shelves_in_ladder = boundaries['ladder_shelf_data'].get(ladder_num, set())
                
                # Determine expected shelf count based on adjacent ladders
                # Look left and right for neighboring ladders with data
                adjacent_shelf_counts = []
                
                # Check left neighbor
                for left in range(ladder_num - 1, min_ladder - 1, -1):
                    if left in boundaries['ladder_shelf_data'] and len(boundaries['ladder_shelf_data'][left]) >= 2:
                        adjacent_shelf_counts.append(max(boundaries['ladder_shelf_data'][left]))
                        break
                
                # Check right neighbor
                for right in range(ladder_num + 1, max_ladder + 1):
                    if right in boundaries['ladder_shelf_data'] and len(boundaries['ladder_shelf_data'][right]) >= 2:
                        adjacent_shelf_counts.append(max(boundaries['ladder_shelf_data'][right]))
                        break
                
                # If no adjacent ladders found, fall back to range average
                if not adjacent_shelf_counts:
                    all_max_shelves = [max(shelves) for shelves in boundaries['ladder_shelf_data'].values() if len(shelves) >= 2]
                    if all_max_shelves:
                        expected_max_shelf = int(sum(all_max_shelves) / len(all_max_shelves))
                    else:
                        continue  # Can't determine pattern
                else:
                    # Average of adjacent ladders
                    expected_max_shelf = int(sum(adjacent_shelf_counts) / len(adjacent_shelf_counts))
                
                if len(shelves_in_ladder) == 0:
                    # This entire ladder is empty - create shelves 1 to expected_max_shelf
                    for shelf_num in range(1, expected_max_shelf + 1):
                        shelf_key = f"{floor_part}-{range_part}-{str(ladder_num).zfill(2)}-{str(shelf_num).zfill(2)}"
                        
                        if shelf_key not in shelf_data and shelf_key not in shelves_with_analytics:
                            shelf_data[shelf_key] = {
                                'floor': floor_part,
                                'range_code': range_part,
                                'ladder': ladder_num,
                                'shelf': shelf_num,
                                'current_items': 0,
                                'max_position': 0,
                                'weeded_count': 0,
                                'first_weeded': None,
                                'last_weeded': None,
                                'occupied_positions': set(),
                                'items_count': 0,
                                'analytics_count': 0
                            }
                else:
                    # Ladder has some data - fill gaps within reasonable bounds
                    min_shelf = min(shelves_in_ladder)
                    max_shelf_in_ladder = max(shelves_in_ladder)
                    
                    # Don't exceed what adjacent ladders suggest
                    effective_max = min(max_shelf_in_ladder, expected_max_shelf)
                    
                    # Create shelves for gaps from min to effective_max
                    for shelf_num in range(min_shelf, effective_max + 1):
                        shelf_key = f"{floor_part}-{range_part}-{str(ladder_num).zfill(2)}-{str(shelf_num).zfill(2)}"
                        
                        if shelf_key not in shelf_data and shelf_key not in shelves_with_analytics:
                            shelf_data[shelf_key] = {
                                'floor': floor_part,
                                'range_code': range_part,
                                'ladder': ladder_num,
                                'shelf': shelf_num,
                                'current_items': 0,
                                'max_position': 0,
                                'weeded_count': 0,
                                'first_weeded': None,
                                'last_weeded': None,
                                'occupied_positions': set(),
                                'items_count': 0,
                                'analytics_count': 0
                            }
    
    # Step 5: Calculate metrics and build result list
    result = []
    
    for shelf_key, data in shelf_data.items():
        # For empty shelves, assume standard 35-slot capacity
        if data['current_items'] == 0:
            capacity = 35  # Standard shelf capacity
            fill_percentage = 0.0
            available_slots = 35
            material_info = {
                'category': 'empty',
                'description': 'Empty shelf - can fit any size',
                'estimated_avg_width': 0,
                'can_fit': ['large', 'average', 'small']
            }
            used_space_inches = 0
            available_space_inches = SHELF_WIDTH_INCHES
        else:
            # Use max_position or current_items as capacity estimate
            capacity = max(data['max_position'], data['current_items'])
            
            fill_percentage = round((data['current_items'] / capacity) * 100, 1) if capacity > 0 else 0
            available_slots = max(capacity - data['current_items'], 0)
            
            # Determine material size based on current item density
            material_info = categorize_material_size(data['current_items'])
            
            # Calculate physical space in inches
            # If we have items, estimate width per item, otherwise use full shelf
            if data['current_items'] > 0:
                estimated_width_per_item = SHELF_WIDTH_INCHES / capacity if capacity > 0 else 1.0
                used_space_inches = round(data['current_items'] * estimated_width_per_item, 1)
                available_space_inches = round(SHELF_WIDTH_INCHES - used_space_inches, 1)
            else:
                used_space_inches = 0
                available_space_inches = SHELF_WIDTH_INCHES
        
        shelf_obj = {
            'floor': data['floor'],
            'range_code': data['range_code'],
            'ladder': data['ladder'],
            'shelf': data['shelf'],
            'current_items': data['current_items'],
            'capacity': capacity,  # Keep for internal logic
            'fill_percentage': fill_percentage,
            'weeded_count': data['weeded_count'],
            'available_slots': available_slots,  # Keep for internal logic
            'used_space_inches': used_space_inches,
            'available_space_inches': available_space_inches,
            'first_weeded': data['first_weeded'].isoformat() if data['first_weeded'] else None,
            'last_weeded': data['last_weeded'].isoformat() if data['last_weeded'] else None,
            'call_number': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}",
            'material_size': material_info['category'],
            'material_description': material_info['description'],
            'estimated_item_width': material_info['estimated_avg_width'],
            'can_fit_materials': material_info['can_fit']
        }
        
        result.append(shelf_obj)
    
    # Step 6: Sort results (only sort existing shelves, not gap-filled)
    reverse = (sort_order == 'desc')
    if sort_by == 'fill_percentage':
        result.sort(key=lambda x: x['fill_percentage'], reverse=reverse)
    elif sort_by == 'weeded_count':
        result.sort(key=lambda x: x['weeded_count'], reverse=reverse)
    elif sort_by == 'items_count':
        result.sort(key=lambda x: x['current_items'], reverse=reverse)
    else:
        # Default sort by floor, range, ladder, shelf
        result.sort(key=lambda x: (x['floor'], x['range_code'], x['ladder'], x['shelf']))
    
    # Step 7: Categorize EXISTING shelves (not gap-filled)
    empty_shelves = []  # 0% exactly
    very_low = []  # 1-25%
    low = []  # 26-50%
    medium = []  # 51-75%
    high = []  # 76-100%
    
    total_shelves = len(result)
    total_items = sum(r['current_items'] for r in result)
    total_weeded = sum(r['weeded_count'] for r in result)
    total_available = sum(r['available_slots'] for r in result)
    
    for shelf in result:
        fill_pct = shelf['fill_percentage']
        if fill_pct == 0:
            empty_shelves.append(shelf)
        elif fill_pct <= 25:
            very_low.append(shelf)
        elif fill_pct <= 50:
            low.append(shelf)
        elif fill_pct <= 75:
            medium.append(shelf)
        else:
            high.append(shelf)
    
    # Sort each category by call number (floor, range, ladder, shelf)
    def sort_by_call_number(shelves_list):
        return sorted(shelves_list, key=lambda x: (x['floor'], x['range_code'], x['ladder'], x['shelf']))
    
    empty_shelves = sort_by_call_number(empty_shelves)
    very_low = sort_by_call_number(very_low)
    low = sort_by_call_number(low)
    medium = sort_by_call_number(medium)
    high = sort_by_call_number(high)
    
    # Apply density filter if specified
    if density_filter:
        if density_filter == 'empty':
            # Return all shelves with 0% fill (includes both gap-filled and existing empty shelves)
            filtered_result = empty_shelves
        elif density_filter == 'very_low':
            filtered_result = very_low
        elif density_filter == 'low':
            filtered_result = low
        elif density_filter == 'medium':
            filtered_result = medium
        elif density_filter == 'high':
            filtered_result = high
        else:
            filtered_result = result
        
        # Apply pagination to filtered result
        paginated_result = filtered_result[offset:offset + limit]
        
        return {
            'summary': {
                'total_shelves': total_shelves,
                'total_items': total_items,
                'total_weeded': total_weeded,
                'total_available_slots': total_available,
                'by_density': {
                    'empty': len(empty_shelves),
                    'very_low': len(very_low),
                    'low': len(low),
                    'medium': len(medium),
                    'high': len(high)
                },
                'filtered_count': len(filtered_result)
            },
            'pagination': {
                'limit': limit,
                'offset': offset,
                'total_in_category': len(filtered_result),
                'returned': len(paginated_result)
            },
            'shelves': paginated_result
        }
    else:
        # This shouldn't happen since density_filter is required, but keep for backwards compatibility
        very_low_paginated = very_low[offset:offset + limit]
        low_paginated = low[offset:offset + limit]
        medium_paginated = medium[offset:offset + limit]
        high_paginated = high[offset:offset + limit]
        
        return {
            'summary': {
                'total_shelves': total_shelves,
                'total_items': total_items,
                'total_weeded': total_weeded,
                'total_available_slots': total_available,
                'by_density': {
                    'empty': len(empty_shelves),
                    'very_low': len(very_low),
                    'low': len(low),
                    'medium': len(medium),
                    'high': len(high)
                }
            },
            'pagination': {
                'limit': limit,
                'offset': offset,
                'returned_very_low': len(very_low_paginated),
                'returned_low': len(low_paginated),
                'returned_medium': len(medium_paginated),
                'returned_high': len(high_paginated)
            },
            'shelves': {
                'very_low': very_low_paginated,
                'low': low_paginated,
                'medium': medium_paginated,
                'high': high_paginated
            }
        }


@router.get("/optimal-placement")
def find_optimal_placement(
    item_count: int = Query(..., description="Number of items to place"),
    prefer_empty_shelves: bool = Query(True, description="Prefer completely empty shelves"),
    floor: Optional[str] = Query(None, description="Specific floor"),
    range_code: Optional[str] = Query(None, description="Specific range"),
    db: Session = Depends(get_db)
):
    """
    Find the best location(s) to place a batch of new items.
    Prioritizes:
    1. Empty shelves (if prefer_empty_shelves=True)
    2. Consecutive empty slots
    3. Partially filled shelves with most available space
    """
    # Get available space
    available_space = get_available_space(floor, range_code, 1, db)
    
    # Sort by priority
    empty_shelves = [s for s in available_space['spaces'] if s['is_completely_empty']]
    partial_shelves = [s for s in available_space['spaces'] if not s['is_completely_empty']]
    partial_shelves.sort(key=lambda x: x['total_available'], reverse=True)
    
    recommendations = []
    items_remaining = item_count
    
    if prefer_empty_shelves:
        # Try to use empty shelves first
        for shelf in empty_shelves:
            if items_remaining <= 0:
                break
            # Estimate capacity (use 35 as default shelf capacity)
            estimated_capacity = 35
            items_to_place = min(items_remaining, estimated_capacity)
            
            recommendations.append({
                'location': shelf['call_number_base'],
                'floor': shelf['floor'],
                'range_code': shelf['range_code'],
                'ladder': shelf['ladder'],
                'shelf': shelf['shelf'],
                'type': 'empty_shelf',
                'items_to_place': items_to_place,
                'suggested_positions': list(range(1, items_to_place + 1))
            })
            items_remaining -= items_to_place
    
    # Use partial shelves for remaining items
    for shelf in partial_shelves:
        if items_remaining <= 0:
            break
        
        available = shelf['total_available']
        items_to_place = min(items_remaining, available)
        
        recommendations.append({
            'location': shelf['call_number_base'],
            'floor': shelf['floor'],
            'range_code': shelf['range_code'],
            'ladder': shelf['ladder'],
            'shelf': shelf['shelf'],
            'type': 'partial_shelf',
            'items_to_place': items_to_place,
            'available_positions': shelf['empty_positions'][:items_to_place]
        })
        items_remaining -= items_to_place
    
    return {
        'requested_items': item_count,
        'items_placed': item_count - items_remaining,
        'items_remaining': items_remaining,
        'can_accommodate_all': items_remaining == 0,
        'recommendations': recommendations
    }


# ==================== CSV EXPORT ENDPOINTS ====================

@router.get("/export/shelf-analysis")
def export_shelf_analysis_csv(
    floor: Optional[str] = Query(None),
    range_code: Optional[str] = Query(None),
    sort_by: str = Query("fill_percentage"),
    sort_order: str = Query("asc"),
    density_filter: Optional[str] = Query(None, description="REQUIRED - Filter by density: empty, very_low, low, medium, high"),
    limit: int = Query(5000, description="Max records to export"),
    db: Session = Depends(get_db)
):
    """Export shelf analysis data to CSV"""
    # Validate density_filter is provided
    if not density_filter:
        raise HTTPException(
            status_code=400,
            detail="density_filter is required for export. Please select: empty, very_low, low, medium, or high"
        )
    
    # Get the data with the density filter
    data = get_shelf_analysis(
        floor=floor,
        range_code=range_code,
        sort_by=sort_by,
        sort_order=sort_order,
        density_filter=density_filter,
        limit=limit,
        offset=0,
        db=db
    )
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write headers
    writer.writerow([
        'Call Number', 'Floor', 'Range', 'Ladder', 'Shelf',
        'Current Items', 'Fill %', 'Space Used (inches)', 'Space Available (inches)',
        'Weeded Count', 'Material Size', 'Material Description',
        'Est. Item Width (in)', 'Can Fit Materials',
        'First Weeded', 'Last Weeded'
    ])
    
    # Write shelves - data format is different when density_filter is used
    # When density_filter is provided, data['shelves'] is a flat array
    shelves_to_export = data['shelves']
    
    for shelf in shelves_to_export:
        writer.writerow([
            shelf['call_number'],
            shelf['floor'],
            shelf['range_code'],
            shelf['ladder'],
            shelf['shelf'],
            shelf['current_items'],
            shelf['fill_percentage'],
            shelf.get('used_space_inches', ''),
            shelf.get('available_space_inches', ''),
            shelf['weeded_count'],
            shelf.get('material_size', ''),
            shelf.get('material_description', ''),
            shelf.get('estimated_item_width', ''),
            ', '.join(shelf.get('can_fit_materials', [])),
            shelf.get('first_weeded', ''),
            shelf.get('last_weeded', '')
        ])
    
    # Prepare response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=shelf_analysis.csv"}
    )


@router.get("/export/available-space")
def export_available_space_csv(
    floor: Optional[str] = Query(None),
    range_code: Optional[str] = Query(None),
    min_consecutive_slots: int = Query(1),
    db: Session = Depends(get_db)
):
    """Export available space and weeded analysis combined to CSV"""
    # Get available space data
    available_data = get_available_space(floor, range_code, min_consecutive_slots, db)
    
    # Get weeded data
    weeded_data = get_weeded_space_analysis(floor, range_code, 1, db)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write available space section
    writer.writerow(['AVAILABLE SPACE'])
    writer.writerow([
        'Call Number', 'Floor', 'Range', 'Ladder', 'Shelf',
        'Status', 'Current Items', 'Total Available',
        'Material Size', 'Material Description', 'Can Fit Materials',
        'Empty Positions'
    ])
    
    for space in available_data['spaces']:
        status = 'Completely Empty' if space['is_completely_empty'] else 'Partial Space'
        empty_pos = ', '.join(map(str, space.get('empty_positions', [])))
        
        writer.writerow([
            space['call_number_base'],
            space['floor'],
            space['range_code'],
            space['ladder'],
            space['shelf'],
            status,
            space.get('current_items', 0),
            space['total_available'],
            space.get('material_size', ''),
            space.get('material_description', ''),
            ', '.join(space.get('can_fit_materials', [])),
            empty_pos
        ])
    
    # Add blank rows
    writer.writerow([])
    writer.writerow([])
    
    # Write weeded space section
    writer.writerow(['WEEDED SPACE ANALYSIS'])
    writer.writerow([
        'Call Number', 'Floor', 'Range', 'Ladder', 'Shelf',
        'Weeded Count', 'Current Items', 'Status',
        'Weeded Material Size', 'Current Material Size',
        'Can Fit Materials', 'First Weeded', 'Last Weeded'
    ])
    
    for shelf in weeded_data['shelves']:
        status = 'Now Empty' if shelf['shelf_now_empty'] else 'Partial Space'
        
        writer.writerow([
            shelf['call_number'],
            shelf['floor'],
            shelf['range_code'],
            shelf['ladder'],
            shelf['shelf'],
            shelf['weeded_count'],
            shelf.get('current_items', 0),
            status,
            shelf.get('weeded_material_size', ''),
            shelf.get('current_material_size', ''),
            ', '.join(shelf.get('can_fit_materials', [])),
            shelf.get('first_weeded', ''),
            shelf.get('last_weeded', '')
        ])
    
    # Prepare response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=available_and_weeded_space.csv"}
    )


@router.get("/export/consolidation")
def export_consolidation_csv(
    floor: Optional[str] = Query(None),
    range_code: Optional[str] = Query(None),
    max_fill_percentage: int = Query(50),
    db: Session = Depends(get_db)
):
    """Export consolidation opportunities to CSV"""
    # Get consolidation data
    data = get_consolidation_opportunities(floor, range_code, max_fill_percentage, db)
    
    # Create CSV in memory
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write summary
    writer.writerow(['CONSOLIDATION OPPORTUNITIES SUMMARY'])
    writer.writerow(['Total Opportunities', data['total_opportunities']])
    writer.writerow([])
    
    # Write opportunities
    writer.writerow(['CONSOLIDATION DETAILS'])
    writer.writerow([
        'Floor', 'Range', 'Current Partial Shelves', 'Total Items',
        'Shelves Needed After Consolidation', 'Shelves Freed'
    ])
    
    for opp in data['opportunities']:
        writer.writerow([
            opp['floor'],
            opp['range_code'],
            opp['current_partial_shelves'],
            opp['total_items'],
            opp['shelves_needed_after_consolidation'],
            opp['shelves_freed']
        ])
        
        # Write individual shelves for this opportunity
        writer.writerow([])
        writer.writerow(['', 'Shelves in this Range:'])
        writer.writerow(['', 'Call Number', 'Ladder', 'Shelf', 'Current Items', 
                        'Capacity', 'Fill %', 'Available Space'])
        
        for shelf in opp['shelves']:
            writer.writerow([
                '',
                shelf['call_number'],
                shelf['ladder'],
                shelf['shelf'],
                shelf['current_items'],
                shelf['capacity'],
                shelf['fill_percentage'],
                shelf['available_space']
            ])
        writer.writerow([])
    
    # Prepare response
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=consolidation_opportunities.csv"}
    )
