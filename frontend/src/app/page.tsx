"use client";

import { useState } from "react";

export default function Home() {
  const [jd, setJd] = useState("");
  const [yaml, setYaml] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloadName, setDownloadName] = useState("Tailored_Resume");
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [atsAnalysis, setAtsAnalysis] = useState<any>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setPdfUrl(null);
    setAtsAnalysis(null);
    try {
      const response = await fetch("http://localhost:8000/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          job_description: jd,
          current_yaml: yaml,
          api_key: apiKey,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        alert("Error: " + err.detail);
        return;
      }

      const data = await response.json();

      // Handle PDF
      const pdfData = "data:application/pdf;base64," + data.pdf_base64;
      setPdfUrl(pdfData);

      // Handle ATS
      setAtsAnalysis(data.ats_analysis);

    } catch (e) {
      alert("Failed to generate resume.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 selection:text-purple-200 font-sans relative overflow-hidden">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/20 rounded-full blur-[120px] animate-pulse delay-1000" />
      </div>

      <div className="max-w-[1400px] mx-auto p-6 relative z-10">

        {/* Header */}
        <header className="text-center py-12 space-y-4">
          <div className="inline-block mb-4">
            <span className="bg-slate-800/50 text-purple-300 border border-purple-500/30 text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
              AI-Powered Evaluation
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 drop-shadow-sm">
            Antigravity Resume
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Forge the perfect resume tailored to any job description using <span className="text-slate-200 font-semibold">Gemini models 3 flash preview Pro</span> & <span className="text-slate-200 font-semibold">RenderCV</span>.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT COLUMN: Inputs */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-2xl">
              <h2 className="text-xl font-semibold flex items-center gap-3 text-white mb-6">
                <span className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">⚙️</span>
                Configuration
              </h2>

              <div className="space-y-5">
                <div className="group">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Gemini API Key</label>
                  <input
                    type="password"
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 outline-none transition-all group-hover:border-slate-600"
                    placeholder="Optional (if set in backend)"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>

                <div className="group">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Job Description</label>
                  <textarea
                    className="w-full h-40 bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 outline-none resize-none transition-all group-hover:border-slate-600 custom-scrollbar"
                    placeholder="Paste the Job Description here..."
                    value={jd}
                    onChange={(e) => setJd(e.target.value)}
                  />
                </div>

                <div className="group">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wide">Current Resume (YAML)</label>
                  <textarea
                    className="w-full h-56 bg-slate-950/50 border border-slate-700 rounded-lg px-4 py-3 text-xs font-mono text-slate-300 placeholder-slate-600 focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 outline-none resize-none transition-all group-hover:border-slate-600 custom-scrollbar"
                    placeholder="Paste your RenderCV YAML content here..."
                    value={yaml}
                    onChange={(e) => setYaml(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-8">
                <button
                  onClick={handleGenerate}
                  disabled={loading || !jd || !yaml}
                  className={`relative w-full py-4 rounded-xl font-bold text-white shadow-lg overflow-hidden group transition-all transform hover:-translate-y-0.5 active:translate-y-0 ${loading || !jd || !yaml
                    ? "bg-slate-800 cursor-not-allowed opacity-50"
                    : "bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:shadow-purple-500/25"
                    }`}
                >
                  <span className="relative z-10 flex items-center justify-center gap-3">
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white/80" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Optimizing...
                      </>
                    ) : (
                      <>
                        <span>✨</span> Generate Tailored Resume
                      </>
                    )}
                  </span>

                  {!loading && (jd && yaml) && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 translate-x-[-150%] group-hover:animate-shine" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Preview & Results */}
          <div className="lg:col-span-8 space-y-6">

            {/* ATS Score Card */}
            {atsAnalysis && (
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-xl flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* Score Circle */}
                <div className="flex-shrink-0 flex items-center justify-center">
                  <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="64" cy="64" r="56" stroke="currentColor" strokeWidth="10" fill="transparent" className="text-slate-800" />
                      <circle
                        cx="64" cy="64" r="56"
                        stroke="currentColor"
                        strokeWidth="10"
                        fill="transparent"
                        strokeDasharray={351.86}
                        strokeDashoffset={351.86 - (351.86 * atsAnalysis.score) / 100}
                        className={`transition-all duration-1000 ease-out ${atsAnalysis.score >= 80 ? 'text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]' :
                          atsAnalysis.score >= 70 ? 'text-yellow-500 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]' :
                            'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                          }`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-white">{atsAnalysis.score}</span>
                      <span className="text-xs uppercase tracking-wider text-slate-400">Score</span>
                    </div>
                  </div>
                </div>

                {/* Feedback Content */}
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">ATS Analysis</h3>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full border ${atsAnalysis.score >= 80 ? 'bg-green-500/10 border-green-500/30 text-green-400' :
                      atsAnalysis.score >= 70 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
                        'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}>
                      {atsAnalysis.score >= 80 ? 'EXCELLENT' : atsAnalysis.score >= 70 ? 'GOOD' : 'NEEDS WORK'}
                    </span>
                  </div>

                  <p className="text-slate-300 text-sm leading-relaxed bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    {atsAnalysis.feedback}
                  </p>

                  {atsAnalysis.missing_keywords && atsAnalysis.missing_keywords.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Missing Keywords</p>
                      <div className="flex flex-wrap gap-2">
                        {atsAnalysis.missing_keywords.map((kw: string, i: number) => (
                          <span key={i} className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs font-medium rounded-md border border-red-500/20">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-800">
                    <span className="font-semibold text-slate-400">Format Check:</span> {atsAnalysis.formatting_check}
                  </p>
                </div>
              </div>
            )}

            {/* PDF Preview */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden flex flex-col h-[800px] animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <div className="bg-slate-950/50 p-4 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-pink-500/10 text-pink-400 rounded-lg text-sm">👁️</span>
                  <span className="font-semibold text-slate-200">Live Preview</span>
                </div>

                {pdfUrl && (
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={downloadName}
                      onChange={(e) => setDownloadName(e.target.value)}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2 px-3 outline-none w-48 placeholder-slate-600"
                      placeholder="Filename"
                    />
                    <a
                      href={pdfUrl}
                      download={downloadName.endsWith(".pdf") ? downloadName : `${downloadName}.pdf`}
                      className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-green-900/20"
                    >
                      <span>Download PDF</span>
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                    </a>
                  </div>
                )}
              </div>

              <div className="flex-1 bg-slate-950/30 flex items-center justify-center p-4 relative">
                {pdfUrl ? (
                  <iframe src={pdfUrl} className="w-full h-full rounded-lg shadow-2xl" title="Resume Preview" />
                ) : (
                  <div className="text-center p-12">
                    <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-600">
                      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-300 mb-2">Ready to Generate</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">
                      Paste your job description and resume YAML on the left to generate your optimized, ATS-friendly resume.
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles for Textareas (Optional, usually handled in global css but good to simulate here if possible via class) */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(30, 41, 59, 0.5); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(71, 85, 105, 0.8); 
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.6); 
        }
        @keyframes shine {
          100% {
            transform: translateX(200%) skewX(12deg);
          }
        }
        .animate-shine {
          animation: shine 2s infinite;
        }
      `}</style>
    </div>
  );
}
