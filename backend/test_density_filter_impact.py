from api.shelf_optimization import get_shelf_analysis
from db.session import SessionLocal

db = SessionLocal()

# Test WITH density_filter='empty' (gap-filling runs)
print("=== WITH density_filter='empty' ===")
result_with_empty = get_shelf_analysis(
    db=db,
    floor='1',
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=250,
    offset=0
)
print(f"Empty shelves: {result_with_empty['summary']['by_density']['empty']}")

# Test WITH density_filter='very_low' (no gap-filling)
print("\n=== WITH density_filter='very_low' ===")
result_with_verylow = get_shelf_analysis(
    db=db,
    floor='1',
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='very_low',
    limit=250,
    offset=0
)
print(f"Empty shelves: {result_with_verylow['summary']['by_density']['empty']}")
print(f"Very low shelves: {result_with_verylow['summary']['by_density']['very_low']}")

db.close()
