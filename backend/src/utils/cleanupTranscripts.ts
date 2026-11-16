import { BlobServiceClient } from '@azure/storage-blob';

export async function cleanupTranscriptArtifacts(
  blobServiceClient: BlobServiceClient,
  normalizedAudioBlobPath: string,
  transcriptionId?: string,
): Promise<void> {
  const transcriptContainer =
    blobServiceClient.getContainerClient('transcripts');

  // 1. Delete normalized transcript JSON (<userId>/<baseName>.json)
  const expectedJsonPath = normalizedAudioBlobPath.replace(/\.[^/.]+$/, '.json');
  await transcriptContainer
    .getBlobClient(expectedJsonPath)
    .deleteIfExists();

  if (transcriptionId) {
    // 2. Delete flat <transcriptionId>.json if Speech wrote it directly at container root
    await transcriptContainer
      .getBlobClient(`${transcriptionId}.json`)
      .deleteIfExists();

    // 3. Delete all blobs inside <transcriptionId>/ virtual folder (contenturl_0.json, report.json, etc.)
    for await (const blob of transcriptContainer.listBlobsFlat({
      prefix: `${transcriptionId}/`,
    })) {
      await transcriptContainer.getBlobClient(blob.name).deleteIfExists();
    }

    // 4. Delete the job from Azure Speech Batch history (best-effort)
    const speechKey = process.env.SPEECH_KEY;
    const speechRegion = process.env.SPEECH_REGION;
    if (speechKey && speechRegion) {
      await fetch(
        `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/${transcriptionId}`,
        {
          method: 'DELETE',
          headers: { 'Ocp-Apim-Subscription-Key': speechKey },
        },
      ).catch(() => {});
    }
  }
}