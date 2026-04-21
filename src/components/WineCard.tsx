import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Session, Wine, Rating } from '../types';
import { AutocompleteInput } from './AutocompleteInput';
import { GRAPE_VARIETIES, WINE_REGIONS } from '../constants';
import {
  Wine as WineIcon,
  Plus,
  Users,
  ChevronDown,
  ChevronUp,
  Trophy,
  Eye,
  EyeOff,
  BarChart3,
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  Search,
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
  PolarRadiusAxis,
} from 'recharts';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface WineCardProps {
  wine: Wine;
  user: UserProfile;
  session: Session;
  ratings: Rating[];
  onRate: (
    score: number,
    comment: string,
    guessedGrape?: string,
    guessedPrice?: number,
    guessedVintage?: number,
    guessedRegion?: string
  ) => void;
  onReveal: () => void;
}

export function WineCard({ wine, user, session, ratings, onRate, onReveal }: WineCardProps) {
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
        'glass rounded-[2.5rem] overflow-hidden transition-all duration-500 label-texture',
        wine.revealed ? 'ring-2 ring-wine-200 bg-white dark:bg-stone-900/40' : ''
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
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
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
                'w-16 h-16 rounded-2xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-xl',
                wine.revealed ? 'wine-gradient' : 'bg-stone-900'
              )}
            >
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
                      'w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg',
                      allVoted ? 'bg-wine-900 text-white hover:bg-wine-800' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'
                    )}
                  >
                    {isRevealing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Eye className="w-5 h-5" />}
                    {allVoted ? 'Enthüllen & Analysieren' : 'Trotzdem enthüllen'}
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
                      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Echte Rebsorte</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.grapeVariety || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Echter Preis</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.price ? `${wine.price}€` : 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Jahrgang</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.vintage || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.3 }}
                        className="bg-stone-50 dark:bg-stone-800/50 p-4 rounded-2xl border border-stone-100 dark:border-stone-800">
                        <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-1">Region</p>
                        <p className="font-serif font-bold text-lg text-wine-950 dark:text-wine-100">{wine.region || 'Unbekannt'}</p>
                      </motion.div>
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 }}
                        className="col-span-2 bg-wine-900 text-white p-4 rounded-2xl flex items-center justify-between shadow-lg">
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
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }}
                      className="glass rounded-2xl overflow-hidden border border-stone-100 dark:border-stone-800">
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
                                <td className={cn('px-4 py-3 whitespace-nowrap',
                                  wine.grapeVariety && r.guessedGrapeVariety && wine.grapeVariety.toLowerCase().includes(r.guessedGrapeVariety.toLowerCase())
                                    ? 'text-emerald-600 font-bold' : 'text-stone-600')}>
                                  {r.guessedGrapeVariety || '-'}
                                </td>
                                <td className={cn('px-4 py-3 whitespace-nowrap',
                                  wine.price && r.guessedPrice && Math.abs(wine.price - r.guessedPrice) <= wine.price * 0.1
                                    ? 'text-emerald-600 font-bold' : 'text-stone-600')}>
                                  {r.guessedPrice ? `${r.guessedPrice}€` : '-'}
                                </td>
                                <td className={cn('px-4 py-3 whitespace-nowrap',
                                  wine.vintage && r.guessedVintage && Math.abs(wine.vintage - r.guessedVintage) <= 1
                                    ? 'text-emerald-600 font-bold' : 'text-stone-600')}>
                                  {r.guessedVintage || '-'}
                                </td>
                                <td className={cn('px-4 py-3 whitespace-nowrap',
                                  wine.region && r.guessedRegion && (wine.region.toLowerCase().includes(r.guessedRegion.toLowerCase()) || r.guessedRegion.toLowerCase().includes(wine.region.toLowerCase()))
                                    ? 'text-emerald-600 font-bold' : 'text-stone-600')}>
                                  {r.guessedRegion || '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>

                    {/* Chart & Vibe */}
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="space-y-6">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-stone-400">Geschmacks-Analyse</h4>
                        <span className={cn('px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm', vibe.bg, vibe.color)}>
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
                              <Radar name="Bewertung" dataKey="score" stroke="#761d1d" fill="#761d1d" fillOpacity={0.4} />
                              <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', fontSize: '12px' }} />
                            </RadarChart>
                          ) : (
                            <BarChart data={ratings} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                              <XAxis dataKey="userName" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                              <YAxis domain={[0, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#78716c' }} />
                              <Tooltip cursor={{ fill: '#f5f5f4' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
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
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}
                      className="bg-wine-50 rounded-3xl p-6 relative overflow-hidden">
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
                      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }}
                        className="bg-stone-50 rounded-3xl p-6 border border-stone-200">
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
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="space-y-3">
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
