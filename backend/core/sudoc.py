# backend/core/sudoc.py

import os
import sqlite3
import zipfile
from typing import List, Optional
from pymarc import MARCReader, Record

# ── Paths ────────────────────────────────────────────────────────────────────

# Base directory = backend/
BASE_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

# Path to your SQLite index (cgp_sudoc_index.db) in backend/
SQLITE_PATH = os.path.join(BASE_DIR, "cgp_sudoc_index.db")

# Path to the folder containing your .mrc.zip files (place them in backend/Record_sets/)
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")


# ── Internal helper ─────────────────────────────────────────────────────────

def _connect():
    """Open a connection to the SQLite index."""
    return sqlite3.connect(SQLITE_PATH)


# ── Public API ───────────────────────────────────────────────────────────────

def search_records(
    query: str,
    title: Optional[str] = None,
    limit: int = 100
) -> List[dict]:
    """
    Return up to `limit` rows whose SuDoc call number contains `query`,
    and whose title contains `title` if given.
    Each dict has keys: id, sudoc, title, zip_file.
    """
    sql = "SELECT rowid, sudoc, title, zip_file FROM records WHERE sudoc LIKE ?"
    args = [f"%{query}%"]
    if title:
        sql += " AND title LIKE ?"
        args.append(f"%{title}%")
    sql += " LIMIT ?"
    args.append(limit)

    conn = _connect()
    cur  = conn.cursor()
    cur.execute(sql, args)
    rows = cur.fetchall()
    conn.close()

    return [
        {"id": r[0], "sudoc": r[1], "title": r[2], "zip_file": r[3]}
        for r in rows
    ]


def get_marc_by_id(record_id: int) -> Optional[Record]:
    """
    Look up the given rowid in the SQLite index, find its ZIP filename,
    open the .mrc.zip, and return the pymarc.Record whose 086 field
    exactly matches the stored SuDoc call number.
    """
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
    """
    Serialize only DataFields (with indicators and subfields).
    ControlFields (no indicators) are skipped automatically.
    Subfields are gathered safely: multiple occurrences are
    concatenated into a comma-separated string.
    """
    rec = get_marc_by_id(record_id)
    if not rec:
        return []

    out = []
    for field in rec.get_fields():
        # Skip control fields by testing indicators
        try:
            ind1, ind2 = field.indicators
        except Exception:
            continue

        # Build a mapping of subfield code → value(s)
        subfields_map = {}
        for sf in field.subfields:
            # each sf is a pymarc.Subfield with .code and .value
            code = getattr(sf, "code", None)
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

        # Flatten lists into comma-separated strings for Pydantic
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
