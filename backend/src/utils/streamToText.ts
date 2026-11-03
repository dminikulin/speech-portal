export async function streamToText(readableStream: NodeJS.ReadableStream | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!readableStream) return resolve("");
    const chunks: any[] = [];
    readableStream.on("data", (data) => chunks.push(data.toString()));
    readableStream.on("end", () => resolve(chunks.join("")));
    readableStream.on("error", reject);
  });
}