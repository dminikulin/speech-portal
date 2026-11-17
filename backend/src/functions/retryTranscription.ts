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
import { cleanupTranscriptArtifacts } from '../utils/cleanupTranscripts';

export async function retryTranscription(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    blobPath?: string;
  };
  const rawBlobPath = body.blobPath || request.query.get('blobPath');
  const rawUserId = body.userId || request.query.get('userId');

  if (!rawUserId || !rawBlobPath) {
    return { status: 400, jsonBody: { error: 'Missing userId or blobPath' } };
  }

  const sanitizedUserId = rawUserId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');

  // Ensure blobPath uses the sanitized userId folder prefix
  const blobPath = rawBlobPath.includes('/')
    ? rawBlobPath
    : `${sanitizedUserId}/${rawBlobPath}`;

  if (!blobPath.startsWith(`${sanitizedUserId}/`)) {
    return {
      status: 403,
      jsonBody: { error: 'Unauthorized access to this file' },
    };
  }

  const accountName = process.env.STORAGE_ACCOUNT_NAME!;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY!;
  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );

  const blobClient = blobServiceClient
    .getContainerClient('audio-in')
    .getBlockBlobClient(blobPath);

  if (!(await blobClient.exists())) {
    return { status: 404, jsonBody: { error: 'Audio blob not found' } };
  }

  const props = await blobClient.getProperties();
  await cleanupTranscriptArtifacts(
    blobServiceClient,
    blobPath,
    props.metadata?.transcriptionid,
  );

  // Self-copy fires a fresh Microsoft.Storage.BlobCreated event for Event Grid
  const downloadResponse = await blobClient.downloadToBuffer();
  await blobClient.uploadData(downloadResponse, {
    blobHTTPHeaders: {
      blobContentType: props.contentType || 'audio/mpeg',
    },
    metadata: {
      ...props.metadata,
      transcriptionstatus: 'Transcribing',
      transcriptionid: '',
    },
  });

  context.log(`Re-uploaded ${blobPath} to trigger Event Grid BlobCreated`);
  return { status: 202, jsonBody: { status: 'Transcribing', blobPath } };
}

app.http('retryTranscription', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/retry',
  handler: retryTranscription,
});
