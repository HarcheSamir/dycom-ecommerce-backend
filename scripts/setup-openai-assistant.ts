
import OpenAI from "openai";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load env vars
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting OpenAI Assistant Setup...");

    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing from .env");
        process.exit(1);
    }

    // 1. Gather Knowledge
    console.log("📚 Fetching knowledge from Database...");

    // B. Load Video Transcripts
    const videos = await prisma.video.findMany({
        where: { transcript: { not: null } },
        select: { title: true, transcript: true, section: { select: { title: true, course: { select: { title: true } } } } }
    });

    console.log(`   Found ${videos.length} videos with transcripts.`);

    // A. Load Platform Manual
    let platformManual = "";
    const manualPath = path.join(process.cwd(), 'src/api/academy-agent/platform-context.md');
    if (fs.existsSync(manualPath)) {
        platformManual = fs.readFileSync(manualPath, 'utf-8');
        console.log("   Loaded Platform Manual.");
    } else {
        console.warn("   ⚠️ Platform Manual not found at:", manualPath);
    }

    // Combine into one large text file
    let combinedContent = `
[PLATFORM MANUAL - HOW TO USE THE DASHBOARD]
${platformManual}

[COURSE CONTENT - TRANSCRIPTS]
`;

    videos.forEach(v => {
        combinedContent += `
---
VIDEO: "${v.title}" (Section: ${v.section.title}, Course: ${v.section.course.title})
CONTENT:
${v.transcript}
---
`;
    });

    const knowledgeFilePath = path.join(process.cwd(), "academy-knowledge.txt");
    fs.writeFileSync(knowledgeFilePath, combinedContent);
    console.log(`💾 Saved temporarily to ${knowledgeFilePath} (${(combinedContent.length / 1024 / 1024).toFixed(2)} MB)`);


    // 2. Upload to Vector Store
    console.log("📤 Uploading file to OpenAI Vector Store...");

    // Create a Vector Store
    const vectorStore = await openai.beta.vectorStores.create({
        name: "Academy Knowledge Store",
    });

    // Upload file
    const fileStream = fs.createReadStream(knowledgeFilePath);
    await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, {
        files: [fileStream]
    });

    console.log(`✅ Vector Store Created: ${vectorStore.id}`);


    // 3. Create Assistant
    console.log("🤖 Creating 'Dylan' Assistant...");

    const assistant = await openai.beta.assistants.create({
        name: "Dylan - Academy Instructor",
        instructions: `
You are **Dylan**, the expert e-commerce instructor and verified mentor of the "E-commerce Insights Academy".
You serve as a personal coach for students launching their online business.

### 🎭 YOUR PERSONA
- **Tone**: French (Français) 🇫🇷, Energetic, Encouraging ("Tu vas y arriver!"), Direct, and Expert.
- **Style**: Use "Tu" (tutoiement). Speak naturally like a human mentor, not an AI.

### 🛡️ PRIME DIRECTIVES (RULES)
1. **INVISIBLE KNOWLEDGE**: You have memorized all the course content. NEVER mention "files", "documents", or "search results". If you find the answer in the context, present it as your own expert knowledge.
2. **NO CITATIONS**: Do NOT include citation markers like [source] or 【4:17†source】. Remove them completely.
3. **HANDLING UNKNOWNS**: If the answer is not in the context, do NOT say "It is not in the files". Say: *"C'est une excellente question, mais ce n'est pas couvert spécifiquement dans ce module de formation. Je te conseille de demander sur le groupe WhatsApp."*
4. **FORMAT**: Keep answers punchy. Use bolding for key concepts.
    `,
        model: "gpt-4o-mini",
        tools: [{ type: "file_search" }],
        tool_resources: {
            file_search: {
                vector_store_ids: [vectorStore.id]
            }
        }
    });

    console.log("\n🎉 SUCCESS! Assistant Created.");
    console.log("------------------------------------------------");
    console.log(`ASSISTANT_ID=${assistant.id}`);
    console.log("------------------------------------------------");
    console.log("👉 Please add this ID to your .env file!");

    // Cleanup
    fs.unlinkSync(knowledgeFilePath);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
