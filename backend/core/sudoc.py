# backend/core/sudoc.py

import os
import sqlite3
import zipfile
from typing import List, Optional
from pymarc import MARCReader, MARCWriter, Record
import io

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

def get_marc_by_id(record_id: int) -> Optional[Record]:
    conn = _connect()
    cur  = conn.cursor()
    cur.execute("SELECT sudoc, zip_file FROM records WHERE rowid = ?", (record_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None

    sudoc_value, zip_filename = row
    zip_path = os.path.join(RECORDS_DIR, zip_filename)

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if not name.lower().endswith(".mrc"):
                continue
            data   = zf.read(name)
            reader = MARCReader(data)
            for rec in reader:
                for field in rec.get_fields("086"):
                    if field.value().strip() == sudoc_value:
                        return rec
    return None

def get_record_fields(record_id: int) -> List[dict]:
    rec = get_marc_by_id(record_id)
    if not rec:
        return []

    out = []

    for field in rec.get_fields():
        if field.is_control_field():
            out.append({
                "tag": field.tag,
                "ind1": " ",
                "ind2": " ",
                "subfields": {"a": str(field.data)}
            })
        else:
            subfields_map = {}

            for subfield in field.subfields:
                code = getattr(subfield, "code", None)
                val  = getattr(subfield, "value", None)

                if code is None or val is None:
                    continue

                if code in subfields_map:
                    existing = subfields_map[code]
                    if isinstance(existing, list):
                        existing.append(val)
                    else:
                        subfields_map[code] = [existing, val]
                else:
                    subfields_map[code] = val

            # Join list values if needed
            for k in subfields_map:
                if isinstance(subfields_map[k], list):
                    subfields_map[k] = ", ".join(subfields_map[k])

            out.append({
                "tag": field.tag,
                "ind1": field.indicator1 or " ",
                "ind2": field.indicator2 or " ",
                "subfields": subfields_map
            })

    return out

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