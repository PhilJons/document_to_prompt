import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/prompts - Fetch all prompts for the authenticated user
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const prompts = await prisma.prompt.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" }, // Or by name, or updatedAt
    });
    return NextResponse.json(prompts);
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json({ error: "Failed to fetch prompts" }, { status: 500 });
  }
}

// POST /api/prompts - Create a new prompt for the authenticated user
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, content } = await req.json();

    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    // Check if a prompt with the same name already exists for this user
    const existingPrompt = await prisma.prompt.findFirst({
        where: {
            userId: session.user.id,
            name: name,
        }
    });

    if (existingPrompt) {
        return NextResponse.json({ error: `A prompt with the name "${name}" already exists.` }, { status: 409 }); // 409 Conflict
    }

    const newPrompt = await prisma.prompt.create({
      data: {
        name,
        content,
        userId: session.user.id,
      },
    });
    return NextResponse.json(newPrompt, { status: 201 });
  } catch (error: any) {
    console.error("Error creating prompt:", error);
    if (error.code === 'P2002' && error.meta?.target?.includes('name') && error.meta?.target?.includes('userId')) {
        return NextResponse.json({ error: `A prompt with the name already exists for this user.` }, { status: 409 });
    } 
    return NextResponse.json({ error: "Failed to create prompt" }, { status: 500 });
  }
} 