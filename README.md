# Storage-App

A multifunctional web-based storage and inventory management app using FastAPI, PostgreSQL, and React (via Vite).

## 🔧 Tech Stack

- **Frontend**: React (Vite)
- **Backend**: FastAPI
- **Database**: PostgreSQL
- **ORM**: SQLAlchemy with asyncpg
- **Data Import**: XLSX (openpyxl + pandas)

## ⚙️ Setup Instructions

### Backend

1. Create `.env` in `backend/` with the following content:
    ```env
    DATABASE_URL=postgresql://quinnjh:quinn@10.2.30.91:5432/shelfdata
    ```

2. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

3. Run the backend server:
    ```bash
    uvicorn backend.main:app --reload
    ```

### Frontend

1. Navigate to `frontend/`:
    ```bash
    cd frontend
    ```

2. Install Node dependencies:
    ```bash
    npm install
    ```

3. Start the dev server:
    ```bash
    npm run dev
    ```

### 🗃 Features

- Upload and parse item data by shelf position
- Attach analytical metadata to matching items
- Review unmatched analytics ("items needing work")
- Compare uploaded vs stored data for consistency
- Admin-only editing interface (future implementation)

## 🛠 Project Structure

```
Storage-App/
├── backend/
│   ├── main.py
│   ├── crud.py
│   ├── database.py
│   ├── models.py
│   ├── schemas.py
│   ├── utils/
│   └── ...
├── frontend/
│   ├── src/pages/
│   ├── src/components/
│   ├── App.jsx
│   └── ...
├── .env
├── requirements.txt
├── README.md
└── .gitignore
```

---

© Quinn Hughes — 2025