import { app, InvocationContext, output } from '@azure/functions';
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

const signalROutput = output.generic({
  type: 'signalR',
  name: 'signalRMessages',
  hubName: 'speechportal',
  connectionStringSetting: 'AzureSignalRConnectionString',
});

export async function onTranscriptCreated(
  event: any,
  context: InvocationContext,
): Promise<void> {
  const eventData = event?.data || event;
  const blobUrl: string = eventData.url || '';

  // Azure Speech writes multiple files (e.g., report.json and contenturl_0.json).
  // Only react to the actual transcript output file, ignoring report.json.
  if (!blobUrl.includes('/transcripts/') || blobUrl.endsWith('report.json')) {
    return;
  }

  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;
  if (!accountName || !accountKey) {
    context.error('Missing storage credentials.');
    return;
  }

  // Extract path inside 'transcripts': e.g. "<userId>/<timestamp>-audio.mp3/contenturl_0.json"
  const urlParts = new URL(blobUrl);
  const pathSegments = urlParts.pathname.split('/');
  const transcriptsIdx = pathSegments.indexOf('transcripts');
  const relativeSegments = pathSegments.slice(transcriptsIdx + 1);

  if (relativeSegments.length < 2) return;

  const userId = relativeSegments[0];
  const audioFileName = relativeSegments[1];
  const audioBlobPath = `${userId}/${audioFileName}`;

  // 1. Update the source audio blob's metadata status to "Transcribed"
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );

  const audioBlobClient = blobServiceClient
    .getContainerClient('audio-in')
    .getBlockBlobClient(audioBlobPath);

  try {
    const props = await audioBlobClient.getProperties();
    await audioBlobClient.setMetadata({
      ...props.metadata,
      transcriptionstatus: 'Transcribed',
    });
  } catch (err) {
    context.warn(`Could not update metadata for ${audioBlobPath}:`, err);
  }

  // 2. Push real-time message to the specific user via Azure SignalR
  const displayFileName = audioFileName.replace(/^\d+-/, '');
  context.extraOutputs.set(signalROutput, [
    {
      userId,
      target: 'jobStatusUpdated',
      arguments: [
        {
          blobPath: audioBlobPath,
          fileName: displayFileName,
          status: 'Transcribed',
        },
      ],
    },
  ]);

  context.log(
    `Pushed SignalR jobStatusUpdated to user ${userId} for ${displayFileName}`,
  );
}

app.eventGrid('onTranscriptCreated', {
  extraOutputs: [signalROutput],
  handler: onTranscriptCreated,
});
