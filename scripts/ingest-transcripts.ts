
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const VIMEO_TOKEN = process.env.VIMEO_ACCESS_TOKEN;

async function run() {
    if (!VIMEO_TOKEN) {
        console.error("❌ No VIMEO_ACCESS_TOKEN in env");
        process.exit(1);
    }

    console.log("🚀 Starting Transcript Ingestion...");
    const videos = await prisma.video.findMany({
        where: { vimeoId: { not: "" } },
        select: { id: true, vimeoId: true, title: true }
    });

    console.log(`Found ${videos.length} videos.`);

    for (const vid of videos) {
        try {
            console.log(`Checking: ${vid.title} (${vid.vimeoId})`);
            const tracksRes = await axios.get(`https://api.vimeo.com/videos/${vid.vimeoId}/texttracks`, {
                headers: { Authorization: `bearer ${VIMEO_TOKEN}` }
            });

            // Find French track or fallback to first
            const track = tracksRes.data.data.find((t: any) => t.language.startsWith('fr')) || tracksRes.data.data[0];

            if (!track) {
                console.log("   ⚠️ No transcript found.");
                continue;
            }

            console.log(`   ✅ Track found: ${track.language} (${track.type})`);

            // Download VTT
            const vttRes = await axios.get(track.link);
            const vttText = vttRes.data;

            // Clean VTT
            const cleanText = vttText
                .replace(/WEBVTT\s+/, '')
                .replace(/(\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3})/g, '') // Remove timestamps
                .replace(/^\d+\s*$/gm, '') // Remove standalone numbers (line numbers)
                .replace(/\r?\n/g, ' ') // Flatten newlines
                .replace(/\s+/g, ' ') // Remove extra spaces
                .trim();

            if (cleanText.length < 50) {
                console.log("   Script too short, skipping.");
                continue;
            }

            // Save to DB
            await prisma.video.update({
                where: { id: vid.id },
                data: { transcript: cleanText }
            });
            console.log("   💾 Saved to Database.");

        } catch (e: any) {
            console.log(`   ❌ Failed: ${e.message}`);
        }
    }
    console.log("Done.");
}

run()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
