from api.shelf_optimization import get_shelf_analysis
from db.session import SessionLocal

db = SessionLocal()

# Test without any floor/range filters - get ALL empty shelves
result = get_shelf_analysis(
    db=db,
    floor=None,
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=250,
    offset=0
)

print(f"Total shelves with data: {result['summary']['total_shelves']}")
print(f"Empty shelves detected: {result['summary']['by_density']['empty']}")
print(f"Very Low shelves: {result['summary']['by_density']['very_low']}")
print(f"Filtered count (returned): {result['summary']['filtered_count']}")
print(f"Actually returned in response: {len(result['shelves'])}")

print(f"\nFirst 20 empty shelves:")
for i, shelf in enumerate(result['shelves'][:20], 1):
    print(f"  {i}. {shelf['call_number']} - items: {shelf['current_items']}, analytics_count: {shelf.get('analytics_count', 'N/A')}")

# Check if gap-filling even ran
print(f"\nChecking gap-filling execution...")
print(f"If this number is much larger than 'Empty shelves detected', gap-filling didn't run.")

db.close()
