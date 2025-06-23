# backend/schemas/user.py

from pydantic import BaseModel, Field
from typing import Optional, Annotated

class UserBase(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=50)]
    role: Annotated[str, Field(pattern=r"^(viewer|book_worm|cataloger|admin)$")]

class UserCreate(UserBase):
    password: Annotated[str, Field(min_length=6)]

class UserUpdate(BaseModel):
    username: Optional[Annotated[str, Field(min_length=3, max_length=50)]]
    password: Optional[Annotated[str, Field(min_length=6)]]
    role: Optional[Annotated[str, Field(pattern=r"^(viewer|book_worm|cataloger|admin)$")]]

class UserRead(UserBase):
    id: int

    model_config = {"from_attributes": True}

