from db.session import SessionLocal
from db.models import Analytics, Item
import re
from collections import defaultdict

db = SessionLocal()

# Check range 1-10B 
test_range = "1-10B"

analytics = db.query(Analytics).filter(
    Analytics.alternative_call_number.like('S-1-10B-%')
).all()

items = db.query(Item).filter(
    Item.alternative_call_number.like('S-1-10B-%')
).all()

print(f"Range {test_range}: {len(analytics)} analytics, {len(items)} items")

pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
ladders_with_data = defaultdict(set)

for rec in analytics + items:
    match = pattern.match(rec.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        ladders_with_data[int(ladder)].add(int(shelf))

print(f"\nLadders with data:")
for ladder in sorted(ladders_with_data.keys()):
    shelves = sorted(ladders_with_data[ladder])
    print(f"  Ladder {ladder}: shelves {shelves}")

if ladders_with_data:
    min_ladder = min(ladders_with_data.keys())
    max_ladder = max(ladders_with_data.keys())
    print(f"\nLadder range: {min_ladder} to {max_ladder}")
    
    missing = [l for l in range(min_ladder, max_ladder + 1) if l not in ladders_with_data]
    if missing:
        print(f"Empty ladders that should be created: {missing}")

db.close()
