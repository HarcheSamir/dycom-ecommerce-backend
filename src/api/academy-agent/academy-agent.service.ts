
import OpenAI from "openai";
import dotenv from "dotenv";
import { prisma } from "../../index";
import { AgentConversation } from "@prisma/client";

dotenv.config();

// Initialize OpenAI Client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
});

const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

const DAILY_QUOTA = 10;

// System Prompt for empathy - we send this as additional instructions if needed, 
// or rely on the Assistant's base instructions. 
// Ideally, update the Assistant in OpenAI dashboard, but we can also steer it here.
const EMPATHY_INSTRUCTION = `
Tu es Dylan, un coach E-commerce empathique, bienveillant et humain. 
Tu dois reconnaitre les émotions de l'utilisateur. 
Ne sois jamais froid ou robotique. 
Tes réponses doivent être structurées, utiles et actionnables.
Si l'utilisateur est découragé, motive-le.
`;

export class AcademyAgentService {
    constructor() {
        if (!process.env.OPENAI_API_KEY) console.warn("⚠️ [AcademyAgent] OPENAI_API_KEY is missing.");
        if (!ASSISTANT_ID) console.warn("⚠️ [AcademyAgent] OPENAI_ASSISTANT_ID is missing.");
    }

    /**
     * Retrieves or creates a conversation thread for a user.
     * Resets quota if it's a new day.
     */
    async getOrCreateConversation(userId: string): Promise<AgentConversation> {
        let conversation = await prisma.agentConversation.findUnique({
            where: { userId },
        });

        // Create if not exists
        if (!conversation) {
            console.log(`[AcademyAgent] Creating new thread for user ${userId}`);
            const thread = await openai.beta.threads.create();
            conversation = await prisma.agentConversation.create({
                data: {
                    userId,
                    threadId: thread.id,
                    dailyMessageCount: 0,
                    lastMessageDate: new Date(),
                },
            });
        }

        // Check if we need to reset daily quota (New day)
        const now = new Date();
        const lastDate = new Date(conversation.lastMessageDate);

        // Simple day comparison (reset at midnight UTC roughly)
        const isNewDay = now.getDate() !== lastDate.getDate() ||
            now.getMonth() !== lastDate.getMonth() ||
            now.getFullYear() !== lastDate.getFullYear();

        if (isNewDay) {
            console.log(`[AcademyAgent] Resetting quota for user ${userId}`);
            conversation = await prisma.agentConversation.update({
                where: { id: conversation.id },
                data: {
                    dailyMessageCount: 0,
                    lastMessageDate: now,
                },
            });
        }

        return conversation;
    }

    /**
     * Main chat method
     */
    async chat(userMessage: string, userId: string) {
        if (!process.env.OPENAI_API_KEY || !ASSISTANT_ID) {
            throw new Error("Service IA non configuré.");
        }

        // 1. Get Conversation & Check Quota
        const conversation = await this.getOrCreateConversation(userId);

        if (conversation.dailyMessageCount >= DAILY_QUOTA) {
            return {
                answer: "Tu as atteint ta limite de messages pour aujourd'hui. Reviens demain pour continuer à discuter ! 🛑",
                quotaExceeded: true,
                remaining: 0
            };
        }

        try {
            // 2. Save User Message to DB (IMMEDIATELY)
            await prisma.agentMessage.create({
                data: {
                    conversationId: conversation.id,
                    role: 'user',
                    content: userMessage,
                }
            });

            // 3. Add User Message to OpenAI Thread
            await openai.beta.threads.messages.create(conversation.threadId, {
                role: "user",
                content: userMessage,
            });

            // 4. Run Assistant
            const run = await openai.beta.threads.runs.createAndPoll(conversation.threadId, {
                assistant_id: ASSISTANT_ID,
                additional_instructions: EMPATHY_INSTRUCTION,
            });

            if (run.status === 'completed') {
                const messages = await openai.beta.threads.messages.list(run.thread_id);
                const lastMessage = messages.data[0];
                let answerText = "";

                if (lastMessage.role === "assistant" && lastMessage.content[0].type === "text") {
                    answerText = lastMessage.content[0].text.value;
                } else {
                    answerText = "Désolé, je n'ai pas pu générer de réponse texte.";
                }

                // 5. Save Assistant Message & Increment Quota
                await prisma.$transaction([
                    prisma.agentConversation.update({
                        where: { id: conversation.id },
                        data: {
                            dailyMessageCount: { increment: 1 },
                            lastMessageDate: new Date(),
                        },
                    }),
                    prisma.agentMessage.create({
                        data: {
                            conversationId: conversation.id,
                            role: 'assistant',
                            content: answerText,
                        }
                    })
                ]);

                return {
                    answer: answerText,
                    quotaExceeded: false,
                    remaining: DAILY_QUOTA - (conversation.dailyMessageCount + 1)
                };
            } else {
                console.error("Run status:", run.status);
                throw new Error("L'assistant n'a pas répondu correctement.");
            }

        } catch (error) {
            console.error("[AcademyAgent] Error:", error);
            throw new Error("Une erreur technique est survenue.");
        }
    }

    /**
     * Fetch history
     */
    async getHistory(userId: string) {
        const conversation = await prisma.agentConversation.findUnique({
            where: { userId },
            include: {
                messages: {
                    orderBy: { createdAt: 'asc' } // Oldest first for chat UI
                }
            }
        });

        if (!conversation) return { messages: [], remaining: DAILY_QUOTA };

        // Handle quota reset check for display purposes
        const now = new Date();
        const lastDate = new Date(conversation.lastMessageDate);
        const isNewDay = now.getDate() !== lastDate.getDate() ||
            now.getMonth() !== lastDate.getMonth() ||
            now.getFullYear() !== lastDate.getFullYear();

        const currentCount = isNewDay ? 0 : conversation.dailyMessageCount;

        return {
            messages: conversation.messages.map(m => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.createdAt
            })),
            remaining: Math.max(0, DAILY_QUOTA - currentCount)
        };
    }
}
