# Record Management System - Component Architecture

## Component Hierarchy

```
App.jsx
├── AnalyticsSearch.jsx
│   ├── Search Form
│   ├── Results Grid (Cards)
│   │   └── "View Record" Button → handleViewRecord(id)
│   └── RecordViewerModal
│       ├── Props: recordType="analytics", recordId, userRole
│       └── Tabs: Details | Relationships | Shelf Context
│
├── ItemSearch.jsx
│   ├── Search Form
│   ├── Results Grid (Cards)
│   │   └── "View Record" Button → handleViewRecord(id)
│   └── RecordViewerModal
│       ├── Props: recordType="item", recordId, userRole
│       └── Tabs: Details | Relationships | Shelf Context
│
└── [FUTURE] ShelfOptimization.jsx
    ├── Shelf Analysis Table
    │   └── "View Records" Button → handleViewShelf(call_number)
    └── ShelfRecordsViewer (NOT YET BUILT)
        └── Position Map View
```

## Data Flow

### View Analytics Record Flow
```
User clicks "View Record" on Analytics card
    ↓
handleViewRecord(analytics.id) called
    ↓
setSelectedRecordId(id)
setViewerOpen(true)
    ↓
RecordViewerModal renders with recordType="analytics"
    ↓
useEffect triggers fetchRecord()
    ↓
GET /api/records/analytics/{id}
    ↓
Returns:
    {
        record: { /* analytics fields */ },
        related_item: { /* physical item if accessioned */ },
        related_error: { /* error if flagged */ },
        shelf_context: {
            shelf_call_number: "S-3-01B-02-03",
            analytics_neighbors: [...],
            physical_items: [...]
        }
    }
    ↓
Modal displays three tabs:
    - Details: All record fields
    - Relationships: related_item, related_error
    - Shelf Context: analytics_neighbors, physical_items
```

### View Item Record Flow
```
User clicks "View Record" on Item card
    ↓
handleViewRecord(item.id) called
    ↓
setSelectedRecordId(id)
setViewerOpen(true)
    ↓
RecordViewerModal renders with recordType="item"
    ↓
useEffect triggers fetchRecord()
    ↓
GET /api/records/item/{id}
    ↓
Returns:
    {
        record: { /* item fields */ },
        related_analytics: { /* analytics record */ },
        shelf_context: {
            shelf_call_number: "S-3-01B-02-03-001",
            analytics_neighbors: [...],
            physical_items: [...]
        }
    }
    ↓
Modal displays three tabs:
    - Details: All record fields
    - Relationships: related_analytics
    - Shelf Context: analytics_neighbors, physical_items
```

### Delete Flow
```
User clicks "Delete" button in RecordViewerModal
    ↓
handleDelete() called
    ↓
Confirmation dialog: "Are you sure?"
    ↓ (user confirms)
DELETE /api/records/{recordType}/{id}
    ↓
Backend cascades:
    - Analytics delete: Remove related analytics_errors
    - Item delete: Set has_item_link=false on related analytics
    ↓
Success response
    ↓
onDelete(recordId) callback
    ↓
Parent component removes record from results
    ↓
Modal closes
```

## API Endpoints

### Analytics Endpoints
```
GET    /api/records/analytics/{id}
└─ Returns: record + related_item + related_error + shelf_context
└─ Permission: viewer+

PUT    /api/records/analytics/{id}
└─ Body: Updated fields
└─ Returns: record + changes dict
└─ Permission: book_worm+

DELETE /api/records/analytics/{id}
└─ Cascades: Deletes related analytics_errors
└─ Returns: Success message
└─ Permission: cataloger+
```

### Item Endpoints
```
GET    /api/records/item/{id}
└─ Returns: record + related_analytics + shelf_context
└─ Permission: viewer+

PUT    /api/records/item/{id}
└─ Body: Updated fields
└─ Returns: record + changes dict
└─ Updates: has_item_link on related analytics
└─ Permission: cataloger+

DELETE /api/records/item/{id}
└─ Updates: has_item_link=false on related analytics
└─ Returns: Success message
└─ Permission: cataloger+
```

### Shelf Context Endpoint
```
GET    /api/records/shelf/{call_number}
└─ Returns: position_map + summary + analytics_errors_on_shelf
└─ Permission: viewer+

position_map structure:
{
    "001": {
        "items": [Item, Item, ...],      # Physical items at position 001
        "analytics": [Analytics, ...],    # Analytics records at position 001
        "source": "item" | "analytics"    # Which takes precedence
    },
    "002": { ... }
}
```

## Permission Matrix

| Action | Endpoint | Viewer | Book_worm | Cataloger | Admin |
|--------|----------|--------|-----------|-----------|-------|
| View Analytics | GET /analytics/{id} | ✅ | ✅ | ✅ | ✅ |
| Edit Analytics | PUT /analytics/{id} | ❌ | ✅ | ✅ | ✅ |
| Delete Analytics | DELETE /analytics/{id} | ❌ | ❌ | ✅ | ✅ |
| View Item | GET /item/{id} | ✅ | ✅ | ✅ | ✅ |
| Edit Item | PUT /item/{id} | ❌ | ❌ | ✅ | ✅ |
| Delete Item | DELETE /item/{id} | ❌ | ❌ | ✅ | ✅ |
| View Shelf | GET /shelf/{call_number} | ✅ | ✅ | ✅ | ✅ |

## State Management

### RecordViewerModal State
```javascript
const [activeTab, setActiveTab] = useState('details');    // 'details' | 'relationships' | 'shelf'
const [recordData, setRecordData] = useState(null);       // Full record object from API
const [loading, setLoading] = useState(false);            // Loading state
const [error, setError] = useState(null);                 // Error message
```

### Parent Page State (AnalyticsSearch/ItemSearch)
```javascript
const [results, setResults] = useState([]);               // Search results
const [viewerOpen, setViewerOpen] = useState(false);      // Modal visibility
const [selectedRecordId, setSelectedRecordId] = useState(null);  // Record to view
const [userRole, setUserRole] = useState('viewer');       // From localStorage
```

## UI Components

### RecordViewerModal
```
┌─────────────────────────────────────────────────────────┐
│ 📊 Analytics Record                              [X]    │
│ ID: 12345 • Barcode: 123456789                         │
├─────────────────────────────────────────────────────────┤
│ [Edit Record] [Delete]                                  │ ← Only if permitted
├─────────────────────────────────────────────────────────┤
│ [📋 Details] [🔗 Relationships] [🗄️ Shelf Context]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  (Tab content here - Details/Relationships/Shelf)       │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                            [Close]      │
└─────────────────────────────────────────────────────────┘
```

### Details Tab Layout
```
┌─────────────────────────────────────────────┐
│ Key Information                             │
│ ┌──────────────┬──────────────┐            │
│ │ Barcode      │ Call Number  │            │
│ │ 123456789    │ S-3-01B-02-03│            │
│ └──────────────┴──────────────┘            │
│ │ Title                        │            │
│ │ Government Document Title... │            │
│ └──────────────────────────────┘            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ All Fields                                  │
│ ┌─────────────────────────────────────────┐ │
│ │ Status       │ Available                │ │
│ │ Item Policy  │ Government Documents     │ │
│ │ Location     │ 01B                      │ │
│ │ ...          │ ...                      │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Relationships Tab Layout
```
┌─────────────────────────────────────────────┐
│ 📦 Physical Item (Accessioned)              │
│ ┌─────────────────────────────────────────┐ │
│ │ Barcode: 123456789                      │ │
│ │ Call Number: S-3-01B-02-03-001          │ │
│ │ Title: Government Document Title...     │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ ⚠️ Analytics Error                          │
│ ┌─────────────────────────────────────────┐ │
│ │ Error Type: Duplicate Barcode           │ │
│ │ Description: Barcode exists in items... │ │
│ │ This record is excluded from space calc │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Shelf Context Tab Layout
```
┌─────────────────────────────────────────────┐
│ Shelf Location                              │
│ ┌───────┬───────┬────────┬────────┐        │
│ │Floor 3│Range  │Ladder 2│Shelf 3 │        │
│ │       │ 01B   │        │        │        │
│ └───────┴───────┴────────┴────────┘        │
│ Full Call Number: S-3-01B-02-03             │
│ Position: 001                               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 📦 Physical Items on This Shelf (3)         │
│ ┌─────────────────────────────────────────┐ │
│ │ Pos │ Barcode    │ Title              │ │ │
│ │ 001 │ 123456789  │ Doc Title 1        │ │ │
│ │ 002 │ 123456790  │ Doc Title 2        │ │ │
│ │ 003 │ 123456791  │ Doc Title 3        │ │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 📊 Analytics Records on This Shelf (45)     │
│ (Estimated records not yet accessioned)     │
│ ┌─────────────────────────────────────────┐ │
│ │ Barcode    │Status    │Title           │ │ │
│ │ 123456792  │Available │Doc Title 4     │ │ │
│ │ 123456793  │Available │Doc Title 5     │ │ │
│ │ ...        │...       │...             │ │ │
│ └─────────────────────────────────────────┘ │
│ Showing first 20 of 45 records              │
└─────────────────────────────────────────────┘
```

## Backend Logic Highlights

### Shelf Context Parsing
```python
# Parse call number: S-3-01B-02-03-001
match = re.match(r'^S-([^-]+)-([^-]+)-(\d+)-(\d+)-(\d+)$', call_number)
floor, range_code, ladder, shelf, position = match.groups()

# Build shelf context
shelf_call_number = f"S-{floor}-{range_code}-{ladder}-{shelf}"

# Find neighbors (same shelf, different positions)
neighbors = db.query(Analytics).filter(
    Analytics.alternative_call_number.like(f"{shelf_call_number}-%")
).limit(20).all()
```

### Cascade Delete Logic
```python
# Analytics delete
@router.delete("/analytics/{record_id}")
def delete_analytics(record_id: int, db: Session):
    # Delete related errors
    db.query(AnalyticsError).filter(
        AnalyticsError.analytics_id == record_id
    ).delete()
    
    # Delete analytics record
    db.delete(analytics_record)
    db.commit()

# Item delete
@router.delete("/item/{record_id}")
def delete_item(record_id: int, db: Session):
    # Update related analytics
    if item.barcode:
        related_analytics = db.query(Analytics).filter(
            Analytics.barcode == item.barcode
        ).first()
        if related_analytics:
            related_analytics.has_item_link = False
    
    # Delete item
    db.delete(item)
    db.commit()
```

## Future Enhancements

### Phase 2: RecordEditModal
```
┌─────────────────────────────────────────────┐
│ ✏️ Edit Analytics Record                    │
├─────────────────────────────────────────────┤
│ Barcode: [123456789            ]            │
│ Call Number: [S-3-01B-02-03    ]            │
│ Title: [Government Document... ]            │
│ Status: [Available         ▼]               │
│ ...                                         │
├─────────────────────────────────────────────┤
│ Changes Preview:                            │
│ • Status: "Available" → "Checked Out"       │
│ • Call Number: "S-3-01B-02-03" → "S-3-..."  │
├─────────────────────────────────────────────┤
│                 [Cancel] [Save Changes]     │
└─────────────────────────────────────────────┘
```

### Phase 3: ShelfRecordsViewer
```
┌─────────────────────────────────────────────┐
│ 🗄️ Shelf S-3-01B-02-03                     │
├─────────────────────────────────────────────┤
│ Physical Representation:                    │
│ ┌────────────────────────────────────────┐  │
│ │█████░░░░░░░░█████████░░░░░█████████░░│  │  ← 35" wide
│ └────────────────────────────────────────┘  │
│ ■ Items   □ Analytics   ░ Empty            │
├─────────────────────────────────────────────┤
│ Summary:                                    │
│ • 8 physical items                          │
│ • 27 analytics records                      │
│ • 15" used, 20" available                   │
├─────────────────────────────────────────────┤
│ Position Map:                               │
│ [001] 📦 Item (Title...)      [View]        │
│ [002] 📊 Analytics (Title...) [View]        │
│ [003] 📦 Item (Title...)      [View]        │
│ ...                                         │
└─────────────────────────────────────────────┘
```

---

**Last Updated**: Just completed Phase 1
**Status**: Ready for testing
**Next**: User testing → Phase 2 (Editing)
