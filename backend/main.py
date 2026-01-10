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
import gspread

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---

class RewriteRequest(BaseModel):
    job_description: str
    current_yaml: str
    target_region: str = "international"
    user_comments: str = ""
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

# --- Helper Functions ---

def get_gemini_model(api_key: str = None):
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(status_code=400, detail="Gemini API Key is required")
    genai.configure(api_key=key)
    return genai.GenerativeModel('models/gemini-3-pro-preview')

# --- Endpoints ---

@app.get("/")
def health_check():
    return {"status": "healthy", "message": "Antigravity Resume Backend is Running"}

@app.post("/rewrite")
async def rewrite_resume(request: RewriteRequest):
    model = get_gemini_model(request.api_key)
    
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
       - **Strictly Factual & Formal**: Ban all "salesy" adjectives (e.g. remove "Passionate", "Visionary", "Ninja"). Tone must be reserved.
       - **Mandatory Personal Data**: You MUST include `birth_date` (YYYY-MM-DD), `place_of_birth`, `nationality`, and `marital_status` in the basics section.
       - **Date Format**: **CRITICAL**: Use strict ISO 8601 format `YYYY-MM-DD` (e.g., 2023-12-01) for ALL dates in the YAML. Do NOT use German `DD.MM.YYYY` format here; the renderer will handle the display.
       - **Signature**: Add a generic placeholder field `signature: "[Place, Date] [Your Name]"` at the end.
       - **Structure**: Explicitly separate Education and Experience.
        """
    elif request.target_region == "dubai":
        region_instructions = """
    6. **DUBAI / UAE REGION STANDARDS**:
       - **Mandatory Demographics**: You MUST include `nationality`, `visa_status`, `gender`, and `date_of_birth` (YYYY-MM-DD) in the basics section.
       - **Photo Placeholder**: Ensure the YAML has a `picture: "path/to/photo.jpg"` field (it is expected).
       - **Tech-Heavy**: Prioritize a "Technical Skills" section near the top. UAE recruiters scan for tools first.
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD`.
       - **Conciseness**: Aggressively summarize bullet points.
        """
    elif request.target_region == "uk":
        region_instructions = """
    6. **UK REGION STANDARDS**:
       - **BRITISH ENGLISH ONLY**: Auto-correct American spellings (e.g., use "Optimised", "Organised", "Programme", "Centre", "Licence").
       - **Personal Statement**: You MUST write a short, narrative 3-4 line summary at the very top of the resume.
       - **References**: Append a section `references` with a single item: "References available upon request".
       - **Strict Prohibitions**: REMOVE `picture`, `gender`, `marital_status`, and `date_of_birth` if present.
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD`.
        """
    elif request.target_region == "usa":
        region_instructions = """
    6. **USA REGION STANDARDS**:
       - **AMERICAN ENGLISH ONLY**: Use "Optimized", "Organized", "Program", "Center".
       - **STRICT PROHIBITIONS (Legal)**: You MUST REMOVE `age`, `date_of_birth`, `marital_status`, `religion`, `gender`, and `picture`. These are illegal for hiring consideration.
       - **Results-Obsessed**: Every bullet point must follow "Action Verb + Task + Quantifiable Result".
       - **Brevity**: Aim for maximum conciseness (ideal for 1 page).
       - **Date Format**: Use strict ISO 8601 `YYYY-MM-DD`.
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
    You are a Strategic Resume Optimizer. Your goal is to maximize the ATS score (aiming for 100/100) for the given Job Description.

    INPUT DATA:
    1. **Critial Keywords to Inject**: {keywords}
    2. **Job Description**:
    {request.job_description}
    3. **Current Resume (YAML)**:
    {request.current_yaml}

    CRITICAL INSTRUCTIONS:
    1. **NO PREAMBLE**:
       - RETURN ONLY THE YAML. Do NOT write "Here is the yaml" or any chat.
       - Start immediately with `cv:`.

    2. **NO HALLUCINATIONS (Top Priority)**:
       - **NEVER** invent new Job Titles, Company Names, Dates, or Locations. You must use the exact work history provided in the 'Current Resume'.
       - **NEVER** add a new entry to the `experience` section that does not exist in the input.
       - You strictly ONLY enhance the *bullet points* inside existing roles.
       - **PRESERVE DATE FORMATS**: Do not change "Dec 2023" to "December 2023" or "2023-12" unless necessary. Keep consistency.

    3. **PRESERVE HEADER / BASICS (CRITICAL)**:
       - You **MUST** retain the `basics` section from the input YAML exactly as is (unless specific Country Rules below say to remove specific fields like age/photo).
       - **MANDATORY FIELDS**: Ensure `name`, `email`, `phone`, `website`, `location`, and `social_networks` (LinkedIn, GitHub, etc.) are included in the output YAML.
       - Do **NOT** drop the LinkedIn or GitHub links.

    4. **KEYWORD INJECTION**:
       - Naturally integrate the "Critical Keywords": {keywords}
       - integrate them into *existing* experience entries or the 'skills' section.
       - If a keyword (e.g. "Kubernetes") is missing and cannot be truthfully added to an existing job, add it to a "Projects" section or "Skills" section, but DO NOT fake a job experience for it.

    5. **CONTENT QUALITY & VOCABULARY**:
       - **ABSOLUTE RULE**: Do NOT use the same action verb more than ONCE in the entire resume.
       - **Specific prohibition**: If you used "Automated" once, you MUST NOT use it again. Use synonyms like "Streamlined", "Orchestrated", "Engineered", "Scripted", "Accelerated", "Optimized".
       - **AUDIT YOURSELF**: Before outputting, check if any verb appears twice. If so, change one immediately.
       - Use the STAR method (Situation, Task, Action, Result).
       - Quantify results (numbers, $, %) in every bullet. Just raw YAML.
       
    6. **NO MARKDOWN FORMATTING**:
       - **DO NOT** use bolding (like **Text**) or italics (*Text*) in the YAML values. 
       - Pure plain text only. The YAML parser will fail calls if it sees asterisks that look like aliases.
       - Example: Write "Resolved critical issue", NOT "**Resolved** critical issue".

    {region_instructions}

    {custom_instructions}

    Perform the rewrite now.
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
        data = json.loads(text)
        return data
    except Exception as e:
        print(f"Cover Letter Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate cover letter.")

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
    
    prompt_type = ""
    if request.outreach_type == "linkedin":
        prompt_type = "A short, professional LinkedIn connection request (max 300 characters). highlight 1 key match."
    elif request.outreach_type == "cold_email":
        prompt_type = "A concise, high-impact cold email to the Hiring Manager. Pitch value proposition based on the resume matches. Use a catchy subject line."
    elif request.outreach_type == "follow_up":
        prompt_type = "A polite but firm follow-up email sent 1 week after applying. Reiterate enthusiasm and a specific qualification."

    prompt = f"""
    You are a Career Coach. Draft a {request.outreach_type} message.
    {prompt_type}

    JOB DESCRIPTION:
    {request.job_description}

    MY RESUME SUMMARY:
    {request.resume_yaml}

    OUTPUT FORMAT:
    Return ONLY the message text. If it's an email, include "Subject: ..." on the first line.
    """

    try:
        response = model.generate_content(prompt)
        return {"content": response.text.strip()}
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
