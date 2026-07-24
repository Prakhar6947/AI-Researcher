import { NextResponse } from "next/server";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { vectorStore } from "@/lib/agent/store";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const uploadedFile = formData.get("file");
    
    if (!uploadedFile || typeof uploadedFile === "string") {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const file = uploadedFile;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isText = file.type.startsWith("text/") || file.name.toLowerCase().endsWith(".txt");

    if (!isPdf && !isText) {
      return NextResponse.json({ error: "Only PDF and plain-text (.txt) files are supported." }, { status: 415 });
    }

    let rawDocs: Document[];

    if (isPdf) {
      const blob = new Blob([await file.arrayBuffer()], { type: "application/pdf" });
      const loader = new PDFLoader(blob, { splitPages: false });
      rawDocs = await loader.load();
    } else {
      const content = await file.text();

      if (!content.trim()) {
        return NextResponse.json({ error: "The text file is empty." }, { status: 400 });
      }

      rawDocs = [new Document({ pageContent: content, metadata: { source: file.name } })];
    }

    // Chunk the text
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await splitter.splitDocuments(rawDocs);
    const sourcedDocs = docs.map(
      (doc) => new Document({
        pageContent: doc.pageContent,
        metadata: { ...doc.metadata, source: file.name },
      }),
    );

    // Embed and store the chunks in memory
    await vectorStore.addDocuments(sourcedDocs);

    return NextResponse.json({ 
      message: `Successfully processed ${file.name}. Embedded ${sourcedDocs.length} chunks.`,
      source: file.name,
      chunks: sourcedDocs.length,
    });
  } catch (error) {
    console.error("Upload error:", error);
    const message = error instanceof Error ? error.message : "Unable to process the file.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
