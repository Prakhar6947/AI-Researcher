import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenAI } from "@google/genai";

function getClient() {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured.");
  }

  return new GoogleGenAI({ apiKey });
}

class NativeGoogleEmbeddings extends Embeddings {
  private readonly modelName = process.env.GOOGLE_EMBEDDING_MODEL ?? "gemini-embedding-001";

  constructor() {
    super({});
  }

  private getEmbeddingValues(response: Awaited<ReturnType<GoogleGenAI["models"]["embedContent"]>>): number[][] {
    const embeddings = response.embeddings;

    if (!embeddings?.length || embeddings.some((embedding) => !embedding.values)) {
      throw new Error("The Gemini embedding response did not include vectors.");
    }

    return embeddings.map((embedding) => embedding.values!);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const response = await getClient().models.embedContent({
      model: this.modelName,
      contents: texts,
    });
    return this.getEmbeddingValues(response);
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await getClient().models.embedContent({
      model: this.modelName,
      contents: text,
    });
    const [embedding] = this.getEmbeddingValues(response);
    return embedding;
  }
}

export const vectorStore = new MemoryVectorStore(new NativeGoogleEmbeddings());

export function getLibraryStats() {
  const sources = Array.from(
    new Set(
      vectorStore.memoryVectors
        .map((vector) => vector.metadata.source)
        .filter((source): source is string => typeof source === "string"),
    ),
  );

  return {
    chunks: vectorStore.memoryVectors.length,
    sources,
  };
}

export function clearLibrary() {
  const removedChunks = vectorStore.memoryVectors.length;
  vectorStore.memoryVectors = [];
  return removedChunks;
}
