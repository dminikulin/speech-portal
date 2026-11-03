import * as signalR from "@microsoft/signalr"

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "https://speechportal-func-app.azurewebsites.net/api"

let connection: signalR.HubConnection | null = null

export const getSignalRConnection = async (
  userId: string
): Promise<signalR.HubConnection> => {
  if (connection && connection.state === signalR.HubConnectionState.Connected) {
    return connection
  }

  connection = new signalR.HubConnectionBuilder()
    .withUrl(API_BASE_URL, {
      headers: { "x-user-id": userId },
    })
    .withAutomaticReconnect()
    .configureLogging(signalR.LogLevel.Warning)
    .build()

  await connection.start()
  return connection
}
