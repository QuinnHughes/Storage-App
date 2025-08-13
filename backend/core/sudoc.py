# backend/core/sudoc.py

from pymarc import MARCReader, Record, MARCWriter  # Added MARCWriter
import os
import sqlite3
import zipfile
import io
from typing import Optional, List, Dict
from sqlalchemy.orm import Session
from db import crud

BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")

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
            
            # The subfields attribute contains Subfield objects, not a flat list
            # We need to iterate over them differently
            if hasattr(field, 'subfields') and field.subfields:
                for subfield in field.subfields:
                    # Each subfield is a Subfield object with .code and .value attributes
                    if hasattr(subfield, 'code') and hasattr(subfield, 'value'):
                        code = subfield.code
                        value = str(subfield.value)
                        
                        # Handle repeated subfield codes by joining values
                        if code in subfields:
                            subfields[code] = subfields[code] + " ; " + value
                        else:
                            subfields[code] = value
                    else:
                        # Fallback: treat as string if not a proper Subfield object
                        print(f"Unexpected subfield format: {subfield}")
            
            result.append({
                "tag": field.tag,
                "ind1": field.indicator1 or " ",
                "ind2": field.indicator2 or " ",
                "subfields": subfields
            })
    
    return result

def get_marc_by_id(record_id: int, include_edits: bool = True):
    """Get MARC record by ID, checking for edited version first, then falling back to original"""
    
    if include_edits:
        # First, try to get edited version from database
        try:
            from db.session import get_db
            from db import crud
            
            db = next(get_db())
            try:
                edited_record = crud.get_edited_record(db, record_id)
                if edited_record:
                    # Found edited version - use it
                    from pymarc import Record
                    record = Record(data=edited_record.marc_data)
                    return record
            finally:
                db.close()
        except Exception as e:
            print(f"Error checking for edited record {record_id}: {e}")
            # Continue to fallback - don't fail entirely
    
    # No edited version found (or include_edits=False), fall back to original
    return _get_original_marc_by_id(record_id)

def _get_original_marc_by_id(record_id: int):
    """Get MARC record using stored position from index"""
    print(f"Looking for record ID: {record_id}")
    
    conn = _connect()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    
    # Get the zip file and exact position for this record
    cur.execute("SELECT zip_file, position_in_zip FROM records WHERE id = ?", (record_id,))
    row = cur.fetchone()
    
    if not row:
        print(f"Record {record_id} not found in index")
        conn.close()
        return None
        
    zip_filename = row['zip_file']
    position_in_zip = row['position_in_zip']
    
    print(f"[SUDOC] id={record_id} -> zip={zip_filename}, pos_in_zip={position_in_zip}")
    conn.close()
    
    zip_path = os.path.join(RECORDS_DIR, zip_filename)
    
    if not os.path.exists(zip_path):
        print(f"ZIP file not found: {zip_path}")
        return None
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            marc_files = [f for f in zf.namelist() if f.endswith('.mrc')]
            if not marc_files:
                print(f"No MARC files found in {zip_filename}")
                return None
            
            marc_filename = marc_files[0]
            with zf.open(marc_filename) as marc_file:
                reader = MARCReader(marc_file, to_unicode=True, force_utf8=True, utf8_handling="replace")
                
                # Read to the exact stored position
                current_position = 0
                for record in reader:
                    if current_position == position_in_zip:
                        print(f"Found record at stored position {position_in_zip} in {zip_filename}")
                        return record
                    current_position += 1
                
                print(f"Record {record_id} not found at stored position {position_in_zip} in {zip_filename}")
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