import fetch from 'node-fetch';
import express from 'express';
import {TextEncoder, TextDecoder} from 'util';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const allowedOrigins = ['https://spageai.mvpdeliver.com'];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, 
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());


import { Writable } from 'stream';

app.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    const systemPrompt = `You are an expert HTML and CSS senior front developer.
    Generate clean, semantic HTML with Tailwind CSS for the user's request in a single page.
    Follow these requirements:
    1. Keep the code under 3000 tokens
    2. Use minimal external resources
    3. Only include essential Tailwind classes
    4. Focus on core functionality first
    5. Output valid HTML5 structure
    6. Include only critical inline CSS in a style tag
    7. Respond with code only, no explanations
    8. Use simple placeholder images from placehold.co
    9. Remove the system html comments`;

    const deepSeekResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "deepseek-coder",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a single HTML page with inline CSS for: ${prompt}` }
        ],
        stream: true,
      }),
    });

    if (!deepSeekResponse.ok || !deepSeekResponse.body) {
      return res.status(500).send('Failed to fetch or empty response');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const decoder = new TextDecoder();

    const writable = new Writable({
      write(chunk, encoding, callback) {
        const chunkStr = decoder.decode(chunk);
        const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          const message = line.replace(/^data: /, '');
          if (message === '[DONE]') continue;

          try {
            const parsed = JSON.parse(message);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(JSON.stringify({ chunk: content }) + '\n');
            }
          } catch (e) {
            console.error('Error parsing chunk:', e);
          }
        }
        callback();
      }
    });

    deepSeekResponse.body.pipe(writable).on('finish', () => {
      res.end();
    }).on('error', (err) => {
      console.error('Stream error:', err);
      res.end();
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate code' });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
