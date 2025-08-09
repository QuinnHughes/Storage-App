# backend/db/session.py

import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()  # looks for a .env file in the backend

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is not set. "
        "Did you forget to create a .env file or export the variable?"
    )

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Check database connection in db/session.py
def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        print(f"Database connection error: {e}")
        raise
    finally:
        db.close()
