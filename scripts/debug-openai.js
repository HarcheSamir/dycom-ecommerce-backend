
const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    console.log("🔍 Authenticating with OpenAI...");
    console.log(`🔑 Key Prefix: ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 10) + "..." : "None"}`);

    try {
        const list = await openai.models.list();
        const models = list.data.map(m => m.id).sort();

        console.log("\n📋 YOUR AVAILABLE MODELS:");
        console.log(models.join(", "));

        console.log("\n-------------------------------------------");
        if (models.includes("gpt-4o-mini")) {
            console.log("✅ SUCCESS: 'gpt-4o-mini' is available.");
            console.log("❓ If the setup script failed, it might be a temporary API glitch.");
        } else {
            console.log("❌ ERROR: 'gpt-4o-mini' is MISSING from your account.");
            console.log("\n👉 POSSIBLE CAUSES:");
            console.log("1. Project Key Restriction: You selected specific models when creating the key.");
            console.log("2. Billing: You need to add $5 credit (Tier 1) to access GPT-4 models.");
            console.log("3. New Account: Free tier accounts might not have access to 'mini' yet.");
        }
        console.log("-------------------------------------------");

    } catch (e) {
        console.error("\n❌ FAILED to connect:", e.message);
        if (e.status === 401) console.error("👉 Check your API Key characters.");
    }
}

main();
