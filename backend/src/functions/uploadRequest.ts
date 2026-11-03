import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import {
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobSASPermissions,
} from '@azure/storage-blob';

export async function uploadRequest(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const accountName = process.env.STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.STORAGE_ACCOUNT_KEY;
  const containerName = 'audio-in';

  if (!accountName || !accountKey) {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Storage configuration missing' },
    };
  }

  let body: { fileName?: string; userId?: string } = {};
  try {
    body = (await request.json()) as { fileName?: string; userId?: string };
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Invalid JSON body' },
    };
  }

  const { fileName, userId } = body;
  if (!fileName || !userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Both fileName and userId are required.' },
    };
  }

  // Safe ASCII sanitization for blob prefix and filename
  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobName = `${sanitizedUserId}/${Date.now()}-${sanitizedFileName}`;

  const credential = new StorageSharedKeyCredential(accountName, accountKey);

  // Set startsOn back 15 minutes to eliminate client-server clock drift issues
  const startsOn = new Date(Date.now() - 15 * 60 * 1000);
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('cw'), // Create and Write permissions
      startsOn,
      expiresOn,
    },
    credential,
  ).toString();

  const uploadUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`;

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: {
      uploadUrl,
      blobPath: blobName,
    },
  };
}

app.http('uploadRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files/upload-request',
  handler: uploadRequest,
});
