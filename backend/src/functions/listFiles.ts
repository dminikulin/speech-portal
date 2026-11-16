import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobSASPermissions,
} from '@azure/storage-blob';
import { streamToText } from '../utils/streamToText';

export async function listFiles(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;
  const containerName = 'audio-in';
  const transcriptContainerName = 'transcripts';

  if (!accountName || !accountKey) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Storage credentials not configured' },
    };
  }

  const userId = request.query.get('userId');
  if (!userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Missing required query parameter: userId' },
    };
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const transcriptContainerClient = blobServiceClient.getContainerClient(
    transcriptContainerName,
  );

  // Scan all transcript JSONs once and collect the sources they transcribed
  const transcribedSources: string[] = [];
  try {
    for await (const tBlob of transcriptContainerClient.listBlobsFlat()) {
      if (tBlob.name.endsWith('.json') && !tBlob.name.endsWith('report.json')) {
        const client = transcriptContainerClient.getBlobClient(tBlob.name);
        const download = await client.download();
        const content = await streamToText(download.readableStreamBody);
        try {
          const parsed = JSON.parse(content);
          const src = parsed.source || parsed.properties?.contentUrl || '';
          if (src) transcribedSources.push(src);
        } catch {}
      }
    }
  } catch {
    // If transcripts container empty or missing
  }

  const speechKey = process.env.SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION;
  const succeededJobDisplayNames: string[] = [];

  if (speechKey && speechRegion) {
    try {
      const speechRes = await fetch(
        `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions?top=50`,
        { headers: { 'Ocp-Apim-Subscription-Key': speechKey } },
      );
      if (speechRes.ok) {
        const speechData = await speechRes.json();
        for (const job of speechData.values || []) {
          if (job.status === 'Succeeded') {
            succeededJobDisplayNames.push(job.displayName || '');
          }
        }
      }
    } catch {}
  }

  const files = [];
  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  const userPrefix = `${sanitizedUserId}/`;
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000);

  for await (const blob of containerClient.listBlobsFlat({
    prefix: userPrefix,
    includeMetadata: true,
  })) {
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: blob.name,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn,
      },
      credential,
    ).toString();

    const cleanFileName = blob.name
      .replace(userPrefix, '')
      .replace(/^\d+-/, '');
    const rawFileName = blob.name.split('/').pop() || '';
    const baseName = rawFileName.replace(/\.[^/.]+$/, '');

    // Check if any transcript JSON recorded this file's unique baseName
    const hasContainerTranscript = transcribedSources.some(
      (src) =>
        src.includes(baseName) || src.includes(encodeURIComponent(baseName)),
    );

    const hasSpeechJob = succeededJobDisplayNames.some((name) =>
      name.includes(baseName),
    );

    const hasTranscript = hasContainerTranscript || hasSpeechJob;

    const transcriptionStatus = (
      blob.metadata?.transcriptionstatus || ''
    ).toLowerCase();
    const status = hasTranscript
      ? 'Transcribed'
      : transcriptionStatus === 'transcribing'
        ? 'Transcribing'
        : transcriptionStatus === 'failed'
          ? 'Failed'
          : undefined;

    files.push({
      name: cleanFileName,
      blobPath: blob.name,
      size: blob.properties.contentLength,
      createdOn: blob.properties.createdOn,
      ...(status ? { status } : {}),
      url: `https://${accountName}.blob.core.windows.net/${containerName}/${blob.name}?${sasToken}`,
    });
  }

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: { files },
  };
}

app.http('listFiles', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files',
  handler: listFiles,
});
