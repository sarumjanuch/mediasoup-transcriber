Transcriber Server using Mediasoup SFU for WebRTC Communication
---

Simple Proof of Concept for creating a server accepting [WebRTC](https://webrtc.org) connections through a [mediasoup SFU](https://mediasoup.org/) and transcribe the audio using [Google Speech API](https://cloud.google.com/speech-to-text/docs).

## Prerequisites

### Google Speech API

You need to acquire a google credential file to use the API to transcribe 
speech to text: https://cloud.google.com/speech-to-text 
Once you had the credential file copy it to for example `./keys` folder 
and give a proper path in `docker-compose.yaml` for that.

## Quick Start

Start the server in docker

    docker-compose up

Building the image takes time (5-20mins). When the image is built go to `http://localhost:5959/rooms/yourRoom` in two different tabs. Mute yourself one and speak.
You should see the transcriptions in the tab and also should show who (which userId) 
did it.

## Run it locally 

Server uses Gstreamer to make a pipeline converting encoded audio to wav, hence 
you need to install gstreamer on your local machine with good, bad, and ugly plugins.
Once you have it, inside the server directory run `npm run dev`, which runs the 
server in developing mode.

Webpage uses a simple html5 page together with a stylesheet, and calls a bundled javascript contains all dependencies in one js file. To generate a new bundled index js you should run `browserify index.js -o ../server/src/bundled-index.js` inside webpage. 

## Contributions

Contributions are welcome. Here are some idea if you want to extend the functionalities:
 * Integrate any kind of speech to text API widely available (IBM watson, vosk, whatever...)
 * Better utilization of transcription in the front end (more fancy UI)
 * Add NLP module to respond voice commands
 * Make a separate react app for the client-side
 * Improve the underlying Gstreamer audio converter pipeline in the server in order to improve the overall transcription quality
 
## License

Apache-2.0
