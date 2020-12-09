import { useEffect, useRef, useState } from 'react';
import RoomService, { RoomClient } from '../../dist';

const useInterval = (callback, delay) => {
  const savedCallback = useRef() as any;

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    function tick() {
      savedCallback.current();
    }
    if (delay !== null) {
      let id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
};

const rs = new RoomService({
  auth: '/api/hello',
});

export default function Presence() {
  const [room, setRoom] = useState<RoomClient>();
  const [first, setFirst] = useState<any>({});
  const [second, setSecond] = useState<any>({});

  useEffect(() => {
    async function load() {
      const room = await rs.room('presence-demo');
      const first = room.presence('first');
      const second = room.presence('second');
      setRoom(room);

      room.subscribe(first, (val) => {
        setFirst(val);
      });

      room.subscribe(second, (val) => {
        setSecond(val);
      });
    }
    load();
  }, []);

  useInterval(() => {
    if (room === undefined) return;
    if (room) {
      room?.presence('first').set(new Date().toTimeString());
      room?.presence('second').set(new Date().toTimeString());
    }
  }, 1000);

  return (
    <div>
      hai
      <p>{JSON.stringify(first)}</p>
      <p>{JSON.stringify(second)}</p>
    </div>
  );
}
