import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Session, Wine, Rating, Message } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WineCard } from './components/WineCard';
import confetti from 'canvas-confetti';
import { analyzeWineRatings, generateFinalSessionSummary, researchWineDetails } from './services/geminiService';
import { Toaster, toast } from 'sonner';
import { AutocompleteInput } from './components/AutocompleteInput';
import { GRAPE_VARIETIES, WINE_REGIONS } from './constants';
import {
  Wine as WineIcon,
  Plus,
  Users,
  ChevronRight,
  LogOut,
  Trophy,
  BarChart3,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Star,
  Power,
  Trash2,
  Calendar,
  MapPin,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [isAddingWine, setIsAddingWine] = useState(false);
  const [newWineName, setNewWineName] = useState('');
  const [newWineGrape, setNewWineGrape] = useState('');
  const [newWinePrice, setNewWinePrice] = useState('');
  const [newWineVintage, setNewWineVintage] = useState('');
  const [newWineRegion, setNewWineRegion] = useState('');
  const [joinInput, setJoinInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMinimalMode, setIsMinimalMode] = useState(false);

  const anonymousName = useMemo(() => {
    if (!user) return '';
    const adjectives = ['Spritziger', 'Edler', 'Würziger', 'Fruchtiger', 'Trockener', 'Süßer', 'Samtiger', 'Reifer'];
    const nouns = ['Riesling', 'Merlot', 'Korken', 'Dekanter', 'Sommelier', 'Rebstock', 'Kelch', 'Jahrgang'];
    const hash = user.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${adjectives[hash % adjectives.length]} ${nouns[(hash * 7) % nouns.length]}`;
  }, [user]);

  // Load user from Authelia forward-auth
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u) setUser(u);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Restore session from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vinoReveal_currentSessionId');
    if (saved) setCurrentSessionId(saved);
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('vinoReveal_currentSessionId', currentSessionId);
    } else {
      localStorage.removeItem('vinoReveal_currentSessionId');
    }
  }, [currentSessionId]);

  // Load recent sessions
  useEffect(() => {
    if (!user) return;
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setRecentSessions)
      .catch(console.error);
  }, [user]);

  // SSE subscription per session
  useEffect(() => {
    if (!currentSessionId) {
      setSession(null);
      setWines([]);
      setRatings([]);
      setMessages([]);
      return;
    }

    // Load initial session data
    Promise.all([
      fetch(`/api/sessions/${currentSessionId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/sessions/${currentSessionId}/wines`).then(r => r.json()),
      fetch(`/api/sessions/${currentSessionId}/ratings`).then(r => r.json()),
      fetch(`/api/sessions/${currentSessionId}/messages`).then(r => r.json()),
    ]).then(([sess, w, rat, msg]) => {
      if (sess) {
        if (sess.status === 'terminated') { setCurrentSessionId(null); return; }
        setSession(sess);
      }
      setWines((w || []).sort((a: Wine, b: Wine) => a.order - b.order));
      setRatings(rat || []);
      setMessages(msg || []);
    }).catch(console.error);

    const es = new EventSource(`/api/events/${currentSessionId}`);

    es.addEventListener('session_updated', (e) => {
      const data = JSON.parse(e.data) as Session;
      if (data.status === 'terminated') { setCurrentSessionId(null); return; }
      setSession(data);
    });

    es.addEventListener('wines_updated', () => {
      fetch(`/api/sessions/${currentSessionId}/wines`)
        .then(r => r.json())
        .then(w => setWines(w.sort((a: Wine, b: Wine) => a.order - b.order)))
        .catch(console.error);
    });

    es.addEventListener('ratings_updated', () => {
      fetch(`/api/sessions/${currentSessionId}/ratings`)
        .then(r => r.json())
        .then(setRatings)
        .catch(console.error);
    });

    es.addEventListener('messages_updated', () => {
      fetch(`/api/sessions/${currentSessionId}/messages`)
        .then(r => r.json())
        .then(setMessages)
        .catch(console.error);
    });

    return () => es.close();
  }, [currentSessionId]);

  // Confetti when summary is generated
  useEffect(() => {
    if (session?.summary && session.status === 'completed') {
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
      document.body.appendChild(canvas);
      const myConfetti = confetti.create(canvas, { resize: true, useWorker: false });
      const interval: any = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        myConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        myConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
      return () => {
        clearInterval(interval);
        if (document.body.contains(canvas)) document.body.removeChild(canvas);
      };
    }
  }, [session?.summary, session?.status]);

  const handleLogin = () => window.location.reload();

  const handleLogout = () => {
    setUser(null);
    setCurrentSessionId(null);
    setSession(null);
  };

  const terminateSession = async () => {
    if (!currentSessionId) return;
    await fetch(`/api/sessions/${currentSessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'terminated' }),
    });
    setCurrentSessionId(null);
    setShowTerminateConfirm(false);
  };

  const createSession = async () => {
    if (!newSessionName.trim()) return;
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newSessionName }),
    });
    if (res.ok) {
      const s = await res.json();
      setCurrentSessionId(s.id);
      setIsCreatingSession(false);
      setNewSessionName('');
    }
  };

  const joinSession = async (shortId: string) => {
    if (!shortId.trim() || isJoining) return;
    setIsJoining(true);
    try {
      const res = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortId: shortId.trim() }),
      });
      if (res.ok) {
        const s = await res.json();
        setCurrentSessionId(s.id);
        setJoinInput('');
      } else {
        alert('Session mit dieser ID nicht gefunden!');
      }
    } finally {
      setIsJoining(false);
    }
  };

  const addWine = async () => {
    if (!currentSessionId || !newWineName.trim()) return;
    const maxNum = wines.reduce((max, w) => {
      const num = parseInt(w.label.split('#')[1]);
      return isNaN(num) ? max : Math.max(max, num);
    }, 0);
    await fetch(`/api/sessions/${currentSessionId}/wines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newWineName,
        grapeVariety: newWineGrape || null,
        price: newWinePrice ? parseFloat(newWinePrice) : null,
        vintage: newWineVintage ? parseInt(newWineVintage) : null,
        region: newWineRegion || null,
        label: `Wein #${maxNum + 1}`,
        order: Date.now(),
      }),
    });
    setNewWineName(''); setNewWineGrape(''); setNewWinePrice('');
    setNewWineVintage(''); setNewWineRegion(''); setIsAddingWine(false);
  };

  const submitRating = async (
    wineId: string,
    score: number,
    comment: string,
    guessedGrape?: string,
    guessedPrice?: number,
    guessedVintage?: number,
    guessedRegion?: string
  ) => {
    if (!currentSessionId) return;
    await fetch(`/api/sessions/${currentSessionId}/ratings/${wineId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, comment, guessedGrapeVariety: guessedGrape, guessedPrice, guessedVintage, guessedRegion }),
    });
  };

  const revealWine = async (wineId: string) => {
    if (!currentSessionId) return;
    const wine = wines.find(w => w.id === wineId);
    if (!wine) return;
    const wineRatings = ratings.filter(r => r.wineId === wineId);

    let analysis = 'Analyse konnte nicht erstellt werden.';
    let research = 'Fakten konnten nicht geladen werden.';

    try {
      analysis = await analyzeWineRatings(wine, wineRatings);
    } catch (e: any) {
      toast.error(e.message || 'KI-Analyse fehlgeschlagen');
    }

    try {
      research = await researchWineDetails(wine);
    } catch (e: any) {
      toast.error(e.message || 'Wein-Recherche fehlgeschlagen');
    }

    await fetch(`/api/sessions/${currentSessionId}/wines/${wineId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revealed: true, analysis, research }),
    });
  };

  const generateSummary = async () => {
    if (!currentSessionId || !session || wines.length === 0) return;
    setIsGeneratingSummary(true);
    try {
      const summary = await generateFinalSessionSummary(session.name, wines, ratings);
      await fetch(`/api/sessions/${currentSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, status: 'completed' }),
      });
      toast.success('Abschlussfazit erfolgreich erstellt!');
    } catch (e: any) {
      toast.error(e.message || 'Abschlussfazit konnte nicht erstellt werden');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const sendMessage = async () => {
    if (!currentSessionId || !newMessage.trim()) return;
    await fetch(`/api/sessions/${currentSessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newMessage, anonymousName }),
    });
    setNewMessage('');
  };

  const leaderboard = useMemo(() => {
    if (!session || wines.length === 0 || ratings.length === 0) return [];
    const userPoints: Record<string, { userId: string; name: string; points: number; correctGrapes: number; closePrices: number; correctVintages: number; correctRegions: number }> = {};
    session.participants.forEach(uid => {
      const userRating = ratings.find(r => r.userId === uid);
      userPoints[uid] = { userId: uid, name: userRating?.userName || 'Teilnehmer', points: 0, correctGrapes: 0, closePrices: 0, correctVintages: 0, correctRegions: 0 };
    });
    wines.forEach(wine => {
      if (!wine.revealed) return;
      const wineRatings = ratings.filter(r => r.wineId === wine.id);
      const scores = wineRatings.map(r => r.score).sort((a, b) => a - b);
      let median = 0;
      if (scores.length > 0) {
        const mid = Math.floor(scores.length / 2);
        median = scores.length % 2 !== 0 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
      }
      wineRatings.forEach(rating => {
        if (!userPoints[rating.userId]) return;
        let points = 0;
        if (wine.grapeVariety && rating.guessedGrapeVariety && wine.grapeVariety.toLowerCase().includes(rating.guessedGrapeVariety.toLowerCase())) {
          points += 50; userPoints[rating.userId].correctGrapes++;
        }
        if (wine.price && rating.guessedPrice && Math.abs(wine.price - rating.guessedPrice) <= wine.price * 0.1) {
          points += 30; userPoints[rating.userId].closePrices++;
        }
        if (wine.vintage && rating.guessedVintage) {
          const diff = Math.abs(wine.vintage - rating.guessedVintage);
          if (diff === 0) { points += 50; userPoints[rating.userId].correctVintages++; }
          else if (diff === 1) { points += 20; userPoints[rating.userId].correctVintages++; }
        }
        if (wine.region && rating.guessedRegion && (wine.region.toLowerCase().includes(rating.guessedRegion.toLowerCase()) || rating.guessedRegion.toLowerCase().includes(wine.region.toLowerCase()))) {
          points += 40; userPoints[rating.userId].correctRegions++;
        }
        const diffToMedian = Math.abs(rating.score - median);
        const minDiff = Math.min(...wineRatings.map(r => Math.abs(r.score - median)));
        if (diffToMedian === minDiff) points += 20;
        userPoints[rating.userId].points += points;
      });
    });
    return Object.values(userPoints).sort((a, b) => b.points - a.points);
  }, [session, wines, ratings]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-stone-50">
        <div className="wine-loader" />
        <p className="text-wine-900 font-serif font-bold animate-pulse">VinoReveal lädt...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <motion.div animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-24 -left-24 w-96 h-96 bg-wine-500/20 rounded-full blur-3xl" />
        <motion.div animate={{ scale: [1, 1.3, 1], rotate: [0, -90, 0], opacity: [0.1, 0.15, 0.1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
          className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] bg-wine-900/10 rounded-full blur-3xl" />
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          className="max-w-md w-full text-center space-y-12 relative z-10">
          <div className="space-y-6">
            <motion.div whileHover={{ scale: 1.05, rotate: 5 }} whileTap={{ scale: 0.95 }}
              className="mx-auto w-28 h-28 wine-gradient rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-8 relative">
              <WineIcon className="w-14 h-14 text-white" />
              <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0, 0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-white rounded-[2.5rem]" />
            </motion.div>
            <div className="space-y-2">
              <h1 className="text-7xl font-serif font-black text-wine-950 tracking-tighter">VinoReveal</h1>
              <p className="text-stone-500 text-lg font-medium">Blinde Weinproben. Echte Emotionen. Witzige Analysen.</p>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full py-5 bg-stone-900 text-white rounded-[1.5rem] font-bold shadow-2xl hover:bg-stone-800 transition-all flex items-center justify-center gap-4 group">
            <span className="text-lg">Anmelden</span>
          </motion.button>
          <div className="flex justify-center gap-8 opacity-40">
            {['Sicher', 'Anonym', 'Live'].map(label => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className="w-1 h-1 bg-stone-400 rounded-full" />
                <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-center" richColors />
      <div className={cn('min-h-screen transition-all duration-500', isDarkMode ? 'dark' : 'light', isMinimalMode && 'minimal')}>
        <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-20 transition-colors duration-500">
          {/* Header */}
          <header className="sticky top-0 z-[60] glass px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentSessionId(null)}>
              <WineIcon className="w-6 h-6 text-wine-700" />
              <span className="font-serif font-bold text-xl text-wine-950 dark:text-wine-100">VinoReveal</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
                <button onClick={() => setIsDarkMode(!isDarkMode)}
                  className={cn('p-1.5 rounded-lg transition-all', isDarkMode ? 'bg-wine-700 text-white shadow-lg' : 'text-stone-400 hover:text-stone-600')}>
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsMinimalMode(!isMinimalMode)}
                  className={cn('p-1.5 rounded-lg transition-all', isMinimalMode ? 'bg-wine-700 text-white shadow-lg' : 'text-stone-400 hover:text-stone-600')}>
                  {isMinimalMode ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
              </div>
              <div className="hidden md:block text-right">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest">Angemeldet als</p>
                <p className="text-sm font-bold dark:text-stone-200">{user.displayName}</p>
              </div>
              <button onClick={handleLogout} className="p-2 text-stone-400 hover:text-wine-700 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </header>

          <main className="max-w-4xl mx-auto p-4 space-y-8">
            <AnimatePresence mode="wait">
              {!currentSessionId ? (
                <motion.div key="session-selection" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-12 pt-12">
                  <div className="text-center space-y-3">
                    <h2 className="text-4xl font-serif font-bold tracking-tight">Willkommen, {user.displayName.split(' ')[0]}!</h2>
                    <p className="text-stone-500 text-lg">Starte eine neue Probe oder tritt einer bestehenden bei.</p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <motion.button whileHover={{ y: -4 }} onClick={() => setIsCreatingSession(true)}
                      className="p-10 glass rounded-[2.5rem] border-2 border-dashed border-stone-200 hover:border-wine-300 hover:bg-wine-50/50 transition-all text-center space-y-4 group">
                      <div className="mx-auto w-16 h-16 bg-wine-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-8 h-8 text-wine-700" />
                      </div>
                      <div>
                        <h3 className="font-bold text-xl">Neue Weinprobe</h3>
                        <p className="text-sm text-stone-500">Erstelle eine Session für deine Freunde.</p>
                      </div>
                    </motion.button>

                    <motion.div whileHover={{ y: -4 }} className="p-10 glass rounded-[2.5rem] space-y-6">
                      <div className="mx-auto w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center">
                        <Users className="w-8 h-8 text-stone-600" />
                      </div>
                      <div className="text-center">
                        <h3 className="font-bold text-xl">Teilnehmen</h3>
                        <p className="text-sm text-stone-500">Gib die Session-ID ein, um beizutreten.</p>
                      </div>
                      <div className="flex gap-2">
                        <input type="text" placeholder="Session ID" value={joinInput} onChange={(e) => setJoinInput(e.target.value)}
                          className="flex-1 px-5 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wine-500 shadow-inner"
                          onKeyDown={(e) => e.key === 'Enter' && joinSession(joinInput)} />
                        <button onClick={() => joinSession(joinInput)} disabled={isJoining || !joinInput.trim()}
                          className="p-3 bg-wine-700 text-white rounded-2xl hover:bg-wine-800 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[52px] shadow-lg">
                          {isJoining ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ChevronRight className="w-6 h-6" />}
                        </button>
                      </div>
                    </motion.div>
                  </div>

                  {recentSessions.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 px-2">Deine letzten Proben</h3>
                      <div className="grid gap-3">
                        {recentSessions.map(s => (
                          <motion.button key={s.id} whileHover={{ x: 4 }} onClick={() => setCurrentSessionId(s.id)}
                            className="w-full p-4 glass rounded-2xl flex items-center justify-between hover:bg-white transition-all group">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-wine-50 rounded-xl flex items-center justify-center text-wine-700 group-hover:scale-110 transition-transform">
                                <WineIcon className="w-5 h-5" />
                              </div>
                              <div className="text-left">
                                <p className="font-bold text-stone-900">{s.name}</p>
                                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">ID: {s.short_id || s.shortId} • {(s.participants || []).length} Teilnehmer</p>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-wine-700 transition-colors" />
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {isCreatingSession && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm" onClick={() => setIsCreatingSession(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6 relative z-10">
                          <h3 className="text-2xl font-serif font-bold">Session erstellen</h3>
                          <input autoFocus type="text" value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)}
                            placeholder="Name der Weinprobe (z.B. Riesling-Nacht)"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                            onKeyDown={(e) => e.key === 'Enter' && createSession()} />
                          <div className="flex gap-3">
                            <button onClick={() => setIsCreatingSession(false)} className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors">Abbrechen</button>
                            <button onClick={createSession} disabled={!newSessionName.trim()} className="flex-1 py-3 bg-wine-700 text-white font-bold rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50">Erstellen</button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ) : (
                <motion.div key="active-session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  {/* Session Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-3xl font-serif font-bold text-wine-950 dark:text-wine-100">{session?.name}</h2>
                      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                        <Users className="w-4 h-4" />
                        <span>{(session?.participants || []).length} Teilnehmer</span>
                        <span className="mx-1">•</span>
                        <span className="font-mono text-xs bg-stone-200 dark:bg-stone-800 px-2 py-0.5 rounded uppercase tracking-wider">
                          ID: {(session as any)?.short_id || session?.shortId}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {session?.createdBy === user.uid ? (
                        <div className="flex items-center gap-2">
                          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={() => setIsAddingWine(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-wine-700 text-white rounded-full hover:bg-wine-800 transition-colors shadow-md text-sm font-bold">
                            <Plus className="w-4 h-4" />Wein
                          </motion.button>
                          <button onClick={() => setShowTerminateConfirm(true)} className="p-2 text-stone-400 hover:text-red-600 transition-colors" title="Session beenden">
                            <Power className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setCurrentSessionId(null)} className="flex items-center gap-2 px-4 py-2 text-stone-500 hover:text-wine-700 transition-colors text-sm font-medium">
                          <LogOut className="w-4 h-4" />Verlassen
                        </button>
                      )}
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => setIsLiveFeedOpen(true)}
                        className="p-3 glass rounded-xl text-wine-900 hover:bg-white transition-all shadow-md relative">
                        <MessageSquare className="w-5 h-5" />
                        <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-wine-600 rounded-full border-2 border-white animate-pulse" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Terminate Confirm Modal */}
                  <AnimatePresence>
                    {showTerminateConfirm && (
                      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setShowTerminateConfirm(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6 relative z-10 text-center">
                          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                            <Trash2 className="w-8 h-8" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="text-xl font-serif font-bold">Session beenden?</h3>
                            <p className="text-stone-500 text-sm">Dies wird die Weinprobe für alle Teilnehmer endgültig beenden.</p>
                          </div>
                          <div className="flex gap-3">
                            <button onClick={() => setShowTerminateConfirm(false)} className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors">Abbrechen</button>
                            <button onClick={terminateSession} className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors">Beenden</button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Add Wine Modal */}
                  <AnimatePresence>
                    {isAddingWine && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm" onClick={() => setIsAddingWine(false)} />
                        <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }}
                          className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6 relative z-10">
                          <h3 className="text-2xl font-serif font-bold">Wein hinzufügen</h3>
                          <p className="text-sm text-stone-500">Gib den echten Namen des Weins ein. Die Teilnehmer sehen diesen erst nach der Enthüllung.</p>
                          <div className="space-y-4">
                            <div>
                              <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Name des Weins</label>
                              <input autoFocus type="text" value={newWineName} onChange={(e) => setNewWineName(e.target.value)}
                                placeholder="z.B. 2018 Château Margaux"
                                className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500" />
                            </div>
                            <AutocompleteInput label="Rebsorte" value={newWineGrape} onChange={setNewWineGrape} suggestions={GRAPE_VARIETIES} placeholder="z.B. Cabernet Sauvignon" />
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Preis (€)</label>
                                <input type="number" value={newWinePrice} onChange={(e) => setNewWinePrice(e.target.value)} placeholder="z.B. 45"
                                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500" />
                              </div>
                              <div>
                                <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Jahrgang</label>
                                <input type="number" value={newWineVintage} onChange={(e) => setNewWineVintage(e.target.value)} placeholder="z.B. 2018"
                                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500" />
                              </div>
                            </div>
                            <AutocompleteInput label="Region" value={newWineRegion} onChange={setNewWineRegion} suggestions={WINE_REGIONS} placeholder="z.B. Bordeaux" />
                          </div>
                          <div className="flex gap-3 pt-4">
                            <button onClick={() => { setIsAddingWine(false); setNewWineName(''); }} className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors">Abbrechen</button>
                            <button onClick={addWine} disabled={!newWineName.trim()} className="flex-1 py-3 bg-wine-700 text-white font-bold rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50">Hinzufügen</button>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Leaderboard */}
                  <AnimatePresence>
                    {leaderboard.length > 0 && (
                      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                        className="glass rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5"><Trophy className="w-32 h-32" /></div>
                        <h3 className="text-2xl font-serif font-bold flex items-center gap-3 dark:text-stone-100 relative z-10">
                          <Trophy className="w-8 h-8 text-amber-500" />Tasting Champions
                        </h3>
                        <div className="flex flex-wrap gap-4 relative z-10">
                          {leaderboard.map((player, idx) => (
                            <motion.div key={player.userId} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: idx * 0.1 }}
                              className={cn('flex items-center gap-4 px-6 py-4 rounded-[1.5rem] border transition-all',
                                idx === 0 ? 'bg-amber-50 border-amber-200 text-amber-900 shadow-xl shadow-amber-100 scale-105' : 'bg-white/50 border-stone-100 text-stone-600')}>
                              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-serif font-black text-xl',
                                idx === 0 ? 'bg-amber-200 text-amber-900' : 'bg-stone-100 text-stone-400')}>{idx + 1}</div>
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{player.name}</p>
                                <div className="flex items-baseline gap-2">
                                  <p className="text-xl font-black">{player.points}</p>
                                  <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Punkte</span>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-1">
                                  <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Rebsorte"><WineIcon className="w-2.5 h-2.5" />{player.correctGrapes}</div>
                                  <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Preis"><Star className="w-2.5 h-2.5" />{player.closePrices}</div>
                                  <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Jahrgang"><Calendar className="w-2.5 h-2.5" />{player.correctVintages}</div>
                                  <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Region"><MapPin className="w-2.5 h-2.5" />{player.correctRegions}</div>
                                </div>
                              </div>
                              {idx === 0 && <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />}
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Wine List */}
                  <div className="space-y-6">
                    {wines.length === 0 ? (
                      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-24 glass rounded-[3rem] border-2 border-dashed border-stone-200">
                        <WineIcon className="w-16 h-16 text-stone-300 mx-auto mb-6" />
                        <p className="text-stone-500 text-lg">Noch keine Weine hinzugefügt.</p>
                      </motion.div>
                    ) : (
                      <div className="space-y-6">
                        {session?.summary && (
                          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                            className="glass rounded-[3rem] p-10 border-2 border-wine-100 bg-wine-50/30 space-y-8 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-wine-200/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                            <div className="flex items-center justify-between text-wine-900 relative z-10">
                              <div className="flex items-center gap-4">
                                <Sparkles className="w-8 h-8" />
                                <h3 className="text-3xl font-serif font-bold">Das Sommelier-Fazit</h3>
                              </div>
                              {session.createdBy === user.uid && (
                                <button onClick={generateSummary} className="p-2 text-wine-400 hover:text-wine-700 transition-colors" title="Fazit aktualisieren">
                                  <Loader2 className={cn('w-6 h-6', isGeneratingSummary && 'animate-spin')} />
                                </button>
                              )}
                            </div>
                            <div className="prose prose-stone max-w-none prose-headings:font-serif prose-headings:text-wine-950 prose-p:text-stone-700 relative z-10">
                              <Markdown>{session.summary}</Markdown>
                            </div>
                            <div className="pt-6 border-t border-wine-100">
                              <h4 className="font-serif font-bold text-lg mb-4">Statistisches Ranking (Median)</h4>
                              <div className="space-y-3">
                                {wines.map(w => {
                                  const wineRatings = ratings.filter(r => r.wineId === w.id).map(r => r.score).sort((a, b) => a - b);
                                  let median = 0;
                                  if (wineRatings.length > 0) {
                                    const mid = Math.floor(wineRatings.length / 2);
                                    median = wineRatings.length % 2 !== 0 ? wineRatings[mid] : (wineRatings[mid - 1] + wineRatings[mid]) / 2;
                                  }
                                  return { name: w.name, median };
                                }).sort((a, b) => b.median - a.median).map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <span className="w-6 h-6 flex items-center justify-center bg-stone-100 rounded-full text-xs font-bold text-stone-500">{idx + 1}</span>
                                      <span className="font-medium">{item.name}</span>
                                    </div>
                                    <div className="font-bold text-wine-700">{item.median} <span className="text-[10px] text-stone-400 font-normal">MEDIAN</span></div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}

                        <AnimatePresence>
                          {isGeneratingSummary && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-8 p-6 text-center">
                              <div className="wine-loader border-white after:bg-white" />
                              <div className="space-y-2">
                                <h3 className="text-2xl font-serif font-bold text-white">KI-Sommelier am Werk</h3>
                                <p className="text-stone-300 max-w-xs mx-auto">Ich analysiere eure Bewertungen und erstelle ein exklusives Fazit für diesen Abend...</p>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {wines.every(w => w.revealed) && !session?.summary && session?.createdBy === user?.uid && (
                          <div className="glass rounded-3xl p-8 text-center space-y-4 border-2 border-dashed border-wine-200">
                            <Trophy className="w-12 h-12 text-wine-300 mx-auto" />
                            <div>
                              <h3 className="text-xl font-serif font-bold">Alle Weine enthüllt!</h3>
                              <p className="text-stone-500">Möchtest du das Sommelier-Fazit und die finale Auswertung generieren?</p>
                            </div>
                            <button onClick={generateSummary} disabled={isGeneratingSummary}
                              className="px-8 py-3 bg-wine-700 text-white rounded-full font-bold hover:bg-wine-800 transition-all shadow-lg flex items-center gap-2 mx-auto disabled:opacity-50">
                              {isGeneratingSummary ? <><Loader2 className="w-5 h-5 animate-spin" />Analysiere Abend...</> : <><Sparkles className="w-5 h-5" />Gesamtfazit erstellen</>}
                            </button>
                          </div>
                        )}

                        {wines.every(w => w.revealed) && !session?.summary && session?.createdBy !== user?.uid && (
                          <div className="glass rounded-3xl p-8 text-center space-y-4 border-2 border-dashed border-wine-200">
                            <Loader2 className="w-12 h-12 text-wine-300 mx-auto animate-spin" />
                            <div>
                              <h3 className="text-xl font-serif font-bold">Warten auf das Sommelier-Fazit</h3>
                              <p className="text-stone-500">Der Gastgeber bereitet gerade die finale Auswertung vor...</p>
                            </div>
                          </div>
                        )}

                        {wines.map((wine, idx) => (
                          <motion.div key={wine.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                            <WineCard
                              wine={wine}
                              user={user!}
                              session={session!}
                              ratings={ratings.filter(r => r.wineId === wine.id)}
                              onRate={(score, comment, grape, price, vintage, region) => submitRating(wine.id, score, comment, grape, price, vintage, region)}
                              onReveal={() => revealWine(wine.id)}
                            />
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </main>

          {/* Live Feed Button */}
          {currentSessionId && (
            <button onClick={() => setIsLiveFeedOpen(true)}
              className="fixed bottom-6 right-6 w-14 h-14 bg-wine-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all z-40">
              <MessageSquare className="w-6 h-6" />
              {messages.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                  {messages.length}
                </span>
              )}
            </button>
          )}

          {/* Live Feed Sidebar */}
          <AnimatePresence>
            {isLiveFeedOpen && (
              <div className="fixed inset-0 z-50 flex justify-end">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setIsLiveFeedOpen(false)} />
                <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col">
                  <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-wine-900 text-white">
                    <div>
                      <h3 className="text-xl font-serif font-bold">Anonymer Live-Feed</h3>
                      <p className="text-xs text-wine-200">Du bist heute: <span className="font-bold text-white">{anonymousName}</span></p>
                    </div>
                    <button onClick={() => setIsLiveFeedOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-stone-50">
                    {messages.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4 opacity-40">
                        <MessageSquare className="w-12 h-12" />
                        <p className="text-sm">Noch keine Nachrichten. Schreib den ersten Tipp oder eine Stichelei!</p>
                      </div>
                    ) : (
                      <AnimatePresence initial={false}>
                        {[...messages].reverse().map((msg) => (
                          <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="space-y-1">
                            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest ml-1">{msg.anonymousName}</p>
                            <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-stone-100">
                              <p className="text-sm text-stone-800">{msg.text}</p>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    )}
                  </div>
                  <div className="p-4 border-t border-stone-100 bg-white">
                    <div className="relative">
                      <input type="text" placeholder="Nachricht senden..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        className="w-full pl-4 pr-12 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wine-500" />
                      <button onClick={sendMessage} disabled={!newMessage.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-wine-700 text-white rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50">
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </ErrorBoundary>
  );
}
