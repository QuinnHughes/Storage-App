# backend/schemas/sudoc.py

from pydantic import BaseModel
from typing import Optional, Dict

class SudocSummary(BaseModel):
    id:        int
    sudoc:     str
    title:     str
    zip_file:  str
    oclc:      Optional[str]

class MarcFieldOut(BaseModel):
    tag:       str
    ind1:      str
    ind2:      str
    subfields: Dict[str, str]
