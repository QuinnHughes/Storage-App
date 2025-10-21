# Record Viewer - Testing Guide

## Quick Start

### 1. Start the Backend
```powershell
cd c:\Users\storage\Desktop\Storage-App\backend
uvicorn main:app --reload --port 8000
```

### 2. Start the Frontend
```powershell
cd c:\Users\storage\Desktop\Storage-App\frontend
npm run dev
```

### 3. Login
- Navigate to http://localhost:5173 (or whatever port Vite uses)
- Login with your credentials
- Note your role (viewer, book_worm, cataloger, or admin)

## Test Cases

### Test 1: View Analytics Record (All Roles)
**Purpose**: Verify analytics record viewer works

1. Navigate to "Analytics Search" page
2. Search for any analytics record (e.g., search by title)
3. Click "View Record" button on any result card
4. **Expected**: Modal opens showing record details
5. **Verify**:
   - Header shows "📊 Analytics Record"
   - Shows record ID and barcode
   - Three tabs visible: Details, Relationships, Shelf Context
   - Close button (X) works

### Test 2: Details Tab
**Purpose**: Verify record data displays correctly

1. With modal open, ensure "Details" tab is active
2. **Verify**:
   - Key Information section shows: Barcode, Call Number, Title
   - All Fields section shows remaining fields
   - Fields are formatted (underscores → spaces, capitalized)
   - No null/undefined values displayed (they should be filtered out)

### Test 3: Relationships Tab
**Purpose**: Verify related records display

1. Click "Relationships" tab
2. **Verify**:
   - If analytics has physical item: Green "📦 Physical Item" section shows
   - If analytics has error: Red "⚠️ Analytics Error" section shows
   - If no relationships: Shows "No Related Records" message
   - Related record details are accurate

### Test 4: Shelf Context Tab
**Purpose**: Verify shelf neighbors display

1. Click "Shelf Context" tab
2. **Verify**:
   - Shelf location shows: Floor, Range, Ladder, Shelf
   - Full call number displayed correctly
   - "Physical Items on This Shelf" table shows items (if any)
   - "Analytics Records on This Shelf" table shows neighbors (if any)
   - Tables are populated and formatted correctly

### Test 5: Viewer Role Permissions
**Purpose**: Verify viewers can't edit/delete

**Prerequisites**: Login as viewer role

1. Open any analytics record
2. **Verify**:
   - NO "Edit Record" button visible
   - NO "Delete" button visible
   - Only "Close" button in footer
3. Open any item record
4. **Verify**: Same - no edit/delete buttons

### Test 6: Book_worm Role Permissions
**Purpose**: Verify book_worm can edit analytics only

**Prerequisites**: Login as book_worm role

1. Open any analytics record
2. **Verify**:
   - "Edit Record" button IS visible (yellow)
   - NO "Delete" button visible
3. Open any item record
4. **Verify**:
   - NO "Edit Record" button visible
   - NO "Delete" button visible

### Test 7: Cataloger Role Permissions
**Purpose**: Verify cataloger has full access

**Prerequisites**: Login as cataloger or admin role

1. Open any analytics record
2. **Verify**:
   - "Edit Record" button IS visible (yellow)
   - "Delete" button IS visible (red)
3. Open any item record
4. **Verify**:
   - "Edit Record" button IS visible (yellow)
   - "Delete" button IS visible (red)

### Test 8: Delete Analytics Record
**Purpose**: Verify delete flow works

**Prerequisites**: Login as cataloger/admin

1. Open any analytics record
2. Click "Delete" button
3. **Verify**: Confirmation dialog appears
4. Click "Cancel" → **Verify**: Modal stays open, nothing deleted
5. Click "Delete" again, then "OK"
6. **Verify**:
   - Record deleted from backend
   - Modal closes
   - Record removed from search results (card disappears)

### Test 9: Delete Item Record
**Purpose**: Verify item delete and analytics update

**Prerequisites**: Login as cataloger/admin, find item with related analytics

1. Open an item record that has related_analytics
2. Note the barcode
3. Click "Delete" button, confirm
4. **Verify**:
   - Item deleted
   - Modal closes
   - Search for the analytics record with same barcode
   - Open analytics record
   - **Verify**: has_item_link should be false (not visible in UI yet, but updated in backend)

### Test 10: View Item Record
**Purpose**: Verify item record viewer works

1. Navigate to "Item Search" page
2. Search for any item (e.g., by barcode)
3. Click "View Record" button
4. **Verify**:
   - Header shows "📦 Physical Item"
   - Details tab shows item fields
   - Relationships tab shows related_analytics (if exists)
   - Shelf Context shows other items on same shelf

### Test 11: Modal Responsiveness
**Purpose**: Verify UI works on different screen sizes

1. Open record viewer
2. Resize browser window (narrow → wide)
3. **Verify**:
   - Modal stays centered
   - Content doesn't overflow
   - Tabs remain accessible
   - Tables scroll horizontally if needed

### Test 12: Multiple Records
**Purpose**: Verify modal state resets properly

1. Open record A
2. Click Close
3. Open record B (different record)
4. **Verify**:
   - Modal shows record B data (not record A)
   - No stale data from previous view
   - Tabs reset to "Details"

### Test 13: Error Handling
**Purpose**: Verify graceful error handling

1. Modify frontend to request invalid ID (e.g., id: 999999)
2. Open modal
3. **Verify**:
   - Shows error message (not crash)
   - Error message is user-friendly
   - Modal can be closed

### Test 14: Loading States
**Purpose**: Verify loading indicators work

1. Simulate slow network (Chrome DevTools → Network → Slow 3G)
2. Open record viewer
3. **Verify**:
   - Loading spinner appears
   - No "flash of no content"
   - Data appears after loading completes

### Test 15: CSV Export Still Works
**Purpose**: Verify existing functionality not broken

1. Search for analytics records
2. Click "Export CSV" button
3. **Verify**:
   - CSV downloads successfully
   - Contains all search results
   - Format is correct

## API Testing (Optional - Using Browser DevTools)

### Test API Endpoint Directly

Open browser console and run:

```javascript
// Test analytics endpoint
fetch('http://localhost:8000/api/records/analytics/1', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(console.log)

// Test item endpoint
fetch('http://localhost:8000/api/records/item/1', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(console.log)

// Test shelf endpoint
fetch('http://localhost:8000/api/records/shelf/S-3-01B-02-03', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(console.log)
```

Expected response structure:

**Analytics Response:**
```json
{
  "record": { "id": 1, "barcode": "...", ... },
  "related_item": { "barcode": "...", ... } | null,
  "related_error": { "error_type": "...", ... } | null,
  "shelf_context": {
    "shelf_call_number": "S-3-01B-02-03",
    "position": "001",
    "floor": "3",
    "range": "01B",
    "ladder": "2",
    "shelf": "3",
    "analytics_neighbors": [...],
    "physical_items": [...]
  }
}
```

**Item Response:**
```json
{
  "record": { "id": 1, "barcode": "...", ... },
  "related_analytics": { "barcode": "...", ... } | null,
  "shelf_context": { ... }
}
```

**Shelf Response:**
```json
{
  "shelf_call_number": "S-3-01B-02-03",
  "position_map": {
    "001": {
      "items": [...],
      "analytics": [...],
      "source": "item" | "analytics"
    }
  },
  "summary": {
    "total_positions": 15,
    "positions_with_items": 5,
    "positions_with_analytics": 12,
    "total_items": 8,
    "total_analytics": 45
  },
  "analytics_errors_on_shelf": [...]
}
```

## Regression Testing

### Verify Existing Features Still Work

1. **Analytics Search**
   - [x] Search by title works
   - [x] Search by barcode works
   - [x] Filters work (policy, location, status)
   - [x] CSV export works
   - [x] Results display as cards

2. **Item Search**
   - [x] Search by barcode works
   - [x] Search by call number works
   - [x] Filters work (floor, range, ladder, shelf)
   - [x] CSV export works
   - [x] Results display as cards

3. **Shelf Optimization**
   - [x] All three tabs work
   - [x] CSV export on all tabs works
   - [x] Physical space calculations correct

## Performance Testing

### Large Dataset Tests

1. **Many Analytics Neighbors**
   - Find shelf with 100+ analytics records
   - Open record viewer
   - **Verify**: Shelf Context tab loads quickly
   - **Verify**: Shows "Showing first 20 of XXX records" message

2. **Many Related Records**
   - Find record with complex relationships
   - **Verify**: Modal opens in < 1 second
   - **Verify**: No lag when switching tabs

## Known Limitations (Expected Behavior)

1. **Edit Functionality**: Clicking "Edit Record" button does nothing (Phase 2 not implemented)
2. **Related Record Navigation**: Can't click related records to view them (future enhancement)
3. **Shelf Context Limit**: Only shows first 20 neighbors (by design for performance)
4. **No History**: Can't go back to previously viewed records (future enhancement)

## Bug Reporting

If you find issues, document:
- User role at time of bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Browser console errors (F12 → Console tab)
- Network errors (F12 → Network tab)

## Success Criteria

✅ **Phase 1 Complete** if:
- All test cases pass
- No console errors
- No network errors (except expected 404/403 for permission tests)
- UI is responsive and intuitive
- Role-based permissions work correctly
- Data displays accurately
- Modal opens/closes smoothly

---

**Testing Time Estimate**: 30-45 minutes for full test suite
**Recommended**: Start with Tests 1-5, then role-specific tests based on your account
**Priority**: Tests 1, 2, 5, 6, 7 (core functionality and permissions)
