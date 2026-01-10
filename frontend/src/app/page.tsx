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

  // Email Sequencer State
  const [emailSequence, setEmailSequence] = useState<any[]>([]);
  const [activeEmailIndex, setActiveEmailIndex] = useState(0);

  const [theme, setTheme] = useState("classic");
  const [targetRegion, setTargetRegion] = useState("international");

  // Constant for API URL avoids "localhost" issues on mobile
  const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://resume-backend-463635413770.asia-south1.run.app";

  // Outreach State
  const [outreachType, setOutreachType] = useState("linkedin");
  const [outreachContent, setOutreachContent] = useState("");
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);

  // Tracker State
  const [applications, setApplications] = useState<any[]>([]);
  const [refreshTracker, setRefreshTracker] = useState(0);

  const [userComments, setUserComments] = useState("");
  const [downloadName, setDownloadName] = useState("Bhavesh_Resume");

  // Process State
  type Step = "idle" | "rewriting" | "analyzing" | "rendering" | "complete" | "error";
  const [currentStep, setCurrentStep] = useState<Step>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  // Results
  // Results
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [atsAnalysis, setAtsAnalysis] = useState<any>(null);
  const [aiDetection, setAiDetection] = useState<any>(null);

  const [coverLetter, setCoverLetter] = useState<string>("");
  const [isGeneratingClPdf, setIsGeneratingClPdf] = useState(false);


  const handleGenerate = async () => {
    // Reset
    setPdfUrl(null);
    setAtsAnalysis(null);
    setAiDetection(null);
    setCoverLetter("");

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
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${backendUrl}/detect_ai`, {
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
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${backendUrl}/generate_cover_letter`, {
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
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

    try {
      const res = await fetch(`${backendUrl}/render_cover_letter_pdf`, {
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
        alert("Job Description Imported!");
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
    setEmailSequence([]); // clear previous
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

      <div className="max-w-[1600px] mx-auto p-4 md:p-8 relative z-10">

        {/* Navigation Tabs */}
        <div className="flex justify-center mb-8 gap-4">
          <button
            onClick={() => setActiveTab('builder')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'builder' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/20' : 'bg-white/5 hover:bg-white/10 text-slate-400'}`}
          >
            Resume Builder
          </button>
          <button
            onClick={() => setActiveTab('outreach')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'outreach' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20' : 'bg-white/5 hover:bg-white/10 text-slate-400'}`}
          >
            Outreach AI
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`px-6 py-2 rounded-full font-bold transition-all ${activeTab === 'tracker' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/20' : 'bg-white/5 hover:bg-white/10 text-slate-400'}`}
          >
            Job Tracker
          </button>
        </div>

        {/* Header */}
        {activeTab === 'builder' && (
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-lg animate-fade-in-up">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">v2.1 • AI Augmented</span>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-center animate-fade-in-up delay-100">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400">Antigravity</span>
              <span className="block text-4xl md:text-5xl mt-2 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 font-extrabold drop-shadow-2xl animate-text-shimmer">
                Resume Builder
              </span>
            </h1>
          </div>
        )}

        {/* --- MAIN BUILDER TAB --- */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* --- LEFT COLUMN: Controls --- */}
            <div className="lg:col-span-4 space-y-6 animate-slide-in-left">
              <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/10 p-6 rounded-3xl shadow-2xl relative overflow-hidden group">
                {/* Subtle top sheen */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

                <h2 className="text-xl font-bold flex items-center gap-3 text-white mb-6">
                  <div className="p-2 bg-gradient-to-br from-slate-800 to-slate-900 rounded-lg border border-white/5 shadow-inner">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  Configuration
                </h2>

                <div className="space-y-5">

                  {/* Theme Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Design Theme</label>
                    <div className="relative">
                      <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none transition-all appearance-none cursor-pointer hover:bg-white/10"
                      >
                        <option value="classic">Classic Professional</option>
                        <option value="engineering">Engineering Clean</option>
                        <option value="sb2nov">Modern Minimal (sb2nov)</option>
                        <option value="moderncv">Stylish Two-Column</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  {/* Target Country Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Target Country Profile</label>
                    <div className="relative">
                      <select
                        value={targetRegion}
                        onChange={(e) => setTargetRegion(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 outline-none transition-all appearance-none cursor-pointer hover:bg-white/10"
                      >
                        <option value="international">International / Global (Default)</option>
                        <option value="germany">Germany (Lebenslauf Standard)</option>
                        <option value="dubai">Dubai / UAE (Regional Norms)</option>
                        <option value="uk">United Kingdom (Professional)</option>
                        <option value="usa">USA (Concise Analysis)</option>
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  {/* API Key */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Gemini API Key</label>
                    <input
                      type="password"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none transition-all"
                      placeholder="Optional (if set in backend)"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>

                  {/* User Instructions (Comments) */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Additional Instructions</label>
                    <textarea
                      className="w-full h-24 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-green-500/50 focus:border-green-500/50 outline-none resize-none transition-all custom-scrollbar hover:bg-white/10"
                      placeholder="E.g. 'Focus on my Python experience', 'Remove the 2019 internship', 'Make it strictly 1 page'..."
                      value={userComments}
                      onChange={(e) => setUserComments(e.target.value)}
                    />
                  </div>

                  {/* Job Description */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Job Description</label>

                    {/* Scraper Input */}
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Paste Job Post URL (LinkedIn/Indeed)..."
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-200 focus:border-cyan-500/50 outline-none"
                        value={scraperUrl}
                        onChange={(e) => setScraperUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleScrapeJob}
                        disabled={isScraping || !scraperUrl}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                      >
                        {isScraping ? "Importing..." : "Import JD"}
                      </button>
                    </div>

                    <textarea
                      className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-slate-300 focus:border-cyan-500/50 outline-none transition-all resize-none"
                      placeholder="Paste the job description here or import from URL..."
                      value={jd}
                      onChange={(e) => setJd(e.target.value)}
                    />
                  </div>

                  {/* Resume YAML */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Resume YAML</label>
                    <div className="relative group/editor">
                      <textarea
                        className="w-full h-64 bg-[#0F1115] border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-slate-300 placeholder-slate-700 focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 outline-none resize-none transition-all custom-scrollbar leading-relaxed"
                        placeholder="Paste your RenderCV YAML content here..."
                        value={yaml}
                        onChange={(e) => setYaml(e.target.value)}
                        spellCheck={false}
                      />
                      <div className="absolute top-2 right-2 px-2 py-1 bg-white/10 rounded text-[10px] text-slate-400 opacity-0 group-hover/editor:opacity-100 transition-opacity pointer-events-none">
                        YAML Editor
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Button */}
                <div className="mt-8 pt-6 border-t border-white/10">
                  <button
                    onClick={handleGenerate}
                    disabled={currentStep !== "idle" && currentStep !== "complete" && currentStep !== "error"}
                    className={`relative w-full py-4 rounded-xl font-bold text-white shadow-lg overflow-hidden group transition-all transform hover:-translate-y-1 hover:shadow-2xl 
                    ${(currentStep !== "idle" && currentStep !== "complete" && currentStep !== "error") || !jd || !yaml
                        ? "bg-slate-800 cursor-not-allowed opacity-50 grayscale"
                        : "bg-gradient-to-r from-cyan-500 via-violet-500 to-fuchsia-500 animate-border-glow shadow-violet-500/40"
                      }`}
                  >
                    <div className="absolute inset-0 bg-white/20 group-hover:translate-x-full duration-1000 transform -skew-x-12 -translate-x-full transition-transform ease-out" />
                    <span className="relative z-10 flex items-center justify-center gap-3 text-lg">
                      {currentStep === 'idle' || currentStep === 'complete' || currentStep === 'error' ? (
                        <>
                          <svg className="w-5 h-5 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                          Optimize Resume
                        </>
                      ) : (
                        <>
                          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      )}
                    </span>
                  </button>
                </div>

                {/* Progress Indicators */}
                {(currentStep !== "idle" && currentStep !== "error") && (
                  <div className="mt-6 p-4 bg-black/40 rounded-xl border border-white/5 backdrop-blur-md">
                    <p className="text-xs font-bold text-cyan-300 mb-4 text-center animate-pulse tracking-wide">
                      {statusMessage}
                    </p>
                    <div className="flex justify-between relative px-4">
                      {/* Line */}
                      <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-0 -translate-y-1/2" />
                      <div
                        className="absolute top-1/2 left-0 h-0.5 bg-gradient-to-r from-cyan-500 to-violet-500 -z-0 -translate-y-1/2 transition-all duration-700"
                        style={{ width: currentStep === 'analyzing' ? '50%' : currentStep === 'complete' ? '100%' : '0%' }}
                      />

                      {steps.map((s) => {
                        const status = getStepStatus(s.id);
                        return (
                          <div key={s.id} className="relative z-10 flex flex-col items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-xl
                              ${status === 'completed' ? 'bg-green-500 border-green-500 text-white scale-110 shadow-green-500/30' :
                                status === 'active' ? 'bg-gradient-to-br from-violet-600 to-fuchsia-600 border-violet-400 text-white scale-125 animate-pulse shadow-violet-500/50' :
                                  'bg-slate-900 border-slate-700 text-slate-600'}`}>
                              {status === 'completed' ? <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <span className="text-white">{s.icon}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex justify-between mt-2 px-1">
                      {steps.map((s) => (
                        <span key={s.id + "lbl"} className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                          {s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tools Grid */}
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <button
                    onClick={handleDetectAI}
                    disabled={!yaml}
                    className="group p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all flex flex-col items-center gap-2 text-slate-400 hover:text-cyan-300 disabled:opacity-50"
                  >
                    <svg className="w-8 h-8 grayscale group-hover:grayscale-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-bold uppercase tracking-wider">Check AI Logic</span>
                  </button>
                  <button
                    onClick={handleGenerateCoverLetter}
                    disabled={!yaml || !jd}
                    className="group p-4 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-all flex flex-col items-center gap-2 text-slate-400 hover:text-fuchsia-300 disabled:opacity-50"
                  >
                    <svg className="w-8 h-8 grayscale group-hover:grayscale-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-xs font-bold uppercase tracking-wider">Draft Cover Letter</span>
                  </button>
                </div>

              </div>
            </div>

            {/* --- RIGHT COLUMN: Results --- */}
            <div className="lg:col-span-8 space-y-6 animate-slide-in-right">

              {/* ATS Score Card */}
              {atsAnalysis && (
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-3xl shadow-2xl relative overflow-hidden">
                  {/* Background Glow */}
                  <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none 
                  ${atsAnalysis.score >= 80 ? 'bg-green-500' : 'bg-red-500'}`} />

                  <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
                    {/* Donut Chart */}
                    <div className="relative w-40 h-40 flex-shrink-0">
                      <svg className="w-full h-full transform -rotate-90 filter drop-shadow-lg">
                        <circle cx="80" cy="80" r="70" stroke="#1e293b" strokeWidth="12" fill="transparent" />
                        <circle
                          cx="80" cy="80" r="70"
                          stroke="currentColor" strokeWidth="12" fill="transparent"
                          strokeDasharray={439.82}
                          strokeDashoffset={439.82 - (439.82 * atsAnalysis.score) / 100}
                          className={`transition-all duration-1500 ease-out 
                            ${atsAnalysis.score >= 80 ? 'text-green-500' : atsAnalysis.score >= 70 ? 'text-yellow-500' : 'text-red-500'}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-5xl font-black text-white">{atsAnalysis.score}</span>
                        <span className="text-xs font-bold uppercase text-slate-400 mt-1">ATS Score</span>
                      </div>
                    </div>

                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-bold text-white">ATS Analysis</h3>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full border 
                           ${atsAnalysis.score >= 80 ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                          {atsAnalysis.score >= 80 ? "EXCELLENT MATCH" : "OPTIMIZATION NEEDED"}
                        </span>
                      </div>
                      <p className="text-slate-300 text-sm leading-relaxed p-4 bg-black/20 rounded-xl border border-white/5">
                        {atsAnalysis.feedback}
                      </p>
                      {atsAnalysis.missing_keywords?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Missing Keywords</p>
                          <div className="flex flex-wrap gap-2">
                            {atsAnalysis.missing_keywords.map((kw: string, i: number) => (
                              <span key={i} className="px-2.5 py-1 text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-300 rounded-md">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Pattern Report */}
              {aiDetection && (
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-5 rounded-3xl shadow-xl">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                      <svg className="w-6 h-6 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                      Pattern Detector
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${aiDetection.human_score > 80 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${aiDetection.human_score}%` }} />
                      </div>
                      <span className="text-sm font-bold text-white">{aiDetection.human_score}% Human</span>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-3 bg-black/20 rounded-xl border border-white/5 text-sm text-slate-300 italic">
                      "{aiDetection.summary}"
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                      {aiDetection.items.map((item: any, i: number) => (
                        <div key={i} className="text-xs bg-white/5 p-2 rounded-lg border border-white/5 flex flex-col">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-red-400 font-mono line-through opacity-75">{item.phrase}</span>
                            <span className="text-[10px] text-slate-500 uppercase">{item.reason}</span>
                          </div>
                          <span className="text-green-400 font-bold flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            {item.suggestion}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tabbed Results Area */}
              <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[900px]">

                {/* Controls Bar */}
                <div className="bg-black/40 border-b border-white/5 p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                  {/* Tabs */}
                  <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                    <button
                      onClick={() => setActiveResultTab("resume")}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeResultTab === 'resume' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                      Resume Preview
                    </button>
                    <button
                      onClick={() => setActiveResultTab("cover-letter")}
                      className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeResultTab === 'cover-letter' ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                    >
                      Cover Letter
                    </button>
                  </div>

                  {/* Actions */}
                  {activeResultTab === "resume" && pdfUrl && (
                    <div className="flex gap-3">
                      <input
                        className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none w-40 focus:border-cyan-500/50"
                        value={downloadName}
                        onChange={(e) => setDownloadName(e.target.value)}
                      />
                      <a href={pdfUrl} download={`${downloadName}.pdf`} className="flex items-center gap-2 px-5 py-2 bg-white text-black hover:bg-slate-200 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-white/10">
                        Download PDF
                      </a>
                      <button
                        onClick={handleSaveToTracker}
                        className="px-6 py-2 bg-violet-600/20 text-violet-300 border border-violet-500/30 font-bold rounded-lg hover:bg-violet-600/30 transition-colors flex items-center gap-2"
                      >
                        Save to Tracker
                      </button>
                    </div>
                  )}

                  {activeResultTab === "cover-letter" && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => navigator.clipboard.writeText(coverLetter)}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-semibold text-slate-300"
                      >
                        Copy Text
                      </button>
                      <button
                        onClick={handleDownloadClPdf}
                        disabled={isGeneratingClPdf}
                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white rounded-lg text-sm font-bold shadow-lg hover:brightness-110 disabled:opacity-50"
                      >
                        {isGeneratingClPdf ? "Generating..." : "Download PDF"}
                      </button>
                      <button
                        onClick={handleSaveToTracker}
                        className="px-6 py-2 bg-violet-600/20 text-violet-300 border border-violet-500/30 font-bold rounded-lg hover:bg-violet-600/30 transition-colors flex items-center gap-2"
                      >
                        Save to Tracker
                      </button>
                    </div>
                  )}
                </div>

                {/* Viewport */}
                <div className="flex-1 relative bg-[#1E1E24]/50 overflow-hidden">

                  {activeResultTab === "resume" && (
                    <div className="h-full w-full flex items-center justify-center p-8">
                      {pdfUrl ? (
                        <iframe src={pdfUrl} className="w-full h-full rounded-xl shadow-2xl border border-white/10 bg-white" />
                      ) : (
                        <div className="text-center opacity-30">
                          <svg className="w-24 h-24 mx-auto mb-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <p className="text-xl font-bold">Document Preview</p>
                          <p className="text-sm">Optimized content will appear here</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeResultTab === "cover-letter" && (
                    <div className="h-full w-full p-8">
                      <textarea
                        className="w-full h-full bg-transparent text-slate-200 resize-none outline-none font-serif text-lg leading-relaxed whitespace-pre-wrap p-4 custom-scrollbar"
                        value={coverLetter}
                        onChange={(e) => setCoverLetter(e.target.value)}
                        placeholder="Generate a cover letter to view and edit it here..."
                      />
                    </div>
                  )}
                </div>

              </div>


            </div>

          </div>
        )}

        {/* --- OUTREACH TAB --- */}
        {activeTab === 'outreach' && (
          <div className="max-w-4xl mx-auto animate-fade-in">
            <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                Cold Outreach Generator
              </h2>
              <p className="text-slate-400 mb-8">Generate high-conversion messages tailored to the Job Description.</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {['linkedin', 'cold_email', 'follow_up'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setOutreachType(t)}
                    className={`p-4 rounded-xl border transition-all ${outreachType === t ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}
                  >
                    <div className="capitalize font-bold mb-1">{t.replace('_', ' ')}</div>
                    <div className="text-xs opacity-70">
                      {t === 'linkedin' ? 'Short connection request' : t === 'cold_email' ? 'Pitch to Hiring Manager' : 'Polite nudge after 1 week'}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleGenerateOutreach}
                disabled={isGeneratingOutreach}
                className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
              >
                {isGeneratingOutreach ? "Writing Magic..." : "Generate Message"}
              </button>

              {/* Output Display */}
              {emailSequence.length > 0 ? (
                <div className="mt-8 relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
                  <div className="relative bg-[#020617] rounded-xl p-6 border border-white/10">

                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 border-b border-white/10 pb-2">
                      {emailSequence.map((email, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveEmailIndex(idx)}
                          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeEmailIndex === idx
                            ? "bg-white/10 text-cyan-400 border-b-2 border-cyan-400"
                            : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                          {email.label || `Email ${idx + 1}`}
                        </button>
                      ))}
                    </div>

                    <div className="mb-4">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Subject</span>
                      <div className="mt-1 text-lg font-medium text-slate-200 border-b border-white/10 pb-2">
                        {emailSequence[activeEmailIndex].subject}
                      </div>
                    </div>

                    <pre className="whitespace-pre-wrap font-sans text-slate-300">
                      {emailSequence[activeEmailIndex].body}
                    </pre>

                    <button
                      onClick={() => navigator.clipboard.writeText(emailSequence[activeEmailIndex].subject + "\n\n" + emailSequence[activeEmailIndex].body)}
                      className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : outreachContent && (
                <div className="mt-8 relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-blue-600/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
                  <div className="relative bg-[#020617] rounded-xl p-6 border border-white/10">
                    <pre className="whitespace-pre-wrap font-sans text-slate-300">{outreachContent}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(outreachContent)}
                      className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TRACKER TAB --- */}
        {activeTab === 'tracker' && (
          <div className="max-w-6xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-500">
                Application Tracker
              </h2>
              <button onClick={fetchApplications} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400">
                Refresh
              </button>
            </div>

            {applications.length === 0 ? (
              <div className="text-center py-20 text-slate-500 bg-white/5 rounded-3xl border border-white/5 border-dashed">
                No applications tracked yet. save one from the Builder!
              </div>
            ) : (
              <div className="grid gap-4">
                {applications.map((app) => (
                  <div key={app.id} className="bg-[#0f172a]/80 backdrop-blur border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center gap-6 group hover:border-white/10 transition-all">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white">{app.company_name}</h3>
                      <div className="text-slate-400">{app.job_title}</div>
                      <div className="text-xs text-slate-600 mt-1">Applied: {app.date_applied}</div>
                    </div>

                    <div className="flex items-center gap-4">
                      <select
                        value={app.status}
                        onChange={(e) => updateAppStatus(app.id, e.target.value)}
                        className={`bg-transparent border border-white/10 rounded-lg px-3 py-1 text-sm font-bold outline-none
                                   ${app.status === 'Applied' ? 'text-blue-400' :
                            app.status === 'Interviewing' ? 'text-yellow-400' :
                              app.status === 'Offer' ? 'text-green-400' : 'text-red-400'}`}
                      >
                        <option value="Applied">Applied</option>
                        <option value="Interviewing">Interviewing</option>
                        <option value="Offer">Offer</option>
                        <option value="Rejected">Rejected</option>
                      </select>

                      <button
                        onClick={() => deleteApp(app.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-2"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

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
      `}</style>
    </div>
  );
}
