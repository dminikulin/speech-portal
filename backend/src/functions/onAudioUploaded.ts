import { app, InvocationContext } from '@azure/functions';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  ContainerSASPermissions,
} from '@azure/storage-blob';

export async function onAudioUploaded(
  event: any,
  context: InvocationContext,
): Promise<void> {
  context.log('Event Grid received event:', JSON.stringify(event));

  // Event Grid envelope handling (handles single event or schema array)
  const eventData = event?.data || event;
  const blobUrl: string = eventData.url || '';

  // Only handle files uploaded into 'audio-in'
  if (!blobUrl.includes('/audio-in/')) {
    context.log('Skipping non-audio-in blob:', blobUrl);
    return;
  }

  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;
  const speechKey = process.env.SPEECH_KEY;
  const speechRegion = process.env.SPEECH_REGION;

  if (!accountName || !accountKey || !speechKey || !speechRegion) {
    context.error('Missing required service credentials in app settings.');
    return;
  }

  // Extract relative blobPath: e.g. "test-portal-dev/1793650878654-audio.mp3"
  const urlParts = new URL(blobUrl);
  const pathSegments = urlParts.pathname.split('/');
  const audioInIndex = pathSegments.indexOf('audio-in');
  const blobPath = pathSegments.slice(audioInIndex + 1).join('/');

  if (!blobPath) {
    context.error('Could not extract blob path from URL:', blobUrl);
    return;
  }

  // Derive user ID from the path prefix
  const userId = blobPath.split('/')[0];

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );

  // 1. Mark audio blob metadata as "transcribing"
  const audioBlobClient = blobServiceClient
    .getContainerClient('audio-in')
    .getBlockBlobClient(blobPath);

  try {
    const props = await audioBlobClient.getProperties();
    await audioBlobClient.setMetadata({
      ...props.metadata,
      transcriptionstatus: 'Transcribing',
    });
  } catch (err) {
    context.warn('Could not set initial metadata:', err);
  }

  // 2. Generate audio read SAS and destination container write SAS
  const expiresOn = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const audioSas = generateBlobSASQueryParameters(
    {
      containerName: 'audio-in',
      blobName: blobPath,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    credential,
  ).toString();

  const sourceAudioUrl = `https://${accountName}.blob.core.windows.net/audio-in/${blobPath}?${audioSas}`;

  const destSas = generateBlobSASQueryParameters(
    {
      containerName: 'transcripts',
      permissions: ContainerSASPermissions.parse('rwlac'),
      expiresOn,
    },
    credential,
  ).toString();

  const destinationContainerUrl = `https://${accountName}.blob.core.windows.net/transcripts?${destSas}`;

  // 3. Submit transcription job to Azure Speech API
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
        candidateLocales: ['en-US', 'lt-LT'],
      },
    },
  };

  const speechEndpoint = `https://${speechRegion}.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions`;
  const response = await fetch(speechEndpoint, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': speechKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(transcriptionPayload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    context.error('Azure Speech submission failed:', errorData);

    const props = await audioBlobClient.getProperties();
    await audioBlobClient.setMetadata({
      ...props.metadata,
      transcriptionstatus: 'Failed',
    });
    return;
  }

  const speechResult = await response.json();
  // speechResult.self looks like:
  // "https://swedencentral.api.cognitive.microsoft.com/speechtotext/v3.2/transcriptions/<job-uuid>"
  const transcriptionId = speechResult.self?.split('/').pop() || '';

  const props = await audioBlobClient.getProperties();
  await audioBlobClient.setMetadata({
    ...props.metadata,
    transcriptionstatus: 'Transcribing',
    transcriptionid: transcriptionId,
  });

  context.log(`Job successfully dispatched for ${blobPath}`);
}

// Bind to Event Grid
app.eventGrid('onAudioUploaded', {
  handler: onAudioUploaded,
});
