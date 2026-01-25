
import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || ""; // You typically have this for the other AI feature
// Use the same model as your product enrichment or 'gemini-1.5-flash' specifically
const MODEL_NAME = "gemini-1.5-flash";

const genAI = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

export class AcademyAgentService {

    /**
     * Main function: Chat with Dylan
     */
    async chat(userMessage: string, userId: string): Promise<string> {
        // 1. Fetch Context (Cache this in production ideally, but DB is fast enough for now)
        const context = await this.buildFullContext();

        // 2. Build System Prompt
        const systemPrompt = `
You are **Dylan**, the expert e-commerce instructor of the "E-commerce Insights Academy".
Your goal is to help students succeed by answering their questions using ONLY the knowledge found in the context below.

### 🎭 YOUR PERSONA
- **Tone**: French (Français), Encouraging, Direct, Professional yet Accessible.
- **Style**: Use "Tu" (tutoiement) with students. Use emojis 🚀 carefully.
- **Identity**: You are NOT an AI assistant, you ARE "Dylan from the Academy".

### 🛡️ PRIME DIRECTIVES (RULES)
1. **STRICT CONTEXT**: Answer based *only* on the provided [COURSE CONTENT] and [PLATFORM MANUAL] below.
2. **NO HALLUCINATION**: If the answer is not in the context, say: *"D'après les vidéos de la formation, ce point n'est pas abordé. Je te conseille de poser la question sur le groupe d'entraide."*
3. **SUPPORT**: If it's a technical bug or billing issue, refer to the [PLATFORM MANUAL] or tell them to contact WhatsApp Support.
4. **FORMAT**: Keep answers concise (max 3-4 sentences unless a detailed explanation is needed). Use bullet points for steps.

### 🧠 CONTEXT
${context}
`;

        // 3. Call Gemini
        try {
            const result: any = await genAI.models.generateContent({
                model: MODEL_NAME,
                contents: [
                    { role: 'user', parts: [{ text: systemPrompt + "\n\nUSER QUESTION: " + userMessage }] }
                ]
            });

            // Handle different SDK response shapes safely
            const textResponse =
                result.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
                result.candidates?.[0]?.content?.parts?.[0]?.text ||
                "Désolé, je n'ai pas pu générer une réponse (Format inattendu).";

            return textResponse;

        } catch (error: any) {
            console.error("AI Agent Error:", error);
            return "Une erreur technique est survenue. Contacte le support si cela persiste.";
        }
    }

    /**
     * Compiles all Transcripts + Platform Context into one huge string
     */
    private async buildFullContext(): Promise<string> {
        // A. Load Platform Manual
        const manualPath = path.join(__dirname, 'platform-context.md');
        let platformManual = "";
        try {
            platformManual = fs.readFileSync(manualPath, 'utf-8');
        } catch (e) {
            console.error("Could not read platform-context.md", e);
        }

        // B. Load Video Transcripts
        const videos = await prisma.video.findMany({
            where: { transcript: { not: null } },
            select: { title: true, transcript: true, section: { select: { title: true, course: { select: { title: true } } } } }
        });

        let courseContent = "";
        videos.forEach(v => {
            const courseName = v.section.course.title;
            const sectionName = v.section.title;
            const videoTitle = v.title;
            const text = v.transcript;

            courseContent += `
---
COURSE: ${courseName}
SECTION: ${sectionName}
VIDEO: "${videoTitle}"
CONTENT:
${text}
---
`;
        });

        // C. Combine
        return `
[PLATFORM MANUAL - HOW TO USE THE DASHBOARD]
${platformManual}

[COURSE CONTENT - TRANSCRIPTS]
${courseContent}
`;
    }
}
