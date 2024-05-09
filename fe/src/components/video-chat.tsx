import * as signalR from "@microsoft/signalr";
import clsx from "clsx";
import Peer, { MediaConnection } from "peerjs";
import { useCallback, useEffect, useRef, useState } from "react";
import loading from "../assets/loading.gif";
import useMediaDevices from "../hooks/use-media-devices";
import useScreenRecord from "../hooks/use-screen-record";
//
const myPeer = new Peer();
const connection = new signalR.HubConnectionBuilder()
  .configureLogging(signalR.LogLevel.None)
  .withUrl("https://test-api.tiendnm.com/meeting")
  .build();
//
const constraints: MediaStreamConstraints = {
  video: true,
};

function VideoChat() {
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const userVideoRef = useRef<HTMLVideoElement>(null);
  const peersRef = useRef<MediaConnection>();
  const localStream = useRef<MediaStream>();
  const userIdRef = useRef<string>("");
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>();
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>();
  const [status, setStatus] = useState<
    "waiting" | "connected" | "disconnected"
  >("waiting");

  const { isRecording, recordScreen, stopRecordingScreen } = useScreenRecord();
  const { audioDevices, videoDevices } = useMediaDevices();
  useEffect(() => {
    //====
    myPeer.on("open", (userId) => {
      const startSignalR = async () => {
        // set waiting status
        setStatus("waiting");
        // full room alert
        connection.on("full-room", (id) => {
          if (id === userId) alert("Phòng đã đầy, mời đi cho");
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
          const call = myPeer.call(id, localStream.current);
          const video = userVideoRef.current;
          streamCall(call, video);
          peersRef.current = call;
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

    const addVideoSteam = (
      stream: MediaStream,
      video: HTMLVideoElement | null
    ) => {
      if (video) {
        video.srcObject = stream;
        video.addEventListener("loadedmetadata", () => {
          video.play();
        });
      }
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
      localStream.current?.getTracks().forEach((track) => track.stop());
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

  return (
    <>
      <div className="video-container">
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
          {isRecording ? (
            <button
              className="bg-white text-black p-2"
              onClick={() => {
                stopRecordingScreen();
              }}
            >
              Stop Recording
            </button>
          ) : (
            <button
              className="bg-white text-black p-2"
              onClick={() => {
                recordScreen();
              }}
            >
              Record
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export default VideoChat;
