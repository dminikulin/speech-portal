# Speech portal (powered by Azure)

**Speech portal** is a Storage-as-a-service platform powered by Azure, it holds audio files and their transcripts in your personal cloud storage.

How it works:

1. Log in or sign up into the portal.
2. Upload the audio file by pressing "Add new transcript" (`.wav` and `.mp3` files are supported)
3. The transcription job for the file will be started automatically. You can view the file and its transcription status in the file list.
4. After the transcription job finishes, you'll get a browser notification and you can view the transcript by clicking on the file.
5. When viewing the transcript, you can export it as `.txt`, `.md` or `.pdf` file or redo transcription if the result doesn't satisfy you.

**NOTE**: This project is a proof-of-concept and mostly relies on free Azure services, so the transcription results might not be ideal or on the level of production.

**What is managed by Azure?**

- Login and signup;
- File upload and deletion;
- File transcriptions;
- Transcription status;

**What is NOT managed by Azure?**

- Browser notifications;
- Transcript exports;

You can access the projects via these two links:

- [Azure deployment](https://polite-stone-05a4dec0f.4.azurestaticapps.net/)

---

### For developers

If you decide to use this project in your playground, here are a few things you should know.

**Backend directory**

In `backend` directory, Azure functions are written to be later deployed to the function app. To tie this project to your Azure cloud, you need to create `local.settings.json` file with the following structure:

```
"IsEncrypted": false
"Values": {
	"AzureWebJobsStorage": "",
	"FUNCTIONS_WORKER_RUNTIME": "",
	"AzureSignalRConnectionString": "",
	"STORAGE_ACCOUNT_NAME": "",
	"STORAGE_ACCOUNT_KEY": "",
	"SpeechKey": "",
	"CosmosDbConnectionString": ""
}
```

To deploy the app, run the following commands:

```
rm -rf dist
npm run build
func azure functionapp publish [your-function-app-name]
```

**Frontend directory**

In `frontend` directory, you need to set up `VITE_API_URL` for both development and production. `.env.example` shows how to write to this variable.
