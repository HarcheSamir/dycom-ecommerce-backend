
const OpenAI = require("openai");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Load env vars
dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting OpenAI Assistant Setup (JS Mode - v6 SDK)...");

    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing from .env");
        process.exit(1);
    }

    // 1. Gather Knowledge
    console.log("📚 Fetching knowledge from Database...");

    // Fetch videos
    const videos = await prisma.video.findMany({
        where: { transcript: { not: null } },
        select: { title: true, transcript: true }
    });

    console.log(`   Found ${videos.length} videos with transcripts.`);

    let content = "[ACADEMY KNOWLEDGE]\n";

    // Try to load manual
    try {
        const manualPath = path.join(process.cwd(), 'src/api/academy-agent/platform-context.md');
        if (fs.existsSync(manualPath)) {
            content += "[PLATFORM MANUAL]\n" + fs.readFileSync(manualPath, 'utf8') + "\n\n";
            console.log("   Loaded Manual.");
        }
    } catch (e) { }

    videos.forEach(v => {
        content += `\nVIDEO: ${v.title}\nTRANSCRIPT:\n${v.transcript}\n---\n`;
    });

    const knowledgeFilePath = path.join(process.cwd(), "academy-knowledge.txt");
    fs.writeFileSync(knowledgeFilePath, content);
    console.log(`💾 Saved temporarily to ${knowledgeFilePath}`);

    // 2. Upload to Vector Store
    console.log("📤 Creating Vector Store (v6 Syntax)...");

    // Try stable path, fallback to beta just in case, but assume STABLE for v6.
    // Error said 'vectorStores' not on 'beta', so it MUST be on root or elsewhere.
    // Based on research: client.vectorStores.create()

    let vectorStore;
    try {
        if (openai.vectorStores) {
            vectorStore = await openai.vectorStores.create({ name: "Academy Knowledge Store" });
        } else {
            // Fallback or panic
            vectorStore = await openai.beta.vectorStores.create({ name: "Academy Knowledge Store" });
        }
    } catch (e) {
        console.log("Error creating store, trying alternate path...");
        // If v6 structure is radically different, we might be blind, but lets assume root.
        vectorStore = await openai.beta.vectorStores.create({ name: "Academy Knowledge Store" });
    }

    console.log(`✅ Vector Store Created: ${vectorStore.id}`);

    // Upload File
    console.log("📤 Uploading File...");
    const fileId = await openai.files.create({
        file: fs.createReadStream(knowledgeFilePath),
        purpose: "assistants",
    });
    console.log(`   File Uploaded: ${fileId.id}`);

    // Link File
    console.log("🔗 Linking File to Store...");
    if (openai.vectorStores) {
        await openai.vectorStores.fileBatches.create(vectorStore.id, { file_ids: [fileId.id] });
    } else {
        await openai.beta.vectorStores.fileBatches.create(vectorStore.id, { file_ids: [fileId.id] });
    }

    // 3. Create Assistant
    console.log("🤖 Creating 'Dylan' Assistant...");

    // DEBUG LOGS PROVED: assistants is still in beta, vectorStores is stable.
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

    console.log("\n================================================");
    console.log(`🎉 ASSISTANT_ID:  ${assistant.id}`);
    console.log("================================================");
    console.log("👉 Add this ID to your .env file!");

    // Cleanup
    fs.unlinkSync(knowledgeFilePath);
}

main()
    .catch((e) => {
        console.error("ERROR:", e);
        // Print properties to help debug if it fails again
        try {
            console.log("OpenAI Client Keys:", Object.keys(openai));
            if (openai.beta) console.log("OpenAI.beta Keys:", Object.keys(openai.beta));
        } catch (err) { }
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
