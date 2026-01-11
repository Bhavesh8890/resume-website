from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
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
import base64
import json
import re
import io
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib import colors
from reportlab.lib import colors
import gspread
import requests
from bs4 import BeautifulSoup

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Manual OPTIONS Handler (CORS fix) ---
@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    from fastapi.responses import JSONResponse
    response = JSONResponse(content={})
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS, PUT, DELETE"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# --- Data Models ---

class RewriteRequest(BaseModel):
    job_description: str
    current_yaml: str
    target_region: str = "international"
    user_comments: str = ""
    model_version: str = "gemini-3-flash-preview"
    api_key: str = None

class ATSRequest(BaseModel):
    job_description: str
    resume_yaml: str
    api_key: str = None

class RenderRequest(BaseModel):
    resume_yaml: str
    theme: str = "classic"

class AIAnalysisRequest(BaseModel):
    resume_yaml: str
    api_key: str = None

class CoverLetterRequest(BaseModel):
    job_description: str
    resume_yaml: str
    api_key: str = None

class RenderCoverLetterRequest(BaseModel):
    resume_yaml: str
    cover_letter_text: str
    theme: str = "classic"

class VersionRequest(BaseModel):
    name: str
    yaml_content: str
    theme: str = "classic"

class LinkedInRequest(BaseModel):
    resume_yaml: str
    job_description: str = "" 
    recruiters_name: str = ""
    recruiters_role: str = ""
    company_name: str = ""
    type: str = "connection" # 'connection' or 'message'
    api_key: str = None

# --- Helper Functions ---

def get_gemini_model(api_key: str = None, model_version: str = "models/gemini-3-flash-preview"):
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="Gemini API Key is required")
    genai.configure(api_key=key)
    
    # User strictly requested this model name
    # We will trust the user has access to this specific preview model
    if "gemini-3" in model_version or "flash" in model_version:
         model_version = "models/gemini-3-flash-preview" 

    print(f"Using AI Model: {model_version}")
    return genai.GenerativeModel(model_version)

# --- Endpoints ---

@app.get("/")
def health_check():
    return {"status": "healthy", "message": "Antigravity Resume Backend is Running"}

@app.post("/rewrite")
async def rewrite_resume(request: RewriteRequest):
    model = get_gemini_model(request.api_key, request.model_version)
    
    # --- Step 1: Keyword Extraction (The "Brain" Step) ---
    # We first identify exactly what an ATS would look for.
    identify_keywords_prompt = f"""
    Analyze the following Job Description and identify the Top 15-20 most critical technical keywords, hard skills, tools, and certifications.
    Focus on specific technologies (e.g., "React", "AWS Lambda", "Terraform") rather than generic terms.
    
    Return **ONLY** a JSON list of strings. Do not include any other text.
    Example: ["Python", "FastAPI", "AWS", "Docker", "Agile"]
    
    Job Description:
    {request.job_description}
    """
    
    keywords = []
    try:
        kw_response = model.generate_content(identify_keywords_prompt)
        text = kw_response.text.strip()
        # Clean potential markdown code blocks
        if text.startswith("```json"):
            text = text.replace("```json", "").replace("```", "")
        elif text.startswith("```"):
            text = text.replace("```", "")
        keywords = json.loads(text)
        print(f"DEBUG: Extracted Keywords: {keywords}")
    except Exception as e:
        print(f"DEBUG: Keyword extraction failed, proceeding with generic rewrite. Error: {e}")
        keywords = []

    # --- Region Specific Instructions ---
    region_instructions = ""
    if request.target_region == "germany":
        region_instructions = """
    6. **GERMAN REGION STANDARDS (Lebenslauf)**:
       - **Tone**: Strictly factual, formal, and results-oriented (Tech focus). Avoid "salesy" adjectives.
       - **Mandatory Personal Data**: You MUST include `birth_date` (YYYY-MM-DD), `nationality`, `address` (full street address), and `marital_status` in the `basics` section.
       - **Photo**: Include `picture: "path/to/photo.jpg"` in `basics` (standard practice in Germany).
       - **Kurzprofil (Professional Summary)**: Include a 3-4 sentence section at the top. Format: Core Tech Stack + Years of Experience + One Major Achievement (e.g. "Senior DevOps Engineer with 8 years...").
       - **Technical Skills Matrix**: Create a highly detailed `skills` section. Use specific categories (e.g., "Languages", "Cloud/DevOps", "Databases") and indicate proficiency levels where possible.
       - **Languages**: Use the CEFR scale (e.g. "English (C2 - Native/Fluent)", "German (A2 - Basic)").
       - **Certifications**: Explicitly list certifications with acquisition dates.
       - **Hard Facts**: Focus on quantifiable impact (e.g. "Reduced API latency by 30%").
       - **Signature**: Add a custom field or section for `signature: "[City, Date]"` at the end.
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD` (renderer handles display).
        """
    elif request.target_region == "dubai":
        region_instructions = """
    6. **DUBAI / UAE REGION STANDARDS**:
       - **Strict Professional Tone**: Use professional English. Avoid slang or overly casual language.
       - **Mandatory Personal Details**: You MUST include `nationality`, `visa_status`, `marital_status`, and `date_of_birth` (YYYY-MM-DD) in the `basics` section.
       - **Photo Placeholder**: Include `picture: "path/to/photo.jpg"` in the `basics` section (this is a placeholder for a professional headshot).
       - **Professional Summary**: Include a "Professional Summary" section at the top. It must be a 3-4 line snapshot of experience, industry expertise, and key achievements.
       - **Work Experience**: 
          - Reverse-chronological order.
          - Include a brief one-line description of the company business for each role if possible (e.g. as the first bullet).
          - Use bullet points focusing on **quantifiable achievements** (e.g., "Increased sales by 20%"), not just tasks.
       - **Education & Skills**: 
          - Highlight degrees and RELEVANT certifications (PMP, CFA, etc.).
          - Include a "Languages" section in headers or skills if multilingual (e.g. English, Arabic, Hindi).
       - **Formatting**: Keep the structure linear and clean (1 column style logic).
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD`.
        """
    elif request.target_region == "uk":
        region_instructions = """
    6. **UK REGION STANDARDS**:
       - **Format**: Reverse-Chronological. Prioritize recent, high-level achievements (last 10-15 years).
       - **Header**: Name, Job Title, Mobile, Email, Location (City, Postcode ONLY), LinkedIn.
       - **Personal Statement**: 3-5 line summary at the top. Highlight years of experience, technical niche, and a standout quantifiable achievement.
       - **Key Skills**: Scannable list of 6-10 competencies. Split into Hard Skills (e.g. AWS, Python) and Soft Skills.
       - **British English**: Use "Optimised", "Organised", "Programme", "Centre".
       - **Impact**: Use Laszlo Bock formula: "Accomplished [X] as measured by [Y], by doing [Z]".
       - **Strict Prohibitions**: NO Photos, NO Date of Birth, NO Marital Status, NO Nationality, NO Full Address.
       - **Certifications**: Highlight industry standards (AWS, Azure, PRINCE2) in a dedicated section.
       - **References**: Add a section `references` with "References available upon request".
       - **Date Format**: ISO 8601 `YYYY-MM-DD`.
        """
    elif request.target_region == "usa":
        region_instructions = """
    6. **USA REGION STANDARDS**:
       - **Format**: Reverse-Chronological. Single-column logic. No tables.
       - **Header**: Name, Phone, Email, Location (City, State), LinkedIn, GitHub/Portfolio.
       - **Professional Summary**: 2-4 sentence "hook". Years of experience, core tech stack, major achievement ("Led cloud migration reducing costs by 25%").
       - **Technical Skills**: Categorize skills (Languages, Cloud, DevOps) for skimmability.
       - **Work Experience**: Focus on ACCOMPLISHMENTS over duties.
       - **Formula**: "Accomplished [X] as measured by [Y], by doing [Z]".
       - **Action Verbs**: Start every bullet with strong verbs (Architected, Automated, Spearheaded, Optimized).
       - **Quantified Impact**: Percentages, dollar amounts, user growth.
       - **Strict Prohibitions**: NO `age`, `date_of_birth`, `marital_status`, `religion`, `gender`, `picture`.
       - **American English**: "Optimized", "Center", "Program".
       - **Date Format**: ISO 8601 `YYYY-MM-DD`.
        """
    else:
        # Default / International
        region_instructions = """
    6. **INTERNATIONAL / GLOBAL STANDARDS (Default)**:
       - Follow standard best practices for modern ATS systems.
       - Focus on clarity, strong action verbs, and quantifiable achievements.
       - Use neutral, professional English (American or British is fine, just be consistent).
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD`.
        """

    # --- Step 2: Targeted Rewrite (The "Action" Step) ---
    custom_instructions = ""
    if request.user_comments:
        custom_instructions = f"""
    7. **USER CUSTOM INSTRUCTIONS (TOP PRIORITY)**:
       The user has provided the following specific instructions. You MUST follow these above all else (except for preventing hallucinations):
       "{request.user_comments}"
       """

    rewrite_prompt = f"""
    You are a Strategic Resume Optimizer. Your goal is to maximize the ATS score (aiming for 100/100) for the given Job Description while ensuring the text PASSES AI DETECTION (Human Score > 85%).

    INPUT DATA:
    1. **Critial Keywords to Inject**: {keywords}
    2. **Job Description**:
    {request.job_description}
    3. **Current Resume (YAML)**:
    {request.current_yaml}

    CRITICAL INSTRUCTIONS - "ANTI-AI" MODE ENGAGED:

    1. **DEFEAT AI DETECTORS (Top Priority)**:
       - **HIGH PERPLEXITY**: Avoid predictable word chains. Do not choose the most statistically probable next word. Use more specific, varied, or slightly "imperfect" but professional phrasings.
       - **HIGH BURSTINESS**: Vary your sentence structure. Do NOT use the same "Action Verb + Task + Result" pattern for every single bullet.
         - Mix short, punchy sentences with longer, complex clauses.
         - Occasionally start with the Result ("Reduced costs by 20% by...") instead of the Action.
       - **NO REPETITIVE PATTERNS**: Do not start consecutive bullets with the same part of speech.

    2. **BANNED VOCABULARY (Strict Enforcement)**:
       - **NEVER** use these "AI-giveaway" words/phrases:
         - "Spearheaded", "Orchestrated", "Navigating", "Meticulous", "Paramount"
         - "Delve", "Tapestry", "Unleashed", "Transformative", "Foster", "Leverage"
         - "Utilizing", "Showcasing", "Ensuring", "Facilitated", "Augmenting"
       - **Alternatives**:
         - Instead of "Spearheaded" -> "Led", "Ran", "Directed".
         - Instead of "Orchestrated" -> "Built", "Managed", "Fixed".
         - Instead of "Leverage" -> "Use", "Apply".
       - **TEST**: If a sentence sounds like a corporate press release, REWRITE IT to sound like a human engineer talking to another engineer.

    3. **NO HALLUCINATIONS**:
       - **NEVER** invent new Job Titles, Company Names, Dates, or Locations.
       - **NEVER** add a new entry to the `experience` section that does not exist in the input.
       - You strictly ONLY enhance the *bullet points* inside existing roles.
       - **PRESERVE DATE FORMATS**: Keep strict ISO 8601 formatting or original consistency.

    4. **PRESERVE HEADER / BASICS**:
       - You **MUST** retain the `basics` section exactly as is.
       - **MANDATORY**: `name`, `email`, `phone`, `website`, `location`, `social_networks` MUST be present in output.

    5. **ATS OPTIMIZATION**:
       - Naturally integrate the "Critical Keywords": {keywords}
       - Place them in context. Do not "stuff" them.
       - Quantify results (numbers, $, %) where possible, but keep it realistic.

    6. **NO MARKDOWN**:
       - **DO NOT** use bolding (**Text**) or italics. Pure plain text only.

    {region_instructions}

    {custom_instructions}

    **FINAL OUTPUT FORMAT**:
    Return ONLY the YAML. Start immediately with `cv:`.
    """

    try:
        rewrite_response = model.generate_content(rewrite_prompt)
        new_yaml_content = rewrite_response.text
        
        # Robust Cleaning
        match = re.search(r"```(?:yaml)?\n(.*?)```", new_yaml_content, re.DOTALL)
        if match:
            new_yaml_content = match.group(1)
        
        # Remove any leading text before "cv:" if regex didn't catch it
        if "cv:" in new_yaml_content:
            preamble_check = new_yaml_content.split("cv:", 1)
            # If there's a lot of text before 'cv:', it's probably chat.
            if len(preamble_check[0]) < 50: # Maybe just indentation or newline
                 pass 
            else:
                 # Aggressive strip: Find the first "cv:" and take everything from there
                 new_yaml_content = "cv:" + preamble_check[1]

        # Analytics
        usage = getattr(rewrite_response, 'usage_metadata', None)
        tokens_input = usage.prompt_token_count if usage else 0
        tokens_output = usage.candidates_token_count if usage else 0
        
        log_event("resume_generated", {
            "target_region": request.target_region, 
            "model": request.model_version,
            "tokens_input": tokens_input,
            "tokens_output": tokens_output
        })

        # Sanitize: Remove markdown bolding (double asterisks) to prevent YAML alias errors
        # Replaces **Text** with Text
        new_yaml_content = new_yaml_content.replace("**", "")
        
        new_yaml_content = new_yaml_content.strip()
        
        # --- CRITICAL FIX Check for Header Structure ---
        # AI often puts contact info in 'basics', but RenderCV often needs them at 'cv' root or vice versa depending on version.
        # We enforce a Flattened Structure for safety: if 'basics' exists, move keys to 'cv' root.
        try:
            data = yaml.safe_load(new_yaml_content)
            if data and "cv" in data:
                cv_data = data["cv"]
            elif data and "name" in data: # AI forgot 'cv' root key entirely
                 cv_data = data
                 data = {"cv": cv_data}
            else:
                 cv_data = {}

            # Fallback: Check if 'basics' exists and lift fields
            if "basics" in cv_data:
                basics = cv_data["basics"]
                # Copy standard fields if they are missing at root
                for key in ["name", "email", "phone", "location", "website", "social_networks"]:
                    if key in basics and key not in cv_data:
                        cv_data[key] = basics[key]
            
            # FORCE STRING TYPE for phone to prevent RenderCV validation error
            if "phone" in cv_data:
                cv_data["phone"] = str(cv_data["phone"])

            # --- RECURSIVE FIX for "Present" -> "present" case sensitivity in RenderCV ---
            def recursive_lowercase_present(obj):
                if isinstance(obj, dict):
                    return {k: recursive_lowercase_present(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [recursive_lowercase_present(i) for i in obj]
                elif isinstance(obj, str):
                    if obj.strip().lower() in ["present", "current", "now"]:
                        return "present"
                    return obj
                return obj

            data = recursive_lowercase_present(data)
            cv_data = data["cv"] # Re-bind after recursion

            # --- FIX REFERENCES SECTION STRUCTURE ---
            # RenderCV expects sections to be lists. If AI made 'references' a string, wrap it.
            if "sections" in cv_data and "references" in cv_data["sections"]:
                refs = cv_data["sections"]["references"]
                if isinstance(refs, str):
                     cv_data["sections"]["references"] = [refs] # Wrap in list -> TextEntry
                elif isinstance(refs, list):
                     # If it's a list of strings, it's allowed (TextEntry).
                     # If it's a list of dicts, it might be failing if keys don't match.
                     # Force it to simple text if it looks complex and is failing
                     pass 

            # --- FIX SIGNATURE SECTION STRUCTURE ---
            # Similar to references, signature needs to be a list
            if "sections" in cv_data and "signature" in cv_data["sections"]:
                sig = cv_data["sections"]["signature"]
                if isinstance(sig, str):
                     cv_data["sections"]["signature"] = [sig] # Wrap in list -> TextEntry 

            # Re-dump to string
            new_yaml_content = yaml.dump(data, allow_unicode=True, sort_keys=False)
            
        except Exception as parse_e:
            print(f"Warning: Post-process YAML fix failed: {parse_e}")
            # Continue with original content if fix fails

        return {"yaml": new_yaml_content}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Rewrite failed: {str(e)}")

@app.post("/ats_score")
async def calculate_ats_score(request: ATSRequest):
    model = get_gemini_model(request.api_key)

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
    {request.resume_yaml}

    JOB_DESCRIPTION:
    {request.job_description}
    """

    try:
        ats_response = model.generate_content(ats_prompt)
        ats_text = ats_response.text
        
        # Clean markdown
        if ats_text.startswith("```json"):
            ats_text = ats_text.replace("```json", "").replace("```", "")
        if ats_text.startswith("```"):
             ats_text = ats_text.replace("```", "")
        
        ats_analysis = json.loads(ats_text)
        return ats_analysis

    except Exception as e:
        print(f"ATS Error: {e}")
        return {
            "score": 0, 
            "feedback": "Could not calculate ATS score due to AI response error.",
            "missing_keywords": [],
            "formatting_check": "Unknown"
        }

@app.post("/render")
async def render_pdf(request: RenderRequest):
    yaml_content = request.resume_yaml
    theme = request.theme or "classic"

    # Inject Theme & Validate YAML
    try:
        # Load as dict to safely modify
        data = yaml.safe_load(yaml_content)
        
        if not data or "cv" not in data:
             raise ValueError("Invalid Resume YAML: Missing 'cv' key.")

        # Ensure 'design' key exists
        if "design" not in data:
            data["design"] = {}
        
        # Theme Validation (Fix for 'custom theme folder' error)
        valid_themes = ["classic", "engineering", "sb2nov"]
        if theme not in valid_themes:
            # If user selected "moderncv" or any other unsupported theme, fallback to a safe one
            print(f"Warning: Unknown theme '{theme}', defaulting to 'sb2nov'.")
            theme = "sb2nov"
        
        # Set theme
        data["design"]["theme"] = theme
        
        # Dump back to string
        yaml_content = yaml.dump(data, allow_unicode=True, sort_keys=False)
        
    except Exception as e:
        print(f"YAML Validation/Injection Error: {e}")
        # CRITICAL FIX: Fail here instead of passing garbage to RenderCV
        raise HTTPException(status_code=400, detail=f"Invalid YAML generated. Please regenerate. Error: {str(e)}")

    pdf_base64 = ""
    with tempfile.TemporaryDirectory() as temp_dir:
        input_yaml_path = os.path.join(temp_dir, "resume.yaml")
        with open(input_yaml_path, "w") as f:
            f.write(yaml_content)
        
        try:
            # Run RenderCV
            # Capture BOTH stdout and stderr to debug errors
            result = subprocess.run(
                ["rendercv", "render", input_yaml_path], 
                cwd=temp_dir, 
                check=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE
            )
            
            output_dir = os.path.join(temp_dir, "rendercv_output")
            pdf_file = None
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    if file.endswith(".pdf"):
                        pdf_file = os.path.join(root, file)
                        break
            
            if not pdf_file:
                 raise Exception("PDF generation failed, output file not found.")
            
            with open(pdf_file, "rb") as pdf_f:
                pdf_bytes = pdf_f.read()
                pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
                
        except subprocess.CalledProcessError as cpe:
             # Decode both to see where the error is
             stdout = cpe.stdout.decode('utf-8') if cpe.stdout else ""
             stderr = cpe.stderr.decode('utf-8') if cpe.stderr else ""
             combined_error = f"STDOUT: {stdout}\nSTDERR: {stderr}"
             
             print(f"RenderCV Failed:\n{combined_error}")
             raise HTTPException(status_code=500, detail=f"RenderCV generation failed. Logs: {stderr[:500]}...")
        except Exception as e:
             print(f"Render Generic Error: {e}")
             raise HTTPException(status_code=500, detail=f"Render failed: {str(e)}")

    return {"pdf_base64": pdf_base64, "final_yaml": yaml_content}

@app.post("/detect_ai")
async def detect_ai_patterns(request: AIAnalysisRequest):
    model = get_gemini_model(request.api_key)
    
    prompt = f"""
    Analyze the following Resume YAML for "AI-generated" patterns, clichés, and robotic phrasing.
    Humans rarely use words like: "delve", "tapestry", "paramount", "unleashed", "spearheaded" (overused), "meticulous", "navigating".
    
    RESUME CONTENT:
    {request.resume_yaml}
    
    Task:
    1. Identify specific phrases that sound artificial or overly buzzword-heavy.
    2. Give a "Human Score" (0-100%). 100% means purely human-written (natural), 0% means obviously AI using ChatGPT defaults.
    3. Suggest "Human Alternatives" for the flagged usage.

    Return JSON:
    {{
        "human_score": 85,
        "items": [
            {{ "phrase": "spearheaded the development", "suggestion": "led the development", "reason": "Overused buzzword" }},
            {{ "phrase": "delve into the data", "suggestion": "analyzed the data", "reason": "AI cliché" }}
        ],
        "summary": "The resume is mostly natural but uses some common AI tropes in the Summary section."
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        text = response.text.replace("```json", "").replace("```", "").strip()
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"AI Detect Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze AI patterns.")

@app.post("/generate_cover_letter")
async def generate_cover_letter(request: CoverLetterRequest):
    model = get_gemini_model(request.api_key)
    
    prompt = f"""
    Write a Professional Cover Letter based on the provided Resume and Job Description.
    
    RESUME:
    {request.resume_yaml}
    
    JOB DESCRIPTION:
    {request.job_description}
    
    Formatting Rules:
    - Keep it concise (max 300 words).
    - Professional but enthusiastic tone.
    - No placeholders! (e.g. "[Company Name]" -> infer looking at JD or use generic "Hiring Team").
    - Highlight 2 specific achievements from the resume that match the JD.
    
    Return JSON:
    {{
        "cover_letter_text": "Dear Hiring Manager, ..."
    }}
    """
    
    try:
        response = model.generate_content(prompt)
        text = response.text.replace("```json", "").replace("```", "").strip()
        
        # Analytics
        usage = getattr(response, 'usage_metadata', None)
        log_event("cover_letter_generated", {
            "tokens_input": usage.prompt_token_count if usage else 0,
            "tokens_output": usage.candidates_token_count if usage else 0
        })

        data = json.loads(text)
        return data
    except Exception as e:
        print(f"Cover Letter Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate cover letter.")

@app.post("/generate_linkedin")
async def generate_linkedin(request: LinkedInRequest):
    request_api_key = request.api_key or os.environ.get("GEMINI_API_KEY")
    if not request_api_key:
         raise HTTPException(status_code=400, detail="Gemini API Key required")
    
    model = get_gemini_model(request_api_key)

    if request.type == "connection":
        prompt_type = "LINKEDIN CONNECTION REQUEST (Strictly < 300 characters)"
        constraints = "Keep it strictly under 300 characters including spaces (LinkedIn Limit). Be casual but professional. Mention a shared interest or specific skill relevance."
    else:
        prompt_type = "LINKEDIN INMAIL / FULL MESSAGE"
        constraints = "Professional, persuasive, and concise (approx 100-150 words). Use a 'hook' in the first sentence."

    prompt = f"""
    You are a Career Networking Expert. Write a {prompt_type} to a Recruiter/Hiring Manager.
    
    MY RESUME SUMMARY (YAML):
    {request.resume_yaml[:1500]}...
    
    TARGET RECRUITER:
    Name: {request.recruiters_name or 'Hiring Manager'}
    Role: {request.recruiters_role or 'Recruiter'}
    Company: {request.company_name or 'the company'}
    
    CONTEXT/JOB:
    {request.job_description[:500]}
    
    CONSTRAINTS:
    {constraints}
    
    GOAL:
    Get them to accept the connection or reply to the message. Mention a specific skill from my resume that matches their company/role.
    
    OUTPUT:
    Return ONLY the message text. No subject lines (unless InMail), no quotes.
    """
    
    try:
        response = model.generate_content(prompt)
        text = response.text.strip().replace('"', '') # Clean quotes
        
        # Analytics
        usage = getattr(response, 'usage_metadata', None)
        log_event("outreach_generated", {
            "type": request.outreach_type,
            "tokens_input": usage.prompt_token_count if usage else 0,
            "tokens_output": usage.candidates_token_count if usage else 0
        })
        
        return {"content": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/render_cover_letter_pdf")
async def render_cover_letter_pdf(request: RenderCoverLetterRequest):
    yaml_content = request.resume_yaml
    cl_text = request.cover_letter_text
    
    # Parse Contact Info from Resume YAML
    name = "Candidate"
    email = ""
    phone = ""
    location = ""
    
    try:
        data = yaml.safe_load(yaml_content)
        if data and "cv" in data:
            cv = data["cv"]
            name = cv.get("name", "Candidate")
            email = cv.get("email", "")
            phone = cv.get("phone", "")
            location = cv.get("location", "")
    except Exception as e:
        print(f"YAML Parse Warning: {e}")

    try:
        # Generate PDF with ReportLab
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=LETTER,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )
        
        styles = getSampleStyleSheet()
        story = []

        # --- Custom Styles ---
        styles.add(ParagraphStyle(
            name='HeaderName',
            parent=styles['Heading1'],
            alignment=TA_CENTER,
            fontSize=24,
            spaceAfter=10,
            textColor=colors.HexColor("#2e3b4e")
        ))
        
        styles.add(ParagraphStyle(
            name='HeaderContact',
            parent=styles['Normal'],
            alignment=TA_CENTER,
            fontSize=10,
            textColor=colors.HexColor("#666666"),
            spaceAfter=20
        ))
        
        styles.add(ParagraphStyle(
            name='BodyContent',
            parent=styles['Normal'],
            alignment=TA_LEFT,
            fontSize=11,
            leading=16, # Line height
            spaceAfter=12
        ))

        # --- Build Content ---
        
        # 1. Header
        story.append(Paragraph(name, styles['HeaderName']))
        
        contact_parts = []
        if email: contact_parts.append(email)
        if phone: contact_parts.append(phone)
        if location: contact_parts.append(location)
        contact_str = " | ".join(contact_parts)
        
        story.append(Paragraph(contact_str, styles['HeaderContact']))
        
        # 2. Date
        from datetime import date
        today_str = date.today().strftime("%B %d, %Y")
        story.append(Paragraph(today_str, styles['BodyContent']))
        story.append(Spacer(1, 12))
        
        # 3. Content
        # Handle newlines properly for ReportLab
        # We split by double newlines for paragraphs, and single for breaks
        paragraphs = cl_text.split('\n\n')
        
        for p_text in paragraphs:
            if not p_text.strip(): continue
            # Convert single newlines to <br/> within paragraph if needed
            clean_text = p_text.replace('\n', ' ') 
            story.append(Paragraph(clean_text, styles['BodyContent']))
            story.append(Spacer(1, 6))

        # Build
        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()
        
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')
        return {"pdf_base64": pdf_base64}

    except Exception as e:
        print(f"ReportLab Error: {e}")
        raise HTTPException(status_code=500, detail=f"PDF Generation failed: {str(e)}")

    return {"pdf_base64": pdf_base64}

# --- Outreach & Tracker Models ---

class OutreachRequest(BaseModel):
    job_description: str
    resume_yaml: str
    outreach_type: str = "linkedin" # linkedin, cold_email, follow_up
    api_key: str = None

class ApplicationEntry(BaseModel):
    id: str = None
    company_name: str
    job_title: str
    status: str = "Applied" # Applied, Interviewing, Offer, Rejected
    date_applied: str
    job_description: str = ""

class ApplicationUpdate(BaseModel):
    status: str

# --- Persistence Helper ---
DB_FILE = "applications_db.json"

def load_db():
    if not os.path.exists(DB_FILE):
        return []
    try:
        with open(DB_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_db(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

# --- Outreach Endpoint ---

@app.post("/generate_outreach")
async def generate_outreach(request: OutreachRequest):
    model = get_gemini_model(request.api_key)
    
    # Decide Prompt and Format based on type
    if request.outreach_type == "cold_email":
        # 3-Step Sequence
        prompt = f"""
        You are an expert Career Coach and Copywriter.
        Task: Create a 3-step Cold Email Sequence for this job application.
        
        JOB DESCRIPTION:
        {request.job_description}

        RESUME SUMMARY:
        {request.resume_yaml[:2000]}

        OUTPUT FORMAT:
        Strictly return a JSON object with this structure:
        {{
            "emails": [
                {{
                    "label": "Initial Email",
                    "subject": "Catchy Subject Line",
                    "body": "Email body (max 200 words)..."
                }},
                {{
                    "label": "Follow-up (3 Days)",
                    "subject": "Re: [Original Subject]",
                    "body": "Short polite nudge..."
                }},
                {{
                    "label": "Final Follow-up (7 Days)",
                    "subject": "Re: [Original Subject]",
                    "body": "Final breakup email..."
                }}
            ]
        }}
        Do not markdown format the JSON. Just return the raw JSON string.
        """
    else:
        # Single Message (LinkedIn, Follow-up, etc.)
        # We still wrap it in the same JSON structure for frontend consistency
        context_instruction = ""
        if request.outreach_type == "linkedin":
            context_instruction = "Draft a short, professional LinkedIn connection request (max 300 characters). Highlight 1 key match. No subject line needed for LinkedIn."
        elif request.outreach_type == "follow_up":
            context_instruction = "Draft a polite but firm follow-up email sent 1 week after applying. Reiterate enthusiasm."

        prompt = f"""
        You are an expert Career Coach.
        Task: {context_instruction}
        
        JOB DESCRIPTION:
        {request.job_description[:1000]}

        RESUME SUMMARY:
        {request.resume_yaml[:1000]}

        OUTPUT FORMAT:
        Strictly return a JSON object with this structure:
        {{
            "emails": [
                {{
                    "label": "{request.outreach_type.capitalize()}",
                    "subject": "Outreach",
                    "body": "Message content here..."
                }}
            ]
        }}
        Do not markdown format the JSON. Just return the raw JSON string.
        """

    try:
        response = model.generate_content(prompt)
        text_response = response.text
        
        # Clean potential markdown code blocks if gemini adds them
        clean_text = text_response.replace("```json", "").replace("```", "").strip()
        
        # Validate JSON
        try:
             json_data = json.loads(clean_text)
             return json_data
        except json.JSONDecodeError:
             # Fallback if AI fails JSON
             return {
                 "emails": [
                     {"label": "Generated Message", "subject": "Outreach", "body": text_response}
                 ]
             }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Tracker Endpoints ---

@app.get("/applications")
def get_applications():
    return load_db()

@app.post("/applications")
def add_application(app: ApplicationEntry):
    db = load_db()
    # Generate ID if not present (simple implementation)
    import uuid
    app.id = str(uuid.uuid4())[:8]
    data = app.dict()
    db.insert(0, data) # Add to top
    save_db(db)
    
    # --- Sync to Google Sheet (if configured) ---
    try:
        sync_to_google_sheet(data)
    except Exception as e:
        print(f"Background Sync Error: {e}")
        
    return app

def sync_to_google_sheet(app_data):
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    creds_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    
    if not sheet_id or not creds_file:
        print("Google Sheet Sync Skipped: Missing Configuration")
        return

    try:
        # Authenticate
        gc = gspread.service_account(filename=creds_file)
        sh = gc.open_by_key(sheet_id)
        
        # Try to find a specific sheet or use the first one
        try:
            worksheet = sh.worksheet("Tracker")
        except:
            worksheet = sh.sheet1
            
        # Append Row: [Date, Company, Position, Status, JD Snippet]
        row = [
            app_data.get("date_applied", ""),
            app_data.get("company_name", ""),
            app_data.get("job_title", ""),
            app_data.get("status", "Applied"),
            app_data.get("job_description", "")[:200]
        ]
        
        worksheet.append_row(row)
        print(f"Synced to Google Sheet: {app_data.get('company_name')}")
        
    except Exception as e:
        print(f"Google Sheet Sync Failed: {e}")

@app.delete("/applications/{app_id}")
def delete_application(app_id: str):
    db = load_db()
    db = [entry for entry in db if entry.get("id") != app_id]
    save_db(db)
    return {"status": "deleted"}

@app.patch("/applications/{app_id}")
def update_status(app_id: str, update: ApplicationUpdate):
    db = load_db()
    for entry in db:
        if entry.get("id") == app_id:
            entry["status"] = update.status
            save_db(db)
            return entry
    raise HTTPException(status_code=404, detail="Application not found")

# --- Scraper ---
class ScrapeRequest(BaseModel):
    url: str

@app.post("/scrape-job")
async def scrape_job(request: ScrapeRequest):
    try:
        url = request.url
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }

        # --- SPECIAL HANDLING FOR LINKEDIN ---
        # LinkedIn "collections" or "search" URLs often redirect to login. 
        # We need to construct the public "jobs/view" URL using the Job ID.
        if "linkedin.com" in url:
            job_id = None
            # Case 1: URL query param ?currentJobId=12345
            match = re.search(r"currentJobId=(\d+)", url)
            if match:
                job_id = match.group(1)
            
            # Case 2: URL path jobs/view/12345
            if not job_id:
                match = re.search(r"jobs/view/(\d+)", url)
                if match:
                    job_id = match.group(1)

            if job_id:
                # Rewrite to the public view URL which is often scrapable without auth
                url = f"https://www.linkedin.com/jobs/view/{job_id}"
                print(f"Rewrote LinkedIn URL to public version: {url}")
        
        response = requests.get(url, headers=headers, timeout=10)
        # LinkedIn might return 429 or 999 for bots, handle gracefully?
        if response.status_code != 200:
             raise HTTPException(status_code=400, detail=f"Scraper blocked or failed (Status {response.status_code})")
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # improved scraping logic: look for main content areas
        # LinkedIn specific: class usually contains 'description' or 'show-more-less-html'
        content = soup.find(class_=re.compile(r"(description|show-more-less-html|job-details)", re.I))
        
        if not content:
             # Fallback to general semantic tags
             content = soup.find('main') or soup.find('article') or soup.body
        
        if not content:
             raise HTTPException(status_code=400, detail="Could not extract content from page")

        # extract text from common text tags
        text_elements = content.find_all(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'ul', 'div'])
        
        # filter out very short lines (often menu items or noise)
        lines = [elem.get_text(strip=True) for elem in text_elements if len(elem.get_text(strip=True)) > 20]
        
        # Remove duplicates while preserving order
        seen = set()
        unique_lines = []
        for line in lines:
            if line not in seen:
                unique_lines.append(line)
                seen.add(line)

        full_text = "\n\n".join(unique_lines[:100]) # Limit blocks
        
        return {"description": full_text}

    except Exception as e:
        print(f"Scraping error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to scrape URL: {str(e)}")

# --- Main ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# --- Version Control Endpoints ---

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
VERSIONS_DIR = os.path.join(BASE_DIR, "data", "versions")

@app.get("/versions")
async def list_versions():
    if not os.path.exists(VERSIONS_DIR):
        return []
    files = [f for f in os.listdir(VERSIONS_DIR) if f.endswith(".yaml")]
    # return names without extension
    return [f.replace(".yaml", "") for f in files]

@app.get("/versions/{name}")
async def get_version(name: str):
    file_path = os.path.join(VERSIONS_DIR, f"{name}.yaml")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Version not found")
    with open(file_path, "r") as f:
        content = f.read()
    return {"name": name, "yaml_content": content}

@app.post("/versions")
async def save_version(request: VersionRequest):
    if not os.path.exists(VERSIONS_DIR):
        os.makedirs(VERSIONS_DIR)
    
    # Sanitize filename (basic)
    safe_name = "".join([c for c in request.name if c.isalnum() or c in (' ', '-', '_')]).strip()
    if not safe_name:
         raise HTTPException(status_code=400, detail="Invalid version name")

    file_path = os.path.join(VERSIONS_DIR, f"{safe_name}.yaml")
    with open(file_path, "w") as f:
        f.write(request.yaml_content)
    
    return {"message": "Version saved", "name": safe_name}

@app.delete("/versions/{name}")
async def delete_version(name: str):
    file_path = os.path.join(VERSIONS_DIR, f"{name}.yaml")
    if os.path.exists(file_path):
        os.remove(file_path)
    return {"message": "Version deleted"}

# --- Analytics Database ---
import sqlite3
from datetime import datetime

ANALYTICS_DB_PATH = os.path.join(BASE_DIR, "data", "analytics.db")

def init_analytics_db():
    if not os.path.exists(os.path.dirname(ANALYTICS_DB_PATH)):
        os.makedirs(os.path.dirname(ANALYTICS_DB_PATH))
    
    conn = sqlite3.connect(ANALYTICS_DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        )
    ''')
    conn.commit()
    conn.close()

def log_event(event_type: str, details: dict):
    try:
        init_analytics_db()
        conn = sqlite3.connect(ANALYTICS_DB_PATH)
        c = conn.cursor()
        c.execute("INSERT INTO events (event_type, details) VALUES (?, ?)", (event_type, json.dumps(details)))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Analytics Error: {e}")

@app.get("/analytics")
async def get_analytics():
    init_analytics_db()
    conn = sqlite3.connect(ANALYTICS_DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Total count
    c.execute("SELECT COUNT(*) as count FROM events WHERE event_type='resume_generated'")
    total_resumes = c.fetchone()['count']

    c.execute("SELECT COUNT(*) as count FROM events WHERE event_type='cover_letter_generated'")
    total_cover_letters = c.fetchone()['count']
    
    # Recent activity
    c.execute("SELECT * FROM events ORDER BY timestamp DESC LIMIT 20")
    recent = [dict(row) for row in c.fetchall()]
    
    # Detailed aggregation for Charts & Tokens
    c.execute("SELECT event_type, details FROM events")
    region_counts = {}
    theme_counts = {}
    total_input_tokens = 0
    total_output_tokens = 0
    
    for row in c.fetchall():
        try:
            d = json.loads(row['details'])
            
            # Count Tokens
            total_input_tokens += d.get('tokens_input', 0)
            total_output_tokens += d.get('tokens_output', 0)

            if row['event_type'] == 'resume_generated':
                # Region Stats
                t = d.get('target_region', 'unknown')
                region_counts[t] = region_counts.get(t, 0) + 1
                
                # Theme Stats (if available)
                th = d.get('theme', 'unknown')
                theme_counts[th] = theme_counts.get(th, 0) + 1
                
        except: pass

    conn.close()
    return {
        "total_resumes": total_resumes,
        "total_cover_letters": total_cover_letters,
        "total_tokens_input": total_input_tokens,
        "total_tokens_output": total_output_tokens,
        "region_distribution": region_counts,
        "theme_distribution": theme_counts,
        "recent_activity": recent
    }

# Hook logging into existing endpoints
# Note: I will inject the logging calls into valid rewrite_resume and render_pdf functions via editing
