import { Request, Response } from "express";
import AppError from "../errors/AppError";
import Ticket from "../models/Ticket";
import Call from "../models/Call";
import User from "../models/User";
import sequelize from "../database"; // Import your sequelize instance

export const initiateCall = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId, contactNumber, userId } = req.body;

    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket not found", 404);
        }

        // Initialize Wavoip call here
        // This is a placeholder for the actual Wavoip integration
        // You'll need to add your Wavoip credentials and API calls

        const callData = {
            from: process.env.WAVOIP_NUMBER,
            to: contactNumber,
            callerId: userId,
            // Add other necessary parameters
        };

        // Make the API call to Wavoip
        // const voipResponse = await wavoipAPI.makeCall(callData);

        return res.status(200).json({
            success: true,
            message: "Call initiated successfully",
            // callId: voipResponse.callId
        });

    } catch (err) {
        console.error(err);
        throw new AppError("Error initiating call", 500);
    }
};

export const endCall = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId, userId } = req.body;

    try {
        // Add logic to end the call through Wavoip API
        return res.status(200).json({
            success: true,
            message: "Call ended successfully"
        });
    } catch (err) {
        console.error(err);
        throw new AppError("Error ending call", 500);
    }
};

export const getCallStatus = async (req: Request, res: Response): Promise<Response> => {
    const { ticketId } = req.params;

    try {
        const ticket = await Ticket.findByPk(ticketId);
        if (!ticket) {
            throw new AppError("Ticket not found", 404);
        }

        const activeCall = await Call.findOne({
            where: {
                ticketId,
                status: "in-progress"
            },
            order: [["createdAt", "DESC"]],
            include: [
                {
                    model: User,
                    attributes: ["id", "name"]
                }
            ]
        });

        if (!activeCall) {
            return res.status(404).json({
                success: false,
                message: "No active call found"
            });
        }

        return res.status(200).json({
            success: true,
            callId: activeCall.callId,
            status: activeCall.status,
            startedAt: activeCall.createdAt,
            user: activeCall.user
        });

    } catch (err) {
        console.error("Error getting call status:", err);
        throw new AppError("Error retrieving call status", 500);
    }
};