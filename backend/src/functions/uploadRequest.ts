import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions"
import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
  StorageSharedKeyCredential,
} from "@azure/storage-blob"

app.http("uploadRequest", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "upload-request",
  handler: async (
    request: HttpRequest,
    context: InvocationContext
  ): Promise<HttpResponseInit> => {
    const body = (await request.json()) as {
      fileName?: string
      userId?: string
    }
    const { fileName, userId } = body || {}

    if (!fileName || !userId) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        jsonBody: { error: "Both fileName and userId are required." },
      }
    }

    const accountName =
      process.env["STORAGE_ACCOUNT_NAME"] || "speechportalstorage"
    const accountKey = process.env["STORAGE_ACCOUNT_KEY"]
    const containerName = "audio-in"
    const sanitizedUserId = userId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
    const blobName = `${sanitizedUserId}/${Date.now()}-${fileName}`

    if (!accountKey) {
      return {
        status: 500,
        jsonBody: { error: "Storage credentials missing on server." },
      }
    }

    const sharedKeyCredential = new StorageSharedKeyCredential(
      accountName,
      accountKey
    )
    const expiresOn = new Date(Date.now() + 15 * 60 * 1000) // 15-minute window

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse("cw"), // create + write
        startsOn: new Date(),
        expiresOn,
      },
      sharedKeyCredential
    ).toString()

    const uploadUrl = `https://${accountName}.blob.core.windows.net/${containerName}/${blobName}?${sasToken}`

    return {
      status: 200,
      jsonBody: {
        uploadUrl,
        blobName,
        containerName,
      },
    }
  },
})
