import type { VercelRequest, VercelResponse } from "@vercel/node";
import fetch from "node-fetch";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";
const TTS_URL = "https://texttospeech.googleapis.com/v1/text:synthesize";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    console.log("Processing question:", question);

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GOOGLE_API_KEY}`, {
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
    console.log("Gemini API response received");

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

    console.log("Extracted text response:", textResponse);

    const ttsResponse = await fetch(`${TTS_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text: textResponse },
        voice: { languageCode: "en-US", ssmlGender: "NEUTRAL" },
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 16000,
          effectsProfileId: ["small-bluetooth-speaker-class-device"],
        },
      }),
    });

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error("TTS API error:", errorText);
      return res.status(200).json({
        text: textResponse,
        error: `TTS API error: ${errorText}`,
      });
    }

    const ttsData = await ttsResponse.json();
    console.log("TTS API response received (PCM format)");

    return res.status(200).json({
      text: textResponse,
      audio: ttsData.audioContent,
      format: "LINEAR16",
      sampleRate: 16000,
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
