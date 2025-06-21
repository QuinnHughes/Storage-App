#!/usr/bin/env python
"""
Seed the database with an initial admin user if one doesn’t exist.
Run this once after you’ve created the `users` table.
"""

from db.session import get_db
from db.crud import get_user_by_username, create_user
from core.auth import hash_password

def main():
    db = next(get_db())
    existing = get_user_by_username(db, "quinnjh")
    if existing:
        print("user already exists.")
        return

    # Create admin with a secure default password (change immediately!)
    create_user(db, username="quinnjh", password="quinn", role="admin")
    print("admin user created.")

if __name__ == "__main__":
    main()
