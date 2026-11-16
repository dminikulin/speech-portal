import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';

export async function retryTranscription(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    blobPath?: string;
  };
  const userId = body.userId || request.query.get('userId');
  const blobPath = body.blobPath || request.query.get('blobPath');

  if (!userId || !blobPath || !blobPath.startsWith(`${userId}/`)) {
    return { status: 400, jsonBody: { error: 'Invalid userId or blobPath' } };
  }

  const accountName = process.env.STORAGE_ACCOUNT_NAME!;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY!;
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  );

  const blobClient = blobServiceClient
    .getContainerClient('audio-in')
    .getBlockBlobClient(blobPath);

  if (!(await blobClient.exists())) {
    return { status: 404, jsonBody: { error: 'Audio blob not found' } };
  }

  // Self-copy fires a fresh Microsoft.Storage.BlobCreated event for Event Grid
  const poller = await blobClient.beginCopyFromURL(blobClient.url, {
    metadata: { transcriptionstatus: 'Transcribing' },
  });
  await poller.pollUntilDone();

  context.log(`Re-triggered Event Grid BlobCreated via self-copy for ${blobPath}`);
  return { status: 202, jsonBody: { status: 'Transcribing', blobPath } };
}

app.http('retryTranscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/retry',
  handler: retryTranscription,
});