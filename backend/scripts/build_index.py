# build_index.py — Create the SQLite SuDoc index for Streamlit lookup
# ---------------------------------------------------------------

import os
import zipfile
import sqlite3
from pymarc import MARCReader

# Directory containing .mrc.zip volumes
DATA_DIR = "Record_sets"
# Output SQLite database
DB_PATH = "cgp_sudoc_index.db"

# Initialize the database and index
def build_index():
    # Remove existing DB so re-running is clean
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # Create table for indexed SuDocs - ADD position_in_zip column
    cur.execute("""
        CREATE TABLE records (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            sudoc           TEXT NOT NULL,
            title           TEXT,
            zip_file        TEXT NOT NULL,
            position_in_zip INTEGER NOT NULL
        )
    """)
    conn.commit()

    # Walk through each volume
    for fn in sorted(os.listdir(DATA_DIR)):
        if not fn.lower().endswith(".mrc.zip"):
            continue
        zip_path = os.path.join(DATA_DIR, fn)
        inner_mrc = fn[:-4]  # strip off .zip extension
        print(f"Indexing {fn}...")

        try:
            with zipfile.ZipFile(zip_path) as zf, zf.open(inner_mrc) as stream:
                reader = MARCReader(stream, to_unicode=True, force_utf8=True)
                marc_position = 0  # Track actual MARC record position
                for rec in reader:
                    # Extract the title
                    title = rec.title() if callable(rec.title) else rec.title or ""
                    # Index each SuDoc (086) found in this record
                    for f in rec.get_fields("086"):
                        sudoc = f.value().strip()
                        cur.execute(
                            "INSERT INTO records (sudoc, title, zip_file, position_in_zip) VALUES (?, ?, ?, ?)",
                            (sudoc, title, fn, marc_position)
                        )
                    marc_position += 1  # Increment for next MARC record
                conn.commit()
        except zipfile.BadZipFile:
            print(f"⚠️ Skipped invalid ZIP: {fn}")

    conn.close()
    print(f"✅ Index built successfully: {DB_PATH}")

if __name__ == "__main__":
    if not os.path.isdir(DATA_DIR):
        print(f"Error: Data directory '{DATA_DIR}' not found.")
    else:
        build_index()
