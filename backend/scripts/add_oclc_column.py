# backend/scripts/add_oclc_column.py

import sqlite3, os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DB_PATH  = os.path.join(BASE_DIR, "cgp_sudoc_index.db")

def main():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()
    try:
        cur.execute("ALTER TABLE records ADD COLUMN oclc TEXT;")
        print("✅ Added `oclc` column.")
    except sqlite3.OperationalError:
        print("ℹ️  `oclc` column already exists, skipping.")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    main()
