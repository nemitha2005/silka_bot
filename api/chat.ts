import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TTS_API_KEY = process.env.TTS_API_KEY;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    if (!GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: "Gemini API key is not configured" });
    }

    if (!TTS_API_KEY) {
      return res.status(500).json({ error: "TTS API key is not configured" });
    }

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: question,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return res
        .status(geminiResponse.status)
        .json({ error: `Gemini API error: ${errorText}` });
    }

    const geminiData = await geminiResponse.json();

    let textResponse = "";
    if (geminiData.candidates && geminiData.candidates[0]?.content?.parts) {
      textResponse = geminiData.candidates[0].content.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join(" ");
    }

    if (!textResponse) {
      return res.status(500).json({ error: "No response from Gemini API" });
    }

    const ttsResponse = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${TTS_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text: textResponse },
          voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error("TTS API error:", errorText);
      return res.status(ttsResponse.status).json({
        error: `TTS API error: ${errorText}`,
        text: textResponse,
      });
    }

    const ttsData = await ttsResponse.json();

    return res.status(200).json({
      text: textResponse,
      audio: ttsData.audioContent,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
