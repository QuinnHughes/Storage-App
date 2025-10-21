from db.session import SessionLocal
from db.models import Analytics, Item
import re
from collections import defaultdict

db = SessionLocal()

# Simple approach: Get all analytics and group by shelf
analytics = db.query(Analytics).filter(
    Analytics.alternative_call_number.isnot(None),
    Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$')
).all()

# Parse each analytics record and extract shelf
pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
shelves_with_analytics = set()

for rec in analytics:
    match = pattern.match(rec.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        # Build shelf identifier (without position)
        shelf_id = f"S-{f}-{r}-{ladder}-{shelf}"
        shelves_with_analytics.add(shelf_id)

print(f"Total shelves with analytics records: {len(shelves_with_analytics)}")

# Now check if S-1-01B-01-01 has analytics
test_shelf = "S-1-01B-01-01"
print(f"\n{test_shelf} has analytics: {test_shelf in shelves_with_analytics}")

# Get actual analytics for this shelf
analytics_on_shelf = db.query(Analytics).filter(
    Analytics.alternative_call_number.like(f'{test_shelf}-%')
).all()
print(f"Analytics records on {test_shelf}: {len(analytics_on_shelf)}")

# Get items on this shelf
items_on_shelf = db.query(Item).filter(
    Item.alternative_call_number.like(f'{test_shelf}-%')
).all()
print(f"Items on {test_shelf}: {len(items_on_shelf)}")

db.close()
