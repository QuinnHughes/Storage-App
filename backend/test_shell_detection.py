from db.session import SessionLocal
from db.models import Analytics, Item, WeededItem
import re
from collections import defaultdict

db = SessionLocal()

# Manually run the gap-filling logic to debug
analytics = db.query(Analytics).filter(
    Analytics.alternative_call_number.like('S-1-%')
).all()

pattern = re.compile(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$')
shelves_with_analytics = set()
range_boundaries = defaultdict(lambda: {'ladders': set(), 'ladder_shelf_data': defaultdict(set)})

for rec in analytics:
    match = pattern.match(rec.alternative_call_number)
    if match:
        f, r, ladder, shelf, position = match.groups()
        shelf_key = f"{f}-{r}-{str(ladder).zfill(2)}-{str(shelf).zfill(2)}"
        shelves_with_analytics.add(shelf_key)
        
        range_key = f"{f}-{r}"
        range_boundaries[range_key]['ladders'].add(int(ladder))
        range_boundaries[range_key]['ladder_shelf_data'][int(ladder)].add(int(shelf))

print(f"Total ranges: {len(range_boundaries)}")
print(f"Total shelves with analytics: {len(shelves_with_analytics)}")

# Count how many empty shelves would be created
created_count = 0
for range_key, boundaries in range_boundaries.items():
    if len(boundaries['ladders']) < 2:
        continue
    
    min_ladder = min(boundaries['ladders'])
    max_ladder = max(boundaries['ladders'])
    
    for ladder_num in range(min_ladder, max_ladder + 1):
        shelves_in_ladder = boundaries['ladder_shelf_data'].get(ladder_num, set())
        
        # Get adjacent ladders
        adjacent_max = []
        for left in range(ladder_num - 1, min_ladder - 1, -1):
            if left in boundaries['ladder_shelf_data'] and len(boundaries['ladder_shelf_data'][left]) >= 2:
                adjacent_max.append(max(boundaries['ladder_shelf_data'][left]))
                break
        for right in range(ladder_num + 1, max_ladder + 1):
            if right in boundaries['ladder_shelf_data'] and len(boundaries['ladder_shelf_data'][right]) >= 2:
                adjacent_max.append(max(boundaries['ladder_shelf_data'][right]))
                break
        
        if not adjacent_max:
            all_max = [max(s) for s in boundaries['ladder_shelf_data'].values() if len(s) >= 2]
            expected_max = int(sum(all_max) / len(all_max)) if all_max else 0
        else:
            expected_max = int(sum(adjacent_max) / len(adjacent_max))
        
        if len(shelves_in_ladder) == 0:
            # Empty ladder
            for shelf_num in range(1, expected_max + 1):
                floor_part, range_part = range_key.split('-', 1)
                shelf_key = f"{floor_part}-{range_part}-{str(ladder_num).zfill(2)}-{str(shelf_num).zfill(2)}"
                if shelf_key not in shelves_with_analytics:
                    created_count += 1
        else:
            # Gaps in ladder
            min_shelf = min(shelves_in_ladder)
            max_shelf_in_ladder = max(shelves_in_ladder)
            effective_max = min(max_shelf_in_ladder, expected_max)
            
            for shelf_num in range(min_shelf, effective_max + 1):
                floor_part, range_part = range_key.split('-', 1)
                shelf_key = f"{floor_part}-{range_part}-{str(ladder_num).zfill(2)}-{str(shelf_num).zfill(2)}"
                if shelf_key not in shelves_with_analytics:
                    created_count += 1

print(f"\nEmpty shelves that would be created: {created_count}")
print(f"Total empty (existing + created): {created_count}")

db.close()
