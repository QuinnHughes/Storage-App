#!/bin/bash
# Database initialization script

# Wait for PostgreSQL to be ready
until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for PostgreSQL to be ready..."
  sleep 2
done

# Restore the database from the custom format dump
echo "Restoring database from dump..."
pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v -Fc /docker-entrypoint-initdb.d/shelfdata.dump

echo "Database restoration completed."