# Storage App - Docker Deployment

## Quick Start (Using Pre-built Images)

1. **Download the docker-compose.prod.yml file**
2. **Run the application:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```
3. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/api/docs

## Default Login
- **Username:** quinnjh
- **Password** quinn
- **Role:** admin

## Container Images
- **Database:** `quinnhughes/storage-app-db:latest` (PostgreSQL 16 + Data)
- **Backend:** `quinnhughes/storage-app-backend:latest` (FastAPI)
- **Frontend:** `quinnhughes/storage-app-frontend:latest` (React + Nginx)

## System Requirements
- Docker & Docker Compose
- 6-8GB RAM minimum
- 5GB storage space

## Stopping the Application
```bash
docker-compose -f docker-compose.prod.yml down
```