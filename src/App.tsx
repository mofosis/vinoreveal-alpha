import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
  doc, setDoc, getDoc, getDocs, collection, query, where, onSnapshot, addDoc, updateDoc, serverTimestamp 
} from './firebase';
import { UserProfile, Session, Wine, Rating, Message, OperationType } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
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
  ChevronDown,
  ChevronUp,
  LogOut, 
  Trophy, 
  Eye, 
  EyeOff,
  BarChart3,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Search,
  Star,
  Power,
  Trash2,
  Calendar,
  MapPin,
  Moon,
  Sun,
  Type,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [wines, setWines] = useState<Wine[]>([]);
  const [ratings, setRatings] = useState<Rating[]>([]);
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLiveFeedOpen, setIsLiveFeedOpen] = useState(false);
  const [showTerminateConfirm, setShowTerminateConfirm] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [hasApiKey, setHasApiKey] = useState(!!process.env.GEMINI_API_KEY);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isMinimalMode, setIsMinimalMode] = useState(false);

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio?.hasSelectedApiKey) {
        // @ts-ignore
        const selected = await window.aistudio.hasSelectedApiKey();
        if (selected) setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  const openKeyDialog = async () => {
    // @ts-ignore
    if (window.aistudio?.openSelectKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  // Persistence: Load session from localStorage
  useEffect(() => {
    const savedSessionId = localStorage.getItem('vino_reveal_session_id');
    if (savedSessionId) {
      setCurrentSessionId(savedSessionId);
    }
  }, []);

  // Persistence: Save session to localStorage
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('vino_reveal_session_id', currentSessionId);
    } else {
      localStorage.removeItem('vino_reveal_session_id');
    }
  }, [currentSessionId]);

  // Load recent sessions
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'sessions'), 
      where('participants', 'array-contains', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
      // Sort client-side to avoid index requirement
      setRecentSessions(
        sessions
          .filter(s => s.status !== 'terminated')
          .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
          .slice(0, 5)
      );
    });
    return () => unsubscribe();
  }, [user]);

  // Anonymous name for the session
  const anonymousName = useMemo(() => {
    if (!user) return '';
    const adjectives = ['Spritziger', 'Edler', 'Würziger', 'Fruchtiger', 'Trockener', 'Süßer', 'Samtiger', 'Reifer'];
    const nouns = ['Riesling', 'Merlot', 'Korken', 'Dekanter', 'Sommelier', 'Rebstock', 'Kelch', 'Jahrgang'];
    const hash = user.uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `${adjectives[hash % adjectives.length]} ${nouns[(hash * 7) % nouns.length]}`;
  }, [user]);

  // Session Persistence
  useEffect(() => {
    const savedSessionId = localStorage.getItem('vinoReveal_currentSessionId');
    if (savedSessionId) {
      setCurrentSessionId(savedSessionId);
    }

    const savedRecent = localStorage.getItem('vinoReveal_recentSessions');
    if (savedRecent) {
      try {
        setRecentSessions(JSON.parse(savedRecent));
      } catch (e) {
        console.error("Error parsing recent sessions", e);
      }
    }
  }, []);

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('vinoReveal_currentSessionId', currentSessionId);
    } else {
      localStorage.removeItem('vinoReveal_currentSessionId');
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (recentSessions.length > 0) {
      localStorage.setItem('vinoReveal_recentSessions', JSON.stringify(recentSessions));
    }
  }, [recentSessions]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userProfile: UserProfile = {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Anonymer Genießer',
          email: firebaseUser.email || undefined,
          photoURL: firebaseUser.photoURL || undefined,
        };
        
        try {
          await setDoc(doc(db, 'users', firebaseUser.uid), userProfile, { merge: true });
          setUser(userProfile);
        } catch (error) {
          console.error("Error saving user profile:", error);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Session Listener
  useEffect(() => {
    if (!currentSessionId) {
      setSession(null);
      setWines([]);
      setRatings([]);
      return;
    }

    const sessionUnsubscribe = onSnapshot(doc(db, 'sessions', currentSessionId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Session;
        if (data.status === 'terminated') {
          setCurrentSessionId(null);
          return;
        }
        setSession({ id: docSnap.id, ...data } as Session);
      } else {
        setCurrentSessionId(null);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `sessions/${currentSessionId}`));

    const winesUnsubscribe = onSnapshot(collection(db, 'sessions', currentSessionId, 'wines'), (snapshot) => {
      const winesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Wine));
      setWines(winesData.sort((a, b) => a.order - b.order));
    }, (err) => handleFirestoreError(err, OperationType.LIST, `sessions/${currentSessionId}/wines`));

    const ratingsUnsubscribe = onSnapshot(collection(db, 'sessions', currentSessionId, 'ratings'), (snapshot) => {
      const ratingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Rating));
      setRatings(ratingsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, `sessions/${currentSessionId}/ratings`));

    const messagesUnsubscribe = onSnapshot(
      query(collection(db, 'sessions', currentSessionId, 'messages'), where('createdAt', '!=', null)), 
      (snapshot) => {
        const messagesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        setMessages(messagesData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis()));
      }, 
      (err) => handleFirestoreError(err, OperationType.LIST, `sessions/${currentSessionId}/messages`)
    );

    return () => {
      sessionUnsubscribe();
      winesUnsubscribe();
      ratingsUnsubscribe();
      messagesUnsubscribe();
    };
  }, [currentSessionId]);

  // Trigger confetti when summary is generated
  useEffect(() => {
    if (session?.summary && session.status === 'completed') {
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      // Create a dedicated canvas to be absolutely sure we have a valid element
      const canvas = document.createElement('canvas');
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '9999';
      document.body.appendChild(canvas);

      const myConfetti = confetti.create(canvas, {
        resize: true,
        useWorker: false
      });

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        myConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        myConfetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => {
        clearInterval(interval);
        if (document.body.contains(canvas)) {
          document.body.removeChild(canvas);
        }
      };
    }
  }, [session?.summary, session?.status]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentSessionId(null);
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  const terminateSession = async () => {
    if (!currentSessionId || !session || session.createdBy !== user?.uid) return;
    
    try {
      await updateDoc(doc(db, 'sessions', currentSessionId), {
        status: 'terminated'
      });
      setCurrentSessionId(null);
      setShowTerminateConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${currentSessionId}`);
    }
  };

  const leaveSession = () => {
    setCurrentSessionId(null);
  };

  const createSession = async () => {
    if (!user || !newSessionName.trim()) return;
    try {
      // Generate a 2-digit short ID (00-99)
      const shortId = Math.floor(Math.random() * 100).toString().padStart(2, '0');
      
      const sessionData = {
        name: newSessionName,
        shortId,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        participants: [user.uid],
        status: 'active' as const
      };
      const docRef = await addDoc(collection(db, 'sessions'), sessionData);
      setCurrentSessionId(docRef.id);
      setIsCreatingSession(false);
      setNewSessionName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sessions');
    }
  };

  const joinSession = async (shortId: string) => {
    if (!user || !shortId.trim() || isJoining) return;
    setIsJoining(true);
    try {
      console.log("Versuche Session beizutreten mit ID:", shortId);
      const q = query(collection(db, 'sessions'), where('shortId', '==', shortId.trim()));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const sessionDoc = querySnapshot.docs[0];
        const sessionRef = sessionDoc.ref;
        const data = sessionDoc.data() as Session;
        
        console.log("Session gefunden:", sessionDoc.id);
        
        if (!data.participants.includes(user.uid)) {
          console.log("Trete Teilnehmerliste bei...");
          await updateDoc(sessionRef, {
            participants: [...data.participants, user.uid]
          });
        }
        
        setCurrentSessionId(sessionDoc.id);
        setJoinInput('');
      } else {
        alert("Session mit dieser ID nicht gefunden!");
      }
    } catch (error) {
      console.error("Fehler beim Beitreten:", error);
      handleFirestoreError(error, OperationType.LIST, `sessions (query shortId: ${shortId})`);
    } finally {
      setIsJoining(false);
    }
  };

  const addWine = async () => {
    if (!currentSessionId || !newWineName.trim()) return;
    try {
      // Use timestamp for order to prevent race conditions and ensure chronological order
      const order = Date.now();
      
      // Calculate the next number based on the highest existing number in labels
      const maxNum = wines.reduce((max, w) => {
        const num = parseInt(w.label.split('#')[1]);
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      
      const wineData = {
        sessionId: currentSessionId,
        name: newWineName,
        grapeVariety: newWineGrape,
        price: newWinePrice ? parseFloat(newWinePrice) : null,
        vintage: newWineVintage ? parseInt(newWineVintage) : null,
        region: newWineRegion,
        label: `Wein #${maxNum + 1}`,
        order,
        revealed: false
      };
      await addDoc(collection(db, 'sessions', currentSessionId, 'wines'), wineData);
      setNewWineName('');
      setNewWineGrape('');
      setNewWinePrice('');
      setNewWineVintage('');
      setNewWineRegion('');
      setIsAddingWine(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `sessions/${currentSessionId}/wines`);
    }
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
    if (!user || !currentSessionId) return;
    try {
      const ratingData = {
        score,
        comment,
        guessedGrapeVariety: guessedGrape || null,
        guessedPrice: guessedPrice || null,
        guessedVintage: guessedVintage || null,
        guessedRegion: guessedRegion || null,
        createdAt: serverTimestamp(),
        userId: user.uid,
        userName: user.displayName,
        wineId,
        sessionId: currentSessionId,
      };

      // Use a deterministic ID to prevent duplicates (wineId_userId)
      const ratingId = `${wineId}_${user.uid}`;
      await setDoc(doc(db, 'sessions', currentSessionId, 'ratings', ratingId), ratingData, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `sessions/${currentSessionId}/ratings`);
    }
  };

  const revealWine = async (wineId: string) => {
    if (!currentSessionId) return;
    try {
      const wine = wines.find(w => w.id === wineId);
      if (!wine) return;

      const wineRatings = ratings.filter(r => r.wineId === wineId);
      
      // Run analysis and research in parallel, handle individual failures
      let analysis = "Analyse konnte nicht erstellt werden.";
      let research = "Fakten konnten nicht geladen werden.";

      try {
        analysis = await analyzeWineRatings(wine, wineRatings);
      } catch (e: any) {
        console.error("Analysis failed:", e);
        toast.error(e.message || "KI-Analyse fehlgeschlagen");
      }

      try {
        research = await researchWineDetails(wine);
      } catch (e: any) {
        console.error("Research failed:", e);
        toast.error(e.message || "Wein-Recherche fehlgeschlagen");
      }

      await updateDoc(doc(db, 'sessions', currentSessionId, 'wines', wineId), {
        revealed: true,
        analysis,
        research
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${currentSessionId}/wines/${wineId}`);
    }
  };

  const reAnalyzeWine = async (wineId: string) => {
    if (!currentSessionId || !session || session.createdBy !== user?.uid) return;
    try {
      const wine = wines.find(w => w.id === wineId);
      if (!wine) return;

      const wineRatings = ratings.filter(r => r.wineId === wineId);
      
      // Run analysis and research in parallel
      try {
        const [analysis, research] = await Promise.all([
          analyzeWineRatings(wine, wineRatings),
          researchWineDetails(wine)
        ]);

        await updateDoc(doc(db, 'sessions', currentSessionId, 'wines', wineId), {
          analysis,
          research
        });
        toast.success("Analyse erfolgreich aktualisiert!");
      } catch (e: any) {
        console.error("Re-analysis failed:", e);
        toast.error(e.message || "Aktualisierung fehlgeschlagen");
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${currentSessionId}/wines/${wineId}`);
    }
  };

  const generateSummary = async () => {
    if (!currentSessionId || !session || wines.length === 0) return;
    setIsGeneratingSummary(true);
    try {
      const summary = await generateFinalSessionSummary(session.name, wines, ratings);
      await updateDoc(doc(db, 'sessions', currentSessionId), {
        summary,
        status: 'completed'
      });
      toast.success("Abschlussfazit erfolgreich erstellt!");
    } catch (error: any) {
      console.error("Summary generation failed:", error);
      toast.error(error.message || "Abschlussfazit konnte nicht erstellt werden");
      // If it's not an AI error, it might be a Firestore error
      if (!error.message || (!error.message.includes('KI') && !error.message.includes('Gemini') && !error.message.includes('Fazit'))) {
        handleFirestoreError(error, OperationType.UPDATE, `sessions/${currentSessionId}`);
      }
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const sendMessage = async () => {
    if (!currentSessionId || !newMessage.trim()) return;
    try {
      await addDoc(collection(db, 'sessions', currentSessionId, 'messages'), {
        text: newMessage,
        createdAt: serverTimestamp(),
        anonymousName
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `sessions/${currentSessionId}/messages`);
    }
  };

  const leaderboard = useMemo(() => {
    if (!session || wines.length === 0 || ratings.length === 0) return [];

    const userPoints: Record<string, { userId: string, name: string, points: number, correctGrapes: number, closePrices: number, correctVintages: number, correctRegions: number }> = {};

    session.participants.forEach(uid => {
      const userRating = ratings.find(r => r.userId === uid);
      userPoints[uid] = { 
        userId: uid,
        name: userRating?.userName || 'Teilnehmer', 
        points: 0, 
        correctGrapes: 0, 
        closePrices: 0,
        correctVintages: 0,
        correctRegions: 0
      };
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
        
        // Grapes
        if (wine.grapeVariety && rating.guessedGrapeVariety && 
            wine.grapeVariety.toLowerCase().includes(rating.guessedGrapeVariety.toLowerCase())) {
          points += 50;
          userPoints[rating.userId].correctGrapes++;
        }

        // Price
        if (wine.price && rating.guessedPrice) {
          const diff = Math.abs(wine.price - rating.guessedPrice);
          if (diff <= wine.price * 0.1) {
            points += 30;
            userPoints[rating.userId].closePrices++;
          }
        }

        // Vintage
        if (wine.vintage && rating.guessedVintage) {
          const diff = Math.abs(wine.vintage - rating.guessedVintage);
          if (diff === 0) {
            points += 50;
            userPoints[rating.userId].correctVintages++;
          } else if (diff === 1) {
            points += 20;
            userPoints[rating.userId].correctVintages++;
          }
        }

        // Region
        if (wine.region && rating.guessedRegion && 
            (wine.region.toLowerCase().includes(rating.guessedRegion.toLowerCase()) || 
             rating.guessedRegion.toLowerCase().includes(wine.region.toLowerCase()))) {
          points += 40;
          userPoints[rating.userId].correctRegions++;
        }

        // Median
        const diffToMedian = Math.abs(rating.score - median);
        const minDiff = Math.min(...wineRatings.map(r => Math.abs(r.score - median)));
        if (diffToMedian === minDiff) {
          points += 20;
        }

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
        {/* Animated Background Elements */}
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            opacity: [0.1, 0.2, 0.1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-24 -left-24 w-96 h-96 bg-wine-500/20 rounded-full blur-3xl"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            rotate: [0, -90, 0],
            opacity: [0.1, 0.15, 0.1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-24 -right-24 w-[30rem] h-[30rem] bg-wine-900/10 rounded-full blur-3xl"
        />

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", damping: 20, stiffness: 100 }}
          className="max-w-md w-full text-center space-y-12 relative z-10"
        >
          <div className="space-y-6">
            <motion.div 
              whileHover={{ scale: 1.05, rotate: 5 }}
              whileTap={{ scale: 0.95 }}
              className="mx-auto w-28 h-28 wine-gradient rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-8 relative"
            >
              <WineIcon className="w-14 h-14 text-white" />
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0, 0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-white rounded-[2.5rem]"
              />
            </motion.div>
            <div className="space-y-2">
              <h1 className="text-7xl font-serif font-black text-wine-950 tracking-tighter">VinoReveal</h1>
              <p className="text-stone-500 text-lg font-medium">Blinde Weinproben. Echte Emotionen. Witzige Analysen.</p>
            </div>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full py-5 bg-stone-900 text-white rounded-[1.5rem] font-bold shadow-2xl hover:bg-stone-800 transition-all flex items-center justify-center gap-4 group"
          >
            <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center group-hover:rotate-12 transition-transform">
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
            </div>
            <span className="text-lg">Mit Google anmelden</span>
          </motion.button>

          <div className="flex justify-center gap-8 opacity-40">
            <div className="flex flex-col items-center gap-1">
              <div className="w-1 h-1 bg-stone-400 rounded-full" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Sicher</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-1 h-1 bg-stone-400 rounded-full" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Anonym</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="w-1 h-1 bg-stone-400 rounded-full" />
              <p className="text-[10px] font-bold uppercase tracking-widest">Live</p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-center" richColors />
      <div className={cn(
        "min-h-screen transition-all duration-500",
        isDarkMode ? "dark" : "light",
        isMinimalMode && "minimal"
      )}>
        <div className="min-h-screen bg-stone-50 dark:bg-stone-950 pb-20 transition-colors duration-500">
          {/* Header */}
          <header className="sticky top-0 z-[60] glass px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2" onClick={() => setCurrentSessionId(null)}>
              <WineIcon className="w-6 h-6 text-wine-700" />
              <span className="font-serif font-bold text-xl text-wine-950 dark:text-wine-100 cursor-pointer">VinoReveal</span>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl">
                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isDarkMode ? "bg-wine-700 text-white shadow-lg" : "text-stone-400 hover:text-stone-600"
                  )}
                  title={isDarkMode ? "Tagmodus" : "Nachtmodus"}
                >
                  {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => setIsMinimalMode(!isMinimalMode)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all",
                    isMinimalMode ? "bg-wine-700 text-white shadow-lg" : "text-stone-400 hover:text-stone-600"
                  )}
                  title={isMinimalMode ? "Standardmodus" : "Minimalmodus"}
                >
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
              <motion.div 
                key="session-selection"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-12 pt-12"
              >
              {!hasApiKey && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-6 bg-amber-50 border border-amber-200 rounded-3xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
                >
                  <div className="p-3 bg-amber-100 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-amber-700" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-amber-900">KI-Funktionen eingeschränkt</h4>
                    <p className="text-sm text-amber-800/80">Der API-Key für die Wein-Analyse fehlt. Wenn du die App remixed hast, wähle bitte einen Key aus.</p>
                  </div>
                  <button 
                    onClick={openKeyDialog}
                    className="px-6 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 transition-colors whitespace-nowrap"
                  >
                    Key auswählen
                  </button>
                </motion.div>
              )}
              <div className="text-center space-y-3">
                <h2 className="text-4xl font-serif font-bold tracking-tight">Willkommen, {user.displayName.split(' ')[0]}!</h2>
                <p className="text-stone-500 text-lg">Starte eine neue Probe oder tritt einer bestehenden bei.</p>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <motion.button
                  whileHover={{ y: -4 }}
                  onClick={() => setIsCreatingSession(true)}
                  className="p-10 glass rounded-[2.5rem] border-2 border-dashed border-stone-200 hover:border-wine-300 hover:bg-wine-50/50 transition-all text-center space-y-4 group"
                >
                  <div className="mx-auto w-16 h-16 bg-wine-100 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Plus className="w-8 h-8 text-wine-700" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl">Neue Weinprobe</h3>
                    <p className="text-sm text-stone-500">Erstelle eine Session für deine Freunde.</p>
                  </div>
                </motion.button>

                <motion.div 
                  whileHover={{ y: -4 }}
                  className="p-10 glass rounded-[2.5rem] space-y-6"
                >
                  <div className="mx-auto w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center">
                    <Users className="w-8 h-8 text-stone-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="font-bold text-xl">Teilnehmen</h3>
                    <p className="text-sm text-stone-500">Gib die Session-ID ein, um beizutreten.</p>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Session ID"
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value)}
                      className="flex-1 px-5 py-3 bg-white border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wine-500 shadow-inner"
                      onKeyDown={(e) => e.key === 'Enter' && joinSession(joinInput)}
                    />
                    <button 
                      onClick={() => joinSession(joinInput)}
                      disabled={isJoining || !joinInput.trim()}
                      className="p-3 bg-wine-700 text-white rounded-2xl hover:bg-wine-800 transition-colors disabled:opacity-50 flex items-center justify-center min-w-[52px] shadow-lg"
                    >
                      {isJoining ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <ChevronRight className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>

              {recentSessions.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 px-2">Deine letzten Proben</h3>
                  <div className="grid gap-3">
                    {recentSessions.map(s => (
                      <motion.button
                        key={s.id}
                        whileHover={{ x: 4 }}
                        onClick={() => setCurrentSessionId(s.id)}
                        className="w-full p-4 glass rounded-2xl flex items-center justify-between hover:bg-white transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-wine-50 rounded-xl flex items-center justify-center text-wine-700 group-hover:scale-110 transition-transform">
                            <WineIcon className="w-5 h-5" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-stone-900">{s.name}</p>
                            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">ID: {s.shortId} • {s.participants.length} Teilnehmer</p>
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
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm" 
                      onClick={() => setIsCreatingSession(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6 relative z-10"
                    >
                      <h3 className="text-2xl font-serif font-bold">Session erstellen</h3>
                      <input
                        autoFocus
                        type="text"
                        value={newSessionName}
                        onChange={(e) => setNewSessionName(e.target.value)}
                        placeholder="Name der Weinprobe (z.B. Riesling-Nacht)"
                        className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => setIsCreatingSession(false)}
                          className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors"
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={createSession}
                          disabled={!newSessionName.trim()}
                          className="flex-1 py-3 bg-wine-700 text-white font-bold rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50"
                        >
                          Erstellen
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div 
              key="active-session"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              {/* Session Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-3xl font-serif font-bold text-wine-950 dark:text-wine-100">{session?.name}</h2>
                  <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-sm">
                    <Users className="w-4 h-4" />
                    <span>{session?.participants.length} Teilnehmer</span>
                    <span className="mx-1">•</span>
                    <span className="font-mono text-xs bg-stone-200 dark:bg-stone-800 px-2 py-0.5 rounded uppercase tracking-wider">ID: {session?.shortId}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {session?.createdBy === user.uid ? (
                    <div className="flex items-center gap-2">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsAddingWine(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-wine-700 text-white rounded-full hover:bg-wine-800 transition-colors shadow-md text-sm font-bold"
                      >
                        <Plus className="w-4 h-4" />
                        Wein
                      </motion.button>
                      <button 
                        onClick={() => setShowTerminateConfirm(true)}
                        className="p-2 text-stone-400 hover:text-red-600 transition-colors"
                        title="Session beenden"
                      >
                        <Power className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={leaveSession}
                      className="flex items-center gap-2 px-4 py-2 text-stone-500 hover:text-wine-700 transition-colors text-sm font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      Verlassen
                    </button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsLiveFeedOpen(true)}
                    className="p-3 glass rounded-xl text-wine-900 hover:bg-white transition-all shadow-md relative"
                  >
                    <MessageSquare className="w-5 h-5" />
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-wine-600 rounded-full border-2 border-white animate-pulse" />
                  </motion.button>
                </div>
              </div>

              <AnimatePresence>
                {showTerminateConfirm && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
                      onClick={() => setShowTerminateConfirm(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl space-y-6 relative z-10 text-center"
                    >
                      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                        <Trash2 className="w-8 h-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-serif font-bold">Session beenden?</h3>
                        <p className="text-stone-500 text-sm">Dies wird die Weinprobe für alle Teilnehmer endgültig beenden. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
                      </div>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => setShowTerminateConfirm(false)}
                          className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors"
                        >
                          Abbrechen
                        </button>
                        <button 
                          onClick={terminateSession}
                          className="flex-1 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors"
                        >
                          Beenden
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {isAddingWine && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-stone-900/20 backdrop-blur-sm" 
                      onClick={() => setIsAddingWine(false)}
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6 relative z-10"
                    >
                      <h3 className="text-2xl font-serif font-bold">Wein hinzufügen</h3>
                      <p className="text-sm text-stone-500">Gib den echten Namen des Weins ein. Die Teilnehmer sehen diesen erst nach der Enthüllung.</p>
                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Name des Weins</label>
                          <input
                            autoFocus
                            type="text"
                            value={newWineName}
                            onChange={(e) => setNewWineName(e.target.value)}
                            placeholder="z.B. 2018 Château Margaux"
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                          />
                        </div>
                        <div>
                          <AutocompleteInput
                            label="Rebsorte"
                            value={newWineGrape}
                            onChange={setNewWineGrape}
                            suggestions={GRAPE_VARIETIES}
                            placeholder="z.B. Cabernet Sauvignon"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Preis (€)</label>
                            <input
                              type="number"
                              value={newWinePrice}
                              onChange={(e) => setNewWinePrice(e.target.value)}
                              placeholder="z.B. 45"
                              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block">Jahrgang</label>
                            <input
                              type="number"
                              value={newWineVintage}
                              onChange={(e) => setNewWineVintage(e.target.value)}
                              placeholder="z.B. 2018"
                              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                            />
                          </div>
                        </div>
                        <div>
                          <AutocompleteInput
                            label="Region"
                            value={newWineRegion}
                            onChange={setNewWineRegion}
                            suggestions={WINE_REGIONS}
                            placeholder="z.B. Bordeaux"
                          />
                        </div>
                      </div>
                      <div className="flex gap-3 pt-4">
                        <button
                          onClick={() => {
                            setIsAddingWine(false);
                            setNewWineName('');
                          }}
                          className="flex-1 py-3 text-stone-500 font-medium hover:bg-stone-50 rounded-xl transition-colors"
                        >
                          Abbrechen
                        </button>
                        <button
                          onClick={addWine}
                          disabled={!newWineName.trim()}
                          className="flex-1 py-3 bg-wine-700 text-white font-bold rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50"
                        >
                          Hinzufügen
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Leaderboard Section */}
              <AnimatePresence>
                {leaderboard.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                      <Trophy className="w-32 h-32" />
                    </div>
                    <div className="flex items-center justify-between relative z-10">
                      <h3 className="text-2xl font-serif font-bold flex items-center gap-3 dark:text-stone-100">
                        <Trophy className="w-8 h-8 text-amber-500" />
                        Tasting Champions
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-4 relative z-10">
                      {leaderboard.map((player, idx) => (
                        <motion.div 
                          key={player.userId}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.1 }}
                          className={cn(
                            "flex items-center gap-4 px-6 py-4 rounded-[1.5rem] border transition-all",
                            idx === 0 
                              ? "bg-amber-50 border-amber-200 text-amber-900 shadow-xl shadow-amber-100 scale-105" 
                              : "bg-white/50 border-stone-100 text-stone-600"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center font-serif font-black text-xl",
                            idx === 0 ? "bg-amber-200 text-amber-900" : "bg-stone-100 text-stone-400"
                          )}>
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">{player.name}</p>
                            <div className="flex items-baseline gap-2">
                              <p className="text-xl font-black">{player.points}</p>
                              <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Punkte</span>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Rebsorte">
                                <WineIcon className="w-2.5 h-2.5" />
                                {player.correctGrapes}
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Preis">
                                <Star className="w-2.5 h-2.5" />
                                {player.closePrices}
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Jahrgang">
                                <Calendar className="w-2.5 h-2.5" />
                                {player.correctVintages}
                              </div>
                              <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Region">
                                <MapPin className="w-2.5 h-2.5" />
                                {player.correctRegions}
                              </div>
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
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center py-24 glass rounded-[3rem] border-2 border-dashed border-stone-200"
                  >
                    <WineIcon className="w-16 h-16 text-stone-300 mx-auto mb-6" />
                    <p className="text-stone-500 text-lg">Noch keine Weine hinzugefügt.</p>
                  </motion.div>
                ) : (
                  <div className="space-y-6">
                    {session?.summary && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass rounded-[3rem] p-10 border-2 border-wine-100 bg-wine-50/30 space-y-8 relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-wine-200/10 rounded-full -mr-32 -mt-32 blur-3xl" />
                        <div className="flex items-center justify-between text-wine-900 relative z-10">
                          <div className="flex items-center gap-4">
                            <Sparkles className="w-8 h-8" />
                            <h3 className="text-3xl font-serif font-bold">Das Sommelier-Fazit</h3>
                          </div>
                          {session.createdBy === user.uid && (
                            <button 
                              onClick={generateSummary}
                              className="p-2 text-wine-400 hover:text-wine-700 transition-colors"
                              title="Fazit aktualisieren"
                            >
                              <Loader2 className={cn("w-6 h-6", isGeneratingSummary && "animate-spin")} />
                            </button>
                          )}
                        </div>
                        <div className="prose prose-stone max-w-none prose-headings:font-serif prose-headings:text-wine-950 prose-p:text-stone-700 relative z-10">
                          <Markdown>{session.summary}</Markdown>
                        </div>
                        
                        <div className="pt-6 border-t border-wine-100">
                          <h4 className="font-serif font-bold text-lg mb-4">Statistisches Ranking (Median)</h4>
                          <div className="space-y-3">
                            {wines
                              .map(w => {
                                const wineRatings = ratings.filter(r => r.wineId === w.id).map(r => r.score).sort((a, b) => a - b);
                                let median = 0;
                                if (wineRatings.length > 0) {
                                  const mid = Math.floor(wineRatings.length / 2);
                                  median = wineRatings.length % 2 !== 0 ? wineRatings[mid] : (wineRatings[mid - 1] + wineRatings[mid]) / 2;
                                }
                                return { name: w.name, median };
                              })
                              .sort((a, b) => b.median - a.median)
                              .map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 flex items-center justify-center bg-stone-100 rounded-full text-xs font-bold text-stone-500">
                                      {idx + 1}
                                    </span>
                                    <span className="font-medium">{item.name}</span>
                                  </div>
                                  <div className="font-bold text-wine-700">{item.median} <span className="text-[10px] text-stone-400 font-normal">MEDIAN</span></div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {leaderboard.length > 0 && (
                          <div className="pt-6 border-t border-wine-100">
                            <div className="flex items-center gap-2 mb-4">
                              <Trophy className="w-5 h-5 text-amber-500" />
                              <h4 className="font-serif font-bold text-lg">Tasting Champion Leaderboard</h4>
                            </div>
                            <div className="space-y-3">
                              {leaderboard.map((player, idx) => (
                                <div key={idx} className={cn(
                                  "flex items-center justify-between p-4 rounded-2xl shadow-sm border",
                                  idx === 0 ? "bg-amber-50 border-amber-200" : "bg-white border-stone-100"
                                )}>
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm",
                                      idx === 0 ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-500"
                                    )}>
                                      {idx + 1}
                                    </div>
                                    <div>
                                      <p className="font-bold text-stone-900">{player.name}</p>
                                      <div className="flex flex-wrap gap-2 mt-1">
                                        <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Rebsorte">
                                          <WineIcon className="w-2.5 h-2.5" />
                                          {player.correctGrapes}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Preis">
                                          <Star className="w-2.5 h-2.5" />
                                          {player.closePrices}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Jahrgang">
                                          <Calendar className="w-2.5 h-2.5" />
                                          {player.correctVintages}
                                        </div>
                                        <div className="flex items-center gap-1 text-[9px] font-bold bg-stone-100 px-1.5 py-0.5 rounded text-stone-500" title="Region">
                                          <MapPin className="w-2.5 h-2.5" />
                                          {player.correctRegions}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-2xl font-serif font-black text-wine-900">{player.points}</p>
                                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Punkte</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}

                    <AnimatePresence>
                      {isGeneratingSummary && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[100] flex flex-col items-center justify-center gap-8 p-6 text-center"
                        >
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
                        <button
                          onClick={generateSummary}
                          disabled={isGeneratingSummary}
                          className="px-8 py-3 bg-wine-700 text-white rounded-full font-bold hover:bg-wine-800 transition-all shadow-lg flex items-center gap-2 mx-auto disabled:opacity-50"
                        >
                          {isGeneratingSummary ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Analysiere Abend...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-5 h-5" />
                              Gesamtfazit erstellen
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {wines.every(w => w.revealed) && !session?.summary && session?.createdBy !== user?.uid && (
                      <div className="glass rounded-3xl p-8 text-center space-y-4 border-2 border-dashed border-wine-200">
                        <Loader2 className="w-12 h-12 text-wine-300 mx-auto animate-spin" />
                        <div>
                          <h3 className="text-xl font-serif font-bold">Warten auf das Sommelier-Fazit</h3>
                          <p className="text-stone-500">Der Gastgeber bereitet gerade die finale Auswertung und das Fazit vor...</p>
                        </div>
                      </div>
                    )}

                    {wines.map((wine, idx) => (
                      <motion.div
                        key={wine.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                      >
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

        {/* Live Feed Toggle Button */}
        {currentSessionId && (
          <button
            onClick={() => setIsLiveFeedOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-wine-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all z-40 group"
          >
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
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" 
                onClick={() => setIsLiveFeedOpen(false)} 
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="relative w-full max-w-sm bg-white h-full shadow-2xl flex flex-col"
              >
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
                      {messages.map((msg) => (
                        <motion.div 
                          key={msg.id}
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          className="space-y-1"
                        >
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
                    <input
                      type="text"
                      placeholder="Nachricht senden..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                      className="w-full pl-4 pr-12 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wine-500"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-wine-700 text-white rounded-xl hover:bg-wine-800 transition-colors disabled:opacity-50"
                    >
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

function WineCard({ wine, user, session, ratings, onRate, onReveal }: { 
  wine: Wine, 
  user: UserProfile, 
  session: Session,
  ratings: Rating[], 
  onRate: (
    score: number, 
    comment: string, 
    guessedGrape?: string, 
    guessedPrice?: number,
    guessedVintage?: number,
    guessedRegion?: string
  ) => void,
  onReveal: () => void 
}) {
  const [isRating, setIsRating] = useState(false);
  const [score, setScore] = useState(5);
  const [comment, setComment] = useState('');
  const [guessedGrape, setGuessedGrape] = useState('');
  const [guessedPrice, setGuessedPrice] = useState('');
  const [guessedVintage, setGuessedVintage] = useState('');
  const [guessedRegion, setGuessedRegion] = useState('');
  const [isRevealing, setIsRevealing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(wine.revealed);

  const myRating = ratings.find(r => r.userId === user.uid);
  const allVoted = ratings.length >= session.participants.length;
  const canReveal = session.createdBy === user.uid;
  
  const averageScore = useMemo(() => {
    if (ratings.length === 0) return 0;
    return (ratings.reduce((acc, r) => acc + r.score, 0) / ratings.length).toFixed(1);
  }, [ratings]);

  const vibe = useMemo(() => {
    if (ratings.length < 2) return { label: 'Erster Eindruck', color: 'text-stone-500', bg: 'bg-stone-50' };
    const scores = ratings.map(r => r.score);
    const avg = parseFloat(averageScore.toString());
    const variance = scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev < 1) return { label: 'Absolute Einigkeit', color: 'text-emerald-600', bg: 'bg-emerald-50' };
    if (stdDev < 2) return { label: 'Harmonisch', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (stdDev > 3.5) return { label: 'Extrem Kontrovers!', color: 'text-red-600', bg: 'bg-red-50' };
    if (avg > 8) return { label: 'Publikumsliebling', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { label: 'Gemischte Gefühle', color: 'text-wine-600', bg: 'bg-wine-50' };
  }, [ratings, averageScore]);

  const handleReveal = async () => {
    setIsRevealing(true);
    await onReveal();
    setIsRevealing(false);
  };

  return (
    <motion.div 
      layout
      className={cn(
        "glass rounded-[2.5rem] overflow-hidden transition-all duration-500 label-texture",
        wine.revealed ? "ring-2 ring-wine-200 bg-white dark:bg-stone-900/40" : ""
      )}
    >
      <AnimatePresence>
        {isRevealing && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-white/90 dark:bg-stone-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="relative w-24 h-24"
            >
              <div className="absolute inset-0 border-4 border-stone-100 dark:border-stone-800 rounded-full" />
              <div className="absolute inset-0 border-4 border-t-wine-600 rounded-full" />
              <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-wine-600 animate-pulse" />
            </motion.div>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-8 space-y-2"
            >
              <h4 className="font-serif text-2xl font-bold text-wine-950 dark:text-wine-100">Der Sommelier analysiert...</h4>
              <p className="text-stone-500 dark:text-stone-400 text-sm max-w-[240px] mx-auto">
                Wir befragen die KI zu euren Bewertungen und recherchieren die Fakten zu diesem Tropfen.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-8 space-y-8">
        {/* Card Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            <motion.div 
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.5 }}
              className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-xl",
                wine.revealed ? "wine-gradient" : "bg-stone-900"
              )}
            >
              {/* Use a stable index for display if order is just a timestamp */}
              {wine.label.split('#')[1] || '?'}
            </motion.div>
            <div>
              <h3 className="text-2xl font-serif font-bold tracking-tight text-stone-900 dark:text-stone-100">
                {wine.revealed ? wine.name : wine.label}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Users className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">
                  {ratings.length} / {session.participants.length} Stimmen
                </p>
              </div>
            </div>
          </div>
          
          {wine.revealed ? (
            <div className="flex items-center gap-3">
              {canReveal && (
                <button 
                  onClick={handleReveal}
                  disabled={isRevealing}
                  className="p-2 bg-wine-50 text-wine-700 rounded-xl hover:bg-wine-100 transition-all disabled:opacity-50"
                  title="KI-Analyse & Fakten aktualisieren"
                >
                  {isRevealing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                </button>
              )}
              <div className="flex items-center gap-1.5 bg-wine-50 text-wine-700 px-4 py-2 rounded-2xl text-lg font-black shadow-sm border border-wine-100">
                <Trophy className="w-5 h-5" />
                {averageScore}
              </div>
              <button 
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-all"
              >
                {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-stone-100/50 px-4 py-2 rounded-2xl text-stone-400 border border-stone-200/50">
              <EyeOff className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Blind</span>
            </div>
          )}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {!wine.revealed ? (
            <motion.div 
              key="blind-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {myRating ? (
                <div className="bg-stone-50 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-wine-100 text-wine-700 rounded-full flex items-center justify-center font-bold">
                      {myRating.score}
                    </div>
                    <div>
                      <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">Deine Bewertung</p>
                      <p className="text-sm italic text-stone-600">"{myRating.comment || 'Kein Kommentar'}"</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      setScore(myRating.score);
                      setComment(myRating.comment || '');
                      setGuessedGrape(myRating.guessedGrapeVariety || '');
                      setGuessedPrice(myRating.guessedPrice?.toString() || '');
                      setGuessedVintage(myRating.guessedVintage?.toString() || '');
                      setGuessedRegion(myRating.guessedRegion || '');
                      setIsRating(true);
                    }}
                    className="text-wine-700 text-sm font-semibold hover:underline"
                  >
                    Ändern
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsRating(true)}
                  className="w-full py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Bewertung abgeben
                </button>
              )}

              <AnimatePresence>
                {isRating && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 pt-4 border-t border-stone-100 overflow-hidden"
                  >
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm font-medium">
                        <span>Score: {score}/10</span>
                        <span className="text-stone-400">{score < 4 ? '🍷 Na ja...' : score < 8 ? '🍷 Ganz gut!' : '🍷 Exzellent!'}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="0.5"
                        value={score}
                        onChange={(e) => setScore(parseFloat(e.target.value))}
                        className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-wine-700"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <AutocompleteInput
                          label="Rebsorte raten"
                          value={guessedGrape}
                          onChange={setGuessedGrape}
                          suggestions={GRAPE_VARIETIES}
                          placeholder="z.B. Riesling"
                          inputClassName="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500 text-sm transition-all"
                          labelClassName="text-[10px] font-bold text-stone-400 uppercase tracking-widest"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Preis schätzen (€)</label>
                        <input
                          type="number"
                          placeholder="z.B. 15"
                          value={guessedPrice}
                          onChange={(e) => setGuessedPrice(e.target.value)}
                          className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Jahrgang raten</label>
                        <input
                          type="number"
                          placeholder="z.B. 2021"
                          value={guessedVintage}
                          onChange={(e) => setGuessedVintage(e.target.value)}
                          className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <AutocompleteInput
                          label="Region raten"
                          value={guessedRegion}
                          onChange={setGuessedRegion}
                          suggestions={WINE_REGIONS}
                          placeholder="z.B. Pfalz"
                          inputClassName="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500 text-sm transition-all"
                          labelClassName="text-[10px] font-bold text-stone-400 uppercase tracking-widest"
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <textarea
                        placeholder="Dein Kommentar (optional)..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-wine-500 min-h-[100px]"
                      />
                      <button
                        onClick={() => {
                          onRate(
                            score, 
                            comment, 
                            guessedGrape, 
                            guessedPrice ? parseFloat(guessedPrice) : undefined,
                            guessedVintage ? parseInt(guessedVintage) : undefined,
                            guessedRegion
                          );
                          setIsRating(false);
                        }}
                        className="absolute bottom-4 right-4 p-2 bg-wine-700 text-white rounded-xl hover:bg-wine-800 transition-colors shadow-lg"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!wine.revealed && canReveal && (
                <div className="space-y-3">
                  {!allVoted && (
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-widest text-center">
                      ⚠️ Noch nicht alle Teilnehmer haben abgestimmt
                    </p>
                  )}
                  <button
                    onClick={handleReveal}
                    disabled={isRevealing}
                    className={cn(
                      "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                      allVoted ? "bg-wine-900 text-white hover:bg-wine-800" : "bg-stone-200 text-stone-600 hover:bg-stone-300"
                    )}
                  >
                    {isRevealing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
                    {allVoted ? "Enthüllen & Analysieren" : "Trotzdem enthüllen"}
                  </button>
                </div>
              )}
              
              {!wine.revealed && !canReveal && allVoted && (
                <div className="text-center p-4 bg-wine-50 rounded-2xl text-wine-700 text-sm font-medium animate-pulse">
                  Alle haben abgestimmt! Warte auf die Enthüllung...
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="revealed-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-8"
                  >
                    {/* Wine Details */}
                    <div className="grid grid-cols-2 gap-4">
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.1 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800"
                      >
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Echte Rebsorte</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.grapeVariety || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div 
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800"
                      >
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Echter Preis</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.price ? `${wine.price}€` : 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.25 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800"
                      >
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Jahrgang</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.vintage || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div 
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800"
                      >
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Region</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.region || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.35 }}
                        className="col-span-2 bg-wine-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg"
                      >
                        <div>
                          <p className="text-[10px] font-bold text-wine-300 uppercase tracking-widest mb-1">Median Bewertung</p>
                          <p className="text-2xl font-serif font-bold">
                            {(() => {
                              const scores = ratings.map(r => r.score).sort((a, b) => a - b);
                              if (scores.length === 0) return 0;
                              const mid = Math.floor(scores.length / 2);
                              return scores.length % 2 !== 0 ? scores[mid] : (scores[mid - 1] + scores[mid]) / 2;
                            })()}
                          </p>
                        </div>
                        <BarChart3 className="w-8 h-8 text-wine-400 opacity-50" />
                      </motion.div>
                    </div>

                    {/* Guesses Table */}
                    <motion.div 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="glass rounded-2xl overflow-hidden border border-stone-100 dark:border-stone-800"
                    >
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-stone-50 dark:bg-stone-800/50 text-stone-500 dark:text-stone-400 text-[10px] font-bold uppercase tracking-widest">
                              <th className="px-4 py-2 text-left">Teilnehmer</th>
                              <th className="px-4 py-2 text-left">Pkt</th>
                              <th className="px-4 py-2 text-left">Rebe</th>
                              <th className="px-4 py-2 text-left">Preis</th>
                              <th className="px-4 py-2 text-left">Jahr</th>
                              <th className="px-4 py-2 text-left">Region</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {ratings.map((r) => (
                              <tr key={r.id}>
                                <td className="px-4 py-3 font-medium">{r.userName}</td>
                                <td className="px-4 py-3">
                                  <span className="bg-wine-50 text-wine-700 px-2 py-0.5 rounded-lg font-bold">{r.score}</span>
                                </td>
                                <td className={cn(
                                  "px-4 py-3 whitespace-nowrap",
                                  wine.grapeVariety && r.guessedGrapeVariety && wine.grapeVariety.toLowerCase().includes(r.guessedGrapeVariety.toLowerCase()) 
                                    ? "text-emerald-600 font-bold" 
                                    : "text-stone-600"
                                )}>
                                  {r.guessedGrapeVariety || '-'}
                                </td>
                                <td className={cn(
                                  "px-4 py-3 whitespace-nowrap",
                                  wine.price && r.guessedPrice && Math.abs(wine.price - r.guessedPrice) <= wine.price * 0.1
                                    ? "text-emerald-600 font-bold"
                                    : "text-stone-600"
                                )}>
                                  {r.guessedPrice ? `${r.guessedPrice}€` : '-'}
                                </td>
                                <td className={cn(
                                  "px-4 py-3 whitespace-nowrap",
                                  wine.vintage && r.guessedVintage && Math.abs(wine.vintage - r.guessedVintage) <= 1
                                    ? "text-emerald-600 font-bold"
                                    : "text-stone-600"
                                )}>
                                  {r.guessedVintage || '-'}
                                </td>
                                <td className={cn(
                                  "px-4 py-3 whitespace-nowrap",
                                  wine.region && r.guessedRegion && (wine.region.toLowerCase().includes(r.guessedRegion.toLowerCase()) || r.guessedRegion.toLowerCase().includes(wine.region.toLowerCase()))
                                    ? "text-emerald-600 font-bold"
                                    : "text-stone-600"
                                )}>
                                  {r.guessedRegion || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>

                    {/* Chart & Vibe */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">Geschmacks-Analyse</h4>
                        <span className={cn("px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm", vibe.bg, vibe.color)}>
                          {vibe.label}
                        </span>
                      </div>

                      <div className="h-72 w-full glass rounded-3xl p-4 border border-stone-100">
                        <ResponsiveContainer width="100%" height="100%">
                          {ratings.length >= 3 ? (
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={ratings}>
                              <PolarGrid stroke="#e5e7eb" />
                              <PolarAngleAxis dataKey="userName" tick={{ fontSize: 10, fill: '#78716c' }} />
                              <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                              <Radar
                                name="Bewertung"
                                dataKey="score"
                                stroke="#761d1d"
                                fill="#761d1d"
                                fillOpacity={0.4}
                              />
                              <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: '12px' }}
                              />
                            </RadarChart>
                          ) : (
                            <BarChart data={ratings} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis 
                                dataKey="userName" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: '#78716c' }}
                              />
                              <YAxis 
                                domain={[0, 10]} 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 10, fill: '#78716c' }}
                              />
                              <Tooltip 
                                cursor={{ fill: '#f5f5f4' }}
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                              />
                              <Bar dataKey="score" radius={[10, 10, 0, 0]} barSize={40}>
                                {ratings.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.score > 7 ? '#761d1d' : entry.score > 4 ? '#aa2121' : '#f06e6e'} />
                                ))}
                              </Bar>
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </motion.div>

                    {/* AI Analysis */}
                    <motion.div 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="bg-wine-50 rounded-3xl p-6 relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Sparkles className="w-12 h-12 text-wine-900" />
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                        <Sparkles className="w-5 h-5 text-wine-700" />
                        <h4 className="font-serif font-bold text-wine-900">KI-Analyse</h4>
                      </div>
                      <div className="prose prose-stone prose-sm max-w-none text-wine-900/80 italic leading-relaxed">
                        <Markdown>{wine.analysis}</Markdown>
                      </div>
                    </motion.div>

                    {/* Research Details */}
                    {wine.research && (
                      <motion.div 
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.55 }}
                        className="bg-stone-50 rounded-3xl p-6 border border-stone-200"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <Search className="w-5 h-5 text-stone-600" />
                          <h4 className="font-serif font-bold text-stone-900">Fakten & Details</h4>
                        </div>
                        <div className="prose prose-stone prose-sm max-w-none text-stone-700 leading-relaxed">
                          <Markdown>{wine.research}</Markdown>
                        </div>
                      </motion.div>
                    )}

                    {/* Comments List */}
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="space-y-3"
                    >
                      <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                        <MessageSquare className="w-3 h-3" />
                        Stimmen der Vernunft
                      </h4>
                      <div className="grid gap-3">
                        {ratings.map((r, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-2xl border border-stone-100">
                            <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-bold text-stone-500 shrink-0">
                              {r.score}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-stone-900">{r.userName}</p>
                              <p className="text-sm text-stone-600 leading-snug">{r.comment || 'Kein Kommentar'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {isCollapsed && (
                <div className="flex items-center justify-between p-4 bg-stone-50 rounded-2xl border border-stone-100">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-wine-100 flex items-center justify-center text-wine-700 font-bold">
                      {averageScore}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Durchschnitt</p>
                      <p className="text-sm font-medium text-stone-600">{vibe.label}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCollapsed(false)}
                    className="text-xs font-bold text-wine-700 uppercase tracking-widest hover:underline"
                  >
                    Details anzeigen
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
