const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

export const uploadAudioFile = async (
  file: File,
  userId: string
): Promise<string> => {
  // 1. Request temporary write-only SAS URL from Function App
  const requestRes = await fetch(`${API_BASE_URL}/files/upload-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, userId }),
  })

  if (!requestRes.ok) {
    const err = await requestRes.json().catch(() => ({}))
    throw new Error(err.error || "Failed to generate upload URL")
  }

  const { uploadUrl, blobPath } = await requestRes.json()

  // 2. Stream the binary file directly to Azure Blob Storage
  // The header 'x-ms-blob-type: BlockBlob' is strictly required by Azure Blob REST API
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type || "audio/octet-stream",
    },
    body: file,
  })

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text()
    console.error("Azure Storage PUT error:", errorText)
    throw new Error(`Blob upload failed: ${uploadResponse.statusText}`)
  }

  return blobPath
}
