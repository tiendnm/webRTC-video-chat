import * as signalR from "@microsoft/signalr";
import clsx from "clsx";
import Peer, { MediaConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import loading from "../assets/loading.gif";
//
const myPeer = new Peer();
const connection = new signalR.HubConnectionBuilder()
  .configureLogging(signalR.LogLevel.None)
  .withUrl("https://test-api.tiendnm.com/meeting")
  .build();
//
type Devices = {
  deviceName: string;
  deviceId: string;
};
//

const constraints: MediaStreamConstraints = {
  video: true,
};
const mapDevice = (device: MediaDeviceInfo) => {
  return {
    deviceName: device.label,
    deviceId: device.deviceId,
  };
};
function VideoChat() {
  const videoGridRef = useRef<HTMLDivElement>(null);
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<MediaConnection>();
  const localStream = useRef<MediaStream>();
  const myIdRef = useRef<string>("");
  const userIdRef = useRef<string>("");
  const [videoDevices, setVideoDevices] = useState<Devices[]>([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>();
  const [audioDevices, setAudioDevices] = useState<Devices[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>();
  const [status, setStatus] = useState<
    "waiting" | "connected" | "disconnected"
  >("waiting");

  const record = useRef<MediaRecorder>();
  useEffect(() => {
    //====
    myPeer.on("open", (userId) => {
      myIdRef.current = userId;
      const startSignalR = async () => {
        // set waiting status
        setStatus("waiting");
        // full room alert
        connection.on("full-room", (id) => {
          if (id === userId) alert("Phòng đã đầy, mời đi cho");
        });

        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoDevices = devices
            .filter((device) => device.kind === "videoinput")
            .map(mapDevice);
          const audioDevices = devices
            .filter((device) => device.kind === "audioinput")
            .map(mapDevice);

          setVideoDevices(videoDevices);
          setSelectedVideoDevice(videoDevices[0]?.deviceId);
          // setAudioDevices(audioDevices);
          // setSelectedAudioDevice(audioDevices[0]?.deviceId);
        });
        // get user webcam and audio
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStream.current = stream;
        // connect to signalR
        await connection.start();

        // join chat room
        await connection.invoke("JoinRoom", "123456", userId);

        // add my video stream
        addVideoSteam(localStream.current, myVideoRef.current);

        // on new user connected to signalR
        connection.on("user-connected", (id) => {
          if (userId === id || !localStream.current) return;
          connectNewUser(id, localStream.current);
          userIdRef.current = id;
          setStatus("connected");
        });

        // on user disconnected from signalR
        connection.on("user-disconnected", () => {
          if (peersRef.current) {
            peersRef.current.close();
            userIdRef.current = "";
            // set disconnected status
            setStatus("disconnected");
          }
        });

        // on received call
        myPeer.on("call", (call) => {
          call.answer(localStream.current);
          setStatus("connected");
          streamCall(call, userVideoRef.current);
          peersRef.current = call;
        });
      };
      startSignalR();
    });

    const addVideoSteam = (
      stream: MediaStream,
      video: HTMLVideoElement | null
    ) => {
      if (video) {
        video.srcObject = stream;
        video.addEventListener("loadedmetadata", () => {
          video.play();
        });
        if (myVideoRef.current === video) return;
        videoGridRef.current?.append(video);
      }
    };

    const connectNewUser = (userId: string, stream: MediaStream) => {
      const call = myPeer.call(userId, stream);
      const video = userVideoRef.current;
      streamCall(call, video);
      peersRef.current = call;
    };

    const streamCall = (
      call: MediaConnection,
      video: HTMLVideoElement | null
    ) => {
      call.on("stream", (userVideoStream) => {
        addVideoSteam(userVideoStream, video);
      });
      call.on("close", () => {
        video?.remove();
      });
    };

    return () => {
      myPeer.disconnect();
      connection.stop();
    };
  }, []);

  const changeAudioInputByDeviceId = useCallback(async (deviceId: string) => {
    constraints.audio = {
      deviceId,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const sender = peersRef.current?.peerConnection
      .getSenders()
      .find((sender) => sender.track?.kind === "audio");
    const audioTrack = stream.getAudioTracks()[0];
    if (sender && audioTrack) {
      sender.replaceTrack(audioTrack);
    }
  }, []);
  const changeVideoInputByDeviceId = useCallback(async (deviceId: string) => {
    try {
      constraints.video = {
        deviceId,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = myVideoRef.current;
      // stop current video
      if (localStream.current) {
        localStream.current.getTracks().forEach(function (track) {
          track.stop();
        });
      }
      // replace video track
      const sender = peersRef.current?.peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === "video");
      const videoTrack = stream.getVideoTracks()[0];
      if (sender && videoTrack) {
        sender.replaceTrack(videoTrack);
      }
      // replace local video stream
      if (video) {
        localStream.current = stream;
        video.srcObject = localStream.current;
        video.addEventListener("loadedmetadata", () => {
          video.play();
        });
      }
    } catch (error) {
      console.error(error);
    }
  }, []);
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
    const displayMediaOptions: DisplayMediaStreamOptions = {
      video: {
        displaySurface: "browser",
      },
      audio: true,
    };
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia(
        displayMediaOptions
      );
      record.current = createRecorder(stream);
    } catch (err) {
      console.error(`Error: ${err}`);
    }
  }, [createRecorder]);

  const stopRecordingScreen = useCallback(() => {
    record.current?.stop();
  }, []);
  return (
    <>
      <div ref={videoGridRef} className="video-container">
        <video
          ref={userVideoRef}
          className={clsx(
            "user-video",
            status === "connected" ? "block" : "hidden"
          )}
        />
        <div
          className={clsx(
            "bg-gray-500 animate-pulse duration-75 aspect-video top-0 left-0 absolute h-screen w-screen",
            status === "connected"
              ? "hidden"
              : "flex items-center justify-center"
          )}
        >
          <img src={loading} />
        </div>
        <video ref={myVideoRef} className="my-video" muted />
        <div className="absolute bottom-10 flex gap-2 z-20">
          <select
            value={selectedVideoDevice}
            onChange={(e) => {
              setSelectedVideoDevice(e.target.value);
              changeVideoInputByDeviceId(e.target.value);
            }}
          >
            {videoDevices.map((device) => {
              return (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.deviceName}
                </option>
              );
            })}
          </select>
          <select
            value={selectedAudioDevice}
            onChange={(e) => {
              setSelectedAudioDevice(e.target.value);
              changeAudioInputByDeviceId(e.target.value);
            }}
          >
            {audioDevices.map((device) => {
              return (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.deviceName}
                </option>
              );
            })}
          </select>
          <button
            className="bg-white text-black p-2"
            onClick={() => {
              recordScreen();
            }}
          >
            Record
          </button>
          <button
            className="bg-white text-black p-2"
            onClick={() => {
              stopRecordingScreen();
            }}
          >
            Stop Recording
          </button>
        </div>
      </div>
    </>
  );
}

export default VideoChat;
