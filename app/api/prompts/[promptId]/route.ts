import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Context might not be strictly needed if we parse ID from URL but kept for consistency if other params were added.
interface HandlerContext {
    params: {
        promptId: string; // This will be ignored if we successfully parse from URL
    }
}

// It's common to define params type directly in the handler arguments for clarity
// interface RouteParams {
//   params: {
//     promptId: string;
//   };
// }

// PUT /api/prompts/[promptId] - Update an existing prompt
export async function PUT(req: NextRequest, context: HandlerContext) {
  const pathname = req.nextUrl.pathname;
  const segments = pathname.split('/');
  const promptIdFromUrl = segments.pop(); // Get the last segment, which should be the ID

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!promptIdFromUrl || isNaN(parseInt(promptIdFromUrl))) {
    return NextResponse.json({ error: "Invalid prompt ID from URL" }, { status: 400 });
  }
  const idAsInt = parseInt(promptIdFromUrl);

  try {
    const { name, content } = await req.json();

    if (!name || !content) {
      return NextResponse.json({ error: "Name and content are required" }, { status: 400 });
    }

    const existingPrompt = await prisma.prompt.findUnique({
      where: { id: idAsInt },
    });

    if (!existingPrompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if (existingPrompt.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden - You do not own this prompt" }, { status: 403 });
    }

    if (name !== existingPrompt.name) {
      const conflictingPrompt = await prisma.prompt.findFirst({
        where: {
          userId: session.user.id,
          name: name,
          NOT: {
            id: idAsInt,
          },
        },
      });
      if (conflictingPrompt) {
        return NextResponse.json({ error: `A prompt with the name "${name}" already exists.` }, { status: 409 });
      }
    }

    const updatedPrompt = await prisma.prompt.update({
      where: {
        id: idAsInt,
      },
      data: {
        name,
        content,
      },
    });
    return NextResponse.json(updatedPrompt);
  } catch (error: any) {
    console.error(`Error updating prompt ${promptIdFromUrl}:`, error);
     if (error.code === 'P2002' && error.meta?.target?.includes('name') && error.meta?.target?.includes('userId')) {
        return NextResponse.json({ error: `A prompt with the name already exists for this user.` }, { status: 409 });
    } 
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
  }
}

// DELETE /api/prompts/[promptId] - Delete a prompt
export async function DELETE(req: NextRequest, context: HandlerContext) {
  const pathname = req.nextUrl.pathname;
  const segments = pathname.split('/');
  const promptIdFromUrl = segments.pop(); // Get the last segment

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!promptIdFromUrl || isNaN(parseInt(promptIdFromUrl))) {
    return NextResponse.json({ error: "Invalid prompt ID from URL" }, { status: 400 });
  }
  const idAsInt = parseInt(promptIdFromUrl);

  try {
    const promptToDelete = await prisma.prompt.findUnique({
      where: { id: idAsInt },
    });

    if (!promptToDelete) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if (promptToDelete.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden - You do not own this prompt" }, { status: 403 });
    }

    await prisma.prompt.delete({
      where: {
        id: idAsInt,
      },
    });
    return NextResponse.json({ message: "Prompt deleted successfully" }, { status: 200 });
  } catch (error) {
    console.error(`Error deleting prompt ${promptIdFromUrl}:`, error);
    return NextResponse.json({ error: "Failed to delete prompt" }, { status: 500 });
  }
} 