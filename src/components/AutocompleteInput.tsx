import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search } from 'lucide-react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  label?: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
}

export function AutocompleteInput({ 
  value, 
  onChange, 
  suggestions, 
  placeholder, 
  label,
  className,
  inputClassName,
  labelClassName
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim() === '') {
      setFilteredSuggestions([]);
      setIsOpen(false);
      return;
    }

    const filtered = suggestions.filter(s => 
      s.toLowerCase().includes(value.toLowerCase()) && 
      s.toLowerCase() !== value.toLowerCase()
    );
    setFilteredSuggestions(filtered);
    setIsOpen(filtered.length > 0);
  }, [value, suggestions]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className={labelClassName || "text-xs font-bold text-stone-400 uppercase tracking-wider mb-1 block"}>
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => value.trim() !== '' && filteredSuggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          className={inputClassName || "w-full px-4 py-3 bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-wine-500 transition-all dark:text-stone-100"}
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-300 dark:text-stone-600 pointer-events-none">
          <Search className="w-4 h-4" />
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-[60] left-0 right-0 mt-2 bg-white dark:bg-stone-900 border border-stone-100 dark:border-stone-800 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  onChange(suggestion);
                  setIsOpen(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-wine-50 dark:hover:bg-wine-900/30 transition-colors text-stone-700 dark:text-stone-200 font-medium border-b border-stone-50 dark:border-stone-800 last:border-0"
              >
                {suggestion}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
