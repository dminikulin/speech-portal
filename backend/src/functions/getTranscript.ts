import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { streamToText } from '../utils/streamToText';

function formatTranscriptWithParagraphs(parsedJson: any): string {
  // Fallback to combined text if recognizedPhrases is unavailable
  if (
    !parsedJson.recognizedPhrases ||
    parsedJson.recognizedPhrases.length === 0
  ) {
    return (
      parsedJson.combinedRecognizedPhrases
        ?.map((p: any) => p.display)
        .join(' ') || ''
    );
  }

  // Helper to parse ISO 8601 duration / seconds (e.g., "PT3.5S", "PT1M2.3S", or ticks)
  const parseSeconds = (durationStr?: string, ticks?: number): number => {
    if (ticks !== undefined) return ticks / 10000000;
    if (!durationStr) return 0;
    const match = durationStr.match(/PT(?:(\d+)M)?([\d.]+)S/);
    if (!match) return 0;
    const minutes = parseFloat(match[1] || '0');
    const seconds = parseFloat(match[2] || '0');
    return minutes * 60 + seconds;
  };

  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];
  let prevEndTime = 0;

  for (const phrase of parsedJson.recognizedPhrases) {
    if (phrase.recognitionStatus !== 'Success') continue;

    const bestNBest = phrase.nBest?.[0];
    const text = bestNBest?.display?.trim();
    if (!text) continue;

    const offsetSec = parseSeconds(phrase.offset, phrase.offsetInTicks);
    const durationSec = parseSeconds(phrase.duration, phrase.durationInTicks);

    // If silence between previous phrase and current phrase is >= 1.2s, start a new paragraph
    const silenceGap = offsetSec - prevEndTime;
    const isMajorPause = prevEndTime > 0 && silenceGap >= 1.2;

    if (isMajorPause && currentParagraph.length > 0) {
      paragraphs.push(currentParagraph.join(' '));
      currentParagraph = [];
    }

    currentParagraph.push(text);
    prevEndTime = offsetSec + durationSec;
  }

  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph.join(' '));
  }

  // Join paragraphs with clean double newlines
  return paragraphs.join('\n\n');
}

export async function getTranscript(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const speechKey = process.env.SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION;
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;

  if (!speechKey || !speechRegion || !accountName || !accountKey) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Service configurations missing in backend.' },
    };
  }

  const userId = request.query.get('userId');
  const blobPath = request.query.get('blobPath');

  if (!userId || !blobPath) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        error: 'Missing required query parameters: userId and blobPath',
      },
    };
  }

  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  const normalizedBlobPath = blobPath.includes('/')
    ? blobPath
    : `${sanitizedUserId}/${blobPath}`;

  if (!normalizedBlobPath.startsWith(`${sanitizedUserId}/`)) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Unauthorized access' },
    };
  }

  const rawFileName = normalizedBlobPath.split('/').pop() || '';
  const baseName = rawFileName.replace(/\.[^/.]+$/, '');

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );
  const audioContainer = blobServiceClient.getContainerClient('audio-in');
  const transcriptContainer =
    blobServiceClient.getContainerClient('transcripts');

  try {
    // 1. Direct UUID lookup using transcriptionid stored on the audio-in blob
    const audioBlobClient =
      audioContainer.getBlockBlobClient(normalizedBlobPath);
    if (await audioBlobClient.exists()) {
      const audioProps = await audioBlobClient.getProperties();
      const transcriptionId = audioProps.metadata?.transcriptionid;

      if (transcriptionId) {
        const expectedJsonPath = normalizedBlobPath.replace(
          /\.[^/.]+$/,
          '.json',
        );
        const directJsonClient =
          transcriptContainer.getBlobClient(expectedJsonPath);

        if (await directJsonClient.exists()) {
          const download = await directJsonClient.download();
          const content = await streamToText(download.readableStreamBody);
          const parsed = JSON.parse(content);
          const combinedText = formatTranscriptWithParagraphs(parsed);

          return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            jsonBody: { text: combinedText },
          };
        }
      }
    }

    // 2. Fallback scan for legacy transcripts without transcriptionid metadata
    for await (const blob of transcriptContainer.listBlobsFlat()) {
      if (blob.name.endsWith('.json') && !blob.name.endsWith('report.json')) {
        const client = transcriptContainer.getBlobClient(blob.name);
        try {
          const download = await client.download();
          const content = await streamToText(download.readableStreamBody);
          const parsed = JSON.parse(content);
          const src = parsed.source || parsed.properties?.contentUrl || '';

          if (
            src.includes(baseName) ||
            src.includes(encodeURIComponent(baseName)) ||
            blob.name.includes(baseName)
          ) {
            const combinedText = formatTranscriptWithParagraphs(parsed);

            return {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
              jsonBody: { text: combinedText },
            };
          }
        } catch {
          // Continue scanning if one JSON is unparseable
        }
      }
    }

    // 2. Fallback: Query Azure Speech API for in-progress or internal jobs
    const listUrl = `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions?top=30`;
    const listRes = await fetch(listUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': speechKey },
    });

    if (!listRes.ok) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { message: 'Transcript not found in container.' },
      };
    }

    const listData = await listRes.json();
    const jobs = listData.values || [];

    const matchedJob = jobs.find(
      (job: any) =>
        job.displayName?.includes(baseName) ||
        job.contentUrls?.some((url: string) => url.includes(baseName)),
    );

    if (!matchedJob) {
      return {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { message: 'Transcription job not found.' },
      };
    }

    if (matchedJob.status === 'Running' || matchedJob.status === 'NotStarted') {
      return {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { status: 'Running', message: 'Transcription in progress.' },
      };
    }

    if (matchedJob.status === 'Failed') {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: { error: 'Transcription job failed on Azure Speech.' },
      };
    }

    // If job succeeded but content was stored in internal Speech managed storage
    const filesUrl = matchedJob.links?.files;
    if (filesUrl) {
      const filesRes = await fetch(filesUrl, {
        headers: { 'Ocp-Apim-Subscription-Key': speechKey },
      });
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        const tFile = (filesData.values || []).find(
          (f: any) => f.kind === 'Transcription',
        );

        if (tFile?.links?.contentUrl) {
          const contentRes = await fetch(tFile.links.contentUrl);
          if (contentRes.ok) {
            const contentJson = await contentRes.json();
            const combinedText =
              contentJson.combinedRecognizedPhrases
                ?.map((p: any) => p.display)
                .join(' ') || '';

            return {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
              jsonBody: { text: combinedText },
            };
          }
        }
      }
    }

    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { message: 'Transcript not available yet.' },
    };
  } catch (err: unknown) {
    context.error('Error fetching transcript:', err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Internal server error while fetching transcript.' },
    };
  }
}

app.http('getTranscript', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'transcriptions/get',
  handler: getTranscript,
});
