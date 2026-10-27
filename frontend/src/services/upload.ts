const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

interface UploadRequestResponse {
  uploadUrl: string
  blobName: string
  containerName: string
}

export const uploadAudioFile = async (
  file: File,
  userId: string
) => {
  // 1. Request temporary write-only SAS URL from Function App
  const response = await fetch(`${API_BASE_URL}/upload-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, userId }),
  })

  if (!response.ok) {
    throw new Error(`Failed to get SAS token: ${response.statusText}`)
  }

  const { uploadUrl, blobName }: UploadRequestResponse = await response.json()

  // 2. Stream the binary file directly to Azure Blob Storage
  // The header 'x-ms-blob-type: BlockBlob' is strictly required by Azure Blob REST API
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "audio/wav",
    },
    body: file,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Blob upload failed: ${uploadResponse.statusText}`)
  }

  console.log("Audio successfully stored in Azure Blob Storage:", blobName)
  return { blobName }
}
