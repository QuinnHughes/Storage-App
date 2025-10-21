# Record Viewer Bug Fixes

## 🔥 CRITICAL: Restart Required

**After applying these fixes, you MUST restart the Vite dev server:**

1. Go to the terminal running `npm run dev`
2. Press `Ctrl+C` to stop it
3. Run `npm run dev` again

**Why?** We added a new proxy route (`/records`) to `vite.config.js`, which only loads when Vite starts.

---

## Issues Found & Fixed

### 1. API Client Method Mismatch ✅
**Problem**: RecordViewerModal was calling `apiClient.get()` but the client doesn't have a `.get()` method
**Solution**: Updated to use `apiClient(url)` directly with proper response handling

**Files Fixed:**
- `frontend/src/components/RecordViewerModal.jsx`
  - `fetchRecord()`: Changed from `apiClient.get()` to `apiClient()`
  - `handleDelete()`: Changed from `apiClient.delete()` to `apiClient(url, { method: 'DELETE' })`

### 2. Double /api/ in URL ✅ **CRITICAL**
**Problem**: URL was `http://localhost:5173/api/api/records/analytics/305013` (double `/api`)
**Root Cause**: 
- Vite proxy routes like `/analytics`, `/catalog` etc. proxy to `http://localhost:8000/api`
- RecordViewerModal was calling `/api/records/...` which became `/api/api/records/...`

**Solution**: 
1. Added `/records` proxy route to `vite.config.js`
2. Changed RecordViewerModal to use `/records/...` (without `/api` prefix)

**Files Fixed:**
- `frontend/vite.config.js` - Added `/records` proxy configuration
- `frontend/src/components/RecordViewerModal.jsx` - Changed `/api/records` to `/records`

**⚠️ REQUIRES**: Restart Vite dev server (Ctrl+C then `npm run dev`)

### 3. Analytics Model Field Mismatch ✅
**Problem**: Backend was trying to return fields that don't exist in Analytics model (`author`, `publisher`, `publication_date`)
**Actual Analytics Fields:**
- id, barcode, alternative_call_number, title, location_code, item_policy, call_number, description, status, has_item_link

**Solution**: Updated analytics GET endpoint to return only existing fields

**Files Fixed:**
- `backend/api/records.py` - GET /analytics/{id} response

### 3. Item Model Field Mismatch ✅
**Problem**: Backend was trying to return fields that don't exist in Item model (`title`, `author`, `sudoc_number`, `accession_date`)
**Actual Item Fields:**
- id, barcode, alternative_call_number, location, floor, range_code, ladder, shelf, position

**Solution**: Updated item GET endpoint to return only existing fields

**Files Fixed:**
- `backend/api/records.py` - GET /item/{id} response

### 4. Update Endpoint Field Mismatch ✅
**Problem**: Update endpoints allowed updating non-existent fields
**Solution**: Updated allowed_fields lists to match actual models

**Files Fixed:**
- `backend/api/records.py` - PUT /analytics/{id}
  - Analytics allowed fields: `barcode, title, alternative_call_number, location_code, item_policy, call_number, description, status, has_item_link`
- `backend/api/records.py` - PUT /item/{id}
  - Item allowed fields: `barcode, alternative_call_number, location, floor, range_code, ladder, shelf, position`

### 5. AnalyticsError Field Name ✅
**Problem**: Frontend was looking for `error_type` and `error_description` but model has `error_reason`
**Actual AnalyticsError Fields:**
- id, barcode, alternative_call_number, title, call_number, status, error_reason

**Solution**: Updated frontend and backend to use correct field names

**Files Fixed:**
- `backend/api/records.py` - Analytics GET endpoint related_error response
- `frontend/src/components/RecordViewerModal.jsx` - RelationshipsTab display

### 6. Shelf Context Key Names ✅
**Problem**: Item endpoint returned `item_neighbors` and `analytics_on_shelf` but frontend expected `physical_items` and `analytics_neighbors`
**Solution**: Updated backend to use consistent naming across both endpoints

**Files Fixed:**
- `backend/api/records.py` - GET /item/{id} shelf_context

## Testing Steps

### Quick Test (5 minutes)
1. Start backend: `cd backend; uvicorn main:app --reload --port 8000`
2. Start frontend: `cd frontend; npm run dev`
3. Login to app
4. Navigate to Analytics Search
5. Search for any record
6. Click "View Record" button
7. **Expected**: Modal opens and shows data in all three tabs

### Detailed Test (15 minutes)
1. **Details Tab**:
   - Should show: barcode, title, alternative_call_number, location_code, item_policy, call_number, description, status, has_item_link
   - No errors in console
   - All fields properly formatted

2. **Relationships Tab**:
   - If has related item: Shows barcode, alternative_call_number, position
   - If has related error: Shows error_reason, title, call_number
   - No undefined/null errors

3. **Shelf Context Tab**:
   - Shows shelf location (floor, range, ladder, shelf)
   - Shows physical_items table (if any)
   - Shows analytics_neighbors table (if any)
   - No errors about missing fields

4. **Item Search**:
   - Navigate to Item Search
   - Search for any item
   - Click "View Record"
   - **Expected**: Modal shows item fields (barcode, alternative_call_number, location, floor, range_code, ladder, shelf, position)
   - Related analytics shown if exists

## What Should Work Now

✅ Modal opens when clicking "View Record"
✅ Data loads from backend
✅ All three tabs display correctly
✅ No console errors about undefined fields
✅ Analytics records show correct fields
✅ Item records show correct fields
✅ Related records display properly
✅ Shelf context shows neighbors

## What Still Needs Phase 2 (Editing)

❌ "Edit Record" button (shows but doesn't do anything yet)
❌ RecordEditModal component (not created)
❌ Save changes functionality
❌ Form validation

## Common Issues & Solutions

### Issue: Modal opens but shows loading forever
**Check**: Backend server running on port 8000?
**Fix**: `cd backend; uvicorn main:app --reload --port 8000`

### Issue: "Failed to load record" error
**Check**: Browser console for detailed error
**Likely cause**: Record ID doesn't exist, or permission denied
**Fix**: Try a different record, check user role

### Issue: Some fields show "undefined"
**Check**: Which fields?
**If Analytics**: Should only show: barcode, title, alternative_call_number, location_code, item_policy, call_number, description, status
**If Item**: Should only show: barcode, alternative_call_number, location, floor, range_code, ladder, shelf, position

### Issue: Shelf Context tab empty
**Check**: Does the record have an alternative_call_number in format S-X-XXX-XX-XX-XXX?
**Likely cause**: Call number doesn't match pattern, or no other records on shelf
**Expected**: If call number is valid, should show shelf breakdown and tables

## Files Changed in This Fix

### Backend
1. `backend/api/records.py` (MODIFIED)
   - Fixed GET /analytics/{id} response fields
   - Fixed GET /item/{id} response fields
   - Fixed PUT /analytics/{id} allowed fields
   - Fixed PUT /item/{id} allowed fields
   - Fixed shelf_context key names
   - Fixed related_error fields

### Frontend
2. `frontend/src/components/RecordViewerModal.jsx` (MODIFIED)
   - Fixed fetchRecord() API call
   - Fixed handleDelete() API call
   - Fixed RelationshipsTab error field names

## Next Steps After Testing

1. **If working**: Move to Phase 2 (RecordEditModal)
2. **If issues**: Check browser console, report specific errors
3. **User feedback**: Does the UI make sense? Any confusion?
4. **Performance**: Does it load quickly? Any lag?

---

**Status**: Bug fixes complete, ready for testing
**Estimated time to verify**: 5-15 minutes
**Priority**: Test Analytics Search → View Record first (most common use case)
