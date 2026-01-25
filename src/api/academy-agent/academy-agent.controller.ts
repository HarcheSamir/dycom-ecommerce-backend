
import { Request, Response } from 'express';
import { AcademyAgentService } from './academy-agent.service';

const agentService = new AcademyAgentService();

export const chatWithAgent = async (req: Request, res: Response) => {
    try {
        console.log("Received chat request");
        const { message } = req.body;
        // User ID is attached by authMiddleware
        const userId = (req as any).user?.id || "unknown";
        console.log("User ID:", userId);

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        // Call the AI Service
        const answer = await agentService.chat(message, userId);

        return res.status(200).json({ answer });

    } catch (error) {
        console.error("Agent Controller Error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
