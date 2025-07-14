# backend/core/sudoc.py

import os
import sqlite3
import zipfile
from typing import List, Optional
from pymarc import MARCReader, Record

BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")

def _connect():
    return sqlite3.connect(SQLITE_PATH)

# backend/core/sudoc.py

def search_records(
    query: str,
    title: Optional[str] = None,
    limit: int = 20,
    offset: int = 0
) -> List[dict]:
    """
    Return up to `limit` rows (with `offset`) whose SuDoc call number contains `query`,
    and whose title contains `title` if given. Includes the precomputed `oclc` field.
    """
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
        try:
            ind1, ind2 = field.indicators
        except Exception:
            continue

        subfields_map = {}
        for sf in field.subfields:
            code  = getattr(sf, "code", None)
            value = getattr(sf, "value", None)
            if code is None or value is None:
                continue
            if code in subfields_map:
                existing = subfields_map[code]
                if isinstance(existing, list):
                    existing.append(value)
                else:
                    subfields_map[code] = [existing, value]
            else:
                subfields_map[code] = value

        for code, val in subfields_map.items():
            if isinstance(val, list):
                subfields_map[code] = ", ".join(val)

        out.append({
            "tag":       field.tag,
            "ind1":      ind1,
            "ind2":      ind2,
            "subfields": subfields_map
        })

    return out
