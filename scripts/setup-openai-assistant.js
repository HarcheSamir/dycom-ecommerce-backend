
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
    console.log("🚀 Starting OpenAI Assistant Setup (JS Mode)...");

    if (!process.env.OPENAI_API_KEY) {
        console.error("❌ OPENAI_API_KEY is missing from .env");
        process.exit(1);
    }

    // 1. Gather Knowledge
    console.log("📚 Fetching knowledge from Database...");

    // Fetch videos
    const videos = await prisma.video.findMany({
        where: { transcript: { not: null } },
        select: { title: true, transcript: true, section: { select: { title: true, course: { select: { title: true } } } } }
    });

    console.log(`   Found ${videos.length} videos with transcripts.`);

    // Platform Manual
    let platformManual = "";
    // Check common paths
    const manualPath = path.join(process.cwd(), 'src/api/academy-agent/platform-context.md');

    if (fs.existsSync(manualPath)) {
        platformManual = fs.readFileSync(manualPath, 'utf-8');
        console.log("   Loaded Platform Manual.");
    } else {
        console.warn("   ⚠️ Platform Manual not found at:", manualPath);
    }

    // Combine
    let combinedContent = `
[PLATFORM MANUAL]
${platformManual}

[COURSE CONTENT]
`;

    videos.forEach(v => {
        combinedContent += `
---
VIDEO: "${v.title}"
CONTENT:
${v.transcript}
---
`;
    });

    const knowledgeFilePath = path.join(process.cwd(), "academy-knowledge.txt");
    fs.writeFileSync(knowledgeFilePath, combinedContent);
    console.log(`💾 Saved temporarily to ${knowledgeFilePath}`);

    // 2. Upload to Vector Store
    console.log("📤 Uploading to OpenAI Vector Store...");

    // Create Store
    const vectorStore = await openai.beta.vectorStores.create({
        name: "Academy Knowledge Store",
    });

    // Upload
    const fileStream = fs.createReadStream(knowledgeFilePath);
    await openai.beta.vectorStores.fileBatches.uploadAndPoll(vectorStore.id, {
        files: [fileStream]
    });

    console.log(`✅ Vector Store Created: ${vectorStore.id}`);

    // 3. Create Assistant
    console.log("🤖 Creating 'Dylan' Assistant...");

    const assistant = await openai.beta.assistants.create({
        name: "Dylan - Academy Instructor",
        instructions: `You are Dylan, the expert e-commerce instructor. Answer based ONLY on the provided files.`,
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
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
