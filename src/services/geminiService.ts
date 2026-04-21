import { GoogleGenAI } from "@google/genai";
import { Rating, Wine } from "../types";

function getAIInstance() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
}

export async function analyzeWineRatings(wine: Wine, ratings: Rating[]) {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      config: {
        systemInstruction: "Du bist ein witziger, leicht snobistischer aber charmanter Weinkritiker. Deine Aufgabe ist es, die Bewertungen einer blinden Weinprobe zu analysieren. Sei humorvoll, ein bisschen frech und ziehe Vergleiche. Wer hat den Wein total unterschätzt? Wer hat ihn überbewertet? Wer hat den 'billigsten' Geschmack? Gehe auch darauf ein, wer bei der Rebsorte und dem Preis am nächsten dran war oder total daneben lag. Fasse dich EXTREM kurz und prägnant.",
      },
      contents: `
        Wein: ${wine.name} (${wine.grapeVariety || 'Unbekannt'}, ${wine.price ? wine.price + '€' : 'Unbekannt'})
        
        Bewertungen der Gruppe:
        ${ratings.map(r => `- ${r.userName}: ${r.score}/10. Rebe: ${r.guessedGrapeVariety || '?'}, Preis: ${r.guessedPrice ? r.guessedPrice + '€' : '?'}. Kommentar: ${r.comment || '-'}`).join('\n')}
        
        Analysiere diese Runde in maximal 2-3 kurzen, witzigen Sätzen auf Deutsch. Sei extrem kompakt.
      `,
    });

    if (!response.text) {
      throw new Error("EMPTY_RESPONSE");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    if (error.message === "MISSING_API_KEY") {
      throw new Error("Der Gemini API Key fehlt. Bitte konfiguriere GEMINI_API_KEY.");
    }
    if (error.message === "EMPTY_RESPONSE") {
      throw new Error("Die KI hat keine Analyse geliefert. Bitte versuche es erneut.");
    }
    throw new Error("Die KI-Analyse ist fehlgeschlagen. Der Weinkritiker ist wohl gerade verhindert.");
  }
}

export async function generateFinalSessionSummary(sessionName: string, wines: Wine[], ratings: Rating[]) {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      config: {
        systemInstruction: "Du bist ein legendärer Sommelier und Weinkritiker. Deine Aufgabe ist es, ein großes Abschlussfazit für eine Weinprobe zu schreiben. Sei eloquent, unterhaltsam und ein bisschen dramatisch. Kröne den Siegerwein, kommentiere das Bewertungsverhalten der Gruppe (wer war der strengste Kritiker, wer der größte Fanboy?) und ziehe ein Gesamtfazit über den Abend. Erwähne auch besondere Leistungen beim Erraten von Rebsorten und Preisen.",
      },
      contents: `
        Weinprobe: ${sessionName}
        
        Weine & Ergebnisse:
        ${wines.map(w => {
          const wineRatings = ratings.filter(r => r.wineId === w.id);
          const avg = wineRatings.length > 0 ? (wineRatings.reduce((sum, r) => sum + r.score, 0) / wineRatings.length).toFixed(1) : 'N/A';
          return `- ${w.name} (${w.grapeVariety || 'Unbekannt'}, ${w.price || '?'}€): Durchschnitt ${avg}/10 (${wineRatings.length} Bewertungen)`;
        }).join('\n')}
        
        Teilnehmer-Statistiken:
        ${Array.from(new Set(ratings.map(r => r.userId))).map(uid => {
          const userRatings = ratings.filter(r => r.userId === uid);
          const avg = userRatings.length > 0 ? (userRatings.reduce((sum, r) => sum + r.score, 0) / userRatings.length).toFixed(1) : '0';
          const name = userRatings[0]?.userName || 'Unbekannt';
          const correctGrapes = userRatings.filter(r => {
            const w = wines.find(wine => wine.id === r.wineId);
            return w && w.grapeVariety && r.guessedGrapeVariety && w.grapeVariety.toLowerCase().includes(r.guessedGrapeVariety.toLowerCase());
          }).length;
          return `- ${name}: Durchschnitt ${avg}/10, ${correctGrapes} Rebsorten-Treffer`;
        }).join('\n')}
        
        Schreibe ein begeisterndes, witziges und kompaktes Abschlussfazit auf Deutsch. Nutze Markdown für die Formatierung.
      `,
    });

    if (!response.text) {
      throw new Error("EMPTY_RESPONSE");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini Summary Error:", error);
    if (error.message === "MISSING_API_KEY") {
      throw new Error("Der Gemini API Key fehlt. Bitte konfiguriere GEMINI_API_KEY.");
    }
    if (error.message === "EMPTY_RESPONSE") {
      throw new Error("Die KI hat kein Fazit geliefert. Bitte versuche es erneut.");
    }
    throw new Error("Das Abschlussfazit konnte nicht erstellt werden.");
  }
}

export async function researchWineDetails(wine: Wine) {
  try {
    const ai = getAIInstance();
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      config: {
        systemInstruction: "Du bist ein Wein-Experte. Deine Aufgabe ist es, objektive, technische Fakten über einen bestimmten Wein zu recherchieren. Suche nach Informationen zu: Holzeinsatz (Barrique etc.), Lagerdauer/Lagerpotenzial, Restzucker, Säuregehalt, besondere Anbautechniken und eventuell ein kurzes Zitat oder eine Beschreibung des Winzers. Antworte in einer übersichtlichen, stichpunktartigen Liste auf Deutsch. Nutze Markdown.",
        tools: [{ googleSearch: {} }],
      },
      contents: `Recherchiere Details zum folgenden Wein: ${wine.name} ${wine.vintage ? 'Jahrgang ' + wine.vintage : ''} ${wine.region ? 'Region ' + wine.region : ''}.`,
    });

    if (!response.text) {
      throw new Error("EMPTY_RESPONSE");
    }

    return response.text;
  } catch (error: any) {
    console.error("Gemini Research Error:", error);
    if (error.message === "MISSING_API_KEY") {
      throw new Error("Der Gemini API Key fehlt. Bitte konfiguriere GEMINI_API_KEY.");
    }
    if (error.message === "EMPTY_RESPONSE") {
      throw new Error("Die KI hat keine Details gefunden. Bitte versuche es erneut.");
    }
    throw new Error("Die Wein-Recherche ist fehlgeschlagen.");
  }
}
