import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions"
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
  BlobSASPermissions,
} from "@azure/storage-blob"

export async function listFiles(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const accountName = process.env.STORAGE_ACCOUNT_NAME
  const accountKey = process.env.STORAGE_ACCOUNT_KEY
  const containerName = "audio-in"

  if (!accountName || !accountKey) {
    return {
      status: 500,
      headers: { "Content-Type": "application/json" },
      jsonBody: { error: "Storage credentials not configured" },
    }
  }

  const userId = request.query.get("userId")
  if (!userId) {
    return {
      status: 400,
      headers: { "Content-Type": "application/json" },
      jsonBody: { error: "Missing required query parameter: userId" },
    }
  }

  const credential = new StorageSharedKeyCredential(accountName, accountKey)
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    credential
  )

  const containerClient = blobServiceClient.getContainerClient(containerName)
  const files = []

  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
  const userPrefix = `${sanitizedUserId}/`
  const expiresOn = new Date(Date.now() + 60 * 60 * 1000)

  for await (const blob of containerClient.listBlobsFlat({
    prefix: userPrefix,
  })) {
    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: blob.name,
        permissions: BlobSASPermissions.parse("r"),
        expiresOn,
      },
      credential
    ).toString()

    const cleanFileName = blob.name.replace(userPrefix, "").replace(/^\d+-/, "")

    files.push({
      name: cleanFileName,
      blobPath: blob.name,
      size: blob.properties.contentLength,
      createdOn: blob.properties.createdOn,
      url: `https://${accountName}.blob.core.windows.net/${containerName}/${blob.name}?${sasToken}`,
    })
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    jsonBody: { files },
  }
}

app.http("listFiles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "files",
  handler: listFiles,
})
