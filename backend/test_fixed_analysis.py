from api.shelf_optimization import get_shelf_analysis
from db.session import SessionLocal

db = SessionLocal()

# Test with 'empty' filter
result = get_shelf_analysis(
    db=db,
    floor=None,
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=10,
    offset=0
)

print('Summary:')
print(f"  Total shelves (existing with data): {result['summary']['total_shelves']}")
print(f"  Empty (gap-filled only): {result['summary']['by_density']['empty']}")
print(f"  Very Low (0-25%): {result['summary']['by_density']['very_low']}")
print(f"  Low (26-50%): {result['summary']['by_density']['low']}")
print(f"  Filtered count returned: {result['summary']['filtered_count']}")

print(f"\nFirst 10 empty shelves returned:")
for shelf in result['shelves'][:10]:
    print(f"  {shelf['call_number']}: current_items={shelf['current_items']}, fill={shelf['fill_percentage']}%")

# Now test with 'very_low' filter
result2 = get_shelf_analysis(
    db=db,
    floor=None,
    range_code=None,
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='very_low',
    limit=5,
    offset=0
)

print(f"\n\nVery Low Shelves (should have data):")
for shelf in result2['shelves'][:5]:
    print(f"  {shelf['call_number']}: current_items={shelf['current_items']}, fill={shelf['fill_percentage']}%")

db.close()
