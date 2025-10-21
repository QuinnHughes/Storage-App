from api.shelf_optimization import get_shelf_analysis
from db.session import SessionLocal

db = SessionLocal()

# Test range 1-10B specifically  
result = get_shelf_analysis(
    db=db,
    floor='1',
    range_code='10B',
    sort_by='fill_percentage',
    sort_order='asc',
    density_filter='empty',
    limit=50,
    offset=0
)

print(f'Empty shelves in range 1-10B: {result["summary"]["filtered_count"]}')
print('\nFirst 20 empty shelves:')
for s in result['shelves'][:20]:
    print(f'  {s["call_number"]}')

# Check ladder 10 specifically (neighbors have max shelf 6, so shouldn't create 7-29)
ladder_10_empty = [s for s in result['shelves'] if 'S-1-10B-10-' in s['call_number']]
print(f'\nEmpty shelves on ladder 10: {len(ladder_10_empty)}')
if ladder_10_empty:
    for s in ladder_10_empty:
        print(f'  {s["call_number"]}')

db.close()
