from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import subprocess
import yaml
import google.generativeai as genai
import tempfile
import shutil
from dotenv import load_dotenv
import base64
import json

load_dotenv()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class GenerateRequest(BaseModel):
    job_description: str
    current_yaml: str
    api_key: str = None

class ATSAnalysis(BaseModel):
    score: int
    feedback: str
    missing_keywords: list[str]
    formatting_check: str

@app.post("/generate")
async def generate_resume_and_score(request: GenerateRequest):
    jd = request.job_description
    yaml_content = request.current_yaml
    api_key = request.api_key
    
    if not api_key and not os.environ.get("GEMINI_API_KEY"):
         raise HTTPException(status_code=400, detail="Gemini API Key is required")
    
    genai.configure(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
    model = genai.GenerativeModel('models/gemini-3-flash-preview')

    # --- Step 1: Resume Rewrite ---
    # --- Step 1: Resume Rewrite ---
    rewrite_prompt = f"""
    You are an elite, perfectionist Resume Writer. Your goal is to rewrite the resume YAML to be ATS-compliant and grammatically flawless.

    CRITICAL INSTRUCTIONS (Failure to follow these results in rejection):
    
    1. **ABSOLUTE ZERO REPETITION**: 
       - Do NOT use the same action verb more than once across the entire resume.
       - Do NOT repeat adjectives (e.g., if you use "Certified", do not use it again; use "Accredited", "Licensed", or rephrase). 
       - Synonyms are your friend. Use a rich vocabulary.
    
    2. **NO BUZZWORDS OR CLICHÉS**:
       - **Strictly BANNED**: "Solution-oriented", "Results-driven", "Team player", "Hardworking", "Passionate", "Strategic thinker", "Visionary", "Go-getter".
       - Replace these with **concrete facts**. Instead of "Solution-oriented", describe the actual solution implemented.
       - Keep the Tone: Professional, Objective, and Factual.
    
    3. **GRAMMAR & SPELLING**:
       - Use flawless Standard American English.
       - Ensure subject-verb agreement.
    
    4. **STAR METHOD & IMPACT**: 
       - Every bullet point must have a quantifiable result. 
       - Don't just list duties; list ACHIEVEMENTS.
    
    5. **INTELLIGENT TAILORING**:
       - Integrate keywords from the Job Description naturally. Do not keyword stuff.

    6. **SUMMARY REFINEMENT**:
       - The summary **MUST** explicitly state the total years of experience (e.g., "Cloud Engineer with 3+ years of experience..." or "Experienced Professional with..."). Calculate this strictly from the provided Experience history.

    Job Description:
    {jd}

    Current YAML:
    {yaml_content}
    """

    try:
        rewrite_response = model.generate_content(rewrite_prompt)
        new_yaml_content = rewrite_response.text
        if new_yaml_content.startswith("```yaml"):
            new_yaml_content = new_yaml_content.replace("```yaml", "").replace("```", "")
        if new_yaml_content.startswith("```"):
             new_yaml_content = new_yaml_content.replace("```", "")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Rewrite failed: {str(e)}")

    # --- Step 2: ATS Evaluation ---
    ats_prompt = f"""
    Act as an ATS (Applicant Tracking System) Score Checker. Evaluate the RESUME_YAML against the JOB_DESCRIPTION.
    
    Criteria:
    - Keyword Optimization: Matching skills, titles, qualifications.
    - Formatting & Structure: (Assume RenderCV handles layout perfectly, focus on logical content structure).
    - Content Quality: Quantifiable results (STAR method), no typos.
    - Readability: Flow and clarity.

    Benchmarks:
    90-100%: Excellent match.
    80-89%: Good match.
    70-79%: Fair match.
    Below 70%: Weak match.

    Return a JSON object with:
    - "score": integer (0-100)
    - "feedback": string (summary of strengths/weaknesses)
    - "missing_keywords": list of strings (important keywords missing from resume)
    - "formatting_check": string (comment on structure/content quality)

    RESUME_YAML:
    {new_yaml_content}

    JOB_DESCRIPTION:
    {jd}
    """

    ats_analysis = None
    try:
        ats_response = model.generate_content(ats_prompt)
        ats_text = ats_response.text
        # Clean markdown
        if ats_text.startswith("```json"):
            ats_text = ats_text.replace("```json", "").replace("```", "")
        if ats_text.startswith("```"):
             ats_text = ats_text.replace("```", "")
        ats_analysis = json.loads(ats_text)
    except Exception as e:
        print(f"ATS Error: {e}")
        # Fallback if parsing fails
        ats_analysis = {
            "score": 0, 
            "feedback": "Could not calculate ATS score due to AI response error.",
            "missing_keywords": [],
            "formatting_check": "Unknown"
        }

    # --- Step 3: Render PDF ---
    pdf_base64 = ""
    with tempfile.TemporaryDirectory() as temp_dir:
        input_yaml_path = os.path.join(temp_dir, "resume.yaml")
        with open(input_yaml_path, "w") as f:
            f.write(new_yaml_content)
        
        try:
            subprocess.run(["rendercv", "render", input_yaml_path], cwd=temp_dir, check=True)
            output_dir = os.path.join(temp_dir, "rendercv_output")
            pdf_file = None
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    if file.endswith(".pdf"):
                        pdf_file = os.path.join(root, file)
                        break
            
            if not pdf_file:
                raise Exception("PDF generation failed, file not found.")
            
            with open(pdf_file, "rb") as pdf_f:
                pdf_bytes = pdf_f.read()
                pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
                
        except Exception as e:
             raise HTTPException(status_code=500, detail=f"RenderCV failed: {str(e)}")

    return {
        "pdf_base64": pdf_base64,
        "ats_analysis": ats_analysis,
        "generated_yaml": new_yaml_content
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
