import React, { useState, useEffect } from 'react';
import { 
  Github, 
  Wand2, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  ChevronRight, 
  Settings2,
  Loader2,
  ExternalLink,
  Code2,
  Plus,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateWordPressPlugin } from './services/geminiService';
import { Octokit } from "octokit";
import { pushToGitHub } from './services/githubService';
import { GitHubConfig, GenerationResult, PluginFile } from './types';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [config, setConfig] = useState<GitHubConfig>(() => {
    const saved = localStorage.getItem('wp_forge_config');
    return saved ? JSON.parse(saved) : {
      token: '',
      owner: '',
      repo: '',
      branch: 'main',
      geminiModel: 'gemini-1.5-flash'
    };
  });
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(() => {
    const saved = localStorage.getItem('wp_forge_last_result');
    return saved ? JSON.parse(saved) : null;
  });
  const [selectedFile, setSelectedFile] = useState<PluginFile | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string, url?: string } | null>(null);
  const [history, setHistory] = useState<{ id: string, type: 'gen' | 'push' | 'error' | 'info', message: string, timestamp: number, url?: string, result?: GenerationResult }[]>(() => {
    const saved = localStorage.getItem('wp_forge_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [activeTab, setActiveTab] = useState<'config' | 'forge' | 'history'>('forge');

  // Set initial selected file if result exists
  useEffect(() => {
    if (result && !selectedFile) {
      setSelectedFile(result.files[0]);
    }
  }, [result, selectedFile]);

  // Save config to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('wp_forge_config', JSON.stringify(config));
  }, [config]);

  // Save history to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('wp_forge_history', JSON.stringify(history));
  }, [history]);

  // Save last result to localStorage when it changes
  useEffect(() => {
    if (result) {
      localStorage.setItem('wp_forge_last_result', JSON.stringify(result));
    }
  }, [result]);

  // Save config to localStorage manually (for the button)
  const saveConfig = () => {
    localStorage.setItem('wp_forge_config', JSON.stringify(config));
    const msg = 'Configuration saved locally.';
    setStatus({ type: 'success', message: msg });
    setHistory(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      type: 'info',
      message: msg,
      timestamp: Date.now()
    }, ...prev]);
  };

  const testGitHubConnection = async () => {
    if (!config.token || !config.owner) {
      setStatus({ type: 'error', message: 'Please provide Token and Owner to test connection.' });
      return;
    }
    
    setStatus({ type: 'info', message: 'Testing GitHub connection...' });
    const octokit = new Octokit({ auth: config.token });
    
    try {
      const { data: user } = await octokit.rest.users.getAuthenticated();
      if (user.login.toLowerCase() === config.owner.toLowerCase()) {
        setStatus({ type: 'success', message: `Connection successful! Authenticated as ${user.login}.` });
      } else {
        setStatus({ type: 'info', message: `Connected as ${user.login}, but Owner is set to ${config.owner}.` });
      }
    } catch (error: any) {
      setStatus({ type: 'error', message: `Connection failed: ${error.message}` });
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setStatus(null);
    
    const genId = Math.random().toString(36).substr(2, 9);
    setHistory(prev => [{
      id: genId,
      type: 'gen',
      message: 'Forging plugin... please keep this window open.',
      timestamp: Date.now()
    }, ...prev]);

    try {
      const genResult = await generateWordPressPlugin(prompt, config.geminiKey, config.geminiModel);

      setResult(genResult);
      setSelectedFile(genResult.files[0]);
      const message = `Plugin "${genResult.pluginName}" generated successfully.`;
      setStatus({ type: 'success', message });
      
      // Update the history item with success message
      setHistory(prev => prev.map(item => 
        item.id === genId ? { ...item, message, timestamp: Date.now(), result: genResult } : item
      ));
    } catch (error: any) {
      console.error("Generation error:", error);
      const errorMessage = error.message || 'Failed to generate plugin.';
      setStatus({ type: 'error', message: errorMessage });
      
      // Update the history item with error message
      setHistory(prev => prev.map(item => 
        item.id === genId ? { ...item, type: 'error', message: errorMessage, timestamp: Date.now() } : item
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePush = async () => {
    if (!result || !config.token || !config.owner || !config.repo) {
      const msg = 'Please provide GitHub details in the Config tab and generate a plugin first.';
      setStatus({ type: 'error', message: msg });
      setHistory(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        type: 'error',
        message: msg,
        timestamp: Date.now()
      }, ...prev]);
      return;
    }
    setIsPushing(true);
    setStatus(null);

    const pushId = Math.random().toString(36).substr(2, 9);
    setHistory(prev => [{
      id: pushId,
      type: 'push',
      message: `Pushing ${result.pluginName} to GitHub...`,
      timestamp: Date.now()
    }, ...prev]);

    try {
      const pushResult = await pushToGitHub(config, result.files, `Add ${result.pluginName} plugin`);

      const message = pushResult.created 
        ? `Repository "${config.owner}/${config.repo}" created and plugin pushed successfully!`
        : `Successfully pushed to ${config.owner}/${config.repo}!`;
        
      setStatus({ 
        type: 'success', 
        message,
        url: pushResult.url
      });
      
      // Update the history item with success message
      setHistory(prev => prev.map(item => 
        item.id === pushId ? { ...item, message, timestamp: Date.now(), url: pushResult.url } : item
      ));
    } catch (error: any) {
      console.error("Push error:", error);
      const errorMessage = error.message || 'Failed to push to GitHub. Check your token and repo details.';
      setStatus({ type: 'error', message: errorMessage });
      
      // Update the history item with error message
      setHistory(prev => prev.map(item => 
        item.id === pushId ? { ...item, type: 'error', message: errorMessage, timestamp: Date.now() } : item
      ));
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 flex justify-between items-center bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#141414] text-[#E4E3E0] flex items-center justify-center rounded-sm">
            <Wand2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight uppercase">WP Plugin Forge</h1>
            <p className="text-[10px] font-mono opacity-50 uppercase tracking-widest">AI-Powered Development Pipeline</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {isGenerating && (
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest opacity-40">
              <Loader2 size={12} className="animate-spin" />
              Forging...
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-0 min-h-[calc(100vh-89px)]">
        {/* Mobile Tabs */}
        <div className="lg:hidden flex border-b border-[#141414] bg-white sticky top-[89px] z-40">
          <button 
            onClick={() => setActiveTab('config')}
            className={cn(
              "flex-1 p-4 text-[10px] font-bold uppercase tracking-widest border-r border-[#141414]",
              activeTab === 'config' ? "bg-[#141414] text-[#E4E3E0]" : "bg-white"
            )}
          >
            Config
          </button>
          <button 
            onClick={() => setActiveTab('forge')}
            className={cn(
              "flex-1 p-4 text-[10px] font-bold uppercase tracking-widest border-r border-[#141414]",
              activeTab === 'forge' ? "bg-[#141414] text-[#E4E3E0]" : "bg-white"
            )}
          >
            Forge
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 p-4 text-[10px] font-bold uppercase tracking-widest",
              activeTab === 'history' ? "bg-[#141414] text-[#E4E3E0]" : "bg-white"
            )}
          >
            History
          </button>
        </div>

        {/* Sidebar: Config */}
        <aside className={cn(
          "lg:col-span-3 border-r border-[#141414] p-8 space-y-8 bg-[#F0EFEA] lg:block",
          activeTab !== 'config' && "hidden"
        )}>
          <section>
            <div className="flex items-center gap-2 mb-6">
              <Settings2 size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider italic font-serif">Configuration</h2>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Gemini API Key</label>
                  {!config.geminiKey && !process.env.GEMINI_API_KEY && (
                    <span className="text-[8px] text-red-500 font-bold animate-pulse">REQUIRED</span>
                  )}
                </div>
                <input 
                  type="password" 
                  value={config.geminiKey || ''}
                  onChange={(e) => setConfig({...config, geminiKey: e.target.value})}
                  placeholder="AI Studio Key (Optional if set in Secrets)"
                  className="w-full bg-white border border-[#141414] p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all"
                />
                <p className="text-[8px] opacity-40 leading-tight">Solo necesario si la clave automática falla o estás en móvil.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Gemini Model</label>
                <select 
                  value={config.geminiModel || 'gemini-3-flash-preview'}
                  onChange={(e) => setConfig({...config, geminiModel: e.target.value})}
                  className="w-full bg-white border border-[#141414] p-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all appearance-none cursor-pointer"
                >
                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast & Smart)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Most Powerful)</option>
                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite (Fastest)</option>
                  <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental)</option>
                </select>
              </div>

              <div className="pt-2 border-t border-[#141414]/10"></div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">GitHub Token</label>
                <input 
                  type="password" 
                  value={config.token}
                  onChange={(e) => setConfig({...config, token: e.target.value})}
                  placeholder="ghp_..."
                  className="w-full bg-white border border-[#141414] p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#141414] transition-all"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Owner</label>
                  <input 
                    type="text" 
                    value={config.owner}
                    onChange={(e) => setConfig({...config, owner: e.target.value})}
                    placeholder="username"
                    className="w-full bg-white border border-[#141414] p-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Repo</label>
                  <input 
                    type="text" 
                    value={config.repo}
                    onChange={(e) => setConfig({...config, repo: e.target.value})}
                    placeholder="my-repo"
                    className="w-full bg-white border border-[#141414] p-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold opacity-50 tracking-widest">Branch</label>
                <input 
                  type="text" 
                  value={config.branch}
                  onChange={(e) => setConfig({...config, branch: e.target.value})}
                  placeholder="main"
                  className="w-full bg-white border border-[#141414] p-3 text-xs focus:outline-none focus:ring-1 focus:ring-[#141414]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={saveConfig}
                  className="bg-[#141414] text-[#E4E3E0] py-3 text-xs font-bold uppercase tracking-widest hover:bg-opacity-90 transition-all active:scale-[0.98]"
                >
                  Save Config
                </button>
                <button 
                  onClick={testGitHubConnection}
                  className="bg-white border border-[#141414] text-[#141414] py-3 text-xs font-bold uppercase tracking-widest hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  Test Connection
                </button>
              </div>
            </div>
          </section>

          <section className="pt-8 border-t border-[#141414]/10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <ChevronRight size={14} />
                <h2 className="text-[10px] font-bold uppercase tracking-widest opacity-50">Recent History</h2>
              </div>
              {history.length > 0 && (
                <button 
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem('wp_forge_history');
                  }}
                  className="text-[8px] uppercase font-bold tracking-widest opacity-30 hover:opacity-100 transition-opacity"
                >
                  Clear All
                </button>
              )}
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {history.length === 0 ? (
                <p className="text-[10px] opacity-30 italic">No recent activity</p>
              ) : (
                history.map(item => (
                  <div key={item.id} className="p-3 bg-white/50 border border-[#141414]/5 rounded-sm space-y-1">
                    <div className="flex justify-between items-start">
                      <span className={cn(
                        "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                        item.type === 'gen' ? "bg-blue-100 text-blue-700" : 
                        item.type === 'push' ? "bg-emerald-100 text-emerald-700" :
                        item.type === 'info' ? "bg-gray-100 text-gray-700" :
                        "bg-red-100 text-red-700"
                      )}>
                        {item.type === 'gen' ? 'Gen' : item.type === 'push' ? 'Push' : item.type === 'info' ? 'Info' : 'Error'}
                      </span>
                      <span className="text-[8px] opacity-30 font-mono">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  <p className="text-[10px] leading-tight font-medium line-clamp-2">{item.message}</p>
                  {item.result && (
                    <button 
                      onClick={() => {
                        setResult(item.result!);
                        setSelectedFile(item.result!.files[0]);
                        setActiveTab('forge');
                      }}
                      className="text-[8px] flex items-center gap-1 font-bold uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      Restore to Forge <Wand2 size={8} />
                    </button>
                  )}
                  {item.url && (
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-[8px] flex items-center gap-1 font-bold uppercase tracking-widest hover:underline"
                      >
                        Link <ExternalLink size={8} />
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="pt-8 border-t border-[#141414]/10">
            <div className="p-4 bg-[#141414] text-[#E4E3E0] rounded-sm space-y-2">
              <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">Quick Tip</p>
              <p className="text-xs leading-relaxed">
                Provide a detailed prompt like "A plugin that adds a custom post type for Books with taxonomies for Author and Genre."
              </p>
            </div>
          </section>
        </aside>

        {/* Main Content: Generation & Preview */}
        <div className={cn(
          "lg:col-span-9 flex flex-col lg:flex",
          activeTab !== 'forge' && "hidden"
        )}>
          {/* Prompt Area */}
          <section className="p-8 border-b border-[#141414] bg-white">
            {status && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "mb-6 p-4 rounded-sm text-xs font-medium flex items-center gap-3 border",
                  status.type === 'success' && "bg-emerald-50 border-emerald-200 text-emerald-700",
                  status.type === 'error' && "bg-red-50 border-red-200 text-red-700",
                  status.type === 'info' && "bg-blue-50 border-blue-200 text-blue-700"
                )}
              >
                {status.type === 'success' ? <CheckCircle2 size={16} /> : status.type === 'error' ? <AlertCircle size={16} /> : <Loader2 size={16} className="animate-spin" />}
                <div className="flex-1">
                  <p className="font-bold uppercase tracking-widest text-[10px] mb-0.5">{status.type}</p>
                  <p>{status.message}</p>
                </div>
                {status.url && (
                  <a 
                    href={status.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 hover:bg-black/5 rounded-full transition-colors"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={() => setStatus(null)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X size={14} />
                </button>
              </motion.div>
            )}

            <div className="flex items-center gap-2 mb-4">
              <Code2 size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider italic font-serif">Plugin Specification</h2>
            </div>
            <div className="relative">
              <textarea 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your WordPress plugin in detail..."
                className="w-full h-32 bg-[#F9F9F7] border border-[#141414] p-6 text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] resize-none transition-all"
              />
              <button 
                onClick={handleGenerate}
                disabled={isGenerating || !prompt.trim()}
                className="absolute bottom-4 right-4 bg-[#141414] text-[#E4E3E0] px-6 py-3 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.95]"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                {isGenerating ? 'Forging...' : 'Generate Plugin'}
              </button>
            </div>
          </section>

          {/* Results Area */}
          <section className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden">
            {result ? (
              <>
                {/* File List */}
                <div className="md:col-span-3 border-r border-[#141414] bg-[#F0EFEA] overflow-y-auto">
                  <div className="p-4 border-b border-[#141414] flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Files</span>
                    <span className="text-[10px] font-mono">{result.files.length} items</span>
                  </div>
                  {result.files.map((file, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedFile(file)}
                      className={cn(
                        "w-full p-4 text-left flex items-center gap-3 border-bottom border-[#141414]/5 transition-all hover:bg-white/50",
                        selectedFile?.path === file.path && "bg-white border-r-4 border-r-[#141414]"
                      )}
                    >
                      <FileCode size={14} className="opacity-50" />
                      <span className="text-xs font-mono truncate">{file.path}</span>
                    </button>
                  ))}
                </div>

                {/* Code Preview */}
                <div className="md:col-span-9 flex flex-col bg-white overflow-hidden">
                  <div className="p-4 border-b border-[#141414] flex justify-between items-center bg-[#F9F9F7]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-widest opacity-50">Preview:</span>
                      <span className="text-xs font-mono font-bold">{selectedFile?.path}</span>
                    </div>
                    <button 
                      onClick={handlePush}
                      disabled={isPushing}
                      className="bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-opacity-90 disabled:opacity-50 transition-all"
                    >
                      {isPushing ? <Loader2 size={12} className="animate-spin" /> : <Github size={12} />}
                      {isPushing ? 'Pushing...' : 'Push to GitHub'}
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-6 font-mono text-xs leading-relaxed bg-[#141414] text-[#E4E3E0]">
                    <pre className="whitespace-pre-wrap">
                      {selectedFile?.content}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-12 flex flex-col items-center justify-center p-20 text-center space-y-6 opacity-30">
                <div className="w-20 h-20 border-2 border-dashed border-[#141414] rounded-full flex items-center justify-center">
                  <Plus size={32} />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tighter">No Plugin Generated</h3>
                  <p className="text-xs">Enter a prompt above to start forging your WordPress plugin.</p>
                </div>
              </div>
            )}
          </section>
        </div>
        {/* Mobile History View */}
        <div className={cn(
          "lg:hidden p-8 bg-[#F0EFEA]",
          activeTab !== 'history' && "hidden"
        )}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <ChevronRight size={18} />
              <h2 className="text-sm font-bold uppercase tracking-wider italic font-serif">Recent History</h2>
            </div>
            {history.length > 0 && (
              <button 
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem('wp_forge_history');
                }}
                className="text-[8px] uppercase font-bold tracking-widest opacity-30 hover:opacity-100 transition-opacity"
              >
                Clear All
              </button>
            )}
          </div>
          <div className="space-y-4">
            {history.length === 0 ? (
              <p className="text-xs opacity-30 italic">No recent activity</p>
            ) : (
              history.map(item => (
                <div key={item.id} className="p-4 bg-white border border-[#141414] rounded-sm space-y-2">
                  <div className="flex justify-between items-start">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter",
                      item.type === 'gen' ? "bg-blue-100 text-blue-700" : 
                      item.type === 'push' ? "bg-emerald-100 text-emerald-700" :
                      item.type === 'info' ? "bg-gray-100 text-gray-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {item.type === 'gen' ? 'Generation' : item.type === 'push' ? 'GitHub Push' : item.type === 'info' ? 'Information' : 'Error'}
                    </span>
                    <span className="text-[10px] opacity-30 font-mono">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm leading-tight font-medium">{item.message}</p>
                  {item.result && (
                    <button 
                      onClick={() => {
                        setResult(item.result!);
                        setSelectedFile(item.result!.files[0]);
                        setActiveTab('forge');
                      }}
                      className="text-[10px] flex items-center gap-1 font-bold uppercase tracking-widest text-blue-600 hover:underline"
                    >
                      Restore to Forge <Wand2 size={10} />
                    </button>
                  )}
                  {item.url && (
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] flex items-center gap-1 font-bold uppercase tracking-widest hover:underline"
                    >
                      View on GitHub <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#141414] p-4 flex justify-between items-center bg-white/50 text-[10px] uppercase font-bold tracking-[0.2em] opacity-50">
        <div>&copy; 2026 WP Plugin Forge</div>
        <div className="flex gap-6">
          <a href="#" className="hover:opacity-100 transition-opacity">Documentation</a>
          <a href="#" className="hover:opacity-100 transition-opacity">GitHub API</a>
          <a href="#" className="hover:opacity-100 transition-opacity">Gemini AI</a>
        </div>
      </footer>
    </div>
  );
}
