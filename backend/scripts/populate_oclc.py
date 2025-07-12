#!/usr/bin/env python3
"""
populate_oclc.py

Populate the OCLC field in your cgp_sudoc_index.db by scanning
your local MARC ZIP bundles for OCLC numbers.

Usage:
    cd backend/scripts
    python populate_oclc.py [--repo /path/to/Record Sets]

By default it looks for a "Record Sets" folder in the parent directory
of this script (i.e. backend/Record Sets) and for the DB at
backend/cgp_sudoc_index.db.
"""

import os, sys, sqlite3, re, argparse, zipfile
from pymarc import MARCReader


def extract_oclc_from_record(rec):
    """
    Extract an OCLC from a pymarc Record:
    1) 035$a fields tagged with "(OCoLC)"
    2) Fallback: control field 001 if present and numeric
    """
    # 035$a search
    for fld in rec.get_fields('035'):
        for val in fld.get_subfields('a'):
            if val.startswith('(OCoLC)'):
                m = re.match(r'\(OCoLC\)(\d+)', val)
                if m:
                    return m.group(1)
    # fallback on 001 if exists
    cf = rec['001']
    if cf:
        v = cf.value().strip()
        if v.isdigit():
            return v
    return None


def main(args):
    script_dir = os.path.dirname(__file__)
    parent_dir = os.path.abspath(os.path.join(script_dir, os.pardir))
    # default Record Sets path
    default_rs = os.path.join(parent_dir, 'Record_Sets')
    if args.repo:
        repo_dir = os.path.abspath(args.repo)
    elif os.path.isdir(default_rs):
        repo_dir = default_rs
    else:
        repo_dir = parent_dir
        print(f"⚠️ 'Record Sets' not found at {default_rs}, scanning {parent_dir}", file=sys.stderr)

    if not os.path.isdir(repo_dir):
        print(f"❌ Repo not found: {repo_dir}", file=sys.stderr)
        sys.exit(1)

    db_path = os.path.abspath(args.db)
    if not os.path.isfile(db_path):
        print(f"❌ DB not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA synchronous = OFF;')
    conn.execute('PRAGMA journal_mode = MEMORY;')
    conn.execute('PRAGMA temp_store = MEMORY;')
    cur = conn.cursor()

    cur.execute("SELECT DISTINCT zip_file FROM records WHERE oclc IS NULL;")
    zip_files = sorted(r[0] for r in cur.fetchall())
    if not zip_files:
        print("✅ No missing OCLC entries—done.")
        return

    UPDATE_SQL = "UPDATE records SET oclc = ? WHERE rowid = ?;"
    BATCH_SIZE = 5000
    total_updated = 0

    for zf in zip_files:
        zip_path = os.path.join(repo_dir, zf)
        if not os.path.isfile(zip_path):
            print(f"⚠️ Missing ZIP: {zip_path}", file=sys.stderr)
            continue

        cur.execute(
            "SELECT rowid FROM records WHERE zip_file = ? AND oclc IS NULL ORDER BY rowid",
            (zf,)
        )
        rowids = [r[0] for r in cur.fetchall()]
        if not rowids:
            continue

        print(f"🔍 Processing {zf} ({len(rowids)} rows)…")
        ops = []

        try:
            with zipfile.ZipFile(zip_path) as z:
                members = [n for n in z.namelist() if n.lower().endswith('.mrc')]
                if not members:
                    print(f"❌ No .mrc in {zf}", file=sys.stderr)
                    continue
                with z.open(members[0]) as fh:
                    reader = MARCReader(fh, utf8_handling='ignore')
                    for idx, rec in enumerate(reader):
                        if idx >= len(rowids):
                            break
                        rid = rowids[idx]
                        oclc = extract_oclc_from_record(rec)
                        if oclc:
                            ops.append((oclc, rid))

                        if len(ops) >= BATCH_SIZE:
                            cur.executemany(UPDATE_SQL, ops)
                            conn.commit()
                            total_updated += len(ops)
                            print(f"  …updated {total_updated}")
                            ops.clear()
        except zipfile.BadZipFile:
            print(f"❌ Bad ZIP: {zip_path}", file=sys.stderr)
            continue

        if ops:
            cur.executemany(UPDATE_SQL, ops)
            conn.commit()
            total_updated += len(ops)
            print(f"  …updated {total_updated}")
            ops.clear()

        print(f"✅ Done {zf}.")

    conn.close()
    print(f"🎉 Finished! Total rows updated: {total_updated}")


if __name__ == '__main__':
    p = argparse.ArgumentParser(__doc__)
    p.add_argument('--repo', help='Record Sets path (override default)')
    p.add_argument(
        '--db',
        default=os.path.abspath(
            os.path.join(os.path.dirname(__file__), os.pardir, 'cgp_sudoc_index.db')
        ),
        help='Path to cgp_sudoc_index.db'
    )
    args = p.parse_args()
    main(args)
