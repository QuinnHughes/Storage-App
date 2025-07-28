import os, sys, sqlite3, re, argparse, zipfile
from pymarc import MARCReader


def extract_oclc_from_record(rec):
    # 1) look for 035$a starting with "(OCoLC)"
    for fld in rec.get_fields('035'):
        for val in fld.get_subfields('a'):
            if val.startswith('(OCoLC)'):
                m = re.match(r'\(OCoLC\)(\d+)', val)
                if m:
                    return m.group(1)
    # 2) fallback to 001 if purely numeric
    cf = rec.get_fields('001')
    if cf:
        v = cf[0].value().strip()
        if v.isdigit():
            return v
    return None


def main(args):
    # locate scripts & data
    script_dir = os.path.dirname(__file__)
    parent_dir = os.path.abspath(os.path.join(script_dir, os.pardir))
    default_rs = os.path.join(parent_dir, 'Record_sets')
    repo_dir = os.path.abspath(args.repo) if args.repo else (
        default_rs if os.path.isdir(default_rs) else parent_dir
    )

    db_path = os.path.abspath(args.db)
    if not os.path.isdir(repo_dir):
        print(f"❌ Record Sets not found: {repo_dir}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(db_path):
        print(f"❌ DB not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False)
    # speed-ups
    conn.execute('PRAGMA busy_timeout = 30000;')
    conn.execute('PRAGMA synchronous = OFF;')
    conn.execute('PRAGMA journal_mode = MEMORY;')
    conn.execute('PRAGMA temp_store = MEMORY;')
    cur = conn.cursor()

    # find all ZIPs with missing OCLC
    cur.execute("SELECT DISTINCT zip_file FROM records WHERE oclc IS NULL;")
    zip_files = [r[0] for r in cur.fetchall()]
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

        # 1) grab all rowids *and* their SuDoc call numbers
        cur.execute(
            "SELECT rowid, sudoc FROM records WHERE zip_file = ? AND oclc IS NULL;",
            (zf,)
        )
        rows = cur.fetchall()
        if not rows:
            continue

        # build a map: callNumber → rowid
        sudoc_to_rowid = { sudoc.strip(): rid for rid, sudoc in rows }
        ops = []

        print(f"🔍 Processing {zf} ({len(rows)} missing)…")
        try:
            with zipfile.ZipFile(zip_path) as z:
                mrcs = [n for n in z.namelist() if n.lower().endswith('.mrc')]
                for member in mrcs:
                    with z.open(member) as fh:
                        reader = MARCReader(fh, utf8_handling='ignore')
                        for rec in reader:
                            # try to get this record's SuDoc
                            f086 = rec.get_fields('086')
                            if not f086 or 'a' not in f086[0]:
                                continue
                            call = f086[0]['a'].strip()
                            rid  = sudoc_to_rowid.get(call)
                            if not rid:
                                continue

                            oclc = extract_oclc_from_record(rec)
                            if oclc:
                                ops.append((oclc, rid))
                                # avoid updating twice
                                del sudoc_to_rowid[call]

                            if len(ops) >= BATCH_SIZE:
                                cur.executemany(UPDATE_SQL, ops)
                                conn.commit()
                                total_updated += len(ops)
                                print(f"  …updated {total_updated}")
                                ops.clear()
                        # end reader
                    # end with member
                # end for each .mrc
        except zipfile.BadZipFile:
            print(f"❌ Bad ZIP: {zip_path}", file=sys.stderr)
            continue

        # final batch
        if ops:
            cur.executemany(UPDATE_SQL, ops)
            conn.commit()
            total_updated += len(ops)
            print(f"  …updated {total_updated}")
            ops.clear()

        print(f"✅ Done {zf}.")
    # end for each zip

    conn.close()
    print(f"🎉 Finished! Total rows updated: {total_updated}")


if __name__ == '__main__':
    p = argparse.ArgumentParser(__doc__)
    p.add_argument('--repo', help='Record_Sets path override')
    p.add_argument(
        '--db',
        default=os.path.abspath(
          os.path.join(os.path.dirname(__file__), os.pardir, 'cgp_sudoc_index.db')
        ),
        help='Path to cgp_sudoc_index.db'
    )
    args = p.parse_args()
    main(args)