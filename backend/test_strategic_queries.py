from db.session import SessionLocal
from db.models import Analytics, Item
import re
from collections import defaultdict

db = SessionLocal()

# Check if the shelf key format matches
test_call_number = "S-1-01B-01-01-001"
pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
match = pattern.match(test_call_number)

if match:
    f, r, ladder, shelf, position = match.groups()
    shelf_key = f"{f}-{r}-{ladder}-{shelf}"
    print(f"Call number: {test_call_number}")
    print(f"Parsed: f={f}, r={r}, ladder={ladder}, shelf={shelf}, position={position}")
    print(f"Shelf key: {shelf_key}")
    
    # Check if analytics exist with this shelf pattern
    analytics = db.query(Analytics).filter(
        Analytics.alternative_call_number.like(f'S-{f}-{r}-{ladder}-{shelf}-%')
    ).all()
    print(f"\nAnalytics records found: {len(analytics)}")
    [print(f"  {a.alternative_call_number}") for a in analytics[:5]]
    
    # Now check what shelf_key would be generated
    print(f"\nShelf key from gap-filling would be: {f}-{r}-{ladder}-{shelf}")

db.close()
