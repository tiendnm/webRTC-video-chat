import { useCallback, useRef, useState } from "react";

const useScreenRecord = () => {
  const recordRef = useRef<MediaRecorder>();
  const streamRef = useRef<MediaStream>();
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const saveFile = useCallback((recordedChunks: Blob[]) => {
    const blob = new Blob(recordedChunks, {
      type: "video/webm",
    });
    const url = URL.createObjectURL(blob);
    let filename = `RECORDING_${new Date().getTime()}`,
      downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `${filename}.webm`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    URL.revokeObjectURL(url); // clear from memory
    document.body.removeChild(downloadLink);
  }, []);

  const createRecorder = useCallback(
    (stream: MediaStream) => {
      // the stream data is stored in this array
      let recordedChunks: Blob[] = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };
      mediaRecorder.onstop = function () {
        saveFile(recordedChunks);
        recordedChunks = [];
      };
      mediaRecorder.start(200); // For every 200ms the stream data will be stored in a separate chunk.
      return mediaRecorder;
    },
    [saveFile]
  );
  const recordScreen = useCallback(async () => {
    setIsRecording(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
        },
        audio: true,
      });
      streamRef.current = stream;
      recordRef.current = createRecorder(stream);
    } catch (err) {
      setIsRecording(false);
      console.error(`Error: ${err}`);
    }
  }, [createRecorder]);
  const stopRecordingScreen = useCallback(() => {
    recordRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setIsRecording(false);
  }, []);
  return {
    isRecording,
    recordScreen,
    stopRecordingScreen,
  };
};

export default useScreenRecord;
