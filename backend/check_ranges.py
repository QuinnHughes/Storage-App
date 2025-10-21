from db.session import SessionLocal
from db.models import Analytics
import re
from collections import defaultdict

db = SessionLocal()

# Get all analytics for floor 1
analytics = db.query(Analytics).filter(
    Analytics.alternative_call_number.like('S-1-%')
).all()

pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
ranges = set()

for rec in analytics:
    match = pattern.match(rec.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        ranges.add(r)

print(f"Total ranges in floor 1: {len(ranges)}")
print("Sorted list of ranges:")
for r in sorted(ranges):
    print(f"  {r}")

# Check specifically what's around 01B-01B range
nearby = [r for r in sorted(ranges) if r.startswith('01') or r.startswith('02')]
print(f"\nRanges around 01B area: {nearby}")

db.close()
