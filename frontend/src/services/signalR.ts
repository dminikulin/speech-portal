import * as signalR from "@microsoft/signalr"

const RAW_BASE_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net"

const cleanHost = RAW_BASE_URL.replace(/\/api\/?$/, "").replace(/\/+$/, "")

export const getSignalRConnection = async (
  userId: string
): Promise<signalR.HubConnection> => {
  const sanitizedUserId = userId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${cleanHost}/api`, {
      headers: { "x-ms-signalr-userid": sanitizedUserId },
    })
    .withAutomaticReconnect()
    .build()

  await connection.start()
  return connection
}
