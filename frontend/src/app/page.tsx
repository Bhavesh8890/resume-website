"use client";

import { useState, useEffect } from "react";

export default function Home() {
  const [jd, setJd] = useState("");
  const [yaml, setYaml] = useState("");
  const [apiKey, setApiKey] = useState("");

  // UI State
  const [activeTab, setActiveTab] = useState("builder"); // builder, outreach, tracker
  const [activeResultTab, setActiveResultTab] = useState<"resume" | "cover-letter">("resume");

  // Scraper State
  const [scraperUrl, setScraperUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);



  const [theme, setTheme] = useState("classic");
  const [targetRegion, setTargetRegion] = useState("international");

  // Constant for API URL avoids "localhost" issues on mobile
  const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://resume-backend-463635413770.asia-south1.run.app";



  // Tracker State
  const [applications, setApplications] = useState<any[]>([]);
  const [refreshTracker, setRefreshTracker] = useState(0);

  const [userComments, setUserComments] = useState("");
  const [downloadName, setDownloadName] = useState("Bhavesh_Resume");

  // Process State
  type Step = "idle" | "rewriting" | "analyzing" | "rendering" | "complete" | "error";
  const [currentStep, setCurrentStep] = useState<Step>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [elapsedTime, setElapsedTime] = useState(0); // Timer state

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (currentStep !== 'idle' && currentStep !== 'complete' && currentStep !== 'error') {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [currentStep]);

  // Version Control State
  const [versions, setVersions] = useState<string[]>([]);
  const [newVersionName, setNewVersionName] = useState("");
  const [showSaveVersion, setShowSaveVersion] = useState(false);

  // Results
  // Results
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [atsAnalysis, setAtsAnalysis] = useState<any>(null);
  const [aiDetection, setAiDetection] = useState<any>(null);

  // Analytics Dashboard State
  const [dashboardStats, setDashboardStats] = useState<any>(null);

  // Load dashboard data when tab is active
  useEffect(() => {
    if (activeTab === 'analytics') {
      fetch(`${API_BASE_URL}/analytics`)
        .then(res => res.json())
        .then(data => setDashboardStats(data))
        .catch(err => console.error("Dashboard fetch error:", err));
    }
  }, [activeTab]);

  const [coverLetter, setCoverLetter] = useState<string>("");
  const [isGeneratingClPdf, setIsGeneratingClPdf] = useState(false);

  // Diff State
  const [originalYaml, setOriginalYaml] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  // Outreach State
  type OutreachType = "linkedin" | "cold_email" | "follow_up";
  const [outreachType, setOutreachType] = useState<OutreachType>("linkedin");
  const [outreachContent, setOutreachContent] = useState("");
  const [emailSequence, setEmailSequence] = useState<any[]>([]);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [activeEmailIndex, setActiveEmailIndex] = useState(0);

  // LinkedIn Specific State
  const [recruiterName, setRecruiterName] = useState("");
  const [recruiterRole, setRecruiterRole] = useState("Recruiter");
  const [linkedinMsgType, setLinkedinMsgType] = useState("connection"); // 'connection' | 'message'
  const [linkedinResult, setLinkedinResult] = useState("");


  const handleGenerate = async () => {
    // Reset
    // Reset
    setPdfUrl(null);
    setAtsAnalysis(null);
    setAiDetection(null);
    setCoverLetter("");
    setOriginalYaml(yaml); // Save original for diff
    setShowDiff(false);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://resume-backend-463635413770.asia-south1.run.app";

    try {
      // --- Step 1: Rewrite ---
      setCurrentStep("rewriting");
      setStatusMessage("AI is rewriting your resume to match the Job Description...");

      const rewriteRes = await fetch(`${backendUrl}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_description: jd,
          current_yaml: yaml,
          target_region: targetRegion,
          user_comments: userComments,
          api_key: apiKey
        })
      });

      if (!rewriteRes.ok) throw new Error((await rewriteRes.json()).detail || "Rewrite failed");
      const rewriteData = await rewriteRes.json();

      // Update the YAML in the editor so the user sees the transformation
      const newYaml = rewriteData.yaml;
      setYaml(newYaml);

      // --- Step 2: Parallel ATS & Render ---
      // We can run these together to save time
      setCurrentStep("analyzing"); // "analyzing" & "rendering" conceptually
      setStatusMessage("Calculating ATS Score & Rendering PDF...");

      const atsPromise = fetch(`${backendUrl}/ats_score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_description: jd,
          resume_yaml: newYaml,
          api_key: apiKey
        })
      });

      const renderPromise = fetch(`${backendUrl}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_yaml: newYaml,
          theme: theme
        })
      });

      const [atsRes, renderRes] = await Promise.all([atsPromise, renderPromise]);

      if (!atsRes.ok) throw new Error("ATS Analysis failed");
      if (!renderRes.ok) throw new Error("PDF Rendering failed");

      const atsData = await atsRes.json();
      const renderData = await renderRes.json();

      setAtsAnalysis(atsData);
      setPdfUrl("data:application/pdf;base64," + renderData.pdf_base64);

      setCurrentStep("complete");
      setStatusMessage("Optimization Complete!");

    } catch (e: any) {
      setCurrentStep("error");
      setStatusMessage("Error: " + e.message);
      console.error(e);
      alert("Something went wrong: " + e.message);
    }
  };

  const handleDetectAI = async () => {
    if (!yaml) return;
    setStatusMessage("Analysing for AI patterns...");
    try {
      const res = await fetch(`${API_BASE_URL}/detect_ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_yaml: yaml, api_key: apiKey })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "AI Detection failed"); // Corrected error message

      setAiDetection(data); // Set aiDetection with the data
      setStatusMessage("AI Analysis Complete"); // Set status message

      // The following lines from the instruction seem to be for a rewrite function, not detect_ai.
      // Keeping them commented out or adapting if they are truly intended for detect_ai.
      // if (data.yaml) {
      //   setYaml(data.yaml);
      //   setUniqueKey(prev => prev + 1);
      //   setCurrentStep("complete");
      //   setStatus("completed"); // This should be setStatusMessage or setCurrentStep

      //   // Auto-refresh tracker if open
      //   if (activeTab === 'tracker') fetchApplications();
      // }
    } catch (e: any) {
      alert(e.message);
      setStatusMessage("Error analyzing AI patterns");
    }
  };

  const handleGenerateCoverLetter = async () => {
    if (!jd || !yaml) return;
    setStatusMessage("Drafting Cover Letter...");
    try {
      const res = await fetch(`${API_BASE_URL}/generate_cover_letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_yaml: yaml, job_description: jd, api_key: apiKey })
      });
      if (!res.ok) throw new Error("Cover Letter Gen failed");
      const data = await res.json();
      setCoverLetter(data.cover_letter_text);
      setActiveResultTab("cover-letter"); // Changed to activeResultTab
      setStatusMessage("Cover Letter Ready");
    } catch (e: any) {
      alert(e.message);
      setStatusMessage("Error generating cover letter");
    }
  }


  const handleDownloadClPdf = async () => {
    if (!coverLetter || !yaml) return;
    setIsGeneratingClPdf(true);

    try {
      const res = await fetch(`${API_BASE_URL}/render_cover_letter_pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_yaml: yaml,
          cover_letter_text: coverLetter,
          theme: theme
        })
      });

      if (!res.ok) throw new Error("PDF Generation failed");
      const data = await res.json();

      // Download logic
      const link = document.createElement('a');
      link.href = "data:application/pdf;base64," + data.pdf_base64;
      link.download = `${downloadName}_Cover_Letter.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (e: any) {
      alert("Failed to download PDF: " + e.message);
    } finally {
      setIsGeneratingClPdf(false);
    }
  };

  const steps = [
    { id: "rewriting", label: "Rewrite Content", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> },
    { id: "analyzing", label: "ATS Check & Render", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> },
    { id: "complete", label: "Done", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> },
  ];

  const getStepStatus = (stepId: string) => {
    const order = ["idle", "rewriting", "analyzing", "complete"];
    const currentIndex = order.indexOf(currentStep === "error" ? "idle" : currentStep);
    const stepIndex = order.indexOf(stepId);

    if (currentStep === "error") return "error";
    if (currentIndex > stepIndex) return "completed";
    if (currentIndex === stepIndex) return "active";
    return "pending";
  };


  // --- Outreach Handlers ---
  // --- Version Control Handlers ---
  const fetchVersions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/versions`);
      if (res.ok) setVersions(await res.json());
    } catch (e) { console.error(e); }
  };
  useEffect(() => { fetchVersions(); }, []);

  const handleSaveVersion = async () => {
    if (!newVersionName) return;
    try {
      const res = await fetch(`${API_BASE_URL}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newVersionName, yaml_content: yaml })
      });
      if (res.ok) {
        setNewVersionName("");
        setShowSaveVersion(false);
        fetchVersions();
        alert("Version Saved!");
      }
    } catch (e) { console.error(e); }
  };

  const handleLoadVersion = async (name: string) => {
    // if (!confirm(`Load version "${name}"? Unsaved changes will be lost.`)) return; // REMOVED POPUP
    try {
      const res = await fetch(`${API_BASE_URL}/versions/${name}`);
      if (res.ok) {
        const data = await res.json();
        setYaml(data.yaml_content);
      }
    } catch (e) { console.error(e); }
  };

  // --- Scraper Handler ---
  const handleScrapeJob = async () => {
    if (!scraperUrl) return;
    setIsScraping(true);
    try {
      // Use existing backendUrl logic if available, or fallback
      const res = await fetch(`${API_BASE_URL}/scrape-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scraperUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setJd(data.description);
        // alert("Job Description Imported!"); // REMOVED POPUP
      } else {
        throw new Error(data.detail || "Scraping failed");
      }
    } catch (e: any) {
      alert("Scraping failed: " + e.message);
    } finally {
      setIsScraping(false);
    }
  };

  // --- Outreach Handlers ---
  const handleGenerateOutreach = async () => {
    if (!jd || !yaml) {
      alert("Please generate a resume first (JD and Resume YAML required)");
      return;
    }
    setIsGeneratingOutreach(true);
    setLinkedinResult("");
    setEmailSequence([]);

    // LINKEDIN LOGIC
    if (outreachType === 'linkedin') {
      try {
        const res = await fetch(`${API_BASE_URL}/generate_linkedin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resume_yaml: yaml,
            job_description: jd,
            recruiters_name: recruiterName,
            recruiters_role: recruiterRole,
            type: linkedinMsgType,
            api_key: apiKey
          })
        });
        const data = await res.json();
        if (res.ok) setLinkedinResult(data.content);
        else throw new Error(data.detail);
      } catch (e: any) { alert(e.message); }
      finally { setIsGeneratingOutreach(false); }
      return;
    }

    // EMAIL LOGIC (Existing)
    try {
      const res = await fetch(`${API_BASE_URL}/generate_outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_description: jd,
          resume_yaml: yaml,
          outreach_type: outreachType,
          api_key: apiKey
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.emails) {
          setEmailSequence(data.emails);
          setActiveEmailIndex(0);
        } else if (data.content) {
          // Fallback for old/simple response
          setOutreachContent(data.content);
          setEmailSequence([]);
        }
      }
      else throw new Error(data.detail || "Failed to generate outreach");
    } catch (e: any) {
      alert("Failed to generate outreach: " + e.message);
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  // --- Tracker Handlers ---
  const fetchApplications = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/applications`);
      if (res.ok) setApplications(await res.json());
      else throw new Error("Failed to fetch applications");
    } catch (e: any) { console.error("Error fetching applications:", e); }
  };

  useEffect(() => {
    if (activeTab === 'tracker') fetchApplications();
  }, [activeTab, refreshTracker]);

  const handleSaveToTracker = async () => {
    // Extract Company/Title from JD (simple heuristic or placeholder)
    // For now, we'll just use generic placeholders or ask user. 
    // Better: Use AI to extract it? For speed, let's use a simple prompt prompt or just saved values.
    const company = prompt("Enter Company Name:");
    if (!company) return;

    const title = prompt("Enter Job Title:") || "role";

    try {
      const res = await fetch(`${API_BASE_URL}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: company,
          job_title: title,
          date_applied: new Date().toISOString().split('T')[0],
          job_description: jd.substring(0, 500) // truncate for db text
        })
      });
      if (!res.ok) throw new Error("Failed to save application");
      alert("Application Saved!");
      setRefreshTracker(prev => prev + 1);
    } catch (e: any) {
      alert("Failed to save application: " + e.message);
    }
  };

  const updateAppStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`http://localhost:8000/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error("Failed to update status");
      fetchApplications();
    } catch (e: any) {
      alert("Failed to update status: " + e.message);
    }
  };

  const deleteApp = async (id: string) => {
    if (!confirm("Delete this application?")) return;
    try {
      const res = await fetch(`http://localhost:8000/applications/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete application");
      fetchApplications();
    } catch (e: any) {
      alert("Failed to delete application: " + e.message);
    }
  };


  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 font-sans relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">

      {/* --- Ambient Background --- */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        {/* CSS Grid Pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.25]" />

        {/* Gradient Orbs */}
        <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] bg-indigo-600/30 rounded-full blur-[128px] animate-float-slow mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[10%] w-[600px] h-[600px] bg-violet-600/20 rounded-full blur-[128px] animate-float-delayed mix-blend-screen" />
        <div className="absolute top-[40%] left-[-10%] w-[400px] h-[400px] bg-cyan-600/20 rounded-full blur-[100px] animate-pulse-slow mix-blend-screen" />
      </div>

      {/* --- Header / Nav --- */}
      <div className="h-16 border-b border-white/10 bg-[#0A0A0B]/80 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-50 shadow-2xl shadow-violet-500/5">
        <div className="flex items-center gap-3 group cursor-default">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-violet-600 flex items-center justify-center transform group-hover:rotate-12 transition-transform duration-500">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div className="absolute -inset-2 bg-cyan-500/20 rounded-xl blur-lg group-hover:bg-cyan-500/40 transition-colors" />
          </div>

          <div className="flex flex-col">
            <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">
              Antigravity<span className="text-cyan-400">.</span>Builder
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">AI-Powered Resume Engine</span>
              <span className="px-1.5 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-[9px] text-violet-400 font-bold font-mono">v2.1</span>
            </div>
          </div>
        </div>

        {/* Modern Pills Navigation */}
        <div className="flex items-center gap-1 bg-white/5 p-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
          {['builder', 'outreach', 'analytics', 'tracker'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-6 py-2 rounded-xl text-xs font-bold transition-all duration-300 capitalize overflow-hidden group/btn ${activeTab === tab ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {activeTab === tab && (
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-violet-600 shadow-lg shadow-cyan-500/25 rounded-xl animate-fade-in" />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {/* Icons for tabs */}
                {tab === 'builder' && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
                {tab === 'outreach' && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
                {tab === 'analytics' && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                {tab === 'tracker' && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                {tab}
              </span>
            </button>
          ))}
        </div>

        <div className="w-10"></div> {/* Balancer */}
      </div>

      <div className="h-[calc(100vh-4rem)] p-4 overflow-hidden relative z-10">

        {/* --- MAIN BUILDER LAYOUT --- */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-12 gap-6 h-full">

            {/* --- LEFT COLUMN: EDITOR (4Cols) --- */}
            <div className="col-span-4 flex flex-col gap-4 h-full overflow-hidden">

              {/* 1. Configuration Panel (Scrollable) */}
              <div className="flex-1 bg-[#13161c] border border-white/10 rounded-2xl p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4">

                {/* Top Row: Theme & Region */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Theme</label>
                    <select value={theme} onChange={(e) => setTheme(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                      <option value="classic">Classic</option>
                      <option value="engineering">Engineering</option>
                      <option value="sb2nov">Modern (sb2nov)</option>
                      <option value="moderncv">Stylish</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Region</label>
                    <select value={targetRegion} onChange={(e) => setTargetRegion(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none">
                      <option value="international">Global</option>
                      <option value="usa">USA</option>
                      <option value="germany">Germany</option>
                      <option value="dubai">Dubai / UAE</option>
                      <option value="uk">United Kingdom</option>
                    </select>
                  </div>
                </div>

                {/* Job Description (Compact) */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Job Description</label>
                    <button onClick={() => handleScrapeJob()} disabled={!scraperUrl} className="text-[10px] text-cyan-400 hover:text-cyan-300 disabled:text-slate-600">
                      {isScraping ? "..." : "Import URL"}
                    </button>
                  </div>
                  <input
                    placeholder="JD URL..."
                    className="w-full bg-black/40 border border-white/10 rounded-md px-2 py-1 text-xs text-slate-400 mb-1"
                    value={scraperUrl} onChange={e => setScraperUrl(e.target.value)}
                  />
                  <textarea
                    className="w-full h-24 bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-slate-400 resize-none outline-none focus:border-cyan-500/40"
                    placeholder="Paste Job Description..."
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                  />
                </div>

                {/* Resume YAML Editor (Expands) */}
                <div className="flex-1 flex flex-col min-h-[200px]">
                  <div className="flex justify-between items-end mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Resume YAML</label>
                    {/* Version Loader */}
                    <div className="flex items-center gap-1">
                      <select className="bg-transparent border border-white/10 rounded px-1 text-[10px] text-slate-400" onChange={(e) => handleLoadVersion(e.target.value)} value="">
                        <option value="" disabled>Load Saved...</option>
                        {versions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <button onClick={() => setShowSaveVersion(true)} className="text-[10px] text-slate-400 hover:text-white">💾</button>
                    </div>
                  </div>

                  {/* Inline Save Input */}
                  {showSaveVersion && (
                    <div className="flex gap-1 mb-1 items-center bg-black/40 p-1 rounded border border-white/10">
                      <input className="flex-1 bg-transparent text-xs text-white outline-none" placeholder="Version Name..." value={newVersionName} onChange={e => setNewVersionName(e.target.value)} autoFocus />
                      <button onClick={handleSaveVersion} className="text-[10px] text-green-400 px-2 font-bold">SAVE</button>
                      <button onClick={() => setShowSaveVersion(false)} className="text-[10px] text-slate-500 hover:text-white px-1">✕</button>
                    </div>
                  )}

                  <textarea
                    className="flex-1 w-full bg-[#0B0D10] border border-white/10 rounded-lg p-3 text-[11px] font-mono text-slate-300 leading-relaxed resize-none outline-none focus:border-violet-500/40 custom-scrollbar"
                    value={yaml}
                    onChange={(e) => setYaml(e.target.value)}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* 2. Action Footer */}
              <div className="h-20 bg-[#13161c] border border-white/10 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-2xl z-20">
                <div className="flex gap-2">
                  <button onClick={handleDetectAI} title="Check AI" disabled={!yaml} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </button>
                  <button onClick={handleGenerateCoverLetter} title="Cover Letter" disabled={!yaml} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-fuchsia-300 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                </div>

                <button
                  onClick={handleGenerate}
                  disabled={!jd || !yaml || (currentStep !== "idle" && currentStep !== "complete" && currentStep !== "error")}
                  className="flex-1 h-full bg-gradient-to-r from-cyan-600 to-violet-600 rounded-xl font-bold text-white shadow-lg hover:shadow-cyan-500/25 transition-all text-sm flex items-center justify-center gap-2 group disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                >
                  {currentStep === 'idle' || currentStep === 'complete' || currentStep === 'error' ? (
                    <>
                      <span>{(!jd || !yaml) ? "Add JD & Resume to Start" : "Optimize Resume"}</span>
                      <svg className="w-4 h-4 text-white/70 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </>
                  ) : "Processing..."}
                </button>
              </div>
            </div>

            {/* --- RIGHT COLUMN: PREVIEW (8Cols) --- */}
            <div className="col-span-8 bg-[#1E1E24] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col relative group">

              {/* Overlay Status Bar */}
              {/* Overlay Status Bar (INNOVATIVE LOADER) */}
              {(statusMessage && currentStep !== 'idle' && currentStep !== 'complete' && currentStep !== 'error') && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">

                  {/* Cyberpunk Loader Card */}
                  <div className="relative w-96 bg-[#0B0D10]/90 border border-cyan-500/30 p-8 rounded-2xl shadow-2xl shadow-cyan-500/20 overflow-hidden group">

                    {/* Scanning Line */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-cyber-scan" />

                    {/* Background Grid Subtle */}
                    <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center gap-6">

                      {/* Central Pulse Icon */}
                      <div className="relative">
                        <div className="w-16 h-16 rounded-full border-2 border-cyan-500/30 flex items-center justify-center animate-spin-slow">
                          <div className="w-12 h-12 rounded-full border-2 border-violet-500/50 border-t-transparent animate-spin" />
                        </div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-cyan-500 rounded-full blur-md animate-pulse" />
                        <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      </div>

                      {/* Text Content */}
                      <div className="text-center space-y-2">
                        <h3 className="text-xl font-bold text-white tracking-widest uppercase animate-pulse">
                          System Optimizing
                        </h3>
                        <div className="h-0.5 w-24 mx-auto bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
                        <p className="text-xs font-mono text-cyan-300 animate-glitch-text">
                          {statusMessage}...
                        </p>
                        <p className="text-[10px] font-mono text-slate-500">
                          Time Elapsed: <span className="text-white">{elapsedTime}s</span>
                        </p>
                      </div>

                      {/* Fake Terminal Output */}
                      <div className="w-full bg-black/50 rounded-lg p-3 border border-white/5 font-mono text-[10px] text-slate-400 h-20 overflow-hidden flex flex-col justify-end">
                        <div className="opacity-50">Checking ATS compatibility... OK</div>
                        <div className="opacity-70">Injecting keywords... OK</div>
                        <div className="text-cyan-400">Rendering high-res PDF...</div>
                        <div className="animate-pulse">_</div>
                      </div>

                    </div>
                  </div>
                </div>
              )}

              {/* Toolbar */}
              <div className="h-12 bg-black/20 border-b border-white/5 flex items-center justify-between px-4">
                <div className="flex gap-2">
                  <button onClick={() => { setActiveResultTab('resume'); setShowDiff(false); }} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${activeResultTab === 'resume' && !showDiff ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Results</button>
                  <button onClick={() => { setActiveResultTab('resume'); setShowDiff(true); }} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${showDiff ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Diff View</button>
                  <button onClick={() => { setActiveResultTab('cover-letter'); setShowDiff(false); }} className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${activeResultTab === 'cover-letter' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}>Cover Letter</button>
                </div>
                {/* Download Actions (Compact) */}
                {activeResultTab === "resume" && pdfUrl && (
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={async () => {
                        const company = window.prompt("Company Name?", "Target Company");
                        if (!company) return;
                        const title = window.prompt("Job Title?", "Software Engineer");
                        if (!title) return;

                        try {
                          const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"}/applications`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              company_name: company,
                              job_title: title,
                              date_applied: new Date().toISOString().split('T')[0],
                              status: "Applied",
                              job_description: jobDescription
                            })
                          });
                          if (response.ok) {
                            alert("Saved to Tracker!");
                            fetchApplications(); // Refresh tracker
                          } else {
                            alert("Failed to save.");
                          }
                        } catch (e) {
                          console.error(e);
                          alert("Error saving to tracker.");
                        }
                      }}
                      className="text-xs font-bold text-green-400 hover:text-green-300 flex items-center gap-1 border border-green-500/20 bg-green-500/10 px-2 py-1 rounded"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Save to Tracker
                    </button>
                    <a href={pdfUrl} download="resume.pdf" className="text-xs font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Download PDF
                    </a>
                  </div>
                )}
                {activeResultTab === "cover-letter" && coverLetter && (
                  <div className="flex gap-2 items-center">
                    <button onClick={handleDownloadClPdf} disabled={isGeneratingClPdf} className="text-xs font-bold text-fuchsia-400 hover:text-fuchsia-300 flex items-center gap-1 disabled:opacity-50">
                      {isGeneratingClPdf ? "Generating..." : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          Download PDF
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Main Viewport */}
              <div className="flex-1 relative bg-gray-500/5 overflow-hidden">
                {activeResultTab === "resume" ? (
                  pdfUrl ? (
                    <iframe src={pdfUrl} className="w-full h-full" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-600 space-y-4">
                      <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
                        <svg className="w-10 h-10 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      </div>
                      <p className="font-medium text-sm">Preview will appear here</p>
                    </div>
                  )
                ) : showDiff ? (
                  <div className="w-full h-full p-4 grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2 h-full">
                      <span className="text-xs font-bold text-red-400 uppercase">Original YAML</span>
                      <textarea className="flex-1 bg-black/40 border border-red-500/20 rounded-xl p-4 text-[10px] font-mono text-neutral-400 resize-none outline-none" readOnly value={originalYaml || "No original version saved."} />
                    </div>
                    <div className="flex flex-col gap-2 h-full">
                      <span className="text-xs font-bold text-green-400 uppercase">Optimized YAML</span>
                      <textarea className="flex-1 bg-black/40 border border-green-500/20 rounded-xl p-4 text-[10px] font-mono text-neutral-200 resize-none outline-none" readOnly value={yaml} />
                    </div>
                  </div>
                ) : (
                  <textarea
                    className="w-full h-full bg-transparent p-8 text-slate-300 resize-none outline-none font-serif leading-relaxed"
                    value={coverLetter}
                    onChange={e => setCoverLetter(e.target.value)}
                    placeholder="Cover letter draft..."
                  />
                )}

                {/* ATS Overlay Score (Floating) */}
                {atsAnalysis && (
                  <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl w-64 animate-slide-in-right transform hover:scale-105 transition-transform cursor-default z-10">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase">ATS Score</span>
                      <span className={`text-xl font-black ${atsAnalysis.score >= 80 ? 'text-green-400' : 'text-orange-400'}`}>{atsAnalysis.score}/100</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <div className={`h-full rounded-full ${atsAnalysis.score >= 80 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${atsAnalysis.score}%` }} />
                    </div>
                    <p className="text-[10px] text-slate-300 line-clamp-2">{atsAnalysis.feedback}</p>
                  </div>
                )}

                {/* AI Detection Result Overlay */}
                {aiDetection && (
                  <div className="absolute top-0 right-0 h-full w-80 bg-slate-900/95 backdrop-blur-xl border-l border-white/10 p-6 overflow-y-auto z-50 animate-slide-in-right shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                        Pattern Detector
                      </h3>
                      <button onClick={() => setAiDetection(null)} className="text-slate-400 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <div className="space-y-6">
                      {/* Score */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-end">
                          <span className="text-xs text-slate-400 font-bold uppercase">Human Score</span>
                          <span className={`text-2xl font-black ${aiDetection.human_score > 80 ? 'text-green-400' : 'text-orange-400'}`}>{aiDetection.human_score}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-1000 ${aiDetection.human_score > 80 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${aiDetection.human_score}%` }} />
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="p-4 bg-white/5 border border-white/5 rounded-xl text-sm text-slate-300 italic">
                        "{aiDetection.summary}"
                      </div>

                      {/* Items */}
                      <div className="space-y-3">
                        {aiDetection.items.map((item: any, i: number) => (
                          <div key={i} className="bg-black/40 border border-white/5 p-3 rounded-lg text-xs space-y-1">
                            <div className="flex justify-between">
                              <span className="text-red-400/80 line-through decoration-red-500/50">{item.phrase}</span>
                              <span className="text-[10px] text-slate-500 uppercase tracking-wide">{item.reason}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-green-400 font-bold">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                              {item.suggestion}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- ANALYTICS TAB (Builder Theme) --- */}
        {activeTab === 'analytics' && (
          <div className="h-full bg-[#13161c] border border-white/10 rounded-2xl p-8 overflow-y-auto custom-scrollbar shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Usage Analytics</h2>
                <p className="text-slate-400 text-sm">Track your generation metrics and AI token usage.</p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-mono text-slate-400">Live System</span>
              </div>
            </div>

            {!dashboardStats ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-8 animate-fade-in">

                {/* Top KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-[#1E1E24] border border-white/5 p-5 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-cyan-500/30 transition-all">
                    <div className="text-4xl font-black text-white group-hover:text-cyan-400 transition-colors">{dashboardStats.total_resumes}</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Resumes Generated</div>
                  </div>
                  <div className="bg-[#1E1E24] border border-white/5 p-5 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-fuchsia-500/30 transition-all">
                    <div className="text-4xl font-black text-white group-hover:text-fuchsia-400 transition-colors">{dashboardStats.total_cover_letters || 0}</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cover Letters</div>
                  </div>
                  <div className="bg-[#1E1E24] border border-white/5 p-5 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-violet-500/30 transition-all">
                    <div className="text-4xl font-black text-white group-hover:text-violet-400 transition-colors">{(dashboardStats.total_tokens_input || 0).toLocaleString()}</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Input Tokens</div>
                  </div>
                  <div className="bg-[#1E1E24] border border-white/5 p-5 rounded-xl flex flex-col items-center justify-center gap-2 group hover:border-indigo-500/30 transition-all">
                    <div className="text-4xl font-black text-white group-hover:text-indigo-400 transition-colors">{(dashboardStats.total_tokens_output || 0).toLocaleString()}</div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Output Tokens</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                  {/* Region Distribution */}
                  <div className="bg-[#1E1E24] border border-white/5 p-6 rounded-xl">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                      <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Target Regions
                    </h3>
                    <div className="space-y-4">
                      {Object.entries(dashboardStats.region_distribution || {}).map(([region, count]: any) => (
                        <div key={region} className="group">
                          <div className="flex justify-between text-xs font-bold uppercase mb-1">
                            <span className="text-slate-300 group-hover:text-cyan-400 transition-colors">{region}</span>
                            <span className="text-slate-500">{count}</span>
                          </div>
                          <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-cyan-600 to-blue-600 rounded-full transition-all duration-1000" style={{ width: `${(count / dashboardStats.total_resumes) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                      {Object.keys(dashboardStats.region_distribution || {}).length === 0 && (
                        <div className="text-slate-500 text-sm italic text-center py-4">No data available</div>
                      )}
                    </div>
                  </div>

                  {/* Recent Activity Log */}
                  <div className="bg-[#1E1E24] border border-white/5 p-6 rounded-xl">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                      <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Recent Activity
                    </h3>
                    <div className="space-y-0 h-64 overflow-y-auto custom-scrollbar">
                      {dashboardStats.recent_activity.map((event: any, i: number) => (
                        <div key={i} className="flex gap-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 transition-colors rounded-lg">
                          <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${event.event_type === 'resume_generated' ? 'bg-cyan-500' :
                            event.event_type === 'cover_letter_generated' ? 'bg-fuchsia-500' : 'bg-violet-500'
                            }`} />
                          <div className="flex-1">
                            <div className="text-xs font-mono text-slate-500 mb-0.5">
                              {new Date(event.timestamp + "Z").toLocaleTimeString()}
                            </div>
                            <div className="text-sm font-bold text-slate-200 capitalize">
                              {event.event_type.replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- OUTREACH TAB (Builder Theme) --- */}
        {activeTab === 'outreach' && (
          <div className="grid grid-cols-12 gap-6 h-full">
            {/* Left Column: Controls */}
            <div className="col-span-4 bg-[#13161c] border border-white/10 rounded-2xl p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 shadow-xl">
              <div>
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mb-2">Outreach</h2>
                <p className="text-xs text-slate-400">Tailor your message to the specific recruiter.</p>
              </div>

              {/* Type Selector */}
              <div className="grid grid-cols-3 gap-2 bg-black/30 p-1 rounded-xl">
                {['linkedin', 'cold_email', 'follow_up'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setOutreachType(t as any)}
                    className={`py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${outreachType === t ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {t.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Inputs */}
              {outreachType === 'linkedin' && (
                <div className="space-y-4 animate-fade-in">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Recruiter Name</label>
                    <input
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 mt-1 focus:border-cyan-500/50 outline-none transition-colors"
                      placeholder="e.g. Sarah Jones"
                      value={recruiterName}
                      onChange={e => setRecruiterName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Target Role</label>
                    <input
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 mt-1 focus:border-cyan-500/50 outline-none transition-colors"
                      placeholder="e.g. Technical Recruiter"
                      value={recruiterRole}
                      onChange={e => setRecruiterRole(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Message Format</label>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setLinkedinMsgType('connection')} className={`flex-1 py-2 rounded-lg border text-xs ${linkedinMsgType === 'connection' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-white/5 bg-white/5 text-slate-400'}`}>
                        Connect (300ch)
                      </button>
                      <button onClick={() => setLinkedinMsgType('message')} className={`flex-1 py-2 rounded-lg border text-xs ${linkedinMsgType === 'message' ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300' : 'border-white/5 bg-white/5 text-slate-400'}`}>
                        InMail
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-auto">
                <button
                  onClick={handleGenerateOutreach}
                  disabled={isGeneratingOutreach}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                  {isGeneratingOutreach ? (
                    <>
                      <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                      Writing Magic...
                    </>
                  ) : "Generate Message"}
                </button>
              </div>
            </div>

            {/* Right Column: Preview */}
            <div className="col-span-8 bg-[#1E1E24] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative flex flex-col">
              <div className="h-12 bg-black/20 border-b border-white/5 flex items-center px-4">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Message Preview</span>
                <div className="ml-auto flex gap-2">
                  {outreachType !== 'linkedin' && (
                    <button
                      onClick={() => {
                        const subject = outreachType === 'cold_email' || emailSequence.length > 0 ? (emailSequence[activeEmailIndex]?.subject || "Application") : "Application";
                        const body = outreachType === 'cold_email' || emailSequence.length > 0 ? (emailSequence[activeEmailIndex]?.body || outreachContent) : outreachContent;
                        // Use Gmail's "Compose" view URL to pre-fill subject and body
                        window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
                      }}
                      className="text-[10px] px-2 py-1 bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-500 hover:to-orange-400 rounded text-white font-bold flex items-center gap-1 shadow-lg"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Open Gmail
                    </button>
                  )}
                  <button
                    onClick={() => { navigator.clipboard.writeText(linkedinResult || outreachContent); alert("Copied!"); }}
                    className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-300 border border-white/5"
                  >
                    Copy to Clipboard
                  </button>
                </div>
              </div>

              <div className="flex-1 p-6 relative">
                {/* Background Accents */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[64px]" />

                {(linkedinResult || outreachContent) ? (
                  <div className="relative z-10 font-serif text-slate-200 text-lg leading-relaxed whitespace-pre-wrap">
                    {outreachType === 'linkedin' ? linkedinResult : outreachContent}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <svg className="w-16 h-16 opacity-20 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    <p>Select settings and generate your message</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- TRACKER TAB (Builder Theme) --- */}
        {/* --- TRACKER TAB (Kanban Board) --- */}
        {activeTab === 'tracker' && (
          <div className="h-full flex flex-col gap-6">
            <div className="bg-[#13161c] border border-white/10 rounded-2xl p-6 flex justify-between items-center shadow-lg shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-white">Application Tracker</h2>
                <p className="text-xs text-slate-400">Drag and drop to update status (Simulation)</p>
              </div>
              <button onClick={fetchApplications} className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-slate-300 transition-colors flex items-center gap-2">
                Refresh
              </button>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-4 h-full min-w-[1000px] px-4 pb-4">
                {['Applied', 'Interview', 'Offer', 'Rejected'].map((status) => (
                  <div key={status} className="flex-1 flex flex-col bg-[#1E1E24] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                    {/* Column Header */}
                    <div className={`p-4 border-b border-white/5 flex items-center justify-between
                            ${status === 'Applied' ? 'bg-blue-500/10' :
                        status === 'Interview' ? 'bg-violet-500/10' :
                          status === 'Offer' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      <h3 className={`font-bold uppercase tracking-widest text-xs
                               ${status === 'Applied' ? 'text-blue-400' :
                          status === 'Interview' ? 'text-violet-400' :
                            status === 'Offer' ? 'text-green-400' : 'text-red-400'}`}>
                        {status}
                      </h3>
                      <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] text-white/50">
                        {applications.filter(a => a.status === status || (status === 'Applied' && !['Interview', 'Offer', 'Rejected'].includes(a.status))).length}
                      </span>
                    </div>

                    {/* Cards Container */}
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-3">
                      {applications.filter(a => a.status === status || (status === 'Applied' && !['Interview', 'Offer', 'Rejected'].includes(a.status))).map(app => (
                        <div key={app.id} className="bg-[#13161c] p-4 rounded-xl border border-white/5 group hover:border-cyan-500/30 transition-all shadow-md relative">
                          <h4 className="font-bold text-slate-200 text-sm group-hover:text-cyan-400 transition-colors mb-1">{app.company_name}</h4>
                          <p className="text-[10px] text-slate-500 font-medium mb-3">{app.job_title}</p>
                          <p className="text-[9px] text-slate-600 font-mono mb-3">{app.date_applied}</p>

                          {/* Quick Actions */}
                          <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {status !== 'Rejected' && <button onClick={() => updateAppStatus(app.id, "Rejected")} className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors" title="Reject"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
                            {status !== 'Interview' && status !== 'Offer' && <button onClick={() => updateAppStatus(app.id, "Interview")} className="p-1.5 hover:bg-violet-500/20 text-slate-500 hover:text-violet-400 rounded transition-colors" title="Move to Interview"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></button>}
                            {status === 'Interview' && <button onClick={() => updateAppStatus(app.id, "Offer")} className="p-1.5 hover:bg-green-500/20 text-slate-500 hover:text-green-400 rounded transition-colors" title="Move to Offer"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg></button>}
                            <button onClick={() => deleteApp(app.id)} className="p-1.5 hover:bg-slate-700 text-slate-600 hover:text-white rounded transition-colors" title="Delete"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div >

      <style jsx global>{`
        .bg-grid-pattern {
           background-size: 50px 50px;
           background-image: linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
                             linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
           mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
           animation: grid-move 20s linear infinite;
        }
        
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(to bottom, #4f46e5, #ec4899); border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(to bottom, #6366f1, #d946ef); }

        @keyframes grid-move {
          0% { transform: translateY(0); }
          100% { transform: translateY(50px); }
        }

        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, 30px); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, -20px); }
        }
        @keyframes float-fast {
           0%, 100% { transform: translate(0, 0) rotate(0deg); }
           33% { transform: translate(10px, -10px) rotate(2deg); }
           66% { transform: translate(-5px, 15px) rotate(-1deg); }
        }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.3; transform: scale(1); filter: hue-rotate(0deg); }
          50% { opacity: 0.5; transform: scale(1.1); filter: hue-rotate(15deg); }
        }
        
        @keyframes text-shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }

        @keyframes border-glow {
          0%, 100% { box-shadow: 0 0 5px rgba(139, 92, 246, 0.5), inset 0 0 0px rgba(139, 92, 246, 0.1); }
          50% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.8), inset 0 0 10px rgba(139, 92, 246, 0.2); }
        }

        .animate-float-slow { animation: float-slow 10s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 12s ease-in-out infinite; }
        .animate-pulse-slow { animation: pulse-slow 6s ease-in-out infinite; }
        .animate-float-fast { animation: float-fast 5s ease-in-out infinite; }
        .animate-text-shimmer { background-size: 200% auto; animation: text-shimmer 3s linear infinite; }
        .animate-border-glow { animation: border-glow 2s ease-in-out infinite; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        .animate-cyber-scan { animation: cyber-scan 2s linear infinite; }
        
        @keyframes cyber-scan {
            0% { top: 0%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div >
  );
}
