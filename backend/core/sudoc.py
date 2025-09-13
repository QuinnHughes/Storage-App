# backend/core/sudoc.py

import io
import os
import sqlite3
import re  # Add this import
import zipfile
from io import BytesIO
from typing import Optional, List, Dict, Union, Any
from pymarc import MARCReader, Record, MARCWriter, Field, Subfield
from cachetools import LRUCache
from sqlalchemy.orm import Session
from db import crud
from db.session import SessionLocal
import re
import itertools

BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")

# Create a cache for MARC records
marc_record_cache = LRUCache(maxsize=100)

def _connect():
    return sqlite3.connect(SQLITE_PATH)

def search_records(
    query: str,
    title: Optional[str] = None,
    limit: int = 20,
    offset: int = 0
) -> List[dict]:

    sql = """
    SELECT
      rowid,
      sudoc,
      title,
      zip_file,
      oclc
    FROM records
    WHERE sudoc LIKE ?
      AND (? IS NULL OR title LIKE ?)
    LIMIT ? OFFSET ?
    """
    args = [f"%{query}%", title, f"%{title}%", limit, offset]

    conn = _connect()
    cur  = conn.cursor()
    cur.execute(sql, args)
    rows = cur.fetchall()
    conn.close()

    return [
        {
          "id":       r[0],
          "sudoc":    r[1],
          "title":    r[2],
          "zip_file": r[3],
          "oclc":     r[4],
        }
        for r in rows
    ]

def get_record_fields(record_id: int) -> List[dict]:
    """Get MARC fields for a record"""
    record = get_marc_by_id(record_id, include_edits=True)  # Always check for edits first
    if not record:
        return []
    
    return _extract_fields_from_record(record)

def _extract_fields_from_record(record) -> List[dict]:
    """Extract fields from a pymarc Record object"""
    if not record:
        return []
        
    result = []
    for field in record.get_fields():
        if field.is_control_field():
            result.append({
                "tag": field.tag,
                "ind1": " ",
                "ind2": " ",
                "subfields": {"data": field.data}
            })
        else:
            subfields = {}
            
            # Handle different field structures based on pymarc version
            if hasattr(field, 'subfields') and field.subfields:
                # Modern pymarc stores subfields as a list of Subfield objects
                if hasattr(field.subfields[0], 'code') and hasattr(field.subfields[0], 'value'):
                    for subfield in field.subfields:
                        code = subfield.code
                        value = str(subfield.value)
                        
                        if code in subfields:
                            subfields[code] = subfields[code] + " ; " + value
                        else:
                            subfields[code] = value
                # Older pymarc versions might store as alternating code/value
                elif len(field.subfields) % 2 == 0:
                    for i in range(0, len(field.subfields), 2):
                        code = field.subfields[i]
                        value = str(field.subfields[i+1])
                        
                        if code in subfields:
                            subfields[code] = subfields[code] + " ; " + value
                        else:
                            subfields[code] = value
                # Direct attribute access for another possible structure
                else:
                    for subfield in field.subfields:
                        if hasattr(subfield, 'code') and hasattr(subfield, 'value'):
                            code = subfield.code
                            value = str(subfield.value)
                            
                            if code in subfields:
                                subfields[code] = subfields[code] + " ; " + value
                            else:
                                subfields[code] = value
            
            result.append({
                "tag": field.tag,
                "ind1": field.indicator1 or " ",
                "ind2": field.indicator2 or " ",
                "subfields": subfields
            })
    
    # Sort fields by tag number for proper display order
    result.sort(key=lambda x: x["tag"])
    return result

def get_marc_by_id(record_id: int, include_edits: bool = True):
    """Get MARC record by ID, checking PostgreSQL first, then SQLite"""
    print(f"DEBUG: get_marc_by_id({record_id}, include_edits={include_edits})")
    
    # Check PostgreSQL if edits should be included
    with SessionLocal() as db:
        if include_edits:
            ov = crud.get_latest_edited_overlay(db, record_id)
            if ov:
                print(f"DEBUG: Found edited record {record_id} in PostgreSQL")
                rec = next(MARCReader(BytesIO(ov.marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec
        
        # Check for created record
        created = crud.get_created_record(db, record_id)
        if created:
            print(f"DEBUG: Found created record {record_id} in PostgreSQL")
            rec = next(MARCReader(BytesIO(created.marc_data), to_unicode=True, force_utf8=True), None)
            if rec:
                return rec
    
    # Check SQLite as fallback
    sqlite_record = _get_original_marc_by_id(record_id)
    if sqlite_record:
        print(f"DEBUG: Found original record {record_id} in SQLite")
    else:
        print(f"DEBUG: Record {record_id} not found in either database")
    
    return sqlite_record

def _get_original_marc_by_id(record_id: int):
    """Get MARC record using byte offset for direct access"""
    
    with sqlite3.connect(SQLITE_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        
        # Get the zip file and byte offset
        cur.execute("""
            SELECT zip_file, marc_file, byte_offset, record_length 
            FROM records WHERE id = ?
        """, (record_id,))
        row = cur.fetchone()
        
        if not row:
            print(f"Record {record_id} not found in index")
            return None
            
        zip_filename = row['zip_file']
        marc_filename = row['marc_file']
        byte_offset = row['byte_offset']
        record_length = row['record_length']
    
    print(f"[SUDOC] id={record_id} -> zip={zip_filename}, byte_offset={byte_offset}")
    
    zip_path = os.path.join(RECORDS_DIR, zip_filename)
    if not os.path.exists(zip_path):
        print(f"ZIP file not found: {zip_path}")
        return None
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            with zf.open(marc_filename) as marc_file:
                # Seek directly to the byte offset
                marc_file.seek(byte_offset)
                
                # Read exactly the record length
                record_data = marc_file.read(record_length)
                
                # Parse the record
                from io import BytesIO
                reader = MARCReader(BytesIO(record_data), to_unicode=True, force_utf8=True)
                try:
                    record = next(reader)
                    return record
                except StopIteration:
                    print(f"Failed to parse record at offset {byte_offset}")
                    return None
                
    except Exception as e:
        print(f"Error reading MARC file: {e}")
        return None

def save_marc_record(record_id: int, record: Record) -> bool:
    """Save an updated MARC record back to its ZIP file"""
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT zip_file FROM records WHERE rowid = ?", (record_id,))
    row = cur.fetchone()
    conn.close()
    
    if not row:
        return False
        
    zip_filename = row[0]
    zip_path = os.path.join(RECORDS_DIR, zip_filename)
    
    try:
        # This is a simplified version - you'll need to implement proper
        # handling of updating records within ZIP files
        with zipfile.ZipFile(zip_path, 'a') as zf:
            # Create a temporary file for the updated record
            buffer = io.BytesIO()
            writer = MARCWriter(buffer)
            writer.write(record)
            buffer.seek(0)
            
            # Add/update the record in the ZIP
            # Note: This is oversimplified - you'll need proper temp file handling
            zf.writestr(f"updated_{record_id}.mrc", buffer.getvalue())
            
        return True
    except Exception as e:
        print(f"Error saving record: {e}")
        return False

# === New utility functions for MARC record processing ===

def get_title_from_record(rec: Record) -> str:
    """Extract title from a MARC record's 245 field"""
    f245 = rec.get_fields('245')
    if not f245:
        return "Untitled"
    field = f245[0]
    a = field.get_subfields('a')
    b = field.get_subfields('b')
    title = (a[0] if a else "") + (" " + b[0] if b else "")
    return title.strip(" /:;") or "Untitled"

def get_control_number(rec: Record) -> Optional[str]:
    """Get control number from 001 field"""
    f001 = rec.get_fields('001')
    if f001:
        return getattr(f001[0], 'data', None)
    return None

def get_oclc_number(rec: Record) -> Optional[str]:
    """Extract OCLC number from 035$a or 019$a field"""
    # Look in 035 $a for (OCoLC)
    for f in rec.get_fields('035'):
        subs = f.get_subfields('a')
        for s in subs:
            if '(OCoLC' in s:
                return s
    # Sometimes 019 has former OCLC numbers
    for f in rec.get_fields('019'):
        subs = f.get_subfields('a')
        for s in subs:
            if s.isdigit():
                return f"(OCoLC){s}"
    return None

def build_serial_008(year: Optional[str] = None) -> str:
    """Build a proper serial-style 008 field"""
    from datetime import datetime
    today = datetime.now().strftime('%y%m%d')
    
    # Date created (positions 0-5)
    result = today
    
    # Date type and dates (positions 6-14)
    if year:
        # Continuing resource with start year
        result += f"c{year[:4]:<4}9999"
    else:
        # Unknown dates
        result += "n||||||||"
    
    # Place of publication (positions 15-17) - default to unknown
    result += "|||"
    
    # Frequency, regularity, type (positions 18-20)
    result += "|||"
    
    # Form of item (position 21-22)
    result += "  "
    
    # Nature of contents (position 23)
    result += " "
    
    # Government publication (position 24) - assume government pub
    result += "f"
    
    # Conference publication (position 25)
    result += "0"
    
    # Festschrift (position 26)
    result += "0"
    
    # Index (position 27)
    result += "0"
    
    # Undefined (position 28)
    result += " "
    
    # Fiction (position 29)
    result += "0"
    
    # Biography (position 30)
    result += " "
    
    # Language (positions 31-33)
    result += "eng"
    
    # Modified record (position 34)
    result += " "
    
    # Cataloging source (position 35)
    result += "d"
    
    return result

def create_government_series_host_record(
    title: str,
    series: Optional[str],
    publisher: Optional[str],
    series_number: Optional[str],
    year: Optional[str],
    subjects: Optional[List[str]]
) -> Record:
    """Create a new MARC record for a government series host"""
    rec = Record(force_utf8=True)
    rec.leader = "00000cas a2200000   4500"  # Changed to 'cas' for continuing resource
    # 008 - proper serial format
    rec.add_field(Field(tag='008', data=build_serial_008(year)))
    # 245
    rec.add_field(Field(tag='245', indicators=['0','0'], subfields=[
        Subfield('a', title.rstrip(' /:;') + '.')
    ]))
    # Series (490 + 830)
    if series:
        rec.add_field(Field(tag='490', indicators=['0','0'], subfields=[
            Subfield('a', series + (f" ; {series_number}" if series_number else ""))
        ]))
        rec.add_field(Field(tag='830', indicators=[' ','0'], subfields=[
            Subfield('a', series + (f". {series_number}" if series_number else ""))
        ]))
    # Publisher (264)
    if publisher or year:
        subs = []
        if publisher: subs.append(Subfield('b', publisher))
        if year: subs.append(Subfield('c', year))
        if subs:
            subs.insert(0, Subfield('a', '[Place of publication not identified]'))
            rec.add_field(Field(tag='264', indicators=[' ','1'], subfields=subs))
    # Subjects
    if subjects:
        for s in subjects:
            if s:
                rec.add_field(Field(tag='650', indicators=[' ','0'], subfields=[
                    Subfield('a', s)
                ]))
    return rec

def add_holdings_and_item_fields(rec: Record, h) -> None:
    """
    Add 852 (holdings) and 945 (local item) fields to host record.
    h: HoldingsItemData
    852: $b location_code, $h call_number
    945: $l location_code, $i barcode, $c call_number, $n enumeration/chronology, $p item_policy
    """
    # Remove any prior 852/945 we added earlier (simple de-dup)
    for tag in ('852','945'):
        for f in list(rec.get_fields(tag)):
            rec.remove_field(f)

    # 852
    subfields_852 = []
    if getattr(h, 'location_code', None):
        subfields_852.append(Subfield('b', h.location_code))
    if getattr(h, 'call_number', None):
        subfields_852.append(Subfield('h', h.call_number))
    if subfields_852:
        rec.add_field(Field(tag='852', indicators=[' ',' '], subfields=subfields_852))

    # 945 (local item)
    sf945 = []
    if getattr(h, 'location_code', None): sf945.append(Subfield('l', h.location_code))
    if getattr(h, 'barcode', None):       sf945.append(Subfield('i', h.barcode))
    if getattr(h, 'call_number', None):   sf945.append(Subfield('c', h.call_number))
    if getattr(h, 'enumeration', None):   sf945.append(Subfield('n', h.enumeration))
    if getattr(h, 'chronology', None):    sf945.append(Subfield('n', h.chronology))
    if getattr(h, 'item_policy', None):   sf945.append(Subfield('p', h.item_policy))
    if sf945:
        rec.add_field(Field(tag='945', indicators=[' ',' '], subfields=sf945))

def _preferred_control_number(record: Record, fallback_local: str) -> str:
    """Get the preferred control number for linking fields"""
    # First try OCLC number
    oclc = get_oclc_number(record)
    if oclc:
        return oclc if '(OCoLC)' in oclc else f"(OCoLC){oclc}"
    
    # Next try system control number from 001
    cn = get_control_number(record)
    if cn:
        return f"(ORG){cn}" if not cn.startswith('(') else cn
        
    # Fallback to local ID with explicit format
    return f"(LOCAL){fallback_local}"

def _strip_existing_link_fields(rec: Record):
    """Remove prior normalized 773/774 (ind2==8) to avoid duplicates."""
    remove = []
    for f in rec.get_fields('773', '774'):
        if f.indicator2 == '8':
            remove.append(f)
    for f in remove:
        rec.remove_field(f)

def _extract_host_title(record: Record) -> str:
    """Extract title from host record for display"""
    f245 = record.get_fields('245')
    if not f245:
        return "Host"
    field = f245[0]
    parts = []
    for code in ('a', 'b', 'p'):
        vals = field.get_subfields(code)
        if vals:
            parts.append(vals[0])
    title = ' '.join(parts).strip(' /:;')
    return title or "Host"

# ================= Boundwith Normalization Helpers (NEW) ================= #

def _normalize_spaces(text: str) -> str:
    return re.sub(r'\s+', ' ', text or '').strip()

def build_normalized_245_title(rec: Record) -> str:
    """Return a normalized title using 245 $a $b with punctuation rules."""
    f_list = rec.get_fields('245')
    if not f_list:
        return "Untitled"
    f = f_list[0]
    a = f.get_subfields('a')
    b = f.get_subfields('b')
    parts: List[str] = []
    if a:
        parts.append(a[0].rstrip(' /:;'))
    if b:
        btxt = b[0].rstrip(' /:;')
        if parts and not re.search(r'[:;.,]$', parts[-1]):
            parts[-1] += ':'
        parts.append(btxt)
    title = _normalize_spaces(' '.join(parts))
    return title or "Untitled"

def build_normalized_child_title(rec: Record) -> str:
    return build_normalized_245_title(rec)

def derive_common_publisher_and_year(records: List[Record]):
    pubs: List[str] = []
    years: List[str] = []
    for r in records:
        for tag in ('264','260'):
            for f in r.get_fields(tag):
                for b in f.get_subfields('b'):
                    pubs.append(b.rstrip(' ,;:/'))
                for c in f.get_subfields('c'):
                    m = re.search(r'(\d{4})', c)
                    if m:
                        years.append(m.group(1))
    publisher = None
    if pubs:
        publisher = max(((p, pubs.count(p)) for p in set(pubs)), key=lambda x: x[1])[0]
    year_range = None
    if years:
        if len(set(years)) > 1:
            year_range = f"{min(years)}-"
        else:
            year_range = years[0]
    return publisher, year_range

def derive_common_subjects(records: List[Record], min_frequency: float = 0.5, limit: int = 5) -> List[str]:
    subjects: List[str] = []
    for r in records:
        for f in r.get_fields():
            if f.tag.startswith('65'):
                vals: List[str] = []
                for code in ('a','x','y','z'):
                    for sf in f.get_subfields(code):
                        vals.append(sf.strip(' .;,/'))
                if vals:
                    subjects.append(' -- '.join(vals))
    flat_parts = list(itertools.chain.from_iterable(s.split(' -- ') for s in subjects))
    if not flat_parts:
        return []
    freq: Dict[str,int] = {}
    for p in flat_parts:
        freq[p] = freq.get(p,0)+1
    threshold = max(1, int(len(records)*min_frequency))
    common = [p for p,c in freq.items() if c >= threshold]
    common.sort(key=lambda p: (-freq[p], p.lower()))
    return common[:limit]

def _preferred_control_number(record: Record, fallback_local: str) -> str:  # type: ignore[override]
    """Override earlier definition to ensure OCLC preference and safe wrapper."""
    # First try OCLC number
    oclc = get_oclc_number(record)
    if oclc:
        return oclc
    # Next try system control number from 001
    cn = get_control_number(record)
    if cn:
        if not cn.startswith('('):
            return f"(LOCAL){cn}"
        return cn
    return f"(LOCAL){fallback_local}"

def build_774_line(child: Record, fallback_id: str, ordinal: Optional[int] = None) -> Dict[str,str]:
    title = build_normalized_child_title(child)
    w = _preferred_control_number(child, fallback_id)
    result = {"i": "Contains (work):", "t": title, "w": w}
    if ordinal is not None:
        result["g"] = f"no: {ordinal}"
    return result

def build_boundwith_preview(record_ids: List[int]) -> Dict[str, Any]:
    """Given record IDs, construct a preview of a prospective host record metadata.
    Returns dict with host_title, publisher, year_range, subjects, lines_774.
    """
    recs: List[Record] = []
    for rid in record_ids:
        rec = get_marc_by_id(rid, include_edits=True)
        if rec:
            recs.append(rec)
    if not recs:
        return {"host_title": "Collection.", "publisher": None, "year_range": None, "subjects": [], "lines_774": []}

    publisher, year_range = derive_common_publisher_and_year(recs)
    subjects = derive_common_subjects(recs)

    committee_names: List[str] = []
    for r in recs:
        for tag in ('110','710'):
            for f in r.get_fields(tag):
                segs: List[str] = []
                for code in ('a','b'):
                    for sf in f.get_subfields(code):
                        segs.append(sf.rstrip(' /:;'))
                if segs:
                    nm = _normalize_spaces('. '.join(segs))
                    committee_names.append(nm)
    if committee_names:
        # most frequent
        host_root = max(((n, committee_names.count(n)) for n in set(committee_names)), key=lambda x: x[1])[0]
    else:
        host_root = build_normalized_child_title(recs[0])
    host_title = host_root + " Collection."

    lines_774: List[Dict[str,str]] = []
    for ordinal, (rid, r) in enumerate(zip(record_ids, recs), 1):
        lines_774.append(build_774_line(r, str(rid), ordinal))

    return {
        "host_title": host_title,
        "publisher": publisher,
        "year_range": year_range,
        "subjects": subjects,
        "lines_774": lines_774,
    }

# Add this function to lookup records by OCLC number
def get_record_by_oclc(oclc_number: str):
    """Find a record by its OCLC number"""
    print(f"DEBUG: Looking up record by OCLC number: {oclc_number}")
    
    # First check PostgreSQL for any records with this OCLC
    try:
        with SessionLocal() as db:
            # Try created records first
            created_records = crud.get_records_by_oclc(db, oclc_number, created_only=True)
            if created_records and len(created_records) > 0:
                print(f"DEBUG: Found created record with OCLC {oclc_number}")
                rec = next(MARCReader(BytesIO(created_records[0].marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec, created_records[0].id
                
            # Then edited records
            edited_records = crud.get_records_by_oclc(db, oclc_number, created_only=False)
            if edited_records and len(edited_records) > 0:
                print(f"DEBUG: Found edited record with OCLC {oclc_number}")
                rec = next(MARCReader(BytesIO(edited_records[0].marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec, edited_records[0].id
    except Exception as e:
        print(f"DEBUG: Error checking PostgreSQL for OCLC {oclc_number}: {e}")
    
    # Then check SQLite
    try:
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM records WHERE oclc = ?", (oclc_number,))
            row = cursor.fetchone()
            if row:
                record_id = row['id']
                record = _get_original_marc_by_id(record_id)
                if record:
                    print(f"DEBUG: Found SQLite record with OCLC {oclc_number}, ID={record_id}")
                    return record, record_id
    except Exception as e:
        print(f"DEBUG: Error checking SQLite for OCLC {oclc_number}: {e}")
        
    print(f"DEBUG: No record found with OCLC {oclc_number}")
    return None, None


# Modify the _extract_child_ids function to return more information about child records
def _extract_child_ids(record):
    """Extract child record information from 774 fields"""
    if not record:
        return []
        
    child_info = []
    for field in record.get_fields('774'):
        print(f"DEBUG: Found 774 field: {field}")
        
        # Get the title from subfield t
        title = None
        for t in field.get_subfields('t'):
            title = t
            break
            
        for w in field.get_subfields('w'):
            print(f"DEBUG: Processing subfield w with value: '{w}'")
            
            # Check if this is an OCLC number
            oclc_match = re.search(r'\(OCoLC\)(\d+)', w)
            if oclc_match:
                oclc_number = oclc_match.group(1)
                print(f"DEBUG: Found OCLC number: {oclc_number}")
                
                # Try to find the record by OCLC number
                record, record_id = get_record_by_oclc(oclc_number)
                
                if record_id:
                    child_info.append({
                        "id": record_id,
                        "oclc": oclc_number,
                        "title": title or get_title_from_record(record) or f"Record {record_id}"
                    })
                else:
                    # We didn't find the record, but still add the OCLC info
                    child_info.append({
                        "id": None,  # No internal ID found
                        "oclc": oclc_number,
                        "title": title or f"OCLC {oclc_number} (Not Found)"
                    })
                continue
                
            # Regular ID extraction
            m = re.search(r'\(LOCAL:?(\d+)\)', w) or re.search(r'\b(\d{1,10})\b', w)
            if m:
                try:
                    child_id = int(m.group(1))
                    print(f"DEBUG: Extracted child ID: {child_id} from '{w}'")
                    
                    # Check if this record exists
                    record = get_marc_by_id(child_id, include_edits=True)
                    if record:
                        child_info.append({
                            "id": child_id,
                            "oclc": get_oclc_number(record) or "",
                            "title": title or get_title_from_record(record) or f"Record {child_id}"
                        })
                    else:
                        print(f"DEBUG: Child record {child_id} not found")
                        child_info.append({
                            "id": child_id,
                            "oclc": "",
                            "title": title or f"Record {child_id} (Not Found)"
                        })
                except Exception as e:
                    print(f"DEBUG: Failed to extract ID from '{w}': {e}")
                    
    print(f"DEBUG: Total child records found: {len(child_info)}")
    return child_info


# Then modify get_record_with_boundwith_info to use the enhanced _extract_child_ids function
def get_record_with_boundwith_info(record_id: int, include_child_records: bool = False) -> Dict[str, Any]:
    """
    Get record with boundwith relationship info.
    Handles both edited/created records (PostgreSQL) and original records (SQLite).
    """
    # First get the MARC record through our standard resolver
    record = get_marc_by_id(record_id, include_edits=True)
    if not record:
        return None
        
    # Get record source info
    is_created = False
    is_edited = False
    
    with SessionLocal() as db:
        created = crud.get_created_record(db, record_id)
        if created:
            is_created = True
        else:
            edited = crud.get_latest_edited_overlay(db, record_id)
            if edited:
                is_edited = True
    
    # Basic record info
    result = {
        "id": record_id,
        "title": get_title_from_record(record),
        "isHost": False,
        "childIds": [],
        "hostId": None,
        "isCreated": is_created,
        "isEdited": is_edited,
    }
    
    # Extract SuDoc and OCLC information
    oclc = get_oclc_number(record) or ""
    
    # Try to extract SUDOC from call number fields
    sudoc = ""
    for field in record.get_fields('050', '055', '060', '070', '080', '082', '086'):
        for a in field.get_subfields('a'):
            if re.search(r'[A-Z]\d', a):  # Simple heuristic for SuDoc pattern
                sudoc = a
                break
        if sudoc:
            break
    
    result["sudoc"] = sudoc
    result["oclc"] = oclc
    
    # Check if this is a host record (has 774 fields)
    child_info = _extract_child_ids(record)
    if child_info:
        result["isHost"] = True
        # Extract just the IDs for the childIds array
        result["childIds"] = [child["id"] for child in child_info if child["id"]]
        result["childRecords"] = []
        
        # Include the full child info for display even when no record exists
        if include_child_records:
            result["childRecords"] = child_info
    
    # Check if this is a child record (has 773 fields)
    for field in record.get_fields('773'):
        ws = field.get_subfields('w')
        for w in ws:
            # Look for (LOCAL:<digits>) or bare digits
            m = re.search(r'\(LOCAL:?(\d+)\)', w) or re.search(r'\b(\d{1,10})\b', w)
            if m:
                try:
                    host_id = int(m.group(1))
                    result["hostId"] = host_id
                    break
                except:
                    pass
        if result["hostId"]:
            break
            
    return result

def _extract_child_ids(record):
    """Extract child record information from 774 fields"""
    if not record:
        return []
        
    child_info = []
    for field in record.get_fields('774'):
        # Get the title from subfield t
        title = None
        for t in field.get_subfields('t'):
            title = t
            break
            
        for w in field.get_subfields('w'):
            # Check if this is an OCLC number
            oclc_match = re.search(r'\(OCoLC\)(\d+)', w)
            if oclc_match:
                oclc_number = oclc_match.group(1)
                
                # Try to find the record by OCLC number
                record, record_id = get_record_by_oclc(oclc_number)
                
                if record_id:
                    child_info.append({
                        "id": record_id,
                        "oclc": oclc_number,
                        "title": title or get_title_from_record(record) or f"Record {record_id}"
                    })
                else:
                    # We didn't find the record, but still add the OCLC info
                    child_info.append({
                        "id": None,  # No internal ID found
                        "oclc": oclc_number,
                        "title": title or f"OCLC {oclc_number} (Not Found)"
                    })
                continue
                
            # Regular ID extraction
            m = re.search(r'\(LOCAL:?(\d+)\)', w) or re.search(r'\b(\d{1,10})\b', w)
            if m:
                try:
                    child_id = int(m.group(1))
                    
                    # Check if this record exists
                    record = get_marc_by_id(child_id, include_edits=True)
                    if record:
                        child_info.append({
                            "id": child_id,
                            "oclc": get_oclc_number(record) or "",
                            "title": title or get_title_from_record(record) or f"Record {child_id}"
                        })
                    else:
                        child_info.append({
                            "id": child_id,
                            "oclc": "",
                            "title": title or f"Record {child_id} (Not Found)"
                        })
                except Exception:
                    pass
                    
    return child_info

def get_record_by_oclc(oclc_number: str):
    """Find a record by its OCLC number"""
    # First check PostgreSQL for any records with this OCLC
    try:
        with SessionLocal() as db:
            # Try created records first
            created_records = crud.get_records_by_oclc(db, oclc_number, created_only=True)
            if created_records and len(created_records) > 0:
                rec = next(MARCReader(BytesIO(created_records[0].marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec, created_records[0].id
                
            # Then edited records
            edited_records = crud.get_records_by_oclc(db, oclc_number, created_only=False)
            if edited_records and len(edited_records) > 0:
                rec = next(MARCReader(BytesIO(edited_records[0].marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec, edited_records[0].id
    except Exception:
        pass
    
    # Then check SQLite
    try:
        with sqlite3.connect(SQLITE_PATH) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM records WHERE oclc = ?", (oclc_number,))
            row = cursor.fetchone()
            if row:
                record_id = row['id']
                record = _get_original_marc_by_id(record_id)
                if record:
                    return record, record_id
    except Exception:
        pass
        
    return None, None

def get_marc_by_id(record_id: int, include_edits: bool = True):
    """Get MARC record by ID, checking PostgreSQL first, then SQLite"""
    # Check PostgreSQL if edits should be included
    with SessionLocal() as db:
        if include_edits:
            ov = crud.get_latest_edited_overlay(db, record_id)
            if ov:
                rec = next(MARCReader(BytesIO(ov.marc_data), to_unicode=True, force_utf8=True), None)
                if rec:
                    return rec
        
        # Check for created record
        created = crud.get_created_record(db, record_id)
        if created:
            rec = next(MARCReader(BytesIO(created.marc_data), to_unicode=True, force_utf8=True), None)
            if rec:
                return rec
    
    # Check SQLite as fallback
    sqlite_record = _get_original_marc_by_id(record_id)
    return sqlite_record