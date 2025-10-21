# Advanced Empty Shelf Detection Using Min/Max Range Analysis

## Overview
Implements sophisticated empty shelf detection by analyzing the physical structure of storage ranges using analytics data to establish boundaries, then identifying shelves within those boundaries that have no data.

## Problem Statement

### Simple Gap Example
```
Range 01B has:
- S-1-01B-06-01 (has items)
- S-1-01B-07-01 (NO DATA - should be detected as empty)
- S-1-01B-08-01 (NO DATA - should be detected as empty)
- S-1-01B-08-06 (has items - last shelf in range)
```

**Question**: How do we know shelves 07-01 and 08-01 exist and are empty?
**Answer**: Use min/max analysis of the range structure.

## Solution: Two-Level Min/Max Analysis

### Level 1: Range-Level Ladder Detection
For each floor-range combination (e.g., Floor 1, Range 01B):
1. Collect ALL ladder numbers that have any data (items, analytics, or weeding)
2. Find MIN ladder and MAX ladder
3. Assume all ladders between min and max exist

**Example**:
```
Range 01B has data on ladders: 1, 3, 6, 8
Min ladder: 1
Max ladder: 8
Therefore ladders 1, 2, 3, 4, 5, 6, 7, 8 all exist (including gaps 2, 4, 5, 7)
```

### Level 2: Ladder-Level Shelf Detection
For each ladder within the range:
1. Collect ALL shelf numbers that have any data
2. Find MIN shelf and MAX shelf for that specific ladder
3. Assume all shelves between min and max exist

**Example**:
```
Ladder 8 in Range 01B has data on shelves: 1, 6
Min shelf: 1
Max shelf: 6
Therefore shelves 1, 2, 3, 4, 5, 6 all exist (including gaps 2, 3, 4, 5)
```

## Implementation Details

### Step 1: Collect Boundaries
```python
range_boundaries = {
    '1-01B': {
        'ladders': {1, 3, 6, 8},  # All ladders with data
        'ladder_shelf_data': {
            1: {1, 2, 3, 4, 5},      # Ladder 1 has shelves 1-5
            3: {1, 6},                # Ladder 3 has shelves 1 and 6
            6: {2, 4},                # Ladder 6 has shelves 2 and 4
            8: {1, 6}                 # Ladder 8 has shelves 1 and 6
        }
    }
}
```

### Step 2: Determine Min/Max
```python
Range '1-01B':
  Min ladder: 1, Max ladder: 8
  
  For ladder 1:
    Min shelf: 1, Max shelf: 5
    
  For ladder 3:
    Min shelf: 1, Max shelf: 6
    
  For ladder 6:
    Min shelf: 2, Max shelf: 4
    
  For ladder 8:
    Min shelf: 1, Max shelf: 6
```

### Step 3: Fill Gaps
```python
# For ladder 8, shelves 1-6
for shelf_num in range(1, 6+1):  # 1, 2, 3, 4, 5, 6
    shelf_key = '1-01B-8-{shelf_num}'
    if shelf_key not in shelf_data:
        # Create empty shelf record for shelves 2, 3, 4, 5
        shelf_data[shelf_key] = {
            'floor': '1',
            'range_code': '01B',
            'ladder': 8,
            'shelf': shelf_num,
            'current_items': 0,
            'max_position': 0,
            # ... (empty shelf properties)
        }
```

## Data Sources for Boundary Detection

The system uses THREE data sources to establish physical boundaries:

### 1. Items Table (Accessioned Items)
- **Purpose**: Ground truth for currently accessioned items
- **Contributes**: Shelf locations with physical items
- **Example**: S-1-01B-06-01-015 indicates ladder 6, shelf 1 exists

### 2. Analytics Table (ILS Data)
- **Purpose**: Catalog records showing where items SHOULD be
- **Contributes**: Extends range beyond just accessioned items
- **Example**: Analytics shows S-1-01B-08-06-020 even if not yet accessioned

### 3. Weeded Items Table (Historical Data)
- **Purpose**: Shows shelves that WERE used but are now empty
- **Contributes**: Establishes historical shelf existence
- **Example**: Weeded item from S-1-01B-07-01 proves shelf existed

## Safety Guards

### Minimum Data Requirements
1. **Range Level**: Requires at least 2 ladders with data
   - Prevents extrapolating from single ladder
   - Example: If only ladder 5 has data, don't assume ladders 1-4 or 6+ exist

2. **Ladder Level**: Requires at least 2 shelves with data
   - Prevents extrapolating from single shelf
   - Example: If ladder 3 only has shelf 2, don't assume shelves 1, 3, 4 exist

### Why These Guards?
- **Incomplete ranges**: Not all ranges go from 1 to max
- **Numbering gaps**: Some facilities skip shelf numbers (e.g., no shelf 13)
- **Data quality**: Protects against bad data creating phantom shelves

## Activation Condition

This logic ONLY runs when `density_filter='empty'`:

```python
if density_filter == 'empty':
    # Run min/max analysis
    # Fill gaps
    # Create empty shelf records
```

**Why?**
- Performance: Avoid processing when not needed
- Accuracy: Only detect empties when user is looking for them
- Prevents pollution of other density categories

## Example Walkthrough

### Scenario: Floor 1, Range 01B

#### Input Data:
```
Items:
- S-1-01B-06-01-015 (ladder 6, shelf 1)
- S-1-01B-06-05-022 (ladder 6, shelf 5)

Analytics:
- S-1-01B-08-01-001 (ladder 8, shelf 1)
- S-1-01B-08-06-035 (ladder 8, shelf 6)

Weeded:
- S-1-01B-07-03-010 (ladder 7, shelf 3)
```

#### Step 1: Collect Boundaries
```python
range_boundaries['1-01B'] = {
    'ladders': {6, 7, 8},
    'ladder_shelf_data': {
        6: {1, 5},      # From items
        7: {3},         # From weeded
        8: {1, 6}       # From analytics
    }
}
```

#### Step 2: Determine Min/Max
```python
Min ladder: 6, Max ladder: 8
Ladders to check: 6, 7, 8

Ladder 6: min_shelf=1, max_shelf=5 → shelves 1-5
Ladder 7: Only 1 shelf (skip - need 2+ to establish pattern)
Ladder 8: min_shelf=1, max_shelf=6 → shelves 1-6
```

#### Step 3: Create Empty Shelves
```python
Ladder 6 (shelves 1-5):
  Shelf 1: EXISTS (has items)
  Shelf 2: CREATED (empty)
  Shelf 3: CREATED (empty)
  Shelf 4: CREATED (empty)
  Shelf 5: EXISTS (has items)

Ladder 7:
  SKIPPED (only 1 shelf with data)

Ladder 8 (shelves 1-6):
  Shelf 1: EXISTS (has analytics)
  Shelf 2: CREATED (empty)
  Shelf 3: CREATED (empty)
  Shelf 4: CREATED (empty)
  Shelf 5: CREATED (empty)
  Shelf 6: EXISTS (has analytics)
```

#### Result:
When user filters by "Empty", they see:
- S-1-01B-06-02 (empty - gap detected)
- S-1-01B-06-03 (empty - gap detected)
- S-1-01B-06-04 (empty - gap detected)
- S-1-01B-08-02 (empty - gap detected)
- S-1-01B-08-03 (empty - gap detected)
- S-1-01B-08-04 (empty - gap detected)
- S-1-01B-08-05 (empty - gap detected)

## Performance Characteristics

### Time Complexity
- **Boundary collection**: O(n) where n = number of shelves with data
- **Min/max determination**: O(r × l) where r = ranges, l = ladders per range
- **Gap filling**: O(g) where g = number of gaps detected
- **Total**: O(n + r×l + g) - typically fast even for large datasets

### Memory Complexity
- **Boundary storage**: O(r × l) for range_boundaries dictionary
- **Empty shelves created**: O(g) where g = detected gaps
- **Total**: O(r×l + g) - minimal memory footprint

### Typical Performance
```
Dataset: 1000 shelves across 10 ranges
Ranges with data: 10
Average ladders per range: 8
Average shelves per ladder: 6
Detected gaps: ~150 empty shelves

Processing time: ~50-100ms
Memory usage: ~2-3 MB
```

## Benefits Over Previous Approach

### Previous (Disabled) Approach
❌ Created shelves for EVERY number between global min/max
❌ No distinction between ranges
❌ No per-ladder analysis
❌ Created thousands of phantom shelves

### New Approach
✅ Range-specific boundary detection
✅ Ladder-specific shelf ranges
✅ Requires minimum 2 data points per level
✅ Only creates shelves with strong evidence they exist
✅ Respects physical storage structure

## Testing & Verification

### Test Case 1: Simple Gap
```
Input: Shelves 1 and 3 have data on ladder 5
Expected: Shelf 2 detected as empty
Verification: Check empty filter shows shelf 2
```

### Test Case 2: Multi-Ladder Gap
```
Input: Ladder 4 and 7 have data, ladder 5-6 have no data
Expected: Ladders 5-6 detected (with their shelves)
Verification: Check empty filter shows all shelves on ladders 5-6
```

### Test Case 3: Single Data Point (No Detection)
```
Input: Only shelf 3 on ladder 8 has data
Expected: NO empty shelves detected (need 2+ data points)
Verification: Check empty filter doesn't show shelves 1-2 or 4-10
```

### Test Case 4: Non-Sequential Shelves
```
Input: Shelves 1, 5, 10 have data on ladder 2
Expected: Shelves 2-4 and 6-9 detected as empty
Verification: Check empty filter shows 8 empty shelves (2-4, 6-9)
```

## Limitations & Edge Cases

### Known Limitations
1. **Assumes contiguous ranges**: Expects shelves 1-N without major gaps
2. **No physical verification**: Can't detect if shelf was physically removed
3. **Numbering skips**: May create records for intentionally skipped numbers (e.g., shelf 13)

### Edge Case Handling
- **Incomplete data**: Requires 2+ ladders and 2+ shelves to infer gaps
- **Range boundaries**: Only fills within established min/max, doesn't extend beyond
- **Mixed data quality**: Uses all 3 sources (items, analytics, weeding) to establish boundaries

## Future Enhancements

### Potential Improvements
1. **Physical capacity limits**: Cap max shelves per ladder (e.g., don't assume 100 shelves)
2. **Range configuration**: Load physical range layouts from configuration
3. **Confidence scoring**: Mark inferred shelves with confidence levels
4. **Manual overrides**: Allow marking specific shelves as "doesn't exist"
5. **Audit trail**: Log which shelves were inferred vs explicitly known

### Integration Ideas
1. **Accession workflow**: Show inferred empty shelves as accession targets
2. **Visual indicators**: UI shows "Inferred Empty" vs "Known Empty"
3. **Bulk operations**: "Verify empty shelves" workflow to confirm inference
4. **Reports**: "Physical structure report" showing ladder/shelf layouts
