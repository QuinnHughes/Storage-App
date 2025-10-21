from db.session import SessionLocal
from db.models import Analytics, Item

db = SessionLocal()

test_shelves = ['S-1-01B-01-01', 'S-1-01B-01-06', 'S-1-10B-10-07', 'S-1-17D-11-03']

for shelf in test_shelves:
    analytics = db.query(Analytics).filter(Analytics.alternative_call_number.like(f'{shelf}-%')).count()
    items = db.query(Item).filter(Item.alternative_call_number.like(f'{shelf}-%')).count()
    status = "SHOULD BE EMPTY" if analytics == 0 and items == 0 else "HAS DATA - SHOULD NOT SHOW"
    print(f'{shelf}: {analytics} analytics, {items} items - {status}')

db.close()
