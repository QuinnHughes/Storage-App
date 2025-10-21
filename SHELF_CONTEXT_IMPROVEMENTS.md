# Shelf Context Display Improvements

## Changes Made

### Backend Updates (backend/api/records.py)

#### 1. Physical Items Now Show Titles from Analytics
**Problem**: Items table doesn't have a `title` field, so physical items showed no title
**Solution**: For each physical item on shelf, look up the related analytics record by barcode and get the title

**Changes to Analytics GET endpoint (`/api/records/analytics/{id}`):**
```python
# Build physical items list with titles from analytics
physical_items_list = []
for item in shelf_physical_items:
    # Get title from related analytics
    title = None
    if item.barcode:
        related_analytics = db.query(models.Analytics).filter(
            models.Analytics.barcode == item.barcode
        ).first()
        if related_analytics:
            title = related_analytics.title
    
    physical_items_list.append({
        'id': item.id,
        'title': title,  # ← Now includes title!
        'barcode': item.barcode,
        'call_number': item.alternative_call_number,
        'position': item.position
    })
```

**Changes to Item GET endpoint (`/api/records/item/{id}`):**
Same logic applied to shelf_items in item endpoint

#### Result:
✅ Physical items now display titles linked to their barcodes
✅ If no matching analytics found, shows "-" for title
✅ Helps users identify items by title instead of just barcode

### Frontend Updates (frontend/src/components/RecordViewerModal.jsx)

#### 2. Analytics Table Now Shows Alternative Call Numbers
**Problem**: Analytics neighbors table only showed barcode, status, and title - missing location info
**Solution**: Added "Call Number" column to show alternative_call_number

**Changes to ShelfContextTab:**
```jsx
<thead className="bg-gray-50">
  <tr>
    <th>Call Number</th>  {/* ← NEW COLUMN */}
    <th>Barcode</th>
    <th>Status</th>
    <th>Title</th>
  </tr>
</thead>
<tbody>
  {analytics_neighbors.map((item, idx) => (
    <tr key={idx}>
      <td className="font-mono">{item.call_number || '-'}</td>  {/* ← NEW */}
      <td className="font-mono">{item.barcode}</td>
      <td>{item.status}</td>
      <td>{item.title || '-'}</td>
    </tr>
  ))}
</tbody>
```

#### Result:
✅ Analytics table now shows: Call Number, Barcode, Status, Title
✅ Users can see exact shelf position of each analytics record
✅ Easier to understand where items are located on the shelf

## Visual Comparison

### Before:
**Physical Items Table:**
```
Position | Barcode    | Title
001      | 123456789  | -        ← No title!
002      | 123456790  | -
```

**Analytics Table:**
```
Barcode    | Status    | Title
123456791  | Available | Government Doc Title
123456792  | Available | Another Doc
```

### After:
**Physical Items Table:**
```
Position | Barcode    | Title
001      | 123456789  | Government Doc Title  ← Title from analytics!
002      | 123456790  | Another Document
```

**Analytics Table:**
```
Call Number      | Barcode    | Status    | Title
S-3-01B-02-03-004 | 123456791 | Available | Government Doc Title
S-3-01B-02-03-005 | 123456792 | Available | Another Doc
```

## Benefits

### 1. Better Item Identification
- Users can now identify physical items by title
- No need to cross-reference barcodes manually
- More intuitive shelf browsing

### 2. Complete Location Information
- Analytics table shows full alternative call number
- Easy to see exact position (S-X-XXX-XX-XX-XXX)
- Helps with shelf management and consolidation

### 3. Improved User Experience
- More information at a glance
- Less confusion about what items are on shelf
- Better for inventory and shelf optimization tasks

## Testing

### Test Physical Items Title Display
1. Open any analytics or item record
2. Go to "Shelf Context" tab
3. Look at "Physical Items on This Shelf" table
4. **Verify**: Title column shows actual titles (not just "-")
5. **Verify**: Titles match the barcodes (cross-check with analytics if needed)

### Test Analytics Call Number Display
1. Open any analytics or item record
2. Go to "Shelf Context" tab
3. Look at "Analytics Records on This Shelf" table
4. **Verify**: "Call Number" column is first column
5. **Verify**: Shows alternative call numbers like S-3-01B-02-03-004
6. **Verify**: All four columns display: Call Number, Barcode, Status, Title

## Performance Notes

### Potential Concern
Each physical item on shelf requires an additional query to get the title from analytics

### Mitigation
- Limited to 20 items per shelf (existing limit)
- Queries are fast (indexed on barcode)
- Acceptable tradeoff for better UX

### Future Optimization (if needed)
Could use a JOIN or single query with subquery to fetch all titles at once:
```python
# Future optimization
items_with_titles = db.query(
    models.Item, models.Analytics.title
).outerjoin(
    models.Analytics, models.Item.barcode == models.Analytics.barcode
).filter(
    models.Item.alternative_call_number.like(f"{shelf_base}-%")
).limit(20).all()
```

## Files Changed

1. ✅ `backend/api/records.py`
   - Updated GET /analytics/{id} shelf_context
   - Updated GET /item/{id} shelf_context
   - Both now fetch titles for physical items

2. ✅ `frontend/src/components/RecordViewerModal.jsx`
   - Updated ShelfContextTab analytics table
   - Added "Call Number" column as first column
   - Reordered: Call Number → Barcode → Status → Title

---

**Status**: Complete and ready to test
**Impact**: Improves shelf context readability significantly
**Breaking Changes**: None (additive only)
