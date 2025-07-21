const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public

// API Proxy endpoint
app.post('/api/translate', async (req, res) => {
    const { text, from, to } = req.body;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API klíč není nastaven na serveru.' });
    }
    
    const langMap = { cs: 'čeština', elf: 'elfština', klingon: 'klingonština', dothraki: 'dothrakština', esperanto: 'esperanto' };
    const fromLabel = langMap[from] || from;
    const toLabel = langMap[to] || to;
    const prompt = `Přelož následující text z ${fromLabel} do ${toLabel} (fantasy styl, pokud je to fiktivní jazyk):\n"${text}"`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 120,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return res.status(response.status).json({ error: 'Chyba OpenAI API', details: errorData });
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Interní chyba serveru.' });
    }
});

// SPA Fallback - Serve index.html for any other requests
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server běží na portu ${port}`);
}); 