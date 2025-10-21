from api.shelf_optimization import get_shelf_analysis
from db.session import SessionLocal

db = SessionLocal()

# Test WITHOUT floor filter (all floors)
print("=== NO FLOOR FILTER (ALL DATA) ===")
result_all = get_shelf_analysis(
    db=db,
    floor=None,  # NO FILTER
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=250,
    offset=0
)
print(f"Empty shelves: {result_all['summary']['by_density']['empty']}")

# Test WITH floor=1 filter
print("\n=== WITH FLOOR=1 FILTER ===")
result_floor1 = get_shelf_analysis(
    db=db,
    floor='1',
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=250,
    offset=0
)
print(f"Empty shelves: {result_floor1['summary']['by_density']['empty']}")

db.close()
