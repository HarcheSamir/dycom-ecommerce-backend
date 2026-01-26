
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// Initialize OpenAI Client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "", // Safe fallback, check in method
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

export class AcademyAgentService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) {
            console.warn("⚠️ [AcademyAgent] OPENAI_API_KEY is missing.");
        }
        if (!ASSISTANT_ID) {
            console.warn("⚠️ [AcademyAgent] OPENAI_ASSISTANT_ID is missing (Run setup script first).");
        } else {
            console.log(`[AcademyAgent] Initialized with Assistant ID: ${ASSISTANT_ID}`);
        }
    }

    async chat(userMessage: string, userId: string): Promise<string> {
        console.log(`[AcademyAgent] Chat request from ${userId}`);

        // 1. Safety Checks
        if (!process.env.OPENAI_API_KEY) return "Service IA non configuré (API Key manquante).";
        if (!ASSISTANT_ID) return "Service IA en cours de maintenance (Assistant ID manquant).";

        try {
            // 2. Create a Thread (In a real app, you'd store threadId per user to separate conversations)
            // For now, we create a fresh thread per question context, or we could pass a threadId if frontend supported it.
            // To keep it simple and stateless like before, we create a new thread.
            const thread = await openai.beta.threads.create();

            // 3. Add User Message
            await openai.beta.threads.messages.create(thread.id, {
                role: "user",
                content: userMessage,
            });

            // 4. Run the Assistant
            const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
                assistant_id: ASSISTANT_ID,
            });

            if (run.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(run.thread_id);
                const lastMessage = messages.data[0];

                if (lastMessage.role === "assistant" && lastMessage.content[0].type === "text") {
                    return lastMessage.content[0].text.value;
                }
            }

            console.error("Run status:", run.status);
            if (run.status === 'failed') {
                console.error("Run Error Details:", JSON.stringify(run.last_error, null, 2));
            }
            return "Désolé, Dylan réfléchit trop longtemps. Réessaie plus tard.";

        } catch (error) {
            console.error("[AcademyAgent] OpenAI Error:", error);
            return "Une erreur technique est survenue.";
        }
    }
}
