import { compiledGraph } from "@/lib/agent/graph";
import { HumanMessage } from "@langchain/core/messages";

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    
    const stream = await compiledGraph.stream(
      { messages: [new HumanMessage(prompt)] },
      { streamMode: "updates" }
    );

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(chunk) + "\n"));
          }
        } catch (streamError) {
          console.error("❌ Error during LangGraph streaming:", streamError);
          // Send an error message to the frontend before closing
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ error: "Agent execution failed." }) + "\n"));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readableStream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("❌ Fatal Error in API Route:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}