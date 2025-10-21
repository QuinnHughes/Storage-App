from db.session import SessionLocal
from db.models import Analytics
import re

db = SessionLocal()

# Directly test: count how many shelves would be in shelves_with_analytics
analytics = db.query(Analytics).filter(
    Analytics.alternative_call_number.isnot(None),
    Analytics.alternative_call_number.op('~')(r'^S-[^-]+-[^-]+-[^-]+-[^-]+-[0-9]+$'),
    Analytics.alternative_call_number.like('S-1-01B-%')
).all()

pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
shelves_with_analytics = set()

for rec in analytics:
    match = pattern.match(rec.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        shelf_key = f"{f}-{r}-{ladder}-{shelf}"
        shelves_with_analytics.add(shelf_key)

print(f"Shelves with analytics in range 1-01B: {len(shelves_with_analytics)}")
print(f"Is 1-01B-01-01 in set: {'1-01B-01-01' in shelves_with_analytics}")
print(f"Is 1-01B-1-1 in set: {'1-01B-1-1' in shelves_with_analytics}")

# Show first 10
print(f"\nFirst 10 shelf keys:")
for shelf_key in sorted(shelves_with_analytics)[:10]:
    print(f"  {shelf_key}")

db.close()
