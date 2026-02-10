
import { Request, Response } from 'express';
import { AcademyAgentService } from './academy-agent.service';

const agentService = new AcademyAgentService();

export const chatWithAgent = async (req: Request, res: Response) => {
    try {
        const { message } = req.body;
        // User ID is attached by authMiddleware
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (!message) {
            return res.status(400).json({ error: "Message is required" });
        }

        // Call the AI Service
        const result = await agentService.chat(message, userId);

        // result contains { answer, quotaExceeded, remaining }
        return res.status(200).json(result);

    } catch (error: any) {
        console.error("Agent Controller Error:", error);
        return res.status(500).json({
            error: "Internal Server Error",
            message: error.message
        });
    }
};

export const getAgentHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const history = await agentService.getHistory(userId);
        return res.status(200).json(history);
    } catch (error) {
        console.error("Agent History Error:", error);
        return res.status(500).json({ error: "Failed to fetch history" });
    }
};
