const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const searchAmazonCA = require('./amazonSearch');
const fs = require('fs');
const systemPrompt = require('./prompts');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

const conversationDir = path.join(__dirname, 'conversations');
if (!fs.existsSync(conversationDir)) fs.mkdirSync(conversationDir);

// 📁 Historique des conversations
function getConversationHistory(conversationId) {
  const filePath = path.join(conversationDir, `${conversationId}.json`);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];
}

function saveConversationHistory(conversationId, history) {
  const filePath = path.join(conversationDir, `${conversationId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2));
}

// 🔍 Extraction discrète de la ligne "Recherche Amazon"
function extractAmazonSearchLine(text) {
  const match = text.match(/recherche amazon\s*:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

// 🧼 Supprime la ligne cachée et tout lien Amazon direct
function cleanVisibleText(text) {
  return text
    .replace(/recherche amazon\s*:.*/i, '')                           // ligne discrète
    .replace(/https:\/\/www\.amazon\.ca\/[^\s<)]+/g, '')              // lien Amazon
    .replace(/\s{2,}/g, ' ')                                          // espaces en trop
    .trim();
}

// 🔧 Route de chat principale
app.post('/api/chat', async (req, res) => {
  const { message, conversationId, mode } = req.body;
  if (!message || !conversationId || !mode) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  const history = getConversationHistory(conversationId);
  const trimmedHistory = history.slice(-6);

  const fullHistory = [
    { role: 'system', content: systemPrompt },
    ...trimmedHistory,
    { role: 'user', content: message }
  ];

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: fullHistory,
      temperature: 0.5,
    });

    let rawReply = completion.choices[0].message.content;
    let finalReply = '';
    let linkToAdd = '';

    if (mode === 'pieces') {
      const aiQuery = extractAmazonSearchLine(rawReply);

      if (aiQuery) {
        const amazonResult = await searchAmazonCA(aiQuery);

        // 📁 Log de la recherche
        const logEntry = {
          timestamp: new Date().toISOString(),
          query: aiQuery,
          foundLink: amazonResult?.link || 'aucun lien',
        };
        fs.appendFileSync(path.join(__dirname, 'piece-search.log'), JSON.stringify(logEntry) + '\n', 'utf8');

        if (amazonResult?.link) {
          linkToAdd = `<br><br><a href="${amazonResult.link}" target="_blank" rel="noopener noreferrer">${amazonResult.link}</a>`;
        }
      }
    }

    finalReply = cleanVisibleText(rawReply) + linkToAdd;

    // 💾 Sauvegarde
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: finalReply });
    saveConversationHistory(conversationId, history);

    res.json({ reply: finalReply });
  } catch (err) {
    console.error('❌ Erreur OpenAI :', err.message || err);
    res.status(500).json({ reply: '❌ Erreur serveur/IA.' });
  }
});

// 📂 Accès à l'historique
app.get('/api/chat/history/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const history = getConversationHistory(conversationId);
  res.json({ history });
});

// 🚀 Lancement
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
