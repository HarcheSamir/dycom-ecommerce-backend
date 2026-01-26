
import { AcademyAgentService } from "../src/api/academy-agent/academy-agent.service";
import dotenv from "dotenv";

dotenv.config();

async function main() {
    console.log("🧪 Testing Academy Agent (OpenAI Mode)...");

    const agent = new AcademyAgentService();
    const userId = "test-user-123";
    const question = "Comment je peux lancer ma propre boutique ? Explique moi les étapes.";

    console.log(`\n❓ Question: "${question}"`);
    console.log("⏳ Waiting for Dylan...");

    const answer = await agent.chat(question, userId);

    console.log("\n💬 Dylan's Answer:");
    console.log("---------------------------------------------------");
    console.log(answer);
    console.log("---------------------------------------------------");
}

main().catch(console.error);
