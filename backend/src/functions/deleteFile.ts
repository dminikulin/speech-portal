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

export async function deleteFile(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;

  if (!accountName || !accountKey) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Storage configuration missing' },
    };
  }

  // 1. Try URL query parameters first
  let userId = request.query.get('userId') || request.query.get('userid');
  let blobPath = request.query.get('blobPath') || request.query.get('blobpath');

  // 2. Fall back to JSON request body if not in query parameters
  if (!userId || !blobPath) {
    try {
      const body = (await request.json()) as {
        userId?: string;
        userid?: string;
        blobPath?: string;
        blobpath?: string;
      };
      userId = userId || body.userId || body.userid;
      blobPath = blobPath || body.blobPath || body.blobpath;
    } catch {
      // Body was empty or not JSON
    }
  }

  if (!userId || !blobPath) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Missing required parameters: userId and blobPath' },
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
      jsonBody: { error: 'Unauthorized access to this file' },
    };
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey);
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential,
  );

  const audioContainer = blobServiceClient.getContainerClient('audio-in');
  try {
    const audioBlob = audioContainer.getBlockBlobClient(normalizedBlobPath);
    let transcriptionId: string | undefined;

    // 1. Read transcriptionid metadata BEFORE deleting the audio blob
    if (await audioBlob.exists()) {
      const props = await audioBlob.getProperties();
      transcriptionId = props.metadata?.transcriptionid;
    }

    // 2. Delete all associated transcript JSONs, UUID folders, and Speech job
    await cleanupTranscriptArtifacts(
      blobServiceClient,
      normalizedBlobPath,
      transcriptionId,
    );

    // 3. Delete the audio file itself
    await audioBlob.deleteIfExists();

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        message: 'Audio file and associated transcripts deleted successfully.',
      },
    };
  } catch (err: unknown) {
    context.error('Failed to cascade delete audio and transcripts:', err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Failed to delete file and transcripts.' },
    };
  }
}

app.http('deleteFile', {
  methods: ['DELETE', 'POST'],
  authLevel: 'anonymous',
  route: 'files/delete',
  handler: deleteFile,
});
