from db.session import SessionLocal
from db.models import Item, Analytics
from collections import defaultdict
import re

db = SessionLocal()

# Test the shelf detection logic for S-1-01B-01-01 specifically
test_shelf = "1-01B-1-1"

# Simulate the query
items_query = db.query(Item).filter(
    Item.alternative_call_number.isnot(None),
    Item.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
)
items_records = items_query.all()

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
    'occupied_positions': set(),
    'items_count': 0,
    'analytics_count': 0
})

call_number_pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')

# Process items
for item in items_records:
    match = call_number_pattern.match(item.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        shelf_key = f"{f}-{r}-{ladder}-{shelf}"
        
        if shelf_key == test_shelf:
            print(f"Found item: {item.alternative_call_number}")
        
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

# Calculate current_items
for shelf_key in shelf_data:
    shelf_data[shelf_key]['current_items'] = len(shelf_data[shelf_key]['occupied_positions'])

print(f"\nShelf {test_shelf} data after Items processing:")
if test_shelf in shelf_data:
    print(f"  current_items: {shelf_data[test_shelf]['current_items']}")
    print(f"  occupied_positions: {sorted(shelf_data[test_shelf]['occupied_positions'])}")
    print(f"  items_count: {shelf_data[test_shelf]['items_count']}")
else:
    print(f"  NOT FOUND in shelf_data!")

# Check if it's in existing_shelf_keys
existing_shelf_keys = set(shelf_data.keys())
print(f"\n{test_shelf} in existing_shelf_keys: {test_shelf in existing_shelf_keys}")

db.close()
