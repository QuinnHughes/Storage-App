# build_index.py — Create the SQLite SuDoc index for Streamlit lookup
# ---------------------------------------------------------------

import os
import sqlite3
import zipfile
from pymarc import MARCReader
import sys
import traceback  # Added for better error reporting

# Add project root to path if needed
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Constants
BASE_DIR = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
RECORDS_DIR = os.path.join(BASE_DIR, "Record_sets")
INDEX_DB = os.path.join(BASE_DIR, "cgp_sudoc_index.db")

def build_index_with_byte_offsets():
    """Build an index of MARC records with byte offsets for direct access"""
    print(f"Building index with byte offsets - output: {INDEX_DB}")
    print(f"Reading MARC files from: {RECORDS_DIR}")
    
    conn = sqlite3.connect(INDEX_DB)
    
    # Drop existing table if it exists
    conn.execute("DROP TABLE IF EXISTS records")
    
    conn.execute("""
        CREATE TABLE records (
            id INTEGER PRIMARY KEY,
            sudoc TEXT,
            title TEXT,
            zip_file TEXT,
            marc_file TEXT,
            byte_offset INTEGER,
            record_length INTEGER,
            oclc TEXT
        )
    """)
    
    record_count = 0
    
    # Process each ZIP file
    for zip_file in sorted(os.listdir(RECORDS_DIR)):
        if not zip_file.endswith('.zip'):
            continue
            
        print(f"Processing {zip_file}...")
        zip_path = os.path.join(RECORDS_DIR, zip_file)
        
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                marc_files = [f for f in zf.namelist() if f.endswith('.mrc')]
                if not marc_files:
                    print(f"  No MARC files found in {zip_file}")
                    continue
                    
                marc_filename = marc_files[0]
                print(f"  Reading {marc_filename}")
                
                with zf.open(marc_filename) as marc_file:
                    # Track byte position
                    byte_pos = 0
                    file_record_count = 0
                    
                    try:
                        # Make sure MARCReader is imported correctly
                        reader = MARCReader(marc_file, to_unicode=True, force_utf8=True)
                        
                        # Iterate through each record
                        for record in reader:
                            try:
                                # Get record length from the record itself
                                record_data = record.as_marc()
                                record_length = len(record_data)
                                
                                # Extract SuDoc from 086 field
                                sudoc = None
                                for field in record.get_fields('086'):
                                    if field.indicator1 == '0':
                                        subfields_a = field.get_subfields('a')
                                        if subfields_a:
                                            sudoc = subfields_a[0]
                                            break
                                
                                # Get title
                                title = None
                                for field in record.get_fields('245'):
                                    title_parts = []
                                    for subfield_code in ('a', 'b', 'c'):
                                        subfield_values = field.get_subfields(subfield_code)
                                        if subfield_values:
                                            title_parts.append(subfield_values[0])
                                    if title_parts:
                                        title = ' '.join(title_parts)
                                        break
                                
                                # If no title found via fields, try the built-in method
                                if not title:
                                    try:
                                        title = record.title()
                                    except:
                                        title = "Unknown title"
                                
                                # Extract OCLC number from 035 field only
                                oclc = None
                                for field in record.get_fields('035'):
                                    subfields_a = field.get_subfields('a')
                                    for value in subfields_a:
                                        if '(OCoLC)' in value:
                                            # Extract just the number portion
                                            oclc = value.replace('(OCoLC)', '').strip()
                                            # Also remove any "ocm" or "ocn" prefixes if present
                                            oclc = oclc.replace('ocm', '').replace('ocn', '')
                                            break
                                    if oclc:
                                        break
                                
                                # Store in database with byte offset
                                conn.execute(
                                    "INSERT INTO records VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)",
                                    (sudoc, title, zip_file, marc_filename, byte_pos, record_length, oclc)
                                )
                                
                                # Update byte position for next record
                                byte_pos += record_length
                                file_record_count += 1
                                record_count += 1
                                
                                # Commit every 1000 records
                                if record_count % 1000 == 0:
                                    conn.commit()
                                    print(f"  Processed {record_count} records...")
                                    
                            except Exception as e:
                                print(f"  Error processing record: {e}")
                                # Still need to increment byte_pos based on record length
                                byte_pos += record_length if 'record_length' in locals() else 5000
                        
                    except Exception as e:
                        print(f"  Error reading MARC file: {e}")
                        print(traceback.format_exc())  # Print full traceback
                    
                    print(f"  Added {file_record_count} records from {marc_filename}")
                    conn.commit()
        except Exception as e:
            print(f"Error processing zip file {zip_file}: {e}")
            print(traceback.format_exc())  # Print full traceback
    
    # Create indexes for faster lookup
    print("Creating database indexes...")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sudoc ON records (sudoc)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON records (title)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_oclc ON records (oclc)")
    conn.commit()
    
    print(f"Index build complete. Total records indexed: {record_count}")
    conn.close()

if __name__ == "__main__":
    build_index_with_byte_offsets()
