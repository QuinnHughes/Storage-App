# backend/api/shelf_optimization.py
# ALL SQL QUERIES REMOVED - PURE PYTHON IMPLEMENTATION ONLY

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
import re
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
    """
    from db.models import Analytics, WeededItem
    
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
    
    # Parse and group by shelf
    shelf_occupancy = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'occupied_positions': set(),
        'max_position': 0
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    for record in analytics_records:
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
    Find partially filled shelves using ONLY analytics - NO SQL.
    Pure Python implementation.
    """
    # Use the shelf analysis function which is already Python-only
    from db.models import Analytics
    
    analytics_query = db.query(Analytics).filter(
        Analytics.alternative_call_number.isnot(None),
        Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
    )
    
    if floor:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-{floor}-%'))
    if range_code:
        analytics_query = analytics_query.filter(Analytics.alternative_call_number.like(f'S-%-{range_code}-%'))
    
    analytics_records = analytics_query.all()
    
    # Parse and group
    shelf_data = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'current_items': 0,
        'max_position': 0
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    for record in analytics_records:
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['current_items'] += 1
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
    # Filter by fill percentage and group by range
    ranges = {}
    for shelf_key, data in shelf_data.items():
        capacity = max(data['max_position'], data['current_items'])
        fill_pct = round((data['current_items'] / capacity) * 100, 1) if capacity > 0 else 0
        
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
                'current_items': data['current_items'],
                'capacity': capacity,
                'fill_percentage': fill_pct,
                'available_space': capacity - data['current_items'],
                'call_number': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}"
            })
            ranges[range_key]['total_items'] += data['current_items']
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
    db: Session = Depends(get_db)
):
    """
    Comprehensive shelf analysis using ONLY analytics and weeded_items tables.
    NO SQL queries - pure Python processing.
    """
    import re
    from db.models import Analytics, WeededItem
    
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
    
    # Step 2: Parse analytics data and group by shelf
    shelf_data = defaultdict(lambda: {
        'floor': None,
        'range_code': None,
        'ladder': None,
        'shelf': None,
        'current_items': 0,
        'max_position': 0,
        'weeded_count': 0,
        'first_weeded': None,
        'last_weeded': None
    })
    
    call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
    
    for record in analytics_records:
        match = call_number_pattern.match(record.alternative_call_number)
        if match:
            f, r, ladder, shelf, position = match.groups()
            shelf_key = f"{f}-{r}-{ladder}-{shelf}"
            
            shelf_data[shelf_key]['floor'] = f
            shelf_data[shelf_key]['range_code'] = r
            shelf_data[shelf_key]['ladder'] = int(ladder)
            shelf_data[shelf_key]['shelf'] = int(shelf)
            shelf_data[shelf_key]['current_items'] += 1
            shelf_data[shelf_key]['max_position'] = max(
                shelf_data[shelf_key]['max_position'],
                int(position)
            )
    
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
    
    # Step 5: Calculate metrics and build result list
    result = []
    for shelf_key, data in shelf_data.items():
        if data['max_position'] == 0 and data['current_items'] == 0:
            continue  # Skip shelves with no data
        
        # Use max_position or current_items as capacity estimate
        capacity = max(data['max_position'], data['current_items'])
        
        fill_percentage = round((data['current_items'] / capacity) * 100, 1) if capacity > 0 else 0
        available_slots = max(capacity - data['current_items'], 0)
        
        # Determine material size based on current item density
        material_info = categorize_material_size(data['current_items'])
        
        result.append({
            'floor': data['floor'],
            'range_code': data['range_code'],
            'ladder': data['ladder'],
            'shelf': data['shelf'],
            'current_items': data['current_items'],
            'capacity': capacity,
            'fill_percentage': fill_percentage,
            'weeded_count': data['weeded_count'],
            'available_slots': available_slots,
            'first_weeded': data['first_weeded'].isoformat() if data['first_weeded'] else None,
            'last_weeded': data['last_weeded'].isoformat() if data['last_weeded'] else None,
            'call_number': f"S-{data['floor']}-{data['range_code']}-{str(data['ladder']).zfill(2)}-{str(data['shelf']).zfill(2)}",
            'material_size': material_info['category'],
            'material_description': material_info['description'],
            'estimated_item_width': material_info['estimated_avg_width'],
            'can_fit_materials': material_info['can_fit']
        })
    
    # Step 6: Sort results
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
    
    # Step 7: Categorize shelves
    very_low = []  # 0-25%
    low = []  # 26-50%
    medium = []  # 51-75%
    high = []  # 76-100%
    
    total_shelves = len(result)
    total_items = sum(r['current_items'] for r in result)
    total_weeded = sum(r['weeded_count'] for r in result)
    total_available = sum(r['available_slots'] for r in result)
    
    for shelf in result:
        fill_pct = shelf['fill_percentage']
        if fill_pct <= 25:
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
    
    very_low = sort_by_call_number(very_low)
    low = sort_by_call_number(low)
    medium = sort_by_call_number(medium)
    high = sort_by_call_number(high)
    
    return {
        'summary': {
            'total_shelves': total_shelves,
            'total_items': total_items,
            'total_weeded': total_weeded,
            'total_available_slots': total_available,
            'by_density': {
                'very_low': len(very_low),
                'low': len(low),
                'medium': len(medium),
                'high': len(high)
            }
        },
        'shelves': {
            'very_low': very_low,
            'low': low,
            'medium': medium,
            'high': high
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
            
            # Estimate capacity (use 20 as default shelf capacity)
            estimated_capacity = 20
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
