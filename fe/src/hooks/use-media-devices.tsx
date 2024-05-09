import { useEffect, useState } from "react";

type MediaDevices = {
  deviceName: string;
  deviceId: string;
};

const mapDevice = (device: MediaDeviceInfo) => {
  return {
    deviceName: device.label,
    deviceId: device.deviceId,
  };
};

const useMediaDevices = () => {
  const [audio, setAudio] = useState<MediaDevices[]>([]);
  const [video, setVideo] = useState<MediaDevices[]>([]);
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map(mapDevice);
      const audioDevices = devices
        .filter((device) => device.kind === "audioinput")
        .map(mapDevice);

      setVideo(videoDevices);
      setAudio(audioDevices);
    });
  }, []);
  return { audioDevices: audio, videoDevices: video };
};

export default useMediaDevices;
