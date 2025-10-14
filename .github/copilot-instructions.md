# Storage App - Government Documents Library Management System

## Architecture Overview
This is a FastAPI + React application for managing **both physical storage and MARC cataloging** of government document collections. The system uses a **dual database architecture**:
- **SQLite**: Read-only MARC records from CGP (Catalog of Government Publications) ZIP files
- **PostgreSQL**: User data, physical items, analytics, edited records, weeding operations

## Key Components

### Backend (`/backend`)
- **FastAPI**: REST API with role-based auth (viewer → book_worm → cataloger → admin)
- **Physical Storage**: Item tracking with precise shelf addressing (`S-{floor}-{range}-{ladder}-{shelf}-{position}`)
- **PyMARC**: MARC record parsing/manipulation (`core/sudoc.py` - 800+ lines of catalog logic)
- **Analytics Integration**: Links physical items to ILS metadata via barcode matching
- **Weeding Operations**: Track removed items and reclaim storage slots

### Frontend (`/frontend`) 
- **React + Vite**: Modern SPA with Tailwind CSS
- **Role-Based UI**: Navigation adapts to user permissions
- **Storage Management**: Empty slot detection, accession workflows, range-based operations
- **MARC Editor**: Complex cataloging workflows for document relationships

## Critical Development Patterns

### Physical Storage System
Items use structured call numbers: `S-{floor}-{range}-{ladder}-{shelf}-{position}`
```python
# Call number parsing for storage operations
def parse_alternative_call_number(acn: str) -> Dict:
    # Format: S-3-01B-02-03-001 (floor 3, range 01B, ladder 2, shelf 3, pos 1)
    match = re.match(r'S-(\w+)-(\d+[A-Z]+)-(\d+)-(\d+)-(.+)', acn)
```

### Empty Slot Detection
Complex SQL view (`empty_slot_details`) tracks available storage:
- **Empty shelves**: Entire shelf available (`position = NULL`)  
- **Empty slots**: Individual positions within occupied shelves
- **Destroyed slots**: Positions freed by weeding operations

### MARC Record Resolution Strategy
Records are resolved with PostgreSQL-first fallback to SQLite:
```python
# Always check PostgreSQL edits first, then SQLite originals
record = get_marc_by_id(record_id, include_edits=True)
```

### Analytics Integration
Links physical items to ILS metadata via dual-key matching:
```python
# Items table: barcode + alternative_call_number
# Analytics table: barcode + alternative_call_number + title + status
```

### Authentication Flow
4-tier role system with hierarchical permissions:
```python
# Role hierarchy: viewer < book_worm < cataloger < admin
# Use route dependencies: dependencies=[Depends(require_cataloger)]
```

## Development Workflow

### Local Development
```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend  
cd frontend && npm run dev

# Full stack
docker-compose up
```

### Key Files by Function
**Storage Management:**
- `api/accession.py` - Empty slot allocation and range-based operations
- `api/catalog.py` - Item search with analytics integration  
- `api/weed.py` - Removal tracking and slot reclamation
- `setup.txt` - Critical `empty_slot_details` view definition

**MARC Operations:**
- `core/sudoc.py` - Primary MARC logic (800+ lines, get familiar with this first)
- `api/sudoc.py` - REST endpoints for catalog operations
- `api/record_management.py` - Generic CRUD for all tables

**Data Sources:**
- `Record_sets/*.zip` - Source MARC files from CGP  
- `cgp_sudoc_index.db` - SQLite index with byte offsets for direct record access
- PostgreSQL tables: `items`, `analytics`, `weeded_items`, `sudoc_*`

## Domain-Specific Considerations

### Physical Storage Context
- **Structured Addresses**: `S-{floor}-{range}-{ladder}-{shelf}-{position}` format
- **Range-Based Operations**: Support filtering by call number ranges for bulk operations
- **Weeding Integration**: Destroyed items create available slots for new acquisitions
- **Analytics Matching**: Dual-key barcode + call number linking to ILS systems

### Government Documents Context
- **SuDoc Numbers**: Superintendent of Documents classification system
- **Boundwiths**: Multiple documents bound together physically 
- **Series Relationships**: Government publications often part of continuing series
- **OCLC Integration**: WorldCat record linking via 035$a fields

### MARC Field Patterns
- Field 086: SuDoc classification numbers
- Fields 773/774: Host/component relationships for boundwiths
- Field 008: Enhanced generation for serials/continuing resources
- Fields 260/264: Publication data analysis for host record creation

When working with catalog records, always consider both the PostgreSQL edited state and SQLite original state. The system maintains referential integrity between physical items and their catalog metadata.