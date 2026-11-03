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
  if (!blobPath.startsWith(`${sanitizedUserId}/`)) {
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
  const transcriptContainer =
    blobServiceClient.getContainerClient('transcripts');

  const rawFileName = blobPath.split('/').pop() || '';
  const baseName = rawFileName.replace(/\.[^/.]+$/, '');

  try {
    // 1. Delete the audio file from audio-in
    const audioBlob = audioContainer.getBlockBlobClient(blobPath);
    await audioBlob.deleteIfExists();

    // 2. Scan and find matching transcript artifacts
    const foldersToDelete = new Set<string>();

    for await (const blob of transcriptContainer.listBlobsFlat()) {
      if (blob.name.endsWith('.json')) {
        const tClient = transcriptContainer.getBlobClient(blob.name);
        try {
          const download = await tClient.download();
          const content = await streamToText(download.readableStreamBody);
          const parsed = JSON.parse(content);
          const sourceUrl =
            parsed.source || parsed.properties?.contentUrl || '';

          if (
            sourceUrl.includes(baseName) ||
            sourceUrl.includes(encodeURIComponent(baseName)) ||
            blob.name.includes(baseName)
          ) {
            const slashIndex = blob.name.lastIndexOf('/');
            if (slashIndex !== -1) {
              foldersToDelete.add(blob.name.substring(0, slashIndex + 1));
            } else {
              await tClient.deleteIfExists();
            }
          }
        } catch {
          // Skip unparseable JSON files
        }
      }
    }

    // 3. Delete entire GUID folder(s) containing contenturl_0.json and report.json
    for (const prefix of foldersToDelete) {
      for await (const fileInFolder of transcriptContainer.listBlobsFlat({
        prefix,
      })) {
        await transcriptContainer
          .getBlobClient(fileInFolder.name)
          .deleteIfExists();
      }
    }

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
