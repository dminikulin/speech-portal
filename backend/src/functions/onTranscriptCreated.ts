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

  // Extract <job-uuid> from ".../transcripts/<job-uuid>/contenturl_0.json"
  const urlParts = new URL(blobUrl);
  const pathSegments = urlParts.pathname.split('/');
  const transcriptsIdx = pathSegments.indexOf('transcripts');
  const jobUuid = pathSegments[transcriptsIdx + 1];

  if (!jobUuid) return;

  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    new StorageSharedKeyCredential(accountName, accountKey),
  );
  const containerClient = blobServiceClient.getContainerClient('audio-in');
  let matchedBlobPath: string | null = null;

  for await (const blob of containerClient.listBlobsFlat({
    includeMetadata: true,
  })) {
    if (blob.metadata?.transcriptionid === jobUuid) {
      matchedBlobPath = blob.name;
      break;
    }
  }

  if (!matchedBlobPath) {
    context.warn(`No audio-in blob found matching transcriptionid ${jobUuid}`);
    return;
  }

  const userId = matchedBlobPath.split('/')[0];
  const displayFileName =
    matchedBlobPath.split('/').pop()?.replace(/^\d+-/, '') || matchedBlobPath;

  const audioBlobClient = containerClient.getBlockBlobClient(matchedBlobPath);
  const props = await audioBlobClient.getProperties();
  await audioBlobClient.setMetadata({
    ...props.metadata,
    transcriptionstatus: 'Transcribed',
  });

  context.extraOutputs.set(signalROutput, [
    {
      userId,
      target: 'jobStatusUpdated',
      arguments: [
        {
          blobPath: matchedBlobPath,
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
