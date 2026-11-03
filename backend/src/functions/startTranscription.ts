import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  BlobServiceClient,
  BlobSASPermissions,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { streamToText } from '../utils/streamToText';

export async function startTranscription(
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
      jsonBody: { error: 'Speech or Storage service configurations missing.' },
    };
  }

  let body: { blobPath?: string; userId?: string } = {};
  try {
    body = (await request.json()) as { blobPath?: string; userId?: string };
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Invalid JSON request body.' },
    };
  }

  const { blobPath, userId } = body;
  if (!blobPath || !userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Both blobPath and userId are required.' },
    };
  }

  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  if (!blobPath.startsWith(`${sanitizedUserId}/`)) {
    return {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Unauthorized access to this audio file.' },
    };
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const audioContainer = 'audio-in';
  const destinationContainer = 'transcripts';
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );
  const audioBlobClient = blobServiceClient
    .getContainerClient(audioContainer)
    .getBlockBlobClient(blobPath);

  try {
    const properties = await audioBlobClient.getProperties();
    await audioBlobClient.setMetadata({
      ...properties.metadata,
      transcriptionstatus: 'transcribing',
    });
  } catch (err: unknown) {
    context.error('Failed to mark audio file as transcribing:', err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        error: 'Failed to prepare the audio file for transcription.',
      },
    };
  }

  const expiresOn = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const audioSas = generateBlobSASQueryParameters(
    {
      containerName: audioContainer,
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential,
  ).toString();

  const sourceAudioUrl = `https://${accountName}.blob.core.windows.net/${audioContainer}/${blobPath}?${audioSas}`;

  const destSas = generateBlobSASQueryParameters(
    {
      containerName: destinationContainer,
      permissions: ContainerSASPermissions.parse('rwlac'), // read, write, list, add, create
      expiresOn,
    },
    credential,
  ).toString();

  const destinationContainerUrl = `https://${accountName}.blob.core.windows.net/${destinationContainer}?${destSas}`;

  const destContainerClient =
    blobServiceClient.getContainerClient(destinationContainer);
  const rawFileName = blobPath.split('/').pop() || '';
  const baseName = rawFileName.replace(/\.[^/.]+$/, '');

  try {
    for await (const blob of destContainerClient.listBlobsFlat()) {
      if (blob.name.endsWith('.json')) {
        const tClient = destContainerClient.getBlobClient(blob.name);
        try {
          const download = await tClient.download();
          const content = await streamToText(download.readableStreamBody);
          const parsed = JSON.parse(content);
          const sourceUrl =
            parsed.source || parsed.properties?.contentUrl || '';

          if (sourceUrl.includes(baseName) || blob.name.includes(baseName)) {
            await tClient.deleteIfExists();
            const folderPrefix = blob.name.substring(
              0,
              blob.name.lastIndexOf('/') + 1,
            );
            if (folderPrefix) {
              await destContainerClient
                .getBlobClient(`${folderPrefix}report.json`)
                .deleteIfExists();
            }
          }
        } catch {
          // Skip unparseable JSON files
        }
      }
    }
  } catch (cleanupErr) {
    context.warn(
      'Non-blocking warning: failed pre-cleanup of older transcripts:',
      cleanupErr,
    );
  }

  const transcriptionPayload = {
    contentUrls: [sourceAudioUrl],
    displayName: `Transcription-${Date.now()}-${blobPath}`,
    description: `User: ${userId}`,
    locale: 'en-US',
    properties: {
      destinationContainerUrl,
      wordLevelTimestampsEnabled: true,
      displayFormWordLevelTimestampsEnabled: true,
      diarizationEnabled: false,
      punctuationMode: 'DictatedAndAutomatic',
      profanityFilterMode: 'None',
      languageIdentification: {
        candidateLocales: ['en-US', 'en-GB', 'lt-LT'],
      },
    },
  };

  try {
    const speechEndpoint = `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions`;
    const response = await fetch(speechEndpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptionPayload),
    });

    const responseData = await response.json();
    if (!response.ok) {
      context.error('Azure Speech error:', responseData);
      try {
        const properties = await audioBlobClient.getProperties();
        await audioBlobClient.setMetadata({
          ...properties.metadata,
          transcriptionstatus: 'failed',
        });
      } catch (err: unknown) {
        context.error('Failed to mark transcription as failed:', err);
      }
      return {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: {
          error: responseData.message || 'Failed to submit transcription job',
        },
      };
    }

    // responseData.self is the URL to poll status (or use webhooks)
    return {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        message: 'Transcription job submitted successfully',
        jobUrl: responseData.self,
        status: responseData.status,
      },
    };
  } catch (err: unknown) {
    context.error('Failed to post transcription job:', err);
    try {
      const properties = await audioBlobClient.getProperties();
      await audioBlobClient.setMetadata({
        ...properties.metadata,
        transcriptionstatus: 'failed',
      });
    } catch (metadataError: unknown) {
      context.error('Failed to mark transcription as failed:', metadataError);
    }
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Failed to communicate with Speech Service.' },
    };
  }
}

app.http('startTranscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'transcriptions/start',
  handler: startTranscription,
});
