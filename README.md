# Antigravity Resume Builder

A full-stack AI-powered Resume Builder that tailors your resume to specific job descriptions using **Google Gemini** (for content optimization and ATS scoring) and **RenderCV** (for high-quality LaTeX/PDF generation).

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

* **AI Resume Tailoring**: Automatically rewrites your resume summaries and bullet points to match a specific Job Description (JD) using Gemini 3.
* **ATS Scoring**: Analyzes your resume against the JD to provide a match score, feedback, and identify missing keywords.
* **PDF Generation**: Converts the optimized YAML resume into a professional PDF using LaTeX (via RenderCV).
* **Modern UI**: Sleek, dark-mode/glassmorphism interface built with Next.js and Tailwind CSS.
* **Privacy Focused**: Your API key stays with you (optional inputs).

---

## 🚀 Running Locally

### Prerequisites

1. **Node.js** (v18+)
2. **Python** (v3.10+)
3. **LaTeX Distribution**: Since this app generates PDFs locally, you need a LaTeX engine.
    * **MacOS**: `brew install --cask mactex` (or `mactex-no-gui`)
    * **Windows**: Install MiKTeX or TeX Live.
    * *Note: If you just want to run the code without PDF generation working locally, you can skip this, but the final step will fail.*

### 1. Backend Setup (FastAPI)

Navigate to the backend directory:

```bash
cd backend
```

Create a virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the server:

```bash
uvicorn main:app --reload --port 8000
```

The backend API will run at `http://localhost:8000`.

### 2. Frontend Setup (Next.js)

Open a new terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## ☁️ Deployment Guide

### Frontend -> Vercel

The frontend is a standard Next.js application and can be easily deployed to Vercel.

1. Push your code to GitHub (already done).
2. Go to [Vercel](https://vercel.com) and log in.
3. Click **"Add New Project"** and select your `resume-website` repository.
4. **Important**: Configure the **Root Directory** settings:
    * Edit the "Root Directory" to be `frontend`.
5. Click **Deploy**.

**Note on connecting to Backend**:
By default, the frontend tries to connect to `http://localhost:8000`. Once deployed, you need to update the fetch URL in `frontend/src/app/page.tsx` to point to your *deployed* backend URL.

* *Solution*: Use an Environment Variable (e.g., `NEXT_PUBLIC_API_URL`) in your frontend and set it in Vercel project settings.

### Backend -> Docker (Render / Railway / GCP)

**Why not Vercel for Backend?**
The backend requires a full **LaTeX installation** (approx. 500MB+ of system dependencies) to generate PDFs using RenderCV. Vercel Serverless functions have size limits that usually exclude LaTeX.

**Recommendation**: Deploy the backend as a **Docker Container** on platforms like **Render.com**, **Railway**, or **Google Cloud Run**.

1. **Create a `Dockerfile`** in the `backend/` folder (Sample provided below).
2. Push to GitHub.
3. Connect your repo to Render/Railway.
4. Set the Root Directory to `backend`.
5. The service will build the container (installing Python + LaTeX) and run the API.
6. Get your new Backend URL (e.g., `https://my-resume-api.onrender.com`) and update your Frontend to use it.

---

## 🛠️ Configuration

**Environment Variables (.env)**
Create a `.env` file in `backend/` if you want to preload your API key:

```
GEMINI_API_KEY=your_key_here
```
