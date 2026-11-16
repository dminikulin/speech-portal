import {
  app,
  HttpRequest,
  HttpResponseInit,
  input,
  InvocationContext,
} from '@azure/functions';

const signalRInput = input.generic({
  type: 'signalRConnectionInfo',
  name: 'connectionInfo',
  hubName: 'speechportal',
  userId: '{headers.x-ms-signalr-userid}',
  connectionStringSetting: 'AzureSignalRConnectionString',
});

app.http('negotiate', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  extraInputs: [signalRInput],
  handler: async (
    request: HttpRequest,
    context: InvocationContext,
  ): Promise<HttpResponseInit> => {
    const connectionInfo = context.extraInputs.get(signalRInput);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: connectionInfo,
    };
  },
});
