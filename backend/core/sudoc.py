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

def get_record_fields(record_id: int, preserve_order: bool = False) -> List[dict]:
    """Get MARC fields for a record"""
    record = get_marc_by_id(record_id, include_edits=True)  # Always check for edits first
    if not record:
        return []
    
    # Sort the actual MARC record fields if not preserving order
    if not preserve_order:
        _sort_marc_record_fields(record)
    
    return _extract_fields_from_record(record, preserve_order=preserve_order)

def _sort_marc_record_fields(record):
    """Sort fields in a MARC record by tag number"""
    if not record:
        return
    
    # Get all fields and sort them by tag
    all_fields = list(record.fields)
    all_fields.sort(key=lambda field: field.tag)
    
    # Clear all fields from the record
    record.fields = []
    
    # Add them back in sorted order
    for field in all_fields:
        record.add_field(field)

def _extract_fields_from_record(record, preserve_order: bool = False) -> List[dict]:
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
    
    # Always sort fields by tag number for proper MARC order
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

def build_enhanced_008(child_records: List[Record], year_range: Optional[str] = None) -> str:
    """Build a comprehensive 008 field based on analysis of child records"""
    from datetime import datetime
    today = datetime.now().strftime('%y%m%d')
    
    # Analyze child records for 008 field data
    analysis = _analyze_records_for_008(child_records)
    
    # Date created (positions 0-5)
    result = today
    
    # Date type and dates (positions 6-14) - analyze publication patterns
    date_type, start_year, end_year = _determine_date_pattern(child_records, year_range)
    result += date_type
    
    # Format years properly (4 digits each)
    start_str = (start_year or "||||")[:4].ljust(4, '|') if start_year != "||||" else "||||"
    end_str = (end_year or "||||")[:4].ljust(4, '|') if end_year != "||||" else "||||"
    result += start_str + end_str
    
    # Place of publication (positions 15-17) - analyze 260/264 fields
    place = _determine_place_of_publication(child_records)
    result += place
    
    # Frequency (position 18) - analyze for serial patterns
    frequency = _determine_frequency(child_records)
    result += frequency
    
    # Regularity (position 19)
    regularity = "r" if frequency in "abcdefghijkmqstwz" else "|"
    result += regularity
    
    # Type of continuing resource (position 20)
    resource_type = _determine_resource_type(child_records)
    result += resource_type
    
    # Form of item (position 21) - analyze for format
    form = _determine_form_of_item(child_records)
    result += form
    
    # Form of original item (position 22)
    result += " "  # Usually blank for government docs
    
    # Nature of entire work (position 23) - analyze subjects/content
    nature = _determine_nature_of_work(child_records)
    result += nature
    
    # Government publication (position 24) - analyze for gov pub indicators
    gov_pub = _determine_government_publication(child_records)
    result += gov_pub
    
    # Conference publication (position 25) - analyze for conference indicators
    conference = _determine_conference_publication(child_records)
    result += conference
    
    # Festschrift (position 26) - analyze titles for festschrift indicators
    festschrift = _determine_festschrift(child_records)
    result += festschrift
    
    # Index (position 27) - analyze for index indicators
    index = _determine_index_present(child_records)
    result += index
    
    # Undefined (position 28)
    result += " "
    
    # Fiction (position 29) - analyze subjects for fiction
    fiction = _determine_fiction(child_records)
    result += fiction
    
    # Biography (position 30) - analyze subjects for biographical content
    biography = _determine_biography(child_records)
    result += biography
    
    # Language (positions 31-33) - analyze 041 fields or default
    language = _determine_language(child_records)
    result += language
    
    # Modified record (position 34)
    result += " "
    
    # Cataloging source (position 35)
    result += "d"  # Other
    
    return result

def _analyze_records_for_008(records: List[Record]) -> Dict[str, Any]:
    """Analyze child records to extract 008 field information"""
    analysis = {
        'years': [],
        'places': [],
        'languages': [],
        'subjects': [],
        'gov_indicators': [],
        'titles': [],
        'frequencies': []
    }
    
    for record in records:
        # Extract publication years from 260/264 fields
        for field in record.get_fields('260', '264'):
            for subfield in field.get_subfields('c'):
                # Extract 4-digit years
                import re
                years = re.findall(r'\b(19|20)\d{2}\b', subfield)
                analysis['years'].extend(years)
        
        # Extract places from 260/264 fields
        for field in record.get_fields('260', '264'):
            for subfield in field.get_subfields('a'):
                analysis['places'].append(subfield)
        
        # Extract languages from 041 fields or default to 008 if available
        lang_fields = record.get_fields('041')
        if lang_fields:
            for field in lang_fields:
                for subfield in field.get_subfields('a'):
                    analysis['languages'].append(subfield[:3])
        else:
            # Try to extract from existing 008 field
            f008 = record.get_fields('008')
            if f008 and len(f008[0].data) >= 35:
                lang = f008[0].data[35:38]
                if lang and lang != '   ':
                    analysis['languages'].append(lang)
        
        # Extract subjects
        for field in record.get_fields('650', '651', '653'):
            for subfield in field.get_subfields('a'):
                analysis['subjects'].append(subfield.lower())
        
        # Extract government publication indicators
        for field in record.get_fields('086'):  # SuDoc numbers indicate gov pubs
            analysis['gov_indicators'].append('f')
            
        # Extract titles for pattern analysis
        f245 = record.get_fields('245')
        if f245:
            title = ""
            for subfield in f245[0].get_subfields('a', 'b'):
                title += subfield + " "
            analysis['titles'].append(title.strip().lower())
    
    return analysis

def _determine_date_pattern(records: List[Record], year_range: Optional[str]) -> tuple:
    """Determine date type and start/end years based on record analysis"""
    analysis = _analyze_records_for_008(records)
    
    if not analysis['years']:
        if year_range:
            # Parse year range like "1990-1995" or "1990-"
            if '-' in year_range:
                parts = year_range.split('-')
                start = parts[0].strip()
                end = parts[1].strip() if len(parts) > 1 and parts[1].strip() else "9999"
                return ("c", start, end)  # Continuing resource
            else:
                return ("s", year_range, year_range)  # Single year
        return ("n", "||||", "||||")  # Unknown dates
    
    years = sorted(set(analysis['years']))
    start_year = years[0]
    end_year = years[-1]
    
    # Determine date type based on pattern
    if len(years) == 1:
        return ("s", start_year, start_year)  # Single date
    elif len(years) > 5:  # Multiple years suggests continuing resource
        # Check if it's ongoing (recent end date suggests continuation)
        from datetime import datetime
        current_year = datetime.now().year
        if int(end_year) >= current_year - 2:
            return ("c", start_year, "9999")  # Continuing
        else:
            return ("d", start_year, end_year)  # Ceased publication
    else:
        return ("m", start_year, end_year)  # Multiple dates

def _determine_place_of_publication(records: List[Record]) -> str:
    """Determine place of publication code"""
    analysis = _analyze_records_for_008(records)
    
    # Common place codes for government publications
    us_indicators = ['washington', 'dc', 'united states', 'u.s.', 'gpo', 'government printing']
    
    for place in analysis['places']:
        place_lower = place.lower()
        for indicator in us_indicators:
            if indicator in place_lower:
                return "dcu"  # Washington, D.C.
    
    # Default to US if no specific place found
    return "xxu"  # United States

def _determine_frequency(records: List[Record]) -> str:
    """Determine frequency of publication"""
    analysis = _analyze_records_for_008(records)
    
    # Analyze titles for frequency indicators
    frequency_indicators = {
        'annual': 'a',
        'yearly': 'a',
        'monthly': 'm',
        'quarterly': 'q',
        'weekly': 'w',
        'daily': 'd',
        'biennial': 'b',
        'triennial': 'c',
        'semiannual': 'f',
        'bimonthly': 'g',
        'semiweekly': 's'
    }
    
    for title in analysis['titles']:
        for indicator, code in frequency_indicators.items():
            if indicator in title:
                return code
    
    # If multiple years but no clear frequency, assume annual
    if len(set(analysis['years'])) > 1:
        return 'a'  # Annual
    
    return '|'  # Unknown frequency

def _determine_resource_type(records: List[Record]) -> str:
    """Determine type of continuing resource"""
    analysis = _analyze_records_for_008(records)
    
    # Analyze titles and subjects for resource type
    type_indicators = {
        'report': 'm',  # Monographic series
        'bulletin': 'p',  # Periodical
        'journal': 'p',  # Periodical
        'newsletter': 'n',  # Newsletter
        'directory': 'd',  # Directory
        'yearbook': 'a',  # Annual
        'proceedings': 'm',  # Monographic series
        'series': 'm'  # Monographic series
    }
    
    for title in analysis['titles']:
        for indicator, code in type_indicators.items():
            if indicator in title:
                return code
    
    # Government publications are often monographic series
    if any('f' in gov for gov in analysis['gov_indicators']):
        return 'm'
    
    return '|'  # Unknown

def _determine_form_of_item(records: List[Record]) -> str:
    """Determine form of original item"""
    # For now, assume print unless electronic indicators found
    # Could be enhanced to check for electronic resource indicators
    return ' '  # None of the following (print)

def _determine_nature_of_work(records: List[Record]) -> str:
    """Determine nature of entire work"""
    analysis = _analyze_records_for_008(records)
    
    # Analyze subjects for content type
    nature_indicators = {
        'statistics': 's',
        'statistical': 's',
        'bibliography': 'b',
        'catalog': 'c',
        'dictionary': 'd',
        'encyclopedia': 'e',
        'handbook': 'h',
        'index': 'i',
        'law': 'l',
        'patent': 'p',
        'standard': 't',
        'technical report': 't',
        'thesis': 't',
        'treaty': 'y'
    }
    
    for subject in analysis['subjects']:
        for indicator, code in nature_indicators.items():
            if indicator in subject:
                return code
    
    return ' '  # None specified

def _determine_government_publication(records: List[Record]) -> str:
    """Determine government publication level"""
    analysis = _analyze_records_for_008(records)
    
    # Check for SuDoc numbers (086 fields) which indicate government publications
    for record in records:
        if record.get_fields('086'):
            return 'f'  # Federal government
    
    # Check subjects for government indicators
    gov_subjects = ['government', 'federal', 'department', 'agency']
    for subject in analysis['subjects']:
        for gov_indicator in gov_subjects:
            if gov_indicator in subject:
                return 'f'  # Federal government
    
    return ' '  # Not a government publication

def _determine_conference_publication(records: List[Record]) -> str:
    """Determine if conference publication"""
    analysis = _analyze_records_for_008(records)
    
    conference_indicators = ['conference', 'symposium', 'workshop', 'meeting', 'proceedings']
    
    for title in analysis['titles']:
        for indicator in conference_indicators:
            if indicator in title:
                return '1'  # Conference publication
    
    for subject in analysis['subjects']:
        for indicator in conference_indicators:
            if indicator in subject:
                return '1'  # Conference publication
    
    return '0'  # Not a conference publication

def _determine_festschrift(records: List[Record]) -> str:
    """Determine if festschrift"""
    analysis = _analyze_records_for_008(records)
    
    festschrift_indicators = ['festschrift', 'tribute', 'honor', 'memorial', 'commemoration']
    
    for title in analysis['titles']:
        for indicator in festschrift_indicators:
            if indicator in title:
                return '1'  # Is a festschrift
    
    return '0'  # Not a festschrift

def _determine_index_present(records: List[Record]) -> str:
    """Determine if index is present"""
    analysis = _analyze_records_for_008(records)
    
    index_indicators = ['index', 'indexes', 'indexed']
    
    for title in analysis['titles']:
        for indicator in index_indicators:
            if indicator in title:
                return '1'  # Index present
    
    for subject in analysis['subjects']:
        for indicator in index_indicators:
            if indicator in subject:
                return '1'  # Index present
    
    return '0'  # No index

def _determine_fiction(records: List[Record]) -> str:
    """Determine if fiction"""
    analysis = _analyze_records_for_008(records)
    
    # Government documents are typically not fiction
    fiction_indicators = ['fiction', 'novel', 'story', 'stories']
    
    for subject in analysis['subjects']:
        for indicator in fiction_indicators:
            if indicator in subject:
                return '1'  # Fiction
    
    return '0'  # Not fiction

def _determine_biography(records: List[Record]) -> str:
    """Determine biographical content level"""
    analysis = _analyze_records_for_008(records)
    
    bio_indicators = ['biography', 'biographical', 'memoir', 'autobiography']
    
    for subject in analysis['subjects']:
        for indicator in bio_indicators:
            if indicator in subject:
                return 'b'  # Biography
    
    for title in analysis['titles']:
        for indicator in bio_indicators:
            if indicator in title:
                return 'b'  # Biography
    
    return ' '  # No biographical content

def _determine_language(records: List[Record]) -> str:
    """Determine primary language"""
    analysis = _analyze_records_for_008(records)
    
    if analysis['languages']:
        # Return most common language
        from collections import Counter
        lang_counts = Counter(analysis['languages'])
        return lang_counts.most_common(1)[0][0]
    
    return 'eng'  # Default to English

def build_serial_008(year: Optional[str] = None) -> str:
    """Build a basic 008 field for serial/continuing resources"""
    from datetime import datetime
    today = datetime.now().strftime('%y%m%d')
    
    # Basic continuing resource 008 field
    result = today  # Date created (positions 0-5)
    result += 'c'   # Date type: continuing resource (position 6)
    
    # Publication dates (positions 7-14)
    if year:
        start_year = year[:4].ljust(4, '|') if year else "||||"
        result += start_year + "9999"  # Ongoing publication
    else:
        result += "||||9999"  # Unknown start, ongoing
    
    # Place of publication (positions 15-17)
    result += "dcu"  # Washington, D.C. (default for gov docs)
    
    # Frequency (position 18)
    result += "a"    # Annual (default for government serials)
    
    # Regularity (position 19)
    result += "r"    # Regular
    
    # Type of continuing resource (position 20)
    result += "m"    # Monographic series
    
    # Form of item (position 21)
    result += " "    # None of the following (print)
    
    # Form of original item (position 22)
    result += " "    # Usually blank
    
    # Nature of entire work (position 23)
    result += " "    # No specified nature
    
    # Government publication (position 24)
    result += "f"    # Federal government publication
    
    # Conference publication (position 25)
    result += "0"    # Not a conference publication
    
    # Festschrift (position 26)
    result += "0"    # Not a festschrift
    
    # Index (position 27)
    result += "0"    # No index
    
    # Undefined (position 28)
    result += " "
    
    # Fiction (position 29)
    result += "0"    # Not fiction
    
    # Biography (position 30)
    result += " "    # No biographical material
    
    # Language (positions 31-33)
    result += "eng"  # English
    
    # Modified record (position 34)
    result += " "
    
    # Cataloging source (position 35)
    result += "d"    # Other
    
    return result

def fix_alma_validation_issues(record: Record) -> Record:
    """Fix common Alma validation issues in MARC records"""
    
    # Fix 035 field indicators - Alma rejects indicator '9'
    for field in record.get_fields('035'):
        if field.indicator1 == '9' or field.indicator2 == '9':
            # Remove the problematic field
            record.remove_field(field)
            # Add it back with correct indicators
            new_field = Field(tag='035', indicators=[' ', ' '], subfields=field.subfields)
            record.add_field(new_field)
    
    # Fix 336/337/338 RDA fields for physical items
    # Remove existing RDA fields to rebuild them correctly
    for tag in ['336', '337', '338']:
        for field in list(record.get_fields(tag)):
            record.remove_field(field)
    
    # Add correct RDA fields for physical government documents
    # 336 - Content type
    record.add_field(Field(tag='336', indicators=[' ', ' '], subfields=[
        Subfield('a', 'text'),
        Subfield('b', 'txt'),
        Subfield('2', 'rdacontent')
    ]))
    
    # 337 - Media type (print for physical items, not "unmediated")
    record.add_field(Field(tag='337', indicators=[' ', ' '], subfields=[
        Subfield('a', 'print'),
        Subfield('b', 'p'),
        Subfield('2', 'rdamedia')
    ]))
    
    # 338 - Carrier type
    record.add_field(Field(tag='338', indicators=[' ', ' '], subfields=[
        Subfield('a', 'volume'),
        Subfield('b', 'nc'),
        Subfield('2', 'rdacarrier')
    ]))
    
    # Fix 043 field - ensure proper subfield formatting
    for field in list(record.get_fields('043')):
        record.remove_field(field)
        # Rebuild with separate subfields instead of semicolon separation
        for subfield in field.get_subfields('a'):
            # Split on semicolon and create separate subfields
            geographic_codes = [code.strip() for code in subfield.split(';')]
            new_subfields = [Subfield('a', code) for code in geographic_codes if code]
            if new_subfields:
                new_field = Field(tag='043', indicators=[' ', ' '], subfields=new_subfields)
                record.add_field(new_field)
                break  # Only process the first 043 field
    
    return record

def create_government_series_host_record(
    title: str,
    series: Optional[str],
    publisher: Optional[str],
    series_number: Optional[str],
    year: Optional[str],
    subjects: Optional[List[str]],
    child_records: Optional[List[Record]] = None
) -> Record:
    """Create a new MARC record for a government series host with enhanced 008 field"""
    rec = Record(force_utf8=True)
    rec.leader = "00000cas a2200000   4500"  # Changed to 'cas' for continuing resource
    
    # 008 - enhanced format using child record analysis
    if child_records:
        rec.add_field(Field(tag='008', data=build_enhanced_008(child_records, year)))
    else:
        rec.add_field(Field(tag='008', data=build_serial_008(year)))
    
    # 040 - Cataloging source (standard for new records)
    rec.add_field(Field(tag='040', indicators=[' ', ' '], subfields=[
        Subfield('b', 'eng'),
        Subfield('c', 'GPO'),
        Subfield('d', 'GPO')
    ]))
    
    # 042 - Authentication code
    rec.add_field(Field(tag='042', indicators=[' ', ' '], subfields=[
        Subfield('a', 'pcc')
    ]))
    
    # 245 - Title
    rec.add_field(Field(tag='245', indicators=['0','0'], subfields=[
        Subfield('a', title.rstrip(' /:;') + '.')
    ]))
    
    # 336/337/338 - RDA content/media/carrier for physical government documents
    rec.add_field(Field(tag='336', indicators=[' ', ' '], subfields=[
        Subfield('a', 'text'),
        Subfield('b', 'txt'),
        Subfield('2', 'rdacontent')
    ]))
    
    rec.add_field(Field(tag='337', indicators=[' ', ' '], subfields=[
        Subfield('a', 'print'),
        Subfield('b', 'p'),
        Subfield('2', 'rdamedia')
    ]))
    
    rec.add_field(Field(tag='338', indicators=[' ', ' '], subfields=[
        Subfield('a', 'volume'),
        Subfield('b', 'nc'),
        Subfield('2', 'rdacarrier')
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
    """Remove prior boundwith 773/774 fields to avoid duplicates.
    Updated to handle both old (ind2==8) and new (ind2==0) boundwith fields."""
    remove = []
    for f in rec.get_fields('773', '774'):
        # Remove fields with either indicator pattern used for boundwiths
        if f.indicator2 in ['8', '0']:
            # Additional check: only remove if it has boundwith-style subfields
            subfields = f.get_subfields('i')
            if subfields and any(phrase in subfields[0].lower() for phrase in ['bound with', 'contains']):
                remove.append(f)
    for f in remove:
        rec.remove_field(f)

def _extract_sorting_info(record: Record) -> dict:
    """Extract date and enumeration information for sorting 774 fields"""
    import re
    
    # Extract date information
    date_sort = None
    
    # Try 008 field for date
    field_008 = record.get_fields('008')
    if field_008:
        date_data = field_008[0].data
        if len(date_data) >= 11:
            # Extract date1 (positions 7-10)
            date1 = date_data[7:11]
            if date1.isdigit():
                date_sort = int(date1)
    
    # Try 260/264 fields for publication date
    if not date_sort:
        for tag in ['264', '260']:
            for field in record.get_fields(tag):
                for subfield in field.get_subfields('c'):
                    # Extract first 4-digit year found
                    year_match = re.search(r'\b(19|20)\d{2}\b', subfield)
                    if year_match:
                        date_sort = int(year_match.group())
                        break
                if date_sort:
                    break
            if date_sort:
                break
    
    # Extract enumeration information from title
    enum_sort = None
    title_field = record.get_fields('245')
    if title_field:
        title = title_field[0].get_subfields('a')[0] if title_field[0].get_subfields('a') else ""
        
        # Look for volume, number, part patterns
        vol_match = re.search(r'\bv(?:ol(?:ume)?)?\.?\s*(\d+)', title, re.IGNORECASE)
        no_match = re.search(r'\bn(?:o|umber)?\.?\s*(\d+)', title, re.IGNORECASE)
        pt_match = re.search(r'\bp(?:ar)?t\.?\s*(\d+)', title, re.IGNORECASE)
        
        if vol_match:
            enum_sort = int(vol_match.group(1)) * 1000  # Volume gets priority
        elif no_match:
            enum_sort = int(no_match.group(1))
        elif pt_match:
            enum_sort = int(pt_match.group(1))
    
    return {
        'date': date_sort or 9999,  # Unknown dates sort last
        'enumeration': enum_sort or 9999,  # Unknown enum sorts last
        'title': title_field[0].get_subfields('a')[0] if title_field and title_field[0].get_subfields('a') else ""
    }

def _sort_child_records_for_774(child_data: list) -> list:
    """Sort child records by date then enumeration for proper 774 field ordering"""
    def sort_key(item):
        record_id, record = item
        info = _extract_sorting_info(record)
        # Primary sort by date, secondary by enumeration, tertiary by title
        return (info['date'], info['enumeration'], info['title'])
    
    return sorted(child_data, key=sort_key)

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
    """Build 774 field data for preview - FIXED FOR ALMA COMPLIANCE"""
    title = build_normalized_child_title(child)
    w = _preferred_control_number(child, fallback_id)
    
    result = {"i": "Contains (work):", "t": title, "w": w, "9": "related"}
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

    # Sort child records for proper 774 ordering
    child_data = list(zip(record_ids, recs))
    sorted_child_data = _sort_child_records_for_774(child_data)
    
    lines_774: List[Dict[str,str]] = []
    for ordinal, (rid, r) in enumerate(sorted_child_data, 1):
        lines_774.append(build_774_line(r, str(rid), ordinal))

    return {
        "host_title": host_title,
        "publisher": publisher,
        "year_range": year_range,
        "subjects": subjects,
        "lines_774": lines_774,
    }

# Add this function to lookup records by OCLC number
def create_945_field(call_number: str = None, barcode: str = None, location: str = None, 
                    library: str = None, item_policy: str = None) -> Field:
    """Create a 945 field for Alma import profile with physical item information.
    
    The 945 field is used by Alma import profiles to create physical inventory
    alongside bibliographic records during import.
    
    Args:
        call_number: Item call number (945 $a)
        barcode: Item barcode (945 $b) 
        location: Location code (945 $l)
        library: Library code (945 $m)
        item_policy: Item policy/type (945 $t)
        
    Returns:
        Field: A properly formatted 945 MARC field
    """
    subfields = []
    
    # Add subfields in proper order for Alma import
    if call_number:
        subfields.append(Subfield(code='a', value=call_number))
    if barcode:
        subfields.append(Subfield(code='b', value=barcode))
    if location:
        subfields.append(Subfield(code='l', value=location))
    if library:
        subfields.append(Subfield(code='m', value=library))
    if item_policy:
        subfields.append(Subfield(code='t', value=item_policy))
    
    return Field(tag='945', indicators=[' ', ' '], subfields=subfields)

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
                    # Apply Alma validation fixes to edited records
                    rec = fix_alma_validation_issues(rec)
                    return rec
        
        # Check for created record
        created = crud.get_created_record(db, record_id)
        if created:
            rec = next(MARCReader(BytesIO(created.marc_data), to_unicode=True, force_utf8=True), None)
            if rec:
                # Apply Alma validation fixes to created records
                rec = fix_alma_validation_issues(rec)
                return rec
    
    # Check SQLite as fallback
    sqlite_record = _get_original_marc_by_id(record_id)
    if sqlite_record:
        # Apply Alma validation fixes to original records too
        sqlite_record = fix_alma_validation_issues(sqlite_record)
    return sqlite_record