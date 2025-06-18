from pydantic import BaseModel
from typing import Dict, List

class SudocSummary(BaseModel):
    id: int
    sudoc: str
    title: str
    zip_file: str

class MarcFieldOut(BaseModel):
    tag: str
    ind1: str
    ind2: str
    subfields: Dict[str, str]
